"""观众端：首次进入发观众 id，闯关事件上报，结算。"""
import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app import play, repo

router = APIRouter(prefix="/api", tags=["viewers"])


class StartRun(BaseModel):
    viewerId: str
    replayId: str


class FinishRun(BaseModel):
    result: Literal["cleared", "dawn", "abandoned"]
    points: int = 0
    roomsDone: int = 0
    lamps: int = 0


class Watch(BaseModel):
    replayId: str
    source: Literal["full", "clip"] = "full"
    ranges: list[tuple[int, int]]


@router.post("/viewers/{vid}/watch")
async def watch(vid: str, request: Request):
    """回放城播放器里看过的区间（秒）；关页时 sendBeacon 发的是 text/plain，一并按 JSON 解析。"""
    req = Watch.model_validate(json.loads(await request.body() or b"{}"))
    r = repo.get_replay(req.replayId)
    if not r or not play.touch_viewer(vid):
        raise HTTPException(404, "观众或回放不存在")
    return {"saved": play.add_watch(vid, r, req.source, req.ranges)}


@router.post("/viewers")
async def create_viewer(request: Request):
    return play.create_viewer(request.headers.get("user-agent", ""))


@router.get("/viewers/{vid}")
def viewer(vid: str):
    v = play.touch_viewer(vid)
    if not v:
        raise HTTPException(404, "观众不存在")
    return v


@router.get("/viewers/{vid}/progress")
def progress(vid: str, channelId: str):
    return play.progress(vid, channelId)


@router.post("/runs")
def start_run(req: StartRun):
    r = repo.get_replay(req.replayId)
    if not r or not play.touch_viewer(req.viewerId):
        raise HTTPException(404, "观众或回放不存在")
    return {"id": play.start_run(req.viewerId, req.replayId, r["channel_id"])}


def must_run(run_id: str) -> dict:
    run = play.get_run(run_id)
    if not run:
        raise HTTPException(404, "这一局不存在")
    return run


@router.post("/runs/{run_id}/events")
async def events(run_id: str, request: Request):
    """body 是事件数组；页面关闭时 sendBeacon 发的是 text/plain，一并按 JSON 解析。"""
    body = json.loads(await request.body() or b"[]")
    return {"saved": play.add_events(must_run(run_id), body if isinstance(body, list) else [body])}


@router.put("/runs/{run_id}/state")
async def save_run_state(run_id: str, request: Request):
    """进行中的地宫快照；关页时 sendBeacon 发的是 text/plain，一并按 JSON 解析。"""
    body = json.loads(await request.body() or b"{}")
    play.save_state(must_run(run_id), body if isinstance(body, dict) else {})
    return {"ok": True}


@router.post("/runs/{run_id}/finish")
def finish(run_id: str, req: FinishRun):
    run = must_run(run_id)
    if run["ended_at"]:
        return {"ok": True}
    play.finish_run(run, req.result, req.model_dump())
    return {"ok": True}
