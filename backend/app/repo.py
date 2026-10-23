"""频道与回放的读写。观众与闯关记录在 app/play.py。"""
from app import db
from app.db import dumps, now_ms

REPLAY_LIST_COLS = ("id, channel_id, video_id, title, duration_s, start_time, cover, url, mp4, session_id, sort_no, "
                    "subtitle_ready, game_status, game_error, updated_at")


def list_channels() -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT c.channel_id, c.name, c.publisher, c.cover_img, c.scene, c.city_status, c.imported_at, "
            "COUNT(r.id) AS replays, SUM(r.game_status = 'ready') AS ready "
            "FROM channel c LEFT JOIN replay r ON r.channel_id = c.channel_id "
            "GROUP BY c.channel_id ORDER BY c.imported_at DESC").fetchall()
    return [dict(r) for r in rows]


def get_channel(cid: str) -> dict | None:
    with db.connect() as conn:
        return db.row(conn.execute("SELECT * FROM channel WHERE channel_id = ?", (cid,)).fetchone(), "city_json")


def save_channel(data: dict) -> None:
    with db.connect() as conn:
        db.upsert(conn, "channel", {**data, "updated_at": now_ms()}, "channel_id")


def set_city(cid: str, status: str, city: dict | None = None, error: str = "") -> None:
    with db.connect() as conn:
        if city is None:
            conn.execute("UPDATE channel SET city_status = ?, city_error = ?, updated_at = ? WHERE channel_id = ?",
                         (status, error, now_ms(), cid))
        else:
            conn.execute("UPDATE channel SET city_status = ?, city_error = ?, city_json = ?, updated_at = ? WHERE channel_id = ?",
                         (status, error, dumps(city), now_ms(), cid))


def list_replays(cid: str, with_game: bool = False) -> list[dict]:
    cols = REPLAY_LIST_COLS + (", game_json" if with_game else "")
    with db.connect() as conn:
        rows = conn.execute(f"SELECT {cols} FROM replay WHERE channel_id = ? ORDER BY sort_no, start_time", (cid,)).fetchall()
    return [db.row(r, "game_json") if with_game else dict(r) for r in rows]


def get_replay(rid: str, with_game: bool = False) -> dict | None:
    cols = REPLAY_LIST_COLS + (", game_json" if with_game else "")
    with db.connect() as conn:
        r = conn.execute(f"SELECT {cols} FROM replay WHERE id = ?", (rid,)).fetchone()
    return db.row(r, "game_json") if with_game else (dict(r) if r else None)


def save_replay(data: dict) -> None:
    with db.connect() as conn:
        db.upsert(conn, "replay", {**data, "updated_at": now_ms()}, "id")


def set_game(rid: str, status: str, game: dict | None = None, error: str = "") -> None:
    with db.connect() as conn:
        if game is None:
            conn.execute("UPDATE replay SET game_status = ?, game_error = ?, updated_at = ? WHERE id = ?",
                         (status, error, now_ms(), rid))
        else:
            conn.execute("UPDATE replay SET game_status = ?, game_error = ?, game_json = ?, updated_at = ? WHERE id = ?",
                         (status, error, dumps(game), now_ms(), rid))
