"""SQLite 数据库：频道（城）、回放（楼阁 / 地宫）、观众与闯关记录。

只用标准库 sqlite3；JSON 字段存 TEXT。原始数据仍落 data/<gid>/raw/ 文件，只给 analyze 用。
"""
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from app.config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS channel (
    channel_id   TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    publisher    TEXT NOT NULL DEFAULT '',
    cover_img    TEXT NOT NULL DEFAULT '',
    watch_url    TEXT NOT NULL DEFAULT '',
    scene        TEXT NOT NULL,                   -- course | commerce
    city_json    TEXT,                            -- AI 生成的城级数据，见 pipeline/city.py
    city_status  TEXT NOT NULL DEFAULT 'none',    -- none | generating | ready | failed
    city_error   TEXT NOT NULL DEFAULT '',
    imported_at  INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS replay (
    id             TEXT PRIMARY KEY,              -- 暂存 fileId
    channel_id     TEXT NOT NULL,
    video_id       TEXT NOT NULL DEFAULT '',      -- 回放 videoId，没有转存成回放时为空
    title          TEXT NOT NULL,
    duration_s     INTEGER NOT NULL DEFAULT 0,
    start_time     TEXT NOT NULL DEFAULT '',      -- yyyyMMddHHmmss
    cover          TEXT NOT NULL DEFAULT '',
    url            TEXT NOT NULL DEFAULT '',      -- m3u8
    mp4            TEXT NOT NULL DEFAULT '',
    session_id     TEXT NOT NULL DEFAULT '',
    sort_no        INTEGER NOT NULL DEFAULT 0,    -- 按开播时间排的讲次，从 1 开始
    subtitle_ready INTEGER NOT NULL DEFAULT 0,
    game_status    TEXT NOT NULL DEFAULT 'none',  -- none | fetching | analyzing | ready | failed
    game_error     TEXT NOT NULL DEFAULT '',
    game_json      TEXT,
    updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_replay_channel ON replay(channel_id, sort_no);

CREATE TABLE IF NOT EXISTS viewer (
    id         TEXT PRIMARY KEY,
    nickname   TEXT NOT NULL,
    ua         TEXT NOT NULL DEFAULT '',
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS play_run (
    id          TEXT PRIMARY KEY,
    viewer_id   TEXT NOT NULL,
    replay_id   TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER,
    result      TEXT,                             -- cleared | dawn | abandoned
    rooms_done  INTEGER NOT NULL DEFAULT 0,
    lamps_left  INTEGER NOT NULL DEFAULT 0,
    points      INTEGER NOT NULL DEFAULT 0,
    correct_cnt INTEGER NOT NULL DEFAULT 0,
    wrong_cnt   INTEGER NOT NULL DEFAULT 0,
    revive_cnt  INTEGER NOT NULL DEFAULT 0,
    duration_s  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_run_replay ON play_run(replay_id);
CREATE INDEX IF NOT EXISTS idx_run_channel ON play_run(channel_id);

CREATE TABLE IF NOT EXISTS play_event (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL,
    viewer_id   TEXT NOT NULL,
    replay_id   TEXT NOT NULL,
    type        TEXT NOT NULL,
    room        INTEGER,
    ref         TEXT NOT NULL DEFAULT '',
    correct     INTEGER,
    choice      TEXT NOT NULL DEFAULT '',
    source_time INTEGER,
    ts          INTEGER NOT NULL,
    extra       TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_event_replay ON play_event(replay_id, type);

CREATE TABLE IF NOT EXISTS viewer_replay (
    viewer_id   TEXT NOT NULL,
    replay_id   TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    runs        INTEGER NOT NULL DEFAULT 0,
    cleared_at  INTEGER,
    best_points INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (viewer_id, replay_id)
);
"""


def db_path() -> Path:
    return get_settings().data_dir / "playback-city.db"


def now_ms() -> int:
    return int(time.time() * 1000)


@contextmanager
def connect():
    """每次请求一个连接；退出时提交。WAL 让读写互不阻塞，单进程 uvicorn 足够。"""
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def row(r: sqlite3.Row | None, *json_fields: str) -> dict | None:
    if r is None:
        return None
    d = dict(r)
    for f in json_fields:
        d[f] = json.loads(d[f]) if d.get(f) else None
    return d


def upsert(conn: sqlite3.Connection, table: str, data: dict, key: str | tuple[str, ...]) -> None:
    """按主键插入或更新 data 里给出的列（没给的列保持原值）。"""
    keys = (key,) if isinstance(key, str) else key
    cols = list(data)
    updates = ", ".join(f"{c}=excluded.{c}" for c in cols if c not in keys)
    conn.execute(
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))}) "
        f"ON CONFLICT ({', '.join(keys)}) DO " + (f"UPDATE SET {updates}" if updates else "NOTHING"),
        [data[c] for c in cols],
    )


def dumps(v) -> str:
    return json.dumps(v, ensure_ascii=False)
