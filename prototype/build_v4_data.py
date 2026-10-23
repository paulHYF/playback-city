"""把两场真实数据打包成 v4 demo 用的 v4-data.js（在 prototype 目录下运行：python3 build_v4_data.py）。

来源：backend/data/<gameId>/game.json 与 raw/（答题卡作答、暂存）、backend/seed/out/<scene>/timeline.json、seed/commerce.json 商品。
"""
import base64
import glob
import json
from pathlib import Path

HERE = Path(__file__).parent
BACK = HERE.parent / "backend"


CHANNEL = {"course": "8655755", "commerce": "8655744"}


def load(scene: str):
    d = Path(glob.glob(str(BACK / "data" / f"{scene}-{CHANNEL[scene]}-*"))[0])
    game = json.loads((d / "game.json").read_text("utf-8"))
    raw = d / "raw"
    quiz = json.loads((raw / "quiz.json").read_text("utf-8")) if (raw / "quiz.json").is_file() else []
    record = json.loads((raw / "record_file.json").read_text("utf-8"))
    return d, game, quiz, record


def start_ms(record):
    from datetime import datetime
    return int(datetime.strptime(str(record["startTime"]), "%Y%m%d%H%M%S").timestamp() * 1000)


def traces(game, quiz, record):
    """答题卡真实作答 → 每间殿室的痕迹：倒下人数、答错者与所选项。"""
    t0 = start_ms(record)
    out = {}
    for card in quiz:
        off = (card["sendTime"] - t0) / 1000
        room = next((i for i, r in enumerate(game["rooms"]) if r["start"] <= off <= r["end"] + 60), None)
        if room is None:
            continue
        opts = {"ABCDEFGH"[i]: o["title"] for i, o in enumerate(card.get("options") or [])}  # options 按 A/B/C… 顺序给出 title
        wrong = [r for r in card.get("records") or [] if not r.get("correct")]
        out[room] = {
            "question": card["questionTitle"].split("\n")[0], "total": card["total"], "wrong": len(wrong),
            "samples": [[r["nickname"], opts.get(r["answer"], r["answer"])] for r in wrong[:4]],
        }
    return out


def main():
    _, course, cquiz, crec = load("course")
    _, commerce, mquiz, mrec = load("commerce")
    tl = json.loads((BACK / "seed/out/commerce/timeline.json").read_text("utf-8"))
    deck = json.loads((BACK / "seed/commerce.json").read_text("utf-8"))
    state = json.loads((BACK / "seed/out/commerce/state.json").read_text("utf-8"))
    products = []
    for p in deck["products"]:
        slides = [s for s in tl["slides"] if s.get("product") == p["key"]]
        lines = [l for s in slides for l in s["lines"]]
        products.append({**p, "cover": state["products"][p["key"]]["cover"], "start": slides[0]["start"], "end": slides[-1]["end"],
                         "quotes": [l["text"] for l in lines][:6]})
    frame = base64.b64encode((HERE / "media/screen-course.jpg").read_bytes()).decode()
    data = {
        # 暂存文件名是上传时的素材文件名，标题改用讲稿标题
        "course": {**course, "replay": {**course["replay"], "title": json.loads((BACK / "seed/course.json").read_text("utf-8"))["title"]},
                   "traces": traces(course, cquiz, crec), "video": "media/course.mp4"},
        "commerce": {"title": deck["title"], "host": deck["host"], "video": "media/commerce.mp4", "products": products, "faq": commerce["faq"],
                     "rooms": [{"title": r["title"], "start": r["start"], "end": r["end"]} for r in commerce["rooms"]]},
        "series": [
            {"no": 1, "title": "变量与类型", "views": 2380, "state": "cleared"},
            {"no": 2, "title": "条件与循环", "views": 2105, "state": "cleared"},
            {"no": 3, "title": "列表、字典与循环", "views": 1862, "state": "open"},
            {"no": 4, "title": "函数与模块", "views": 0, "state": "locked"},
        ],
        "screen": "data:image/jpeg;base64," + frame,
    }
    (HERE / "v4-data.js").write_text("window.PC_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", "utf-8")
    print("rooms", len(course["rooms"]), "boss", course["boss_room"], "traces", sorted(data["course"]["traces"]), "products", [p["name"] for p in products])


if __name__ == "__main__":
    main()
