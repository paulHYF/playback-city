"""后台生成任务：大模型一场要跑几分钟，接口立即返回，状态写库，前端轮询。"""
import logging

from app import repo
from app.config import get_settings
from app.polyv import PolyvClient

from .analyze import analyze
from .city import generate_city
from .fetch import fetch

log = logging.getLogger(__name__)
_running: set[str] = set()


def is_running(key: str) -> bool:
    return key in _running


async def generate_replay(rid: str) -> None:
    """拉原始数据 → 大模型生成 game.json → 写库。"""
    key = f"replay:{rid}"
    if key in _running:
        return
    _running.add(key)
    try:
        r, settings = repo.get_replay(rid), get_settings()
        ch = repo.get_channel(r["channel_id"])
        repo.set_game(rid, "fetching")
        async with PolyvClient(settings) as c:
            gid = await fetch(c, ch["scene"], ch["channel_id"], rid)
        repo.set_game(rid, "analyzing")
        game = await analyze(settings, gid)
        repo.set_game(rid, "ready", game.model_dump())
    except Exception as e:  # 任务在后台跑，任何失败都要落到 game_error 让后台看见
        log.exception("生成 %s 失败", rid)
        repo.set_game(rid, "failed", error=str(e)[:500])
    finally:
        _running.discard(key)


async def generate_city_job(cid: str) -> None:
    key = f"city:{cid}"
    if key in _running:
        return
    _running.add(key)
    try:
        ch = repo.get_channel(cid)
        ready = [r for r in repo.list_replays(cid, with_game=True) if r["game_status"] == "ready"]
        if not ready:
            repo.set_city(cid, "failed", error="还没有生成好的回放，先生成至少一讲")
            return
        repo.set_city(cid, "generating")
        city, note = await generate_city(get_settings(), ch, ready)
        repo.set_city(cid, "ready", city.model_dump(), error="" if note == "模型生成" else note)
    except Exception as e:
        log.exception("生成城 %s 失败", cid)
        repo.set_city(cid, "failed", error=str(e)[:500])
    finally:
        _running.discard(key)
