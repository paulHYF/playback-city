"""后台：按频道号导入、回放基础信息、生成整城；观众端：进城取数。"""
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app import repo
from app.config import get_settings
from app.pipeline import jobs
from app.pipeline.assemble import city_payload
from app.pipeline.importer import import_channel
from app.polyv import PolyvClient, api

router = APIRouter(prefix="/api", tags=["channels"])


class ImportChannel(BaseModel):
    channelId: str
    scene: Literal["course", "commerce"]


def must_channel(cid: str) -> dict:
    ch = repo.get_channel(cid)
    if not ch:
        raise HTTPException(404, f"频道 {cid} 还没有导入")
    return ch


@router.post("/channels/import")
async def import_(req: ImportChannel):
    async with PolyvClient(get_settings()) as c:
        return await import_channel(c, req.channelId.strip(), req.scene)


@router.get("/channels")
def channels():
    return repo.list_channels()


@router.get("/channels/{cid}")
def channel(cid: str):
    ch = must_channel(cid)
    replays = repo.list_replays(cid)
    for r in replays:
        r["running"] = jobs.is_running(f"replay:{r['id']}")
    return {**ch, "replays": replays, "cityRunning": jobs.is_running(f"city:{cid}")}


@router.post("/channels/{cid}/city/generate")
async def generate_city(cid: str, tasks: BackgroundTasks):
    must_channel(cid)
    tasks.add_task(jobs.generate_city_job, cid)
    return {"accepted": True}


@router.post("/channels/{cid}/replays/{rid}/outline")
async def create_outline(cid: str, rid: str):
    """暂存还没有 AI 大纲 / 字幕时，触发生成（异步，几分钟后重新导入刷新状态）。"""
    must_channel(cid)
    async with PolyvClient(get_settings()) as c:
        return await api.create_record_outline(c, rid, quiz=True, sync_dot=False)


@router.get("/city/{cid}")
def city(cid: str):
    data = city_payload(cid)
    if not data:
        raise HTTPException(404, f"频道 {cid} 还没有导入")
    return data
