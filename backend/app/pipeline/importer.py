"""按频道号导入：频道信息 + 回放列表 + 暂存列表 → channel / replay 表。

一讲回放以暂存 fileId 为 id（AI 大纲、字幕都挂在暂存上）；回放列表补上 videoId、封面和 m3u8。
重复导入只刷新基础信息，不动已生成的游戏与城数据。
"""
from app import repo, storage
from app.db import now_ms
from app.polyv import PolyvClient, api

MAX_PAGES = 20


def _seconds(v) -> int:
    """回放列表的 duration 是 HH:mm:ss，暂存列表是秒。"""
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str) and ":" in v:
        s = 0
        for part in v.split(":"):
            s = s * 60 + int(part or 0)
        return s
    return int(v or 0)


def _https(url: str | None) -> str:
    return f"https:{url}" if url and url.startswith("//") else (url or "")


async def _all_playbacks(c: PolyvClient, cid: str) -> list[dict]:
    out = []
    for page in range(1, MAX_PAGES + 1):
        data = await api.playback_list(c, cid, page, 50)
        contents = data.get("contents") or []
        out += contents
        if len(contents) < 50 or page >= (data.get("totalPages") or page):
            break
    return out


async def _all_record_files(c: PolyvClient, cid: str) -> list[dict]:
    out = []
    for page in range(1, MAX_PAGES + 1):
        data = await api.record_files(c, cid, page)
        out += data.get("contents") or []
        if page >= (data.get("totalPages") or 1):
            break
    return out


async def import_channel(c: PolyvClient, cid: str, scene: str) -> dict:
    info = await api.channel_info(c, cid)
    playbacks = await _all_playbacks(c, cid)
    records = {f["fileId"]: f for f in await _all_record_files(c, cid)}

    existing = repo.get_channel(cid)
    repo.save_channel({
        "channel_id": cid, "name": info.get("name") or cid, "publisher": info.get("publisher") or "",
        "cover_img": _https(info.get("coverImg")), "watch_url": info.get("watchUrl") or "", "scene": scene,
        "imported_at": existing["imported_at"] if existing else now_ms(),
    })

    replays: dict[str, dict] = {}
    for f in records.values():
        replays[f["fileId"]] = {
            "id": f["fileId"], "channel_id": cid, "title": f.get("name") or f["fileId"],
            "duration_s": _seconds(f.get("duration")), "start_time": str(f.get("startTime") or ""),
            "cover": _https(f.get("firstImage")), "url": f.get("m3u8") or "", "mp4": f.get("mp4") or "",
            "session_id": f.get("channelSessionId") or "", "subtitle_ready": int(api.pick_subtitle(f) is not None),
        }
    for p in playbacks:
        rid = p.get("fileId") or p["videoId"]  # 没有暂存的回放（如上传的视频）只能展示，不能生成
        base = replays.get(rid, {"id": rid, "channel_id": cid, "subtitle_ready": 0})
        replays[rid] = {
            **base, "video_id": p.get("videoId") or "", "title": p.get("title") or base.get("title") or rid,
            "duration_s": _seconds(p.get("duration")) or base.get("duration_s", 0),
            "start_time": str(p.get("startTime") or base.get("start_time") or ""),
            "cover": _https(p.get("firstImage")) or base.get("cover", ""),
            "url": p.get("url") or base.get("url", ""), "mp4": p.get("mp4") or base.get("mp4", ""),
            "session_id": p.get("channelSessionId") or base.get("session_id", ""),
        }

    for no, r in enumerate(sorted(replays.values(), key=lambda r: r["start_time"]), start=1):
        repo.save_replay({**r, "sort_no": no})
    return {"channelId": cid, "replays": len(replays), "playbacks": len(playbacks), "recordFiles": len(records)}


def migrate_files() -> int:
    """把文件时代生成的 data/<scene>-<channelId>-<fileId>/（含 samples）导进库，返回导入场数。"""
    n = 0
    for g in storage.list_games():
        cid, rid = g["channelId"], g["fileId"]
        if not repo.get_channel(cid):
            name = f"离线样例 · {g['title']}" if g["sample"] else f"频道 {cid}"
            repo.save_channel({"channel_id": cid, "name": name, "scene": g["scene"], "imported_at": now_ms()})
        if repo.get_replay(rid):
            continue
        d = storage.game_dir(g["id"])
        record = storage.read_json(d / "raw/record_file.json") if (d / "raw/record_file.json").is_file() else {}
        game = storage.read_json(d / "game.json") if g["ready"] else None
        repo.save_replay({
            "id": rid, "channel_id": cid, "title": record.get("name") or g["title"],
            "duration_s": _seconds(record.get("duration") or (game or {}).get("replay", {}).get("duration") or 0),
            "start_time": str(record.get("startTime") or ""), "cover": _https(record.get("firstImage")),
            "mp4": record.get("mp4") or "", "session_id": record.get("channelSessionId") or "", "sort_no": 1,
            "subtitle_ready": int((d / "raw/subtitle.json").is_file()),
        })
        if game:
            repo.set_game(rid, "ready", game)
        n += 1
    return n
