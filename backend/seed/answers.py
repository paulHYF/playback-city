"""答题卡 / 问卷的观众作答：直接写测试库 interaction_db（没有提交作答的开放接口）。

存储（只读调研 + 源码确认）：answer_record 存两类作答（questionnaireId 为空=答题卡）；
答题卡发送记录 channel_session_interact_record(type=1)；问卷需 status='forbidden' 才能查到结果。
查询：/live/v3/channel/question/answer-records、/live/v3/channel/questionnaire/answer-records（按 sessionId 或日期）。
造的作答 recordId 以 bn 开头（课程 bnu、带货 bnm）；清理：python seed/answers.py <scene> --clean

  python seed/answers.py course
"""
import json
import os
import random
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).parent
BACKEND = HERE.parent
USER_ID = "0f9d966433"
AVATAR = "https://s1.videocc.net/default-img/avatar/viewer.png"

# 每间殿室的答错率：集中在讲稿里埋的易错点
WRONG_RATE = {
    "course": [0.08, 0.45, 0.35, 0.62, 0.55, 0.30, 0.25, 0.40],  # 增删改（append/extend、c=b）与字典（KeyError/get）最难
    "commerce": [0.12, 0.25, 0.45, 0.40, 0.30, 0.50],            # 羊毛 vs 羊绒、两件装颜色、咖啡拆封退货
}
# 问卷多选题的勾选概率（按选项顺序）
SURVEY = {
    "course": {"R": [0.08, 0.52, 0.32, 0.08], "C": [0.38, 0.30, 0.55, 0.48, 0.52, 0.22, 0.18, 0.35], "X": [0, 0.02, 0.1, 0.38, 0.5],
               "Q": ["append 和 extend 能再多举几个例子吗", "KeyError 那里希望多讲讲实际项目里怎么处理", "节奏刚好，期待函数那一讲",
                     "c = b 那个坑讲得很清楚", "词频统计能不能出一道课后练习的答案"]},
    "commerce": {"R0": [0.35, 0.28, 0.17, 0.20], "C": [0.55, 0.48, 0.42, 0.38, 0.22], "R1": [0.30, 0.25, 0.20, 0.15, 0.10],
                 "X": [0, 0.03, 0.12, 0.40, 0.45]},
}


def db(sql: str) -> str:
    env = {**os.environ, "MYSQL_PWD": os.environ["TEST_INTERACTION_DB_PASS"]}
    r = subprocess.run(["mysql", "--connect-timeout=10", "-h", os.environ["TEST_INTERACTION_DB_HOST"], "-P", os.environ["TEST_INTERACTION_DB_PORT"],
                        "-u", os.environ["TEST_INTERACTION_DB_USER"], "interaction_db", "-N", "-e", sql], capture_output=True, text=True, env=env)
    if r.returncode:
        raise SystemExit("MySQL 报错：" + r.stderr.strip()[:500])
    return r.stdout


def q(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, datetime):
        v = v.strftime("%Y-%m-%d %H:%M:%S")
    return "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"


def main():
    scene, flags = sys.argv[1], sys.argv[2:]
    state = json.loads((HERE / "out" / scene / "state.json").read_text("utf-8"))
    channel = json.loads((HERE / "channels.json").read_text("utf-8"))[scene]["channelId"]
    theme = json.loads((HERE / f"{scene}.json").read_text("utf-8"))["theme"]
    session, qn = state["sessionId"], state["questionnaireId"]
    clean = (f"DELETE FROM answer_record WHERE channelId={channel} AND recordId LIKE 'bn%';"
             f"DELETE FROM channel_session_interact_record WHERE channelId={channel} AND sessionId={q(session)} AND type=1;"
             f"UPDATE questionnaire SET status='saved' WHERE questionnaireId={q(qn)};"
             f"UPDATE question SET times=0, status='draft' WHERE channelId={channel} AND questionId IN "
             f"({','.join(q(c['questionId']) for c in state['cards'].values())});")
    if "--clean" in flags:
        db(clean)
        print("已清理", scene)
        return

    game = json.loads((BACKEND / "data" / f"{theme}-{channel}-{state['fileId']}" / "game.json").read_text("utf-8"))
    viewers = [line.split(maxsplit=1) for line in (HERE / f"{scene}_viewers.txt").read_text("utf-8").splitlines() if line.strip()]
    viewers = [(f"bny_{v}", n.strip()) for v, n in viewers]
    live_start = datetime.fromtimestamp(state["liveStart"] / 1000)
    duration = json.loads((HERE / "out" / scene / "timeline.json").read_text("utf-8"))["duration"]
    rnd = random.Random(f"{channel}-answers")
    seq = iter(range(1, 100000))
    rid = lambda: f"bn{scene[2]}{next(seq):07d}"  # noqa: E731
    answers, sends = [], []

    def row(question_id, name, typ, answer, viewer, at, times=None, questionnaire=None):
        answers.append([rid(), question_id, channel, USER_ID, name, typ, answer, viewer[0], viewer[1], AVATAR,
                        at, at, at - timedelta(seconds=rnd.randint(1, 6)), times, session, questionnaire, "", ""])

    # 答题卡：殿室讲完时发题，约 8 成观众作答
    for card in state["cards"].values():
        room = game["rooms"][card["room"]]
        sent = live_start + timedelta(seconds=min(room["end"], duration - 30))
        sends.append([session, channel, USER_ID, 1, card["questionId"], "R", card["name"][:1000], 13, 1, sent, sent + timedelta(seconds=60)])
        wrong_rate = WRONG_RATE[scene][card["room"] % len(WRONG_RATE[scene])]
        wrong_letters = [l for l in "ABCD" if l != card["answer"]]
        for v in viewers:
            if rnd.random() > 0.8:
                continue
            pick = card["answer"] if rnd.random() > wrong_rate else rnd.choices(wrong_letters, weights=[3, 2, 1])[0]
            row(card["questionId"], card["name"], "R", pick, v, sent + timedelta(seconds=rnd.randint(5, 50)), times=1)

    # 问卷：直播尾声发布，约 7 成观众填写
    qs = [line.split("\t") for line in db(
        f"SELECT q.questionId,q.type,q.name FROM questionnaire_question qq JOIN question q ON q.questionId=qq.questionId "
        f"WHERE qq.questionnaireId={q(qn)} ORDER BY qq.sort, qq.createdTime").strip().splitlines()]
    published = live_start + timedelta(seconds=duration - 120)
    survey, r_seen = SURVEY[scene], 0
    for v in viewers:
        if rnd.random() > 0.7:
            continue
        at = published + timedelta(seconds=rnd.randint(20, 110))
        r_seen = 0
        for qid, typ, name in qs:
            if typ == "R":
                weights = survey.get(f"R{r_seen}") or survey["R"]
                r_seen += 1
                ans = "ABCDE"[rnd.choices(range(len(weights)), weights=weights)[0]]
            elif typ == "C":
                ans = "".join(l for l, p in zip("ABCDEFGHIJ", survey["C"]) if rnd.random() < p) or "A"
            elif typ == "X":
                ans = "ABCDE"[rnd.choices(range(5), weights=survey["X"])[0]]
            else:
                if rnd.random() > 0.3 or not survey.get("Q"):
                    continue
                ans = rnd.choice(survey["Q"])
            row(qid, name, typ, ans, v, at, questionnaire=qn)

    cols = "recordId,questionId,channelId,userId,name,type,answer,viewerId,nickname,avatar,createdTime,lastModified,submitTime,times,sessionId,questionnaireId,param4,param5"
    sql = clean + "".join(
        f"INSERT INTO answer_record ({cols}) VALUES " + ",".join("(" + ",".join(q(x) for x in r) + ")" for r in answers[i:i + 200]) + ";"
        for i in range(0, len(answers), 200))
    sql += ("INSERT INTO channel_session_interact_record (sessionId,channelId,userId,type,interactId,interactType,interactName,status,times,createdTime,lastModified) VALUES "
            + ",".join("(" + ",".join(q(x) for x in s) + ")" for s in sends) + ";")
    sql += (f"UPDATE question SET times=1, status='send' WHERE channelId={channel} AND questionId IN "
            f"({','.join(q(c['questionId']) for c in state['cards'].values())});")
    end = published + timedelta(minutes=2)
    sql += f"UPDATE questionnaire SET status='forbidden', publishedTime={q(published)}, endTime={q(end)}, lastModified={q(end)} WHERE questionnaireId={q(qn)};"
    if "--dry-run" in flags:
        print(len(answers), "条作答；", len(sends), "条发送记录")
        return
    db(sql)
    print(db(f"SELECT IF(questionnaireId IS NULL,'答题卡','问卷') k, COUNT(*), COUNT(DISTINCT viewerId) FROM answer_record "
             f"WHERE channelId={channel} AND recordId LIKE 'bn%' GROUP BY k"))


if __name__ == "__main__":
    main()
