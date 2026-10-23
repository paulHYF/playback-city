"""观众端一次取齐的城数据：城（AI 命名）+ 每讲楼阁 + 已生成讲次的地宫数据（含前人痕迹、字幕）。

形状沿用原型 v5 的 PC_DATA（原 prototype/build_v5_data.py），前端引擎按它渲染。
"""
from datetime import datetime
from pathlib import Path

from app import repo, storage
from app.config import get_settings

from .city import fallback
from .fetch import game_id


def _load(raw: Path, name: str):
    f = raw / f"{name}.json"
    return storage.read_json(f) if f.is_file() else None


def traces(game: dict, quiz: list | None, record: dict | None) -> dict[int, dict]:
    """答题卡真实作答 → 每间殿室的痕迹：题目、作答人数、答错者与所选项。"""
    s = str((record or {}).get("startTime") or "")
    if not quiz or not (len(s) == 14 and s.isdigit()):
        return {}
    t0 = int(datetime.strptime(s, "%Y%m%d%H%M%S").timestamp() * 1000)
    out = {}
    for card in quiz:
        if not card.get("sendTime"):
            continue
        off = (card["sendTime"] - t0) / 1000
        room = next((i for i, r in enumerate(game["rooms"]) if r["start"] <= off <= r["end"] + 60), None)
        if room is None:
            continue
        opts = {"ABCDEFGH"[i]: o["title"] for i, o in enumerate(card.get("options") or [])}
        wrong = [r for r in card.get("records") or [] if not r.get("correct")]
        out[room] = {"question": card["questionTitle"].split("\n")[0], "total": card.get("total") or 0, "wrong": len(wrong),
                     "samples": [[r["nickname"], opts.get(r["answer"], r["answer"])] for r in wrong[:4]]}
    return out


def viewers(viewlog) -> int:
    contents = viewlog.get("contents") if isinstance(viewlog, dict) else viewlog
    return len({v.get("viewerId") for v in contents or []})


def replay_payload(channel: dict, r: dict) -> dict:
    out = {
        "id": r["id"], "no": r["sort_no"], "title": r["title"], "duration": r["duration_s"], "cover": r["cover"],
        "video": r["url"] or r["mp4"], "mp4": r["mp4"], "state": "open" if r["game_status"] == "ready" else "locked",
        "views": 0, "game": None,
    }
    g = r.get("game_json")
    if not g:
        return out
    raw = storage.game_dir(game_id(channel["scene"], channel["channel_id"], r["id"])) / "raw"
    record = _load(raw, "record_file")
    # 没有字幕文件时（离线样例）用题目原话凑一份，寻证关照样能搜
    subs = _load(raw, "subtitle") or sorted(
        ({"t": it["source_time"], "text": it["source_quote"]} for rm in g["rooms"] for it in rm["items"]), key=lambda s: s["t"])
    out["views"] = viewers(_load(raw, "viewlog"))
    out["game"] = {
        **{k: g[k] for k in ("scene", "rooms", "boss_room", "faq", "pairs")},
        "world": g.get("world"), "title": r["title"], "host": g["replay"].get("host") or channel["publisher"],
        "duration": g["replay"]["duration"] or r["duration_s"],
        "traces": traces(g, _load(raw, "quiz"), record), "subs": subs,
    }
    return out


def city_payload(cid: str) -> dict | None:
    channel = repo.get_channel(cid)
    if not channel:
        return None
    replays = repo.list_replays(cid, with_game=True)
    city = channel["city_json"]
    # 直播播放器要账号 uid：取任一讲暂存记录里的 userId
    uid = next((rec.get("userId") for r in replays
                if (rec := _load(storage.game_dir(game_id(channel["scene"], cid, r["id"])) / "raw", "record_file"))), "")
    if not city:  # 还没生成城：按标题兜底，进城不用等
        city = fallback(channel, [r for r in replays]).model_dump()
    return {
        "channel": {"id": cid, "name": channel["name"], "publisher": channel["publisher"], "scene": channel["scene"],
                    "cover": channel["cover_img"]},
        "city": city,
        "player": {"uid": uid, "channelId": cid, "domainInfo": get_settings().player_domain_info},
        "replays": [replay_payload(channel, r) for r in replays],
    }
