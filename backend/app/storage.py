"""文件存储：data/<gameId>/raw/*.json 是拉取的原始数据，data/<gameId>/game.json 是生成结果。
data/samples/<gameId>/game.json 是离线样例，现场演示不依赖网络和模型。"""
import json
from pathlib import Path

from app.config import get_settings


def root() -> Path:
    return get_settings().data_dir


def game_dir(game_id: str) -> Path:
    for base in (root(), root() / "samples"):
        if (base / game_id).is_dir():
            return base / game_id
    return root() / game_id


def channel_dir(cid: str) -> Path:
    """频道级文件：import/ 是导入时拉的原始数据，report_ai.json 是质量报告的 AI 点评。"""
    return root() / "channels" / cid


def read_json(path: Path):
    return json.loads(path.read_text("utf-8"))


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


def list_games() -> list[dict]:
    games = []
    for base, sample in ((root(), False), (root() / "samples", True)):
        if not base.is_dir():
            continue
        for d in sorted(base.iterdir()):
            meta = d / "meta.json"
            if not meta.is_file():
                continue
            info = {"id": d.name, "sample": sample, **read_json(meta), "ready": (d / "game.json").is_file()}
            games.append(info)
    return games
