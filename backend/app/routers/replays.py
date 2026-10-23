from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import ValidationError

from app import rawdata, repo
from app.config import get_settings
from app.pipeline import jobs
from app.pipeline.fetch import fetch
from app.pipeline.schema import Game, error_lines
from app.polyv import PolyvClient

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


@router.put("/{rid}/game")
def edit_game(rid: str, data: dict):
    """后台人工调整 game.json：过同一套校验再落库，观众端进城即生效；回放身份与场景不允许改。"""
    r = must_replay(rid, with_game=True)
    old = r["game_json"]
    if not old:
        raise HTTPException(409, f"{r['title']} 还没有生成，先生成再调整")
    if jobs.is_running(f"replay:{rid}"):
        raise HTTPException(409, "正在重新生成，完成后再调整")
    try:
        game = Game.model_validate({**data, "replay": old["replay"], "scene": old["scene"], "skin": old["skin"]})
    except ValidationError as e:
        raise HTTPException(422, "\n".join(error_lines(e)))
    repo.edit_game(rid, game.model_dump())
    return game


@router.get("/{rid}/raw")
def raw_status(rid: str):
    r = must_replay(rid)
    raw = rawdata.replay_dir(repo.get_channel(r["channel_id"]), rid)
    if not raw.is_dir():
        return {"files": [], "errors": {}}
    return {"files": sorted(p.stem for p in raw.glob("*.json") if p.stem != "errors"),
            "errors": rawdata.load(raw, "errors") or {}}


@router.post("/{rid}/raw/refresh")
async def raw_refresh(rid: str):
    """只重新拉原始数据，不调大模型、不动已生成的密室；用于补拉新接入的数据源（如直播 / 回放观看日志）。"""
    r = must_replay(rid)
    ch = repo.get_channel(r["channel_id"])
    async with PolyvClient(get_settings()) as c:
        await fetch(c, ch["scene"], ch["channel_id"], rid)
    return raw_status(rid)


@router.get("/{rid}/raw/{name}")
def raw_file(rid: str, name: str):
    if name not in rawdata.REPLAY_FILES:
        raise HTTPException(404, f"没有 {name} 这类原始数据")
    r = must_replay(rid)
    data = rawdata.load(rawdata.replay_dir(repo.get_channel(r["channel_id"]), rid), name)
    if data is None:
        raise HTTPException(404, f"{r['title']} 还没有拉取{rawdata.REPLAY_FILES[name]}，先生成这一讲")
    return data


@router.post("/{rid}/generate")
async def generate(rid: str, tasks: BackgroundTasks):
    must_replay(rid)
    if jobs.is_running(f"replay:{rid}"):
        raise HTTPException(409, "正在生成中")
    repo.set_game(rid, "fetching")
    tasks.add_task(jobs.generate_replay, rid)
    return {"accepted": True}
