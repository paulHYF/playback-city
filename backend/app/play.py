"""观众与闯关记录：首次进入发观众 id，闯关事件落库，结算更新最好成绩；讲师助教大盘从这里聚合。"""
import json
import random
import uuid
from collections import Counter, defaultdict

from app import db
from app.db import dumps, now_ms

EVENT_TYPES = {"enter_palace", "enter_room", "answer", "fall", "revive_watch", "npc_talk", "tool_get",
               "room_done", "boss_win", "clear", "watch_replay"}
NICK_HEAD = "夜巡人"


def create_viewer(ua: str = "") -> dict:
    vid, t = uuid.uuid4().hex, now_ms()
    nick = f"{NICK_HEAD}·{random.randint(1000, 9999)}"
    with db.connect() as conn:
        conn.execute("INSERT INTO viewer (id, nickname, ua, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)", (vid, nick, ua[:300], t, t))
    return {"id": vid, "nickname": nick}


def touch_viewer(vid: str) -> dict | None:
    with db.connect() as conn:
        r = conn.execute("SELECT id, nickname FROM viewer WHERE id = ?", (vid,)).fetchone()
        if r:
            conn.execute("UPDATE viewer SET last_seen = ? WHERE id = ?", (now_ms(), vid))
    return dict(r) if r else None


def progress(vid: str, cid: str) -> dict:
    with db.connect() as conn:
        rows = conn.execute("SELECT replay_id, runs, cleared_at, best_points FROM viewer_replay WHERE viewer_id = ? AND channel_id = ?",
                            (vid, cid)).fetchall()
        active = conn.execute("SELECT id, replay_id, state FROM play_run WHERE viewer_id = ? AND channel_id = ? AND ended_at IS NULL "
                              "AND state IS NOT NULL AND state != '' ORDER BY started_at DESC LIMIT 1", (vid, cid)).fetchone()
    replays = {r["replay_id"]: dict(r) for r in rows}
    snap = None
    if active and active["state"]:
        try:
            snap = json.loads(active["state"])
        except json.JSONDecodeError:
            snap = None
    return {
        "replays": replays, "points": sum(r["best_points"] for r in replays.values()),
        "active": {"runId": active["id"], "replayId": active["replay_id"], "state": snap} if snap else None,
    }


def start_run(vid: str, rid: str, cid: str) -> str:
    run_id = uuid.uuid4().hex
    with db.connect() as conn:
        conn.execute("INSERT INTO play_run (id, viewer_id, replay_id, channel_id, started_at) VALUES (?, ?, ?, ?, ?)",
                     (run_id, vid, rid, cid, now_ms()))
        db.upsert(conn, "viewer_replay", {"viewer_id": vid, "replay_id": rid, "channel_id": cid}, ("viewer_id", "replay_id"))
        conn.execute("UPDATE viewer_replay SET runs = runs + 1 WHERE viewer_id = ? AND replay_id = ?", (vid, rid))
    return run_id


def get_run(run_id: str) -> dict | None:
    with db.connect() as conn:
        return db.row(conn.execute("SELECT * FROM play_run WHERE id = ?", (run_id,)).fetchone())


def add_events(run: dict, events: list[dict]) -> int:
    rows = []
    for e in events:
        if e.get("type") not in EVENT_TYPES:
            continue
        correct = e.get("correct")
        rows.append((run["id"], run["viewer_id"], run["replay_id"], e["type"], e.get("room"), str(e.get("ref") or "")[:64],
                     None if correct is None else int(bool(correct)), str(e.get("choice") or "")[:200], e.get("source_time"),
                     int(e.get("ts") or now_ms()), dumps(e.get("extra") or {})))
    with db.connect() as conn:
        conn.executemany("INSERT INTO play_event (run_id, viewer_id, replay_id, type, room, ref, correct, choice, source_time, ts, extra) "
                         "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
    return len(rows)


def add_watch(vid: str, replay: dict, source: str, ranges: list[tuple[int, int]]) -> int:
    t, dur = now_ms(), replay["duration_s"] or 10 ** 6
    rows = [(vid, replay["id"], replay["channel_id"], source, max(0, int(a)), min(dur, int(b)), t)
            for a, b in ranges[:200] if min(dur, b) - max(0, a) >= 2]
    with db.connect() as conn:
        conn.executemany("INSERT INTO replay_watch (viewer_id, replay_id, channel_id, source, from_s, to_s, ts) VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
    return len(rows)


def review_ranges(rid: str) -> list[dict]:
    """回放城里观众回看过的区间：播放器真实播放区间（完整回放 / 片段）+ 复活时看完的封印片段。"""
    with db.connect() as conn:
        watch = conn.execute("SELECT viewer_id, source, from_s, to_s FROM replay_watch WHERE replay_id = ?", (rid,)).fetchall()
        revive = conn.execute("SELECT viewer_id, source_time, extra FROM play_event WHERE replay_id = ? AND type = 'revive_watch' "
                              "AND source_time IS NOT NULL", (rid,)).fetchall()
    out = [{"viewer": w["viewer_id"], "source": w["source"], "from": w["from_s"], "to": w["to_s"]} for w in watch]
    for e in revive:
        seconds = json.loads(e["extra"] or "{}").get("seconds") or 30
        out.append({"viewer": e["viewer_id"], "source": "revive", "from": int(e["source_time"]), "to": int(e["source_time"]) + int(seconds)})
    return out


def save_state(run: dict, state: dict) -> None:
    """进行中的地宫快照：位置、已破的室、道具、怪的血量。刷新后按观众 id 接着打。"""
    if run.get("ended_at"):
        return
    with db.connect() as conn:
        conn.execute("UPDATE play_run SET state = ? WHERE id = ?", (dumps(state), run["id"]))


def finish_run(run: dict, result: str, stats: dict) -> None:
    t = now_ms()
    with db.connect() as conn:
        agg = conn.execute("SELECT SUM(type='answer' AND correct=1) ok, SUM(type='answer' AND correct=0) bad, "
                           "SUM(type='revive_watch') rv FROM play_event WHERE run_id = ?", (run["id"],)).fetchone()
        points = int(stats.get("points") or 0)
        conn.execute("UPDATE play_run SET ended_at=?, result=?, rooms_done=?, lamps_left=?, points=?, correct_cnt=?, wrong_cnt=?, "
                     "revive_cnt=?, duration_s=?, state=NULL WHERE id=?",
                     (t, result, int(stats.get("roomsDone") or 0), int(stats.get("lamps") or 0), points, agg["ok"] or 0,
                      agg["bad"] or 0, agg["rv"] or 0, (t - run["started_at"]) // 1000, run["id"]))
        conn.execute("UPDATE viewer_replay SET best_points = MAX(best_points, ?), "
                     "cleared_at = COALESCE(cleared_at, CASE WHEN ? = 'cleared' THEN ? END) WHERE viewer_id = ? AND replay_id = ?",
                     (points, result, t, run["viewer_id"], run["replay_id"]))


# ───────── 讲师助教大盘 ─────────

def _rate(a, b) -> float:
    return round(a / b, 3) if b else 0.0


def dashboard(cid: str, replays: list[dict]) -> dict:
    """城级：KPI + 每讲楼阁数据 + 点亮时间线。"""
    with db.connect() as conn:
        runs = [dict(r) for r in conn.execute("SELECT * FROM play_run WHERE channel_id = ?", (cid,)).fetchall()]
        ids = [r["id"] for r in replays]
        q = ",".join("?" * len(ids)) or "''"
        answers = conn.execute(f"SELECT replay_id, room, correct FROM play_event WHERE type='answer' AND replay_id IN ({q})", ids).fetchall()
        revives = conn.execute(f"SELECT replay_id, COUNT(*) n FROM play_event WHERE type='revive_watch' AND replay_id IN ({q}) GROUP BY replay_id", ids).fetchall()
    by_replay = defaultdict(list)
    for r in runs:
        by_replay[r["replay_id"]].append(r)
    ans = defaultdict(lambda: defaultdict(lambda: [0, 0]))  # replay → room → [作答, 答错]
    for a in answers:
        c = ans[a["replay_id"]][a["room"] if a["room"] is not None else -1]
        c[0] += 1
        c[1] += 0 if a["correct"] else 1
    rv = {r["replay_id"]: r["n"] for r in revives}

    buildings = []
    for r in replays:
        rs = by_replay.get(r["id"], [])
        players = {x["viewer_id"] for x in rs}
        cleared = {x["viewer_id"] for x in rs if x["result"] == "cleared"}
        rooms = (r.get("game_json") or {}).get("rooms") or []
        fail = room_fail_rates(rooms, ans.get(r["id"], {}))
        hot = max(range(len(fail)), key=lambda i: fail[i]) if fail else None
        total_a = sum(v[0] for v in ans.get(r["id"], {}).values())
        total_w = sum(v[1] for v in ans.get(r["id"], {}).values())
        buildings.append({
            "id": r["id"], "no": r["sort_no"], "title": r["title"], "ready": r["game_status"] == "ready",
            "players": len(players), "runs": len(rs), "cleared": len(cleared), "clearRate": _rate(len(cleared), len(players)),
            "failRate": _rate(total_w, total_a) if total_a else (round(sum(fail) / len(fail), 3) if fail else 0.0),
            "hotRoom": None if hot is None else {"index": hot, "title": rooms[hot]["title"], "failRate": fail[hot]},
            "revives": rv.get(r["id"], 0),
        })
    viewers = {x["viewer_id"] for x in runs}
    done = [x for x in runs if x["ended_at"]]
    timeline = sorted(({"ts": x["ended_at"], "replay": x["replay_id"], "viewer": x["viewer_id"]} for x in runs if x["result"] == "cleared"),
                      key=lambda e: e["ts"])
    first_clear, seen = [], set()
    for e in timeline:  # 每位观众在每讲第一次通关才点亮一扇窗
        if (e["viewer"], e["replay"]) not in seen:
            seen.add((e["viewer"], e["replay"]))
            first_clear.append(e)
    return {
        "kpi": {"viewers": len(viewers), "runs": len(runs), "cleared": sum(b["cleared"] for b in buildings),
                "clearRate": _rate(len({(x["viewer_id"], x["replay_id"]) for x in runs if x["result"] == "cleared"}),
                                   len({(x["viewer_id"], x["replay_id"]) for x in runs})),
                "avgDuration": round(sum(x["duration_s"] for x in done) / len(done)) if done else 0,
                "revives": sum(rv.values())},
        "buildings": buildings,
        "timeline": first_clear,
    }


def room_fail_rates(rooms: list[dict], answered: dict) -> list[float]:
    """殿室错误率：有闯关作答就用闯关作答，没有就用答题卡算出的 fail_rate。"""
    out = []
    for i, rm in enumerate(rooms):
        n, w = answered.get(i, [0, 0])
        out.append(round(w / n, 3) if n else float(rm.get("fail_rate") or 0))
    return out


def replay_dashboard(r: dict) -> dict:
    """单讲：殿室漏斗、各室错误率、错题榜（含学员最常选的错误选项）、复活回看热度带、观众列表。"""
    g = r.get("game_json") or {}
    rooms = g.get("rooms") or []
    items = {it["id"]: (i, it) for i, rm in enumerate(rooms) for it in rm["items"]}
    with db.connect() as conn:
        runs = [dict(x) for x in conn.execute(
            "SELECT p.*, v.nickname FROM play_run p JOIN viewer v ON v.id = p.viewer_id WHERE replay_id = ? ORDER BY started_at DESC", (r["id"],))]
        events = [dict(x) for x in conn.execute(
            "SELECT run_id, viewer_id, type, room, ref, correct, choice, source_time, extra FROM play_event WHERE replay_id = ?", (r["id"],))]

    reached = defaultdict(set)  # 殿室 → 到过的局
    answered = defaultdict(lambda: [0, 0])
    wrong_items: dict[str, Counter] = defaultdict(Counter)
    item_total = Counter()
    revive_heat = Counter()
    for e in events:
        if e["type"] == "enter_room" and e["room"] is not None:
            reached[e["room"]].add(e["run_id"])
        elif e["type"] == "answer":
            if e["room"] is not None:
                answered[e["room"]][0] += 1
                answered[e["room"]][1] += 0 if e["correct"] else 1
            if e["ref"]:
                item_total[e["ref"]] += 1
                if not e["correct"]:
                    wrong_items[e["ref"]][e["choice"]] += 1
        elif e["type"] == "revive_watch" and e["source_time"] is not None:
            watched = json.loads(e["extra"] or "{}").get("seconds") or 30
            revive_heat[int(e["source_time"]) // 30 * 30] += watched

    run_ids = {x["id"] for x in runs}
    funnel = [{"room": i, "title": rm["title"], "reached": len(reached.get(i, set()) & run_ids)} for i, rm in enumerate(rooms)]
    funnel.append({"room": None, "title": "通关", "reached": sum(1 for x in runs if x["result"] == "cleared")})
    fail = room_fail_rates(rooms, answered)
    top_wrong = []
    for ref, choices in sorted(wrong_items.items(), key=lambda kv: -sum(kv[1].values()))[:8]:
        if ref not in items:
            continue
        i, it = items[ref]
        top_wrong.append({"id": ref, "room": i, "keyword": it["keyword"], "question": it["question"], "answer": it["options"][0],
                          "wrong": sum(choices.values()), "total": item_total[ref], "sourceTime": it["source_time"],
                          "choices": [{"text": c, "count": n} for c, n in choices.most_common(3)]})
    return {
        "id": r["id"], "title": r["title"], "duration": r["duration_s"],
        "rooms": [{"index": i, "title": rm["title"], "start": rm["start"], "end": rm["end"], "failRate": fail[i],
                   "answered": answered.get(i, [0, 0])[0], "cardFailRate": rm.get("fail_rate", 0)} for i, rm in enumerate(rooms)],
        "bossRoom": g.get("boss_room"),
        "funnel": funnel, "topWrong": top_wrong,
        "reviveHeat": [{"t": t, "seconds": s} for t, s in sorted(revive_heat.items())],
        "viewers": [{"nickname": x["nickname"], "result": x["result"] or "playing", "points": x["points"], "roomsDone": x["rooms_done"],
                     "wrong": x["wrong_cnt"], "revives": x["revive_cnt"], "duration": x["duration_s"], "startedAt": x["started_at"]}
                    for x in runs[:50]],
    }
