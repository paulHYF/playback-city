"""测试环境造数：频道开关 → 商品 → 伪直播 → 开播中按时间轴发聊天、推商品 → 下播后 AI 大纲 → 拉进游戏数据。

在 backend 目录下运行（读 backend/.env 的 appId / appSecret）：
  uv run python seed/seed.py setup    commerce            # 回放开关；带货场景另建商品并关联频道
  uv run python seed/seed.py schedule course <materialId> [--start-in 300]   # 设置频道伪直播
  uv run python seed/seed.py live     course [--dry-run]  # 开播后按时间轴发聊天 / 推商品，下播后触发 AI 大纲
  uv run python seed/seed.py outline  course              # 单独查询或补触发 AI 大纲
  uv run python seed/seed.py ingest   course              # 拉取原始数据到 backend/data，供生成游戏

素材上传走后台页面：node seed/upload_material.mjs seed/out/<scene>/<scene>.mp4
状态（materialId、开播时间、sessionId、fileId、商品 ID）记在 seed/out/<scene>/state.json，中断后可接着跑。
"""
import argparse
import asyncio
import json
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.pipeline.fetch import fetch  # noqa: E402
from app.polyv import PolyvClient, api  # noqa: E402

HERE = Path(__file__).parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BATCH = 30  # message/audit 单次最多 30 条


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


class Scene:
    def __init__(self, name: str):
        self.name = name
        self.channel_id = json.loads((HERE / "channels.json").read_text("utf-8"))[name]["channelId"]
        self.deck = json.loads((HERE / f"{name}.json").read_text("utf-8"))
        self.out = HERE / "out" / name
        self.state_file = self.out / "state.json"
        self.state = json.loads(self.state_file.read_text("utf-8")) if self.state_file.is_file() else {}

    def save(self, **kv):
        self.state.update(kv)
        self.out.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(self.state, ensure_ascii=False, indent=2), "utf-8")

    @property
    def timeline(self) -> dict:
        return json.loads((self.out / "timeline.json").read_text("utf-8"))

    def events(self) -> list[dict]:
        """聊天脚本 + 商品推送 → 按视频秒数排序的事件列表。"""
        slides = {s["id"]: s for s in self.timeline["slides"]}
        viewers = dict(line.split(maxsplit=1) for line in (HERE / f"{self.name}_viewers.txt").read_text("utf-8").splitlines() if line.strip())
        events = []
        for i, line in enumerate((HERE / f"{self.name}_chat.txt").read_text("utf-8").splitlines()):
            if not line.strip() or line.startswith("#"):
                continue
            slide, after, viewer, content = line.split("|", 3)
            question = slide.startswith("?")
            s = slides[slide.lstrip("?")]
            at = min(s["start"] + float(after), s["end"] - 0.5)
            events.append({"at": at, "kind": "chat", "viewerId": f"bny_{viewer}", "nickName": viewers[viewer].strip(),
                           "content": content.strip(), "question": question, "msgId": f"bny-{self.name}-{i:03d}"})
        pushed = set()
        for s in self.timeline["slides"]:
            if s.get("product") and s["product"] not in pushed:
                pushed.add(s["product"])
                events.append({"at": s["start"] + 3, "kind": "push", "product": s["product"]})
        return sorted(events, key=lambda e: e["at"])


# ---------------- setup：频道开关与商品 ----------------

async def setup(c: PolyvClient, sc: Scene):
    await c.post("/live/v3/channel/playback/set-setting", channelId=sc.channel_id, playbackEnabled="Y", type="single",
                 origin="record", productPlaybackEnabled="Y", chatPlaybackEnabled="Y")
    s = await c.get("/live/v3/channel/playback/get-setting", channelId=sc.channel_id)
    log("回放设置", {k: s.get(k) for k in ("playbackEnabled", "chatPlaybackEnabled", "productPlaybackEnabled", "qaPlaybackEnabled", "aiSummaryEnabled")})
    if sc.deck.get("products"):
        await c.post("/live/v3/channel/product/update-enabled", channelId=sc.channel_id, enabled="Y")
        await create_products(c, sc)


def render_cover(p: dict, path: Path):
    html = path.with_suffix(".html")
    html.write_text(f"""<html><body style="margin:0;width:600px;height:600px;display:grid;place-items:center;
      background:radial-gradient(circle at 30% 20%,#5a3a24,#1b120d);font-family:'STKaiti','Kaiti SC',serif;color:#e8cf94">
      <div style="text-align:center"><div style="font-size:64px;line-height:1.3;padding:0 40px">{p['name']}</div>
      <div style="margin-top:28px;font:600 56px Menlo,monospace">¥{p['price']}</div>
      <div style="margin-top:20px;font:22px 'PingFang SC';color:#c9a45c;letter-spacing:.3em">不夜城集市</div></div></body></html>""", "utf-8")
    subprocess.run([CHROME, "--headless=new", f"--user-data-dir={Path(tempfile.gettempdir()) / 'playback-city-chrome'}", "--hide-scrollbars", "--window-size=600,600", f"--screenshot={path}", html.as_uri()],
                   check=True, capture_output=True, timeout=120)


async def create_products(c: PolyvClient, sc: Scene):
    products = dict(sc.state.get("products", {}))
    for p in sc.deck["products"]:
        if p["key"] in products:
            continue
        cover = sc.out / f"cover-{p['key']}.png"
        render_cover(p, cover)
        urls = await c.upload("/live/v3/common/upload-image", {"file": (cover.name, cover.read_bytes(), "image/png")}, type="coverImage")
        url = "https:" + urls[0] if urls[0].startswith("//") else urls[0]
        await c.post_json("/live/v4/user/product/save", {
            "name": p["name"], "cover": url, "coverList": [url], "productType": "normal",
            "linkType": 10, "link": f"https://develop-3-live.polyv.cn/watch/{sc.channel_id}",
            "productDesc": p["desc"], "productDetail": p["detail"],
            "priceType": "AMOUNT", "realPrice": p["price"], "originalPriceType": "AMOUNT", "price": p["originalPrice"],
        })
        found = await c.get("/live/v4/user/product/list", pageNumber=1, pageSize=20, keyword=p["name"])
        origin = next(x for x in found["contents"] if x["name"] == p["name"])
        origin_id = origin.get("productId") or origin.get("id")
        ref = await c.post_json("/live/v3/channel/product/reference", {"originId": str(origin_id), "status": 1}, channelId=sc.channel_id)
        products[p["key"]] = {"originId": origin_id, "productId": ref["productId"], "cover": url}
        sc.save(products=products)
        log("商品", p["name"], products[p["key"]])


# ---------------- schedule：频道伪直播 ----------------

async def schedule(c: PolyvClient, sc: Scene, material_id: str, start_in: int):
    start = int((time.time() + start_in) * 1000)
    await c.post("/live/v3/channel/stream/add-disk-videos", channelId=sc.channel_id, origin="material", vids=material_id,
                 startTimes=str(start))
    sc.save(materialId=material_id, planStart=start)
    log("伪直播已设置，开播时间", datetime.fromtimestamp(start / 1000).strftime("%H:%M:%S"),
        "；接着运行 live 子命令")


# ---------------- live：开播中按时间轴发聊天、推商品 ----------------

async def wait_live_session(c: PolyvClient, sc: Scene) -> dict:
    since = sc.state.get("planStart", int(time.time() * 1000)) - 10 * 60_000
    day = datetime.fromtimestamp(since / 1000).strftime("%Y-%m-%d 00:00:00")
    log("等待开播 …")
    while True:
        data = await c.get("/live/v3/channel/session/list", channelId=sc.channel_id, startDate=day, page=1, pageSize=20)
        live = [s for s in data.get("contents") or [] if (s.get("startTime") or 0) >= since]
        if live:
            s = max(live, key=lambda x: x["startTime"])
            sc.save(sessionId=s["sessionId"], liveStart=s["startTime"])
            log("已开播", s["sessionId"], datetime.fromtimestamp(s["startTime"] / 1000).strftime("%H:%M:%S"))
            return s
        await asyncio.sleep(5)


async def live(c: PolyvClient, sc: Scene, dry_run: bool):
    events = sc.events()
    if dry_run:
        for e in events:
            print(f"{e['at']:7.1f}s", e["kind"], e.get("nickName", e.get("product")), e.get("content", ""))
        print(len(events), "个事件，视频", sc.timeline["duration"], "秒")
        return
    session = await wait_live_session(c, sc)
    t0 = session["startTime"] / 1000
    sent = set(sc.state.get("sent", []))
    pending = [e for e in events if e.get("msgId", e.get("product")) not in sent]
    while pending:
        now = time.time() - t0
        due = [e for e in pending if e["at"] <= now]
        chats = [e for e in due if e["kind"] == "chat"]
        for i in range(0, len(chats), BATCH):
            body = [{k: e[k] for k in ("msgId", "viewerId", "nickName", "content")} | {"viewerType": "viewer", "sessionId": session["sessionId"]}
                    for e in chats[i:i + BATCH]]
            res = await c.post_json("/live/v4/chat/message/audit", body, channelId=sc.channel_id)
            bad = [r for r in res or [] if not r.get("status")]
            log(f"{now:6.0f}s 聊天 {len(body)} 条" + (f"，失败 {bad}" if bad else ""), body[-1]["nickName"], body[-1]["content"])
        for e in due:
            if e["kind"] == "push":
                pid = sc.state["products"][e["product"]]["productId"]
                await c.post("/live/v3/channel/product/push-product", channelId=sc.channel_id, productId=pid)
                log(f"{now:6.0f}s 推送商品", e["product"])
        sent |= {e.get("msgId", e.get("product")) for e in due}
        sc.save(sent=sorted(sent))
        pending = [e for e in pending if e not in due]
        await asyncio.sleep(1)
    log("脚本发完，等待下播与暂存生成 …")
    await outline(c, sc, wait_until=t0 + sc.timeline["duration"])


# ---------------- outline：暂存 → AI 大纲 + 知识测验 ----------------

async def outline(c: PolyvClient, sc: Scene, wait_until: float = 0):
    while time.time() < wait_until:
        await asyncio.sleep(10)
    since = sc.state.get("liveStart", 0)
    file_id = sc.state.get("fileId")
    while not file_id:
        files = (await api.record_files(c, sc.channel_id)).get("contents") or []
        fresh = [f for f in files if f.get("channelSessionId") == sc.state.get("sessionId")
                 or str(f.get("startTime", "")) >= datetime.fromtimestamp(since / 1000).strftime("%Y%m%d%H%M%S")]
        if fresh:
            file_id = fresh[0]["fileId"]
            sc.save(fileId=file_id)
            log("暂存已生成", file_id, fresh[0].get("name"), fresh[0].get("duration"), "秒")
        else:
            await asyncio.sleep(10)
    status = (await api.record_outline(c, sc.channel_id, file_id) or {}).get("status")
    if status in (None, "init", "fail"):
        await api.create_record_outline(c, file_id, quiz=True)
        log("已触发 AI 大纲 + 知识测验")
    while status not in ("success", "fail", "audit"):
        await asyncio.sleep(30)
        status = (await api.record_outline(c, sc.channel_id, file_id) or {}).get("status")
        log("大纲状态", status)
    sc.save(outlineStatus=status)


async def ingest(c: PolyvClient, sc: Scene):
    gid = await fetch(c, sc.deck["theme"], sc.channel_id, sc.state["fileId"])
    log("已拉取到 backend/data/" + gid)


async def main():
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["setup", "schedule", "live", "outline", "ingest"])
    p.add_argument("scene", choices=["course", "commerce"])
    p.add_argument("material_id", nargs="?")
    p.add_argument("--start-in", type=int, default=300, help="伪直播在多少秒后开播")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    sc = Scene(a.scene)
    async with PolyvClient(get_settings()) as c:
        if a.cmd == "setup":
            await setup(c, sc)
        elif a.cmd == "schedule":
            await schedule(c, sc, a.material_id or sc.state["materialId"], a.start_in)
        elif a.cmd == "live":
            await live(c, sc, a.dry_run)
        elif a.cmd == "outline":
            await outline(c, sc)
        else:
            await ingest(c, sc)


if __name__ == "__main__":
    asyncio.run(main())
