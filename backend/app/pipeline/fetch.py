"""拉取一场回放的原始数据，落到 data/<gameId>/raw/。单个接口失败不中断，错误记进 raw/errors.json。"""
from datetime import datetime

from app import storage
from app.polyv import PolyvClient, api
from app.polyv.srt import parse_srt


def game_id(scene: str, channel_id: str, file_id: str) -> str:
    return f"{scene}-{channel_id}-{file_id}"


def _day(value) -> str | None:
    """暂存文件 startTime 可能是毫秒时间戳或 yyyyMMddHHmmss 字符串，统一成 yyyy-MM-dd。"""
    if value in (None, ""):
        return None
    s = str(value)
    if s.isdigit() and len(s) == 13:
        return datetime.fromtimestamp(int(s) / 1000).strftime("%Y-%m-%d")
    if s.isdigit() and len(s) >= 8:
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return s[:10]


async def find_record_file(c: PolyvClient, channel_id: str, file_id: str) -> dict:
    page = 1
    while True:
        data = await api.record_files(c, channel_id, page=page)
        for f in data.get("contents") or []:
            if f.get("fileId") == file_id:
                return f
        if page >= (data.get("totalPages") or 1):
            raise LookupError(f"频道 {channel_id} 下没有暂存文件 {file_id}")
        page += 1


async def fetch(c: PolyvClient, scene: str, channel_id: str, file_id: str, day: str | None = None) -> str:
    gid = game_id(scene, channel_id, file_id)
    raw = storage.root() / gid / "raw"
    errors: dict[str, str] = {}

    record = await find_record_file(c, channel_id, file_id)
    storage.write_json(raw / "record_file.json", record)
    day = day or _day(record.get("startTime"))
    storage.write_json(storage.root() / gid / "meta.json", {
        "scene": scene, "channelId": channel_id, "fileId": file_id,
        "title": record.get("name") or file_id, "day": day,
    })

    async def step(name: str, coro):
        try:
            storage.write_json(raw / f"{name}.json", await coro)
        except Exception as e:  # 单个数据源缺失时继续，analyze 会按缺省处理
            errors[name] = str(e)

    await step("outline", api.record_outline(c, channel_id, file_id))
    await step("questions", api.questions(c, channel_id))
    if day:
        await step("chat", api.chat_messages(c, channel_id, day, day))
        await step("viewlog", api.view_logs(c, channel_id, day, day))

    session_id = record.get("channelSessionId")
    if session_id:
        await step("quiz", api.quiz_answers(c, channel_id, session_id))
        await step("questionnaire", api.questionnaire_answers(c, channel_id, session_id))

    sub = api.pick_subtitle(record)
    if sub:
        try:
            storage.write_json(raw / "subtitle.json", parse_srt(await c.download_text(sub["srtUrl"])))
        except Exception as e:
            errors["subtitle"] = str(e)
    else:
        errors["subtitle"] = "暂存文件还没有已生成的字幕"

    storage.write_json(raw / "errors.json", errors)
    return gid
