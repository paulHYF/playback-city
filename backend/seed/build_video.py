"""讲稿 JSON → 幻灯片图片 + 语音 → mp4，同时输出时间轴与幻灯片 PDF。

  python seed/build_video.py seed/course.json
产物在 seed/out/<name>/：<name>.mp4、timeline.json、slides.pdf
依赖：macOS say（中文语音 Ting-Ting）、ffmpeg、Node 18+ 与 Playwright（render_slides.mjs）
"""
import json
import re
import shutil
import subprocess
import sys
import os
from pathlib import Path

NODE = os.environ.get("NODE", "node")  # 需要 Node 18+（Playwright）
GAP = 0.8  # 每页讲完后的停顿（秒）
HERE = Path(__file__).parent


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return float(out.strip())


def sentences(text: str, start: float, length: float) -> list[dict]:
    """按句切分，用字数比例估算每句在视频里的起止时间。"""
    parts = [p for p in re.split(r"(?<=[。！？])", text) if p.strip()]
    total, acc, res = sum(len(p) for p in parts), 0, []
    for p in parts:
        res.append({"t": round(start + length * acc / total, 1), "text": p.strip()})
        acc += len(p)
    return res


def main(script_path: str):
    deck = json.loads(Path(script_path).read_text("utf-8"))
    out = HERE / "out" / deck["name"]
    work = out / "work"
    shutil.rmtree(out, ignore_errors=True)
    work.mkdir(parents=True)

    page = work / "slides.html"
    html = (HERE / "slides.html").read_text("utf-8")
    page.write_text(html.replace("<div id=\"deck\"></div>",
                                 f"<div id=\"deck\"></div><script>window.DECK = {json.dumps(deck, ensure_ascii=False)}</script>"), "utf-8")
    # 幻灯片用 Playwright 自带 Chromium 一次渲染完（不碰本机 Chrome）
    subprocess.run([NODE, str(HERE / "render_slides.mjs"), str(page), str(work), str(len(deck["slides"]))], check=True, timeout=300)

    clips, timeline, t = [], [], 0.0
    for i, s in enumerate(deck["slides"]):
        png, aiff, clip = work / f"{i:02d}.png", work / f"{i:02d}.aiff", work / f"{i:02d}.mp4"
        run("say", "-v", deck["voice"], "-r", str(deck["rate"]), "-o", str(aiff), s["say"])
        speak = duration(aiff)
        run("ffmpeg", "-y", "-loop", "1", "-i", str(png), "-i", str(aiff), "-af", f"apad=pad_dur={GAP}",
            "-t", f"{speak + GAP:.3f}", "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast", "-r", "25",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-b:a", "128k", str(clip))
        length = duration(clip)
        timeline.append({"id": s["id"], "seg": s["seg"], "title": s["title"], "product": s.get("product"),
                         "start": round(t, 1), "end": round(t + length, 1), "lines": sentences(s["say"], t, speak)})
        clips.append(clip)
        t += length
        print(f"{i + 1}/{len(deck['slides'])} {s['title']} {length:.1f}s", flush=True)

    concat = work / "concat.txt"
    concat.write_text("".join(f"file '{c}'\n" for c in clips), "utf-8")
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", "-movflags", "+faststart",
        str(out / f"{deck['name']}.mp4"))

    segs = [{"title": title, "start": min(x["start"] for x in timeline if x["seg"] == k),
             "end": max(x["end"] for x in timeline if x["seg"] == k)} for k, title in enumerate(deck["segments"])]
    (out / "timeline.json").write_text(json.dumps({"title": deck["title"], "duration": round(t, 1), "segments": segs,
                                                   "slides": timeline}, ensure_ascii=False, indent=2), "utf-8")
    shutil.rmtree(work)
    print(f"done {out / (deck['name'] + '.mp4')} {t / 60:.1f} min")


if __name__ == "__main__":
    main(sys.argv[1])
