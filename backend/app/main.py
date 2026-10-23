from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app import db, repo
from app.config import get_settings
from app.llm.client import LLMError
from app.pipeline.importer import migrate_files
from app.polyv import PolyvError
from app.routers import channels, dashboard, replays, viewers


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    if not repo.list_channels():  # 空库首次启动：把文件时代生成的回放（含离线样例）导进来
        migrate_files()
    yield


app = FastAPI(title="回放不夜城 API", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origin_list, allow_methods=["*"], allow_headers=["*"])
for r in (channels, replays, viewers, dashboard):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    s = get_settings()
    return {"ok": True, "polyv": s.polyv_api_base, "polyvReady": bool(s.polyv_app_id), "llmReady": bool(s.llm_api_key)}


@app.exception_handler(PolyvError)
@app.exception_handler(LLMError)
@app.exception_handler(LookupError)
async def upstream_error(_: Request, e: Exception):
    return JSONResponse(status_code=502, content={"detail": str(e)})


@app.exception_handler(ValidationError)
async def game_invalid(_: Request, e: ValidationError):
    return JSONResponse(status_code=422, content={"detail": "game.json 校验未通过", "errors": e.errors(include_url=False)})


@app.exception_handler(httpx.HTTPError)
async def http_error(_: Request, e: httpx.HTTPError):
    return JSONResponse(status_code=502, content={"detail": f"上游请求失败：{e}"})
