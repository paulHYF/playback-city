"""直播质量分析报告：直播原始数据（观看 / 聊天 / 答题卡 / 问卷）+ 回放城数据（殿室错误率 / 高频疑问 / 闯关）
按培训、营销两个维度打分并给出诊断。

指标与诊断全部由程序按真实数据算；大模型只在 ai_review 里写点评，不改任何数值。
"""
import json
import re
from collections import Counter
from datetime import datetime

from app import play, rawdata, repo, storage
from app.config import get_settings
from app.db import now_ms
from app.llm.client import chat_json

STAFF = {"teacher", "assistant", "manager", "guest"}
QUESTION_RE = re.compile(r"[?？]|吗|怎么|为什么|能不能|可以.{0,6}吗|多少|哪")
TOPICS = {
    "course": {
        "没听懂 / 求重讲": r"不懂|没懂|听不懂|没听懂|再讲|太快|什么意思|为什么|晕",
        "理解反馈": r"懂了|明白|会了|学到|清楚|原来|get",
        "实操 / 作业": r"作业|练习|代码|报错|运行|编辑器|敲",
        "签到寒暄": r"打卡|来了|晚上好|老师好|签到",
    },
    "commerce": {
        "价格优惠": r"价|优惠|券|满减|减|便宜|贵|多少钱|折",
        "物流发货": r"包邮|发货|快递|运费|几天到|偏远",
        "售后保障": r"退|换|售后|运费险|保修|质量",
        "规格材质": r"尺寸|规格|多大|毫升|材质|成分|真丝|羊毛|羊绒|不锈钢|面料",
        "下单意向": r"买|下单|拍|链接|库存|想要|抢|上车|冲",
    },
}
INTENT_RE = re.compile(TOPICS["commerce"]["下单意向"] + "|" + TOPICS["commerce"]["价格优惠"])
CONFUSED_RE = re.compile(TOPICS["course"]["没听懂 / 求重讲"])


def _ratio(a, b):
    return round(a / b, 3) if b else None


def _hms(v) -> int:
    if isinstance(v, (int, float)):
        return int(v)
    s = 0
    for part in str(v or "0").split(":"):
        s = s * 60 + int(part or 0)
    return s


def _start_ms(record: dict) -> int | None:
    s = str(record.get("startTime") or "")
    if len(s) == 14 and s.isdigit():
        return int(datetime.strptime(s, "%Y%m%d%H%M%S").timestamp() * 1000)
    return None


def _contents(data) -> list:
    if isinstance(data, list):
        return data
    return (data or {}).get("contents") or []


def _room_at(rooms: list[dict], t: float) -> dict | None:
    return next((r for r in rooms if r["start"] <= t <= r["end"]), None)


def _letters(answer: str) -> list[str]:
    return re.findall(r"[A-Z]", str(answer or "").upper())


# ───────── 单讲：观看（直播 / 回放分开）─────────

REVIEW_BIN = 30  # 重点回顾热度按 30 秒一格
VOD_AGE = ["当天", "1–3 天", "4–7 天", "7 天后"]


def _per_viewer(logs: list[dict]) -> dict[str, dict]:
    """观看日志一次播放一条，按观众合并：播放次数、累计播放秒数、首次与各次进出时间。"""
    out: dict[str, dict] = {}
    for g in logs:
        vid = g.get("param1") or g.get("param2") or g.get("playId")
        v = out.setdefault(vid, {"nick": g.get("param2") or "", "plays": 0, "seconds": 0, "first": None, "spans": []})
        v["plays"] += 1
        v["seconds"] += int(g.get("playDuration") or 0)
        a = g.get("firstActiveTime") or g.get("createdTime")
        b = g.get("lastActiveTime") or (a + int(g.get("stayDuration") or 0) * 1000 if a else None)
        if a:
            v["first"] = a if v["first"] is None else min(v["first"], a)
            v["spans"].append((a, b or a))
    return out


def _completion(viewers: dict[str, dict], duration: int) -> tuple[float | None, list[int]]:
    ratios = [min(1.0, v["seconds"] / duration) for v in viewers.values()] if duration else []
    buckets = [0, 0, 0, 0]  # 观看时长占回放时长 <25% / 25–50% / 50–75% / ≥75%
    for x in ratios:
        buckets[min(3, int(x * 4))] += 1
    return (round(sum(ratios) / len(ratios), 3) if ratios else None), buckets


def _live(logs: list[dict], duration: int, start: int | None, rooms: list[dict]) -> dict:
    """直播：到场与留存。在线人数曲线按分钟统计，找出下降最多的一分钟作为流失点。"""
    viewers = _per_viewer(logs)
    completion, buckets = _completion(viewers, duration)
    minutes = max(1, -(-duration // 60)) if duration else 1
    online = [0] * minutes
    if start:
        for v in viewers.values():
            for k in range(minutes):
                mid = start + k * 60000 + 30000
                if any(a <= mid <= b for a, b in v["spans"]):
                    online[k] += 1
    drop = None
    if any(online) and minutes > 2:
        k = max(range(1, minutes - 1), key=lambda i: online[i - 1] - online[i])  # 最后一分钟自然散场，不算
        if online[k - 1] - online[k] > 0:
            drop = {"minute": k, "lost": online[k - 1] - online[k], "room": (_room_at(rooms, k * 60) or {}).get("title")}
    n = len(viewers)
    return {"viewers": n, "plays": len(logs), "avgWatch": round(sum(v["seconds"] for v in viewers.values()) / n) if n else 0,
            "completion": completion, "buckets": buckets, "online": online, "peak": max(online) if any(online) else 0, "drop": drop}


def _vod(logs: list[dict], live_logs: list[dict], duration: int, start: int | None) -> dict:
    """回放：谁来看（补看 / 只看回放）、看几遍、什么时候看。"""
    viewers, live = _per_viewer(logs), _per_viewer(live_logs)
    completion, buckets = _completion(viewers, duration)
    live_short = {k for k, v in live.items() if duration and v["seconds"] / duration < 0.5}  # 直播没看到一半的人
    age = [0, 0, 0, 0]
    if start:
        for v in viewers.values():
            if v["first"]:
                d = (v["first"] - start) / 86400000
                age[0 if d < 1 else 1 if d < 4 else 2 if d < 8 else 3] += 1
    n = len(viewers)
    return {"viewers": n, "plays": len(logs), "avgWatch": round(sum(v["seconds"] for v in viewers.values()) / n) if n else 0,
            "completion": completion, "buckets": buckets,
            "repeat": sum(1 for v in viewers.values() if v["plays"] >= 2),
            "fromLive": sum(1 for k in viewers if k in live), "vodOnly": sum(1 for k in viewers if k not in live),
            "liveShort": len(live_short), "makeup": sum(1 for k in viewers if k in live_short),
            "age": age}


def _review(ranges: list[dict], duration: int, rooms: list[dict], faq: list[dict], live: dict, chat_peak: dict | None) -> dict:
    """回放重点回顾段：回放城里观众回看过的区间叠加成热度，取连续的高热区间，并标注为什么大家回看。"""
    bins = max(1, -(-duration // REVIEW_BIN)) if duration else 0
    viewers = [set() for _ in range(bins)]
    seconds = [0] * bins
    sources = Counter(x["source"] for x in ranges)
    for x in ranges:
        a, b = max(0, x["from"]), min(duration, x["to"])
        for k in range(a // REVIEW_BIN, min(bins, -(-b // REVIEW_BIN))):
            lo, hi = max(a, k * REVIEW_BIN), min(b, (k + 1) * REVIEW_BIN)
            if hi > lo:
                viewers[k].add(x["viewer"])
                seconds[k] += hi - lo
    heat = [len(v) for v in viewers]
    top = max(heat) if heat else 0
    segments = []
    if top:
        k = 0
        while k < bins:
            if heat[k] >= top * 0.6:
                j = k
                while j + 1 < bins and heat[j + 1] >= top * 0.6:
                    j += 1
                segments.append((k, j))
                k = j + 1
            else:
                k += 1
    out = []
    for k, j in sorted(segments, key=lambda s: -max(heat[s[0]:s[1] + 1]))[:5]:
        a, b = k * REVIEW_BIN, min(duration, (j + 1) * REVIEW_BIN)
        room = _room_at(rooms, (a + b) / 2) or _room_at(rooms, a)
        reasons = []
        if room and room.get("fail_rate", 0) >= 0.4:
            reasons.append(f"答题错误率 {room['fail_rate'] * 100:.0f}%")
        hits = [f for f in faq if a <= f["source_time"] <= b]
        if hits:
            reasons.append(f"高频疑问「{hits[0]['question']}」")
        if live.get("drop") and a <= live["drop"]["minute"] * 60 + 30 <= b + 30:
            reasons.append("直播在这里流失最多")
        if chat_peak and a <= chat_peak["minute"] * 60 + 30 <= b + 30:
            reasons.append("直播弹幕高峰")
        out.append({"from": a, "to": b, "viewers": len(set().union(*viewers[k:j + 1])), "seconds": sum(seconds[k:j + 1]),
                    "room": room["title"] if room else None, "reasons": reasons})
    return {"bin": REVIEW_BIN, "heat": heat, "seconds": seconds, "ranges": len(ranges),
            "reviewers": len({x["viewer"] for x in ranges}), "sources": dict(sources), "segments": out}


# ───────── 单讲 ─────────

def replay_metrics(r: dict, raw, ranges: list[dict]) -> dict:
    record = rawdata.load(raw, "record_file") or {}
    duration = r["duration_s"] or _hms(record.get("duration"))
    start = _start_ms(record)
    game = r.get("game_json") or {}
    rooms = game.get("rooms") or []

    live_logs, vod_logs = rawdata.load(raw, "viewlog_live"), rawdata.load(raw, "viewlog_vod")
    split = live_logs is not None or vod_logs is not None
    if not split:  # 旧数据只有按观众汇总、直播回放混在一起的观看记录，先全部当直播看，提示补拉
        live_logs = [{"param1": v.get("viewerId"), "param2": v.get("nick"), "playDuration": _hms(v.get("totalDuration"))}
                     for v in _contents(rawdata.load(raw, "viewlog"))]
    live = _live(live_logs or [], duration, start, rooms)
    vod = _vod(vod_logs or [], live_logs or [], duration, start)
    viewers = live["viewers"]

    chat = [m for m in _contents(rawdata.load(raw, "chat")) if m.get("userType") not in STAFF and m.get("content")]
    speakers = {(m.get("user") or {}).get("userId") or (m.get("user") or {}).get("nickname") for m in chat}
    minutes = max(1, -(-duration // 60)) if duration else 1
    heat = [0] * minutes
    if start:
        for m in chat:
            k = int((m["time"] - start) // 60000)
            if 0 <= k < minutes:
                heat[k] += 1
    peak = max(range(minutes), key=lambda k: heat[k]) if any(heat) else None
    topics = {s: {name: sum(1 for m in chat if re.search(pat, m["content"], re.I)) for name, pat in pats.items()}
              for s, pats in TOPICS.items()}

    quiz = rawdata.load(raw, "quiz") or []
    cards = []
    for c in quiz:
        offset = (c["sendTime"] - start) / 1000 if start and c.get("sendTime") else None
        room = _room_at(rooms, offset) if offset is not None else None
        cards.append({"title": str(c.get("questionTitle") or "").split("\n")[0], "total": c.get("total") or 0,
                      "correct": c.get("correctCount") or 0, "correctRate": _ratio(c.get("correctCount") or 0, c.get("total") or 0),
                      "offset": offset, "room": room["title"] if room else None})
    quiz_total = sum(c["total"] for c in cards)

    qn = rawdata.load(raw, "questionnaire") or []
    submitters = {u.get("viewerId") or u.get("nickname") for q in qn for u in q.get("users") or []}
    questions: dict[str, dict] = {}
    scores = []
    for q in qn:
        for u in q.get("users") or []:
            for a in u.get("answers") or []:
                st = questions.setdefault(a["questionId"], {"name": a.get("questionName") or "", "type": a.get("type") or "", "answers": 0, "options": Counter()})
                st["answers"] += 1
                letters = _letters(a.get("answer"))
                st["options"].update(letters)
                if a.get("type") == "X" and letters:  # 打分题 A–E 对应 1–5 分
                    scores.append(ord(letters[0]) - 64)

    faq = sorted(game.get("faq") or [], key=lambda f: -f["count"])
    hard = sorted([rm for rm in rooms if rm.get("fail_rate", 0) >= 0.5], key=lambda rm: -rm["fail_rate"])
    chat_peak = None if peak is None else {"minute": peak, "count": heat[peak], "room": (_room_at(rooms, peak * 60 + 30) or {}).get("title")}
    return {
        "id": r["id"], "no": r["sort_no"], "title": r["title"], "duration": duration, "gameReady": r["game_status"] == "ready",
        "hasRaw": raw.is_dir(), "viewSplit": split,
        "live": live, "vod": vod, "review": _review(ranges, duration, rooms, faq, live, chat_peak),
        "chat": {"messages": len(chat), "speakers": len(speakers), "speakRate": _ratio(len(speakers), viewers),
                 "perMinute": round(len(chat) / minutes, 2) if duration else None,
                 "questions": sum(1 for m in chat if QUESTION_RE.search(m["content"])),
                 "intent": sum(1 for m in chat if INTENT_RE.search(m["content"])),
                 "confused": sum(1 for m in chat if CONFUSED_RE.search(m["content"])),
                 "heat": heat, "peak": chat_peak,
                 "topics": topics},
        "asks": len(rawdata.load(raw, "questions") or []),
        "quiz": {"cards": cards, "count": len(cards), "answers": quiz_total,
                 "participation": _ratio(quiz_total / len(cards), viewers) if cards and viewers else None,
                 "correctRate": _ratio(sum(c["correct"] for c in cards), quiz_total)},
        "questionnaire": {"count": len(qn), "submitters": len(submitters), "rate": _ratio(len(submitters), viewers),
                          "satisfaction": round(sum(scores) / len(scores), 2) if scores else None,
                          "questions": [{"name": q["name"], "type": q["type"], "answers": q["answers"],
                                         "options": [{"key": k, "count": n} for k, n in sorted(q["options"].items())]}
                                        for q in questions.values()]},
        "rooms": [{"title": rm["title"], "start": rm["start"], "end": rm["end"], "failRate": rm.get("fail_rate", 0),
                   "items": len(rm.get("items") or []), "keywords": rm.get("keywords") or []} for rm in rooms],
        "hardRooms": [{"title": rm["title"], "start": rm["start"], "end": rm["end"], "failRate": rm["fail_rate"]} for rm in hard],
        "faq": [{"question": f["question"], "count": f["count"], "sourceTime": f["source_time"]} for f in faq[:8]],
        "faqTotal": sum(f["count"] for f in faq),
    }


# ───────── 维度打分 ─────────

def _indicator(key, name, value, low, high, weight, fmt="pct", tip=""):
    """value 落在 [low, high] 之间线性折算 0–100 分；没有数据时不计入维度总分。"""
    if value is None:
        return {"key": key, "name": name, "value": None, "display": "无数据", "score": None, "level": "none", "weight": weight, "tip": tip}
    score = round(max(0.0, min(1.0, (value - low) / (high - low))) * 100)
    display = {"pct": f"{value * 100:.0f}%", "score5": f"{value:.1f} / 5", "num": f"{value:g}"}[fmt]
    level = "good" if score >= 80 else "fair" if score >= 60 else "poor"
    return {"key": key, "name": name, "value": value, "display": display, "score": score, "level": level, "weight": weight, "tip": tip}


def _dimension(indicators: list[dict]) -> int | None:
    scored = [i for i in indicators if i["score"] is not None]
    w = sum(i["weight"] for i in scored)
    return round(sum(i["score"] * i["weight"] for i in scored) / w) if w else None


def _mmss(s) -> str:
    s = int(s or 0)
    return f"{s // 60:02d}:{s % 60:02d}"


def _view_findings(it: dict, unit: str) -> list[str]:
    """直播流失点 + 回放重点回顾段，两个维度共用。"""
    out = []
    d = it["live"]["drop"]
    if d and d["lost"] >= 2:
        out.append(f"第 {it['no']} {unit}直播第 {d['minute'] + 1} 分钟流失最多（{d['lost']} 人离开）" + (f"，正在讲「{d['room']}」" if d["room"] else ""))
    for sg in it["review"]["segments"][:3]:
        out.append(f"第 {it['no']} {unit}回放重点回顾段 {_mmss(sg['from'])}–{_mmss(sg['to'])}" + (f"「{sg['room']}」" if sg["room"] else "")
                   + f"：{sg['viewers']} 人回看" + (f"，{'、'.join(sg['reasons'])}" if sg["reasons"] else ""))
    return out


def _training(agg: dict, items: list[dict], kpi: dict, commerce: bool) -> dict:
    unit = "场" if commerce else "讲"
    ind = [
        _indicator("completion", "直播完课率", agg["completion"], 0.3, 0.8, 25, tip="直播观众平均观看时长 / 直播时长"),
        _indicator("speakRate", "互动发言率", agg["speakRate"], 0.1, 0.5, 10, tip="发过言的观众 / 直播观众数"),
        _indicator("quizPart", "答题参与率", agg["quizPart"], 0.3, 0.8, 15, tip="每张答题卡平均作答人数 / 直播观众数"),
        _indicator("quizCorrect", "知识掌握度", agg["quizCorrect"], 0.5, 0.9, 25, tip="答题卡答对人次 / 作答人次"),
        _indicator("feedback", "课后反馈率", agg["qnRate"], 0.1, 0.5, 5, tip="提交问卷人数 / 直播观众数"),
        _indicator("satisfaction", "讲解满意度", agg["satisfaction"], 3.0, 4.6, 10, "score5", "问卷打分题平均分"),
        _indicator("makeup", "回放补课率", agg["makeupRate"], 0.2, 0.6, 10, tip="直播没看到一半的观众里，回头看了回放的比例"),
    ]
    if kpi["runs"]:
        ind.append(_indicator("clearRate", "回放城复习通关率", kpi["clearRate"], 0.2, 0.7, 10, tip="回放城闯关通关的观众 / 闯关观众"))
    findings, actions = [], []
    for it in items:
        for rm in it["hardRooms"][:3]:
            findings.append(f"第 {it['no']} {unit}「{rm['title']}」（{_mmss(rm['start'])}–{_mmss(rm['end'])}）答题错误率 {rm['failRate'] * 100:.0f}%，"
                            + ("观众对这段商品信息理解不到位" if commerce else "是知识难点"))
            actions.append(f"「{rm['title']}」讲解时补充参数对比与使用演示，讲完立即发卡确认" if commerce
                           else f"「{rm['title']}」补一段例题讲解或课后练习，并在下一讲开场回顾")
        if it["faq"]:
            top = it["faq"][0]
            findings.append(f"第 {it['no']} {unit}被问最多的是「{top['question']}」（{top['count']} 人次，{_mmss(top['sourceTime'])}）")
        if it["chat"]["confused"] >= 3:
            findings.append(f"第 {it['no']} {unit}有 {it['chat']['confused']} 条弹幕表达没听懂或求重讲")
        b = it["live"]["buckets"]
        if it["live"]["viewers"] and b[0] / it["live"]["viewers"] >= 0.3:
            findings.append(f"第 {it['no']} {unit}直播 {b[0]} 位观众看了不到 1/4 就离开，开场吸引力不足")
            actions.append("开场 3 分钟内亮出本场福利和主推商品，减少早退" if commerce
                           else "开场 3 分钟内交代本讲能学会什么、给出成品演示，减少早退")
        findings += _view_findings(it, unit)
        for sg in it["review"]["segments"][:2]:
            actions.append(f"「{sg['room'] or _mmss(sg['from'])}」被反复回看，剪成知识点微课单独分发，并在下一讲开场补讲" if not commerce
                           else f"「{sg['room'] or _mmss(sg['from'])}」被反复回看，剪成商品讲解切片用于投放和详情页")
    if agg["faqTotal"]:
        actions.append(f"把 {agg['faqTotal']} 人次的高频疑问整理成商品知识卡，用于主播与客服培训" if commerce
                       else f"把 {agg['faqTotal']} 人次的高频疑问整理进讲义 FAQ（回放城已自动生成，可直接分发）")
    if agg["quizPart"] is not None and agg["quizPart"] < 0.5:
        actions.append("答题卡参与偏低：发题前口播提醒、缩短题干，并在讲完对应知识点后立即发题")
    return {"score": _dimension(ind), "indicators": ind, "findings": findings, "actions": list(dict.fromkeys(actions))}


def _marketing(agg: dict, items: list[dict], commerce: bool) -> dict:
    unit = "场" if commerce else "讲"
    ind = [
        _indicator("completion", "直播观看留存", agg["completion"], 0.3, 0.7, 20, tip="直播观众平均观看时长 / 直播时长"),
        _indicator("perMinute", "互动热度", agg["perMinute"], 2, 10, 15, "num", "每分钟观众弹幕数"),
        _indicator("speakRate", "发言渗透率", agg["speakRate"], 0.1, 0.5, 10, tip="发过言的观众 / 直播观众数"),
        _indicator("reach", "回放二次触达", agg["vodReach"], 0.1, 0.5, 10, tip="回放观众数 / 直播观众数，回放带来的额外曝光"),
        _indicator("intent", "购买意向信号", agg["intentRate"], 0.05, 0.3, 20, tip="涉及下单、链接、价格、优惠的弹幕占比"),
        _indicator("cognition", "卖点认知度", agg["quizCorrect"], 0.5, 0.9, 15, tip="商品知识答题卡答对率"),
        _indicator("leads", "问卷留资率", agg["qnRate"], 0.1, 0.5, 5, tip="提交问卷人数 / 直播观众数"),
        _indicator("satisfaction", "主播讲解满意度", agg["satisfaction"], 3.0, 4.6, 10, "score5", "问卷打分题平均分"),
    ]
    findings, actions = [], []
    topics = agg["topics"]["commerce"]
    if sum(topics.values()):
        top = [f"{k} {n} 条" for k, n in topics.most_common(3) if n]
        findings.append("观众关注点：" + "、".join(top))
        first = topics.most_common(1)[0][0]
        actions.append({"价格优惠": "把到手价、券和满减规则做成常驻贴片，每个商品讲解结尾复述一次",
                        "物流发货": "开场和返场时口播包邮范围与发货时效，偏远地区规则写进商品卡",
                        "售后保障": "明确运费险、七天无理由和拆封规则，降低下单顾虑",
                        "规格材质": "增加实物对比与规格特写镜头，尺寸和材质用字幕标注",
                        "下单意向": "意向集中时及时上链接、口播库存，缩短从心动到下单的路径"}[first])
    for it in items:
        for rm in it["hardRooms"][:3]:
            findings.append(f"第 {it['no']} {unit}「{rm['title']}」（{_mmss(rm['start'])}–{_mmss(rm['end'])}）{"卖点认知" if commerce else "答题"}错误率 {rm['failRate'] * 100:.0f}%，观众没记住关键信息")
            actions.append(f"「{rm['title']}」复播时把核心卖点压缩成三句话，配合对比演示" if commerce
                           else f"把「{rm['title']}」的核心价值压缩成三句话，用于课程宣传和复播开场")
        pk = it["chat"]["peak"]
        if pk and pk["count"]:
            findings.append(f"第 {it['no']} {unit}弹幕峰值在第 {pk['minute'] + 1} 分钟（{pk['count']} 条）" + (f"，对应「{pk['room']}」" if pk["room"] else ""))
        if it["faq"]:
            label = "最大购买顾虑" if commerce else "观众最集中的疑问（可转化为咨询话术）"
            findings.append(f"第 {it['no']} {unit}{label}：「{it['faq'][0]['question']}」（{it['faq'][0]['count']} 人次）")
        findings += _view_findings(it, unit)
        v = it["vod"]
        if v["viewers"] and v["vodOnly"]:
            findings.append(f"第 {it['no']} {unit}回放带来 {v['vodOnly']} 位没看直播的新观众"
                            + (f"，{v['age'][2] + v['age'][3]} 位在直播 4 天后才来看" if v["age"][2] + v["age"][3] else ""))
            actions.append("回放有长尾流量：回放页挂常驻购买链接与优惠，别只在直播时上链接" if commerce
                           else "回放有长尾流量：回放页挂报名入口与资料领取，持续转化")
        for sg in it["review"]["segments"][:2]:
            actions.append(f"「{sg['room'] or _mmss(sg['from'])}」是回放观众最想看的段落，剪成切片做二次投放" if commerce
                           else f"「{sg['room'] or _mmss(sg['from'])}」是回放观众最想看的段落，剪成试听片段用于课程宣传")
        b = it["live"]["buckets"]
        if it["live"]["viewers"] and b[3] / it["live"]["viewers"] < 0.3:
            actions.append("看到最后的观众不足三成：把福利、抽奖或返场优惠放在后半场并提前预告" if commerce
                           else "看到最后的观众不足三成：把资料领取、课程福利或报名入口放在后半场并提前预告")
    if agg["faqTotal"]:
        actions.append("把高频疑问整理成客服快捷回复与商品详情页 FAQ" if commerce else "把高频疑问整理成课程咨询话术与招生页 FAQ")
    return {"score": _dimension(ind), "indicators": ind, "findings": findings, "actions": list(dict.fromkeys(actions))}


def _aggregate(items: list[dict]) -> dict:
    with_view = [i for i in items if i["live"]["viewers"]]
    viewers = sum(i["live"]["viewers"] for i in items)
    vod_viewers = sum(i["vod"]["viewers"] for i in items)
    live_short = sum(i["vod"]["liveShort"] for i in items if i["viewSplit"])
    messages = sum(i["chat"]["messages"] for i in items)
    minutes = sum(len(i["chat"]["heat"]) for i in items if i["chat"]["perMinute"] is not None)
    quiz_ans = sum(i["quiz"]["answers"] for i in items)
    part = [(i["quiz"]["participation"], i["live"]["viewers"]) for i in items if i["quiz"]["participation"] is not None]
    sat = [(i["questionnaire"]["satisfaction"], i["questionnaire"]["submitters"]) for i in items if i["questionnaire"]["satisfaction"] is not None]
    topics = {s: Counter() for s in TOPICS}
    for i in items:
        for s, counts in i["chat"]["topics"].items():
            topics[s].update(counts)
    weighted = lambda pairs: round(sum(v * w for v, w in pairs) / sum(w for _, w in pairs), 3) if pairs and sum(w for _, w in pairs) else None
    return {
        "replays": len(items), "analyzed": sum(1 for i in items if i["hasRaw"]), "duration": sum(i["duration"] for i in items),
        "viewers": viewers, "messages": messages, "speakers": sum(i["chat"]["speakers"] for i in items),
        "completion": weighted([(i["live"]["completion"], i["live"]["viewers"]) for i in with_view if i["live"]["completion"] is not None]),
        "viewSplit": any(i["viewSplit"] for i in items), "vodViewers": vod_viewers,
        "vodCompletion": weighted([(i["vod"]["completion"], i["vod"]["viewers"]) for i in items if i["vod"]["completion"] is not None]),
        "vodRepeat": sum(i["vod"]["repeat"] for i in items), "vodOnly": sum(i["vod"]["vodOnly"] for i in items),
        "vodReach": _ratio(vod_viewers, viewers) if any(i["viewSplit"] for i in items) else None,
        "makeupRate": _ratio(sum(i["vod"]["makeup"] for i in items), live_short) if live_short else None,
        "reviewers": sum(i["review"]["reviewers"] for i in items), "reviewRanges": sum(i["review"]["ranges"] for i in items),
        "speakRate": _ratio(sum(i["chat"]["speakers"] for i in items), viewers),
        "perMinute": round(messages / minutes, 2) if minutes and (messages or viewers) else None,
        "intentRate": _ratio(sum(i["chat"]["intent"] for i in items), messages),
        "quizCount": sum(i["quiz"]["count"] for i in items), "quizAnswers": quiz_ans,
        "quizPart": weighted(part), "quizCorrect": _ratio(sum(c["correct"] for i in items for c in i["quiz"]["cards"]), quiz_ans),
        "qnRate": _ratio(sum(i["questionnaire"]["submitters"] for i in items), viewers) if any(i["questionnaire"]["count"] for i in items) else None,
        "satisfaction": weighted(sat), "faqTotal": sum(i["faqTotal"] for i in items), "topics": topics,
    }


def channel_report(cid: str) -> dict | None:
    ch = repo.get_channel(cid)
    if not ch:
        return None
    replays = repo.list_replays(cid, with_game=True)
    items = [replay_metrics(r, rawdata.replay_dir(ch, r["id"]), play.review_ranges(r["id"])) for r in replays]
    kpi = play.dashboard(cid, replays)["kpi"]
    agg = _aggregate(items)
    commerce = ch["scene"] == "commerce"
    training, marketing = _training(agg, items, kpi, commerce), _marketing(agg, items, commerce)
    ai = storage.channel_dir(cid) / "report_ai.json"
    return {
        "channel": {"id": cid, "name": ch["name"], "scene": ch["scene"], "publisher": ch["publisher"], "city": (ch["city_json"] or {}).get("name")},
        "generatedAt": now_ms(),
        "summary": {**{k: v for k, v in agg.items() if k != "topics"},
                    "topics": {s: dict(c) for s, c in agg["topics"].items()}, "play": kpi},
        "dimensions": {"training": training, "marketing": marketing},
        "replays": items,
        "ai": storage.read_json(ai) if ai.is_file() else None,
    }


AI_PROMPT = """你是保利威的直播运营与教学质量顾问。根据给你的直播质量分析数据（全部是程序按真实数据算出的指标，不要改动或编造数字），
从培训和营销两个维度写一份简短的点评。场景字段说明这场直播主要是课程培训还是直播带货，主维度写得更深入，另一维度给出可借鉴的观察。

只输出一个 JSON 对象：
{"summary": "≤120 字的总评", "training": ["培训维度要点，每条 ≤60 字，3–5 条"], "marketing": ["营销维度要点，每条 ≤60 字，3–5 条"],
 "actions": ["下一场最该做的改进，每条 ≤50 字，按优先级 3 条"]}
"""


async def ai_review(cid: str) -> dict:
    rep = channel_report(cid)
    brief = {
        "频道": rep["channel"], "汇总": rep["summary"],
        "维度": {k: {"score": d["score"], "指标": [(i["name"], i["display"]) for i in d["indicators"]], "发现": d["findings"]}
                 for k, d in rep["dimensions"].items()},
        "各讲": [{"讲次": i["no"], "标题": i["title"], "直播": {k: i["live"][k] for k in ("viewers", "completion", "drop")},
                  "回放": {k: i["vod"][k] for k in ("viewers", "completion", "repeat", "vodOnly", "makeup", "age")},
                  "重点回顾段": i["review"]["segments"],
                  "弹幕": i["chat"]["messages"], "答题正确率": i["quiz"]["correctRate"], "难点": i["hardRooms"],
                  "高频疑问": i["faq"][:3]} for i in rep["replays"]],
    }
    data = await chat_json(get_settings(), AI_PROMPT, json.dumps(brief, ensure_ascii=False))
    out = {"summary": str(data.get("summary") or ""), "generatedAt": now_ms(),
           **{k: [str(x) for x in data.get(k) or []] for k in ("training", "marketing", "actions")}}
    storage.write_json(storage.channel_dir(cid) / "report_ai.json", out)
    return out
