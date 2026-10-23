from fastapi import APIRouter, BackgroundTasks, HTTPException

from app import repo, storage
from app.pipeline import jobs
from app.pipeline.fetch import game_id

router = APIRouter(prefix="/api/replays", tags=["replays"])


def must_replay(rid: str, with_game: bool = False) -> dict:
    r = repo.get_replay(rid, with_game)
    if not r:
        raise HTTPException(404, f"回放 {rid} 不存在")
    return r


@router.get("/{rid}")
def replay(rid: str):
    return {**must_replay(rid), "running": jobs.is_running(f"replay:{rid}")}


@router.get("/{rid}/game")
def game(rid: str):
    r = must_replay(rid, with_game=True)
    if not r["game_json"]:
        raise HTTPException(404, f"{r['title']} 还没有生成")
    return r["game_json"]


@router.get("/{rid}/raw")
def raw_status(rid: str):
    r = must_replay(rid)
    ch = repo.get_channel(r["channel_id"])
    raw = storage.game_dir(game_id(ch["scene"], ch["channel_id"], rid)) / "raw"
    if not raw.is_dir():
        return {"files": [], "errors": {}}
    errors = raw / "errors.json"
    return {"files": sorted(p.stem for p in raw.glob("*.json") if p.stem != "errors"),
            "errors": storage.read_json(errors) if errors.is_file() else {}}


@router.post("/{rid}/generate")
async def generate(rid: str, tasks: BackgroundTasks):
    must_replay(rid)
    if jobs.is_running(f"replay:{rid}"):
        raise HTTPException(409, "正在生成中")
    repo.set_game(rid, "fetching")
    tasks.add_task(jobs.generate_replay, rid)
    return {"accepted": True}
