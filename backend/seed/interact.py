"""答题卡与问卷：用开放接口创建，作答记录另行写入测试库（answers 子命令）。

在 backend 目录下运行：
  uv run python seed/interact.py create course     # 每间殿室挑一道题建答题卡 + 建问卷
"""
import asyncio
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import storage  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.polyv import PolyvClient  # noqa: E402
from seed import Scene, log  # noqa: E402

HERE = Path(__file__).parent


def game_of(sc: Scene) -> dict:
    gid = f"{sc.deck['theme']}-{sc.channel_id}-{sc.state['fileId']}"
    return storage.read_json(storage.game_dir(gid) / "game.json")


async def create(c: PolyvClient, sc: Scene):
    game = game_of(sc)
    rnd = random.Random(sc.channel_id)
    cards = dict(sc.state.get("cards", {}))
    for i, room in enumerate(game["rooms"]):
        it = max(room["items"], key=lambda x: len(x["explain"]))  # 讲解最充分的一题
        if it["id"] in cards:
            continue
        opts = it["options"][:]
        rnd.shuffle(opts)
        letter = "ABCD"[opts.index(it["options"][0])]
        name = (it["question"] + ("\n" + it["code"] if it["code"] else ""))[:200]
        await c.post("/live/v3/channel/interact/question/add-edit-question", channelId=sc.channel_id, type="R", itemType=0,
                     name=name, answer=letter, **{f"option{k + 1}": o for k, o in enumerate(opts)})
        cards[it["id"]] = {"room": i, "name": name, "answer": letter, "options": opts}
        sc.save(cards=cards)
        log("答题卡", i + 1, it["keyword"], "答案", letter)
    listed = await c.get("/live/v3/channel/interact/question/list-question", channelId=sc.channel_id)
    for card in cards.values():
        hit = next((q for q in (listed or {}).get("list") or [] if q.get("name") == card["name"]), None)
        if hit:
            card["questionId"] = hit.get("questionId")
    sc.save(cards=cards)
    log("答题卡共", len(cards), "张，已回填 questionId", sum(1 for v in cards.values() if v.get("questionId")))

    if not sc.state.get("questionnaireId"):
        q = json.loads((HERE / "questionnaires.json").read_text("utf-8"))[sc.name]
        # 文档写 options 数组，但 v4/save 的 QuestionReq 实际只认 option1..option10（interaction-service-api）
        q["questions"] = [{k: v for k, v in x.items() if k != "options"} | {f"option{i + 1}": o for i, o in enumerate(x.get("options", []))}
                          for x in q["questions"]]
        res = await c.post_json("/live/v4/channel/questionnaire/save", {"channelId": int(sc.channel_id), **q}, channelId=sc.channel_id)
        sc.save(questionnaireId=(res or {}).get("questionnaireId") if isinstance(res, dict) else res)
        log("问卷", q["questionnaireTitle"], sc.state["questionnaireId"])


async def main():
    cmd, scene = sys.argv[1], sys.argv[2]
    sc = Scene(scene)
    async with PolyvClient(get_settings()) as c:
        if cmd == "create":
            await create(c, sc)


if __name__ == "__main__":
    asyncio.run(main())
