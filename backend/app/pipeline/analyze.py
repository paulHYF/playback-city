"""原始数据 + 场景提示词 → 大模型 → 校验 → game.json。"""
import json
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError

from app import storage
from app.config import Settings
from app.llm.client import chat_json

from .schema import Game

PROMPTS = Path(__file__).parent / "prompts"
MAX_MATERIAL_CHARS = 120_000  # 超长时后续改成按分段分批调用再合并（需求文档 7.4）


def _load(raw: Path, name: str):
    f = raw / f"{name}.json"
    return storage.read_json(f) if f.is_file() else None


def build_material(gid: str) -> tuple[dict, str]:
    d = storage.game_dir(gid)
    meta, raw = storage.read_json(d / "meta.json"), d / "raw"
    record = _load(raw, "record_file") or {}
    parts = {
        "场景": meta["scene"],
        "回放信息": {"channelId": meta["channelId"], "fileId": meta["fileId"], "title": meta["title"],
                     "duration": record.get("duration")},
        "大纲与 AI 测验": _load(raw, "outline"),
        "字幕": _load(raw, "subtitle"),
        "聊天": _load(raw, "chat"),
        "提问": _load(raw, "questions"),
        "观看记录": _load(raw, "viewlog"),
        "问卷结果": _load(raw, "questionnaire"),
    }
    text = "\n\n".join(f"[{k}]\n{json.dumps(v, ensure_ascii=False)}" for k, v in parts.items() if v)
    return meta, text[:MAX_MATERIAL_CHARS]


async def analyze(settings: Settings, gid: str) -> Game:
    meta, material = build_material(gid)
    system = (PROMPTS / f"{meta['scene']}.md").read_text("utf-8") + "\n\n" + (PROMPTS / "common.md").read_text("utf-8")
    data = await chat_json(settings, system, material)
    try:
        game = Game.model_validate(data)
    except ValidationError as e:
        # 校验失败把错误回喂一次，让模型自己修
        data = await chat_json(settings, system, f"{material}\n\n[上次输出]\n{json.dumps(data, ensure_ascii=False)}"
                                                 f"\n\n[校验错误，请修正后重新输出完整 JSON]\n{e}")
        try:
            game = Game.model_validate(data)
        except ValidationError:
            # world 是可选的闯关配置：仍不合法就去掉，题目与殿室照常生成，前端走默认关卡
            game = Game.model_validate({**data, "world": None})
    apply_quiz_stats(game, storage.game_dir(gid) / "raw")
    storage.write_json(storage.game_dir(gid) / "game.json", game.model_dump())
    return game


def _start_ms(record: dict) -> int | None:
    s = str(record.get("startTime") or "")
    if len(s) == 14 and s.isdigit():
        return int(datetime.strptime(s, "%Y%m%d%H%M%S").timestamp() * 1000)
    return None


def apply_quiz_stats(game: Game, raw: Path):
    """殿室错误率用答题卡真实作答算（不让模型估）：发题时间落在殿室区间内的卡，1 - 答对数 / 作答数；Boss = 错误率最高且题数够的殿室。"""
    quiz, record = _load(raw, "quiz"), _load(raw, "record_file") or {}
    start = _start_ms(record)
    if not quiz or start is None:
        return
    stats = [[0, 0] for _ in game.rooms]
    for card in quiz:
        if not card.get("sendTime") or not card.get("total"):
            continue
        offset = (card["sendTime"] - start) / 1000
        i = next((k for k, r in enumerate(game.rooms) if r.start <= offset <= r.end + 60), None)
        if i is not None:
            stats[i][0] += card["total"]
            stats[i][1] += card["total"] - card.get("correctCount", 0)
    for room, (total, wrong) in zip(game.rooms, stats):
        if total:
            room.fail_rate = round(wrong / total, 2)
    eligible = [k for k, r in enumerate(game.rooms) if len(r.items) >= 3]
    if eligible:
        game.boss_room = max(eligible, key=lambda k: game.rooms[k].fail_rate)
