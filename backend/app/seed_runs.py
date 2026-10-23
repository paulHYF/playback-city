"""演示数据：按直播时答题卡的真实作答人（昵称），模拟他们各闯一局，让讲师大盘不空。

每间殿室答对的概率取这一室的真实错误率；答错时选的是该题的某个干扰项。时间散在最近 3 天里，
大盘的「点亮」时间线才有先后。模拟出的观众昵称带「（模拟）」后缀，和真实观众区分。
"""
import json
import random
import uuid

from app import db, repo
from app.db import now_ms
from app.pipeline.assemble import _load
from app.pipeline.fetch import game_id
from app import storage

DAY_MS = 86_400_000


def _nicknames(raw) -> list[str]:
    quiz = _load(raw, "quiz") or []
    names = {r["nickname"] for card in quiz for r in card.get("records") or [] if r.get("nickname")}
    return sorted(names) or [f"学员{i:02d}" for i in range(1, 21)]


def seed_runs(cid: str, seed: int = 7) -> dict:
    rnd = random.Random(seed)
    ch = repo.get_channel(cid)
    out = {}
    with db.connect() as conn:
        for r in repo.list_replays(cid, with_game=True):
            g = r["game_json"]
            if not g:
                continue
            raw = storage.game_dir(game_id(ch["scene"], cid, r["id"])) / "raw"
            rooms, boss = g["rooms"], g["boss_room"]
            n_runs = 0
            for nick in _nicknames(raw):
                vid = "seed-" + uuid.uuid5(uuid.NAMESPACE_URL, f"{cid}/{nick}").hex[:24]
                t0 = now_ms() - rnd.randint(0, 3 * DAY_MS)
                conn.execute("INSERT OR IGNORE INTO viewer (id, nickname, ua, first_seen, last_seen) VALUES (?, ?, 'seed', ?, ?)",
                             (vid, f"{nick}（模拟）", t0, t0))
                run_id, t, lamps, points, events, wrong, revives, done = uuid.uuid4().hex, t0, 5, 0, [], 0, 0, 0
                skill = rnd.uniform(-0.15, 0.2)
                result = "cleared"
                for i, rm in enumerate(rooms):
                    t += rnd.randint(20, 70) * 1000
                    events.append(("enter_room", i, "", None, "", None, t, {}))
                    for it in (rm["items"][:3] if i == boss else rm["items"][:1]):
                        ok = rnd.random() > max(0.03, min(0.9, rm.get("fail_rate", 0.2) - skill))
                        choice = it["options"][0] if ok else rnd.choice(it["options"][1:])
                        t += rnd.randint(8, 30) * 1000
                        events.append(("answer", i, it["id"], int(ok), choice, it["source_time"], t, {"kind": "boss" if i == boss else "door"}))
                        if ok:
                            points += 50
                            continue
                        wrong += 1
                        lamps -= 1
                        events.append(("fall", i, it["id"], None, "", it["source_time"], t, {}))
                        watched = rnd.randint(18, 35)
                        t += watched * 1000
                        revives += 1
                        events.append(("revive_watch", i, it["id"], None, "", it["source_time"], t, {"seconds": watched}))
                    if lamps <= 0 or (i == boss and rnd.random() < 0.25):
                        result = "dawn"
                        break
                    done += 1
                    events.append(("room_done", i, "", None, "", None, t, {}))
                if result == "cleared":
                    events.append(("boss_win", boss, "", None, "", None, t, {}))
                    events.append(("clear", None, "", None, "", None, t, {}))
                    points += 150
                conn.execute("INSERT INTO play_run (id, viewer_id, replay_id, channel_id, started_at, ended_at, result, rooms_done, lamps_left, "
                             "points, correct_cnt, wrong_cnt, revive_cnt, duration_s) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                             (run_id, vid, r["id"], cid, t0, t, result, done, max(0, lamps), points,
                              sum(1 for e in events if e[0] == "answer" and e[3]), wrong, revives, (t - t0) // 1000))
                conn.executemany("INSERT INTO play_event (run_id, viewer_id, replay_id, type, room, ref, correct, choice, source_time, ts, extra) "
                                 "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                 [(run_id, vid, r["id"], e[0], e[1], e[2], e[3], e[4], e[5], e[6], json.dumps(e[7])) for e in events])
                db.upsert(conn, "viewer_replay", {"viewer_id": vid, "replay_id": r["id"], "channel_id": cid}, ("viewer_id", "replay_id"))
                conn.execute("UPDATE viewer_replay SET runs = runs + 1, best_points = MAX(best_points, ?), "
                             "cleared_at = COALESCE(cleared_at, CASE WHEN ? = 'cleared' THEN ? END) WHERE viewer_id = ? AND replay_id = ?",
                             (points, result, t, vid, r["id"]))
                n_runs += 1
            out[r["id"]] = n_runs
    return out
