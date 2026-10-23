"""后台：按频道号导入、回放基础信息、生成整城；观众端：进城取数。"""
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, ValidationError

from app import rawdata, repo, report
from app.config import get_settings
from app.pipeline import jobs
from app.pipeline.assemble import city_payload
from app.pipeline.city import City, fallback, reconcile
from app.pipeline.importer import import_channel
from app.pipeline.schema import error_lines
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


def ready_replays(cid: str) -> list[dict]:
    return [r for r in repo.list_replays(cid) if r["game_status"] == "ready"]


@router.get("/channels/{cid}/city")
def city_config(cid: str):
    """后台调整用的城数据：已对齐当前已生成的讲次；还没生成整城时给按标题兜底的一份当起点。"""
    ch, ready = must_channel(cid), ready_replays(cid)
    if not ready:
        raise HTTPException(409, "还没有生成好的回放，先生成至少一讲")
    city = ch["city_json"] or fallback(ch, ready).model_dump()
    return {"city": reconcile(ch, city, ready), "generated": bool(ch["city_json"]), "editedAt": ch["city_edited_at"]}


@router.put("/channels/{cid}/city")
def edit_city(cid: str, data: dict):
    """后台人工调整城数据：每个已生成的讲次恰好一座楼、恰好在一条街上，校验同 AI 生成。"""
    must_channel(cid)
    if jobs.is_running(f"city:{cid}"):
        raise HTTPException(409, "正在重新生成整城，完成后再调整")
    try:
        city = City.model_validate(data).check_replays([r["id"] for r in ready_replays(cid)])
    except (ValidationError, ValueError) as e:
        raise HTTPException(422, "\n".join(error_lines(e)))
    repo.edit_city(cid, city.model_dump())
    return city


@router.post("/channels/{cid}/replays/{rid}/outline")
async def create_outline(cid: str, rid: str):
    """暂存还没有 AI 大纲 / 字幕时，触发生成（异步，几分钟后重新导入刷新状态）。"""
    must_channel(cid)
    async with PolyvClient(get_settings()) as c:
        return await api.create_record_outline(c, rid, quiz=True, sync_dot=False)


@router.get("/channels/{cid}/raw")
def raw_overview(cid: str):
    return rawdata.overview(must_channel(cid))


@router.get("/channels/{cid}/raw/import/{name}")
def raw_import_file(cid: str, name: str):
    if name not in rawdata.IMPORT_FILES:
        raise HTTPException(404, f"没有 {name} 这类导入数据")
    must_channel(cid)
    data = rawdata.load(rawdata.import_dir(cid), name)
    if data is None:
        raise HTTPException(404, "这个频道导入时还没保存原始数据，点「重新导入」后再看")
    return data


@router.get("/channels/{cid}/report")
def quality_report(cid: str):
    must_channel(cid)
    return report.channel_report(cid)


@router.post("/channels/{cid}/report/ai")
async def quality_report_ai(cid: str):
    must_channel(cid)
    return await report.ai_review(cid)


@router.get("/city/{cid}")
def city(cid: str):
    data = city_payload(cid)
    if not data:
        raise HTTPException(404, f"频道 {cid} 还没有导入")
    return data
