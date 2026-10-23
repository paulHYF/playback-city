"""讲师助教大盘。"""
from fastapi import APIRouter, HTTPException

from app import play, repo

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/{cid}")
def dashboard(cid: str):
    ch = repo.get_channel(cid)
    if not ch:
        raise HTTPException(404, f"频道 {cid} 还没有导入")
    replays = repo.list_replays(cid, with_game=True)
    return {"channel": {"id": cid, "name": ch["name"], "scene": ch["scene"], "city": ch["city_json"]},
            **play.dashboard(cid, replays)}


@router.get("/{cid}/replays/{rid}")
def replay_dashboard(cid: str, rid: str):
    r = repo.get_replay(rid, with_game=True)
    if not r or r["channel_id"] != cid:
        raise HTTPException(404, "回放不存在")
    return play.replay_dashboard(r)
