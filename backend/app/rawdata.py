"""直播原始数据的定位与读取：导入时拉的频道级数据 + 每讲生成时拉的回放级数据。"""
from pathlib import Path

from app import repo, storage
from app.pipeline.fetch import game_id

IMPORT_FILES = {"channel_info": "频道信息", "playbacks": "回放列表", "record_files": "暂存列表"}
REPLAY_FILES = {
    "record_file": "暂存文件", "outline": "AI 大纲与测验", "subtitle": "字幕", "chat": "聊天记录",
    "questions": "提问", "viewlog": "观看记录（按观众汇总）", "viewlog_live": "直播观看日志", "viewlog_vod": "回放观看日志",
    "quiz": "答题卡", "questionnaire": "问卷",
}


def import_dir(cid: str) -> Path:
    return storage.channel_dir(cid) / "import"


def replay_dir(ch: dict, rid: str) -> Path:
    return storage.game_dir(game_id(ch["scene"], ch["channel_id"], rid)) / "raw"


def load(raw: Path, name: str):
    f = raw / f"{name}.json"
    return storage.read_json(f) if f.is_file() else None


def _count(data) -> int | None:
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict) and isinstance(data.get("contents"), list):
        return len(data["contents"])
    return None


def _files(raw: Path, labels: dict[str, str]) -> list[dict]:
    out = []
    for name, label in labels.items():
        f = raw / f"{name}.json"
        if f.is_file():
            st = f.stat()
            out.append({"name": name, "label": label, "size": st.st_size, "mtime": int(st.st_mtime * 1000),
                        "count": _count(storage.read_json(f))})
    return out


def overview(ch: dict) -> dict:
    cid = ch["channel_id"]
    replays = []
    for r in repo.list_replays(cid):
        raw = replay_dir(ch, r["id"])
        replays.append({"id": r["id"], "title": r["title"], "sort_no": r["sort_no"], "game_status": r["game_status"],
                        "files": _files(raw, REPLAY_FILES), "errors": load(raw, "errors") or {}})
    return {"import": {"files": _files(import_dir(cid), IMPORT_FILES)}, "replays": replays}
