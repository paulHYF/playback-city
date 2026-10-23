"""把两个场景（课程 / 带货）的真实数据打包成 v5 demo 用的 v5-data.js（在 prototype 目录下运行：python3 build_v5_data.py）。

来源：backend/data/<scene>-<channelId>-<fileId>/game.json 与 raw/（字幕、答题卡作答、暂存），
backend/seed/<scene>.json（讲稿标题、商品）、seed/out/<scene>/timeline.json、state.json（商品封面）。
"""
import base64
import glob
import json
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
BACK = HERE.parent / "backend"
CHANNEL = {"course": "8655755", "commerce": "8655744"}
SERIES = {
    "course": [("变量与类型", 2380, "cleared"), ("条件与循环", 2105, "cleared"), (None, 1862, "open"), ("函数与模块", 0, "locked")],
    "commerce": [("夏日清凉专场", 3120, "cleared"), ("开学文具专场", 2460, "cleared"), (None, 1530, "open"), ("年货预售专场", 0, "locked")],
}


def read(p: Path):
    return json.loads(p.read_text("utf-8"))


def traces(game, quiz, record):
    """答题卡真实作答 → 每间殿室的痕迹：题目、作答人数、答错者与所选项。"""
    t0 = int(datetime.strptime(str(record["startTime"]), "%Y%m%d%H%M%S").timestamp() * 1000)
    out = {}
    for card in quiz:
        off = (card["sendTime"] - t0) / 1000
        room = next((i for i, r in enumerate(game["rooms"]) if r["start"] <= off <= r["end"] + 60), None)
        if room is None:
            continue
        opts = {"ABCDEFGH"[i]: o["title"] for i, o in enumerate(card.get("options") or [])}
        wrong = [r for r in card.get("records") or [] if not r.get("correct")]
        out[room] = {"question": card["questionTitle"].split("\n")[0], "total": card["total"], "wrong": len(wrong),
                     "samples": [[r["nickname"], opts.get(r["answer"], r["answer"])] for r in wrong[:4]]}
    return out


def scene(name: str) -> dict:
    d = Path(glob.glob(str(BACK / "data" / f"{name}-{CHANNEL[name]}-*"))[0])
    game, raw, deck = read(d / "game.json"), d / "raw", read(BACK / f"seed/{name}.json")
    frame = base64.b64encode((HERE / f"media/screen-{name}.jpg").read_bytes()).decode()
    series = [{"no": i + 1, "title": t or deck["title"].split("·")[-1].split("：")[-1].strip(), "views": v, "state": s}
              for i, (t, v, s) in enumerate(SERIES[name])]
    return {
        **{k: game[k] for k in ("scene", "rooms", "boss_room", "faq", "pairs")},
        "title": deck["title"], "host": deck["host"], "duration": game["replay"]["duration"],
        "traces": traces(game, read(raw / "quiz.json"), read(raw / "record_file.json")),
        "subs": read(raw / "subtitle.json"), "video": f"media/{name}.mp4",
        "screen": "data:image/jpeg;base64," + frame, "series": series,
    }


def products():
    tl, deck, state = read(BACK / "seed/out/commerce/timeline.json"), read(BACK / "seed/commerce.json"), read(BACK / "seed/out/commerce/state.json")
    out = []
    for i, p in enumerate(deck["products"]):
        slides = [s for s in tl["slides"] if s.get("product") == p["key"]]
        out.append({**p, "cover": state["products"][p["key"]]["cover"], "start": slides[0]["start"], "end": slides[-1]["end"],
                    "quotes": [l["text"] for s in slides for l in s["lines"]][:6], "clerk": f"media/clerk-{i}.mp4"})
    return out


def main():
    data = {"scenes": {n: scene(n) for n in CHANNEL}, "products": products(), "commerceVideo": "media/commerce.mp4"}
    (HERE / "v5-data.js").write_text("window.PC_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", "utf-8")
    for n, s in data["scenes"].items():
        print(n, "rooms", len(s["rooms"]), "boss", s["boss_room"], "subs", len(s["subs"]), "traces", sorted(s["traces"]), "pairs", len(s["pairs"]))


if __name__ == "__main__":
    main()
