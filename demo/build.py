#!/usr/bin/env python3
"""演示视频合成：配音 → （record.mjs 录画面）→ 单段合成 → 整片拼接。

  python3 demo/build.py tts [id...]        按句合成旁白，写 out/tts.json（每句起止时间），record.mjs 据此定每段时长
  node    demo/record.mjs [id...]          录画面 → out/clips/<id>.mp4（Node 18+）
  python3 demo/build.py seg [id...]        画面 + 旁白 + 字幕 → out/segs/<id>.mp4（字幕 PNG 由 record.mjs subs 渲染）
  python3 demo/build.py final              拼成 out/回放不夜城-演示视频.mp4

不传 id 即全部；某段有问题只重做那一段的 tts / record / seg，再 final。
依赖：ffmpeg；配音 engine=edge 用 uv + edge-tts（微软在线神经语音，旁白文本会发到微软服务端），engine=say 用 macOS say。
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "out"
LEAD, GAP, TAIL = 0.4, 0.25, 0.7  # 段首留白、句间停顿、段尾留白（秒）
FPS = 30


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return float(out.strip())


def script():
    return json.loads((HERE / "script.json").read_text())


def pick(ids):
    scenes = script()["scenes"]
    return [s for s in scenes if not ids or s["id"] in ids]


def line(item):
    return (item, item) if isinstance(item, str) else (item["text"], item.get("tts", item["text"]))


def tts(ids):
    sc = script()
    path = OUT / "tts.json"
    table = json.loads(path.read_text()) if path.exists() else {}
    scenes = pick(ids)
    # 先把所有句子合成出来：edge 引擎一次批量调用，say 引擎逐句调用
    jobs = []
    for s in scenes:
        d = OUT / "tts" / s["id"]
        d.mkdir(parents=True, exist_ok=True)
        for i, item in enumerate(s["lines"]):
            jobs.append((d / f"{i:02d}", line(item)[1]))
    if sc.get("engine") == "edge":
        spec = OUT / "tts_jobs.json"
        spec.write_text(json.dumps({"voice": sc["voice"], "rate": sc["rate"],
                                    "jobs": [{"text": t, "out": str(base) + ".mp3"} for base, t in jobs]}, ensure_ascii=False))
        subprocess.run(["uv", "run", "--no-project", "--with", "edge-tts", "python", str(HERE / "tts_edge.py"), str(spec)], check=True)
        for base, _ in jobs:
            run("ffmpeg", "-y", "-i", str(base) + ".mp3", "-ar", "48000", "-ac", "1", str(base) + ".wav")
    else:
        for base, t in jobs:
            run("say", "-v", sc["voice"], "-r", str(sc["rate"]), "-o", str(base) + ".aiff", t)
            run("ffmpeg", "-y", "-i", str(base) + ".aiff", "-ar", "48000", "-ac", "1", str(base) + ".wav")
    for s in scenes:
        d = OUT / "tts" / s["id"]
        t, rows = LEAD, []
        for i, item in enumerate(s["lines"]):
            wav = d / f"{i:02d}.wav"
            n = duration(wav)
            rows.append({"text": line(item)[0], "start": round(t, 3), "end": round(t + n, 3), "wav": str(wav)})
            t += n + GAP
        table[s["id"]] = {"lines": rows, "total": round(t - GAP + TAIL, 3)}
        print(f"{s['id']}: {table[s['id']]['total']:.1f}s")
    known = {s["id"] for s in script()["scenes"]}
    table = {k: v for k, v in table.items() if k in known}
    path.write_text(json.dumps(table, ensure_ascii=False, indent=1))
    print("合计", round(sum(v["total"] for v in table.values()), 1), "秒")


def seg(ids):
    table = json.loads((OUT / "tts.json").read_text())
    (OUT / "segs").mkdir(parents=True, exist_ok=True)
    for s in pick(ids):
        sid, info = s["id"], table[s["id"]]
        clip = OUT / "clips" / f"{sid}.mp4"
        length = max(duration(clip), info["total"])
        args = ["ffmpeg", "-y", "-i", str(clip)]
        for r in info["lines"]:
            args += ["-i", r["wav"]]
        subs = [OUT / "subs" / sid / f"{i:02d}.png" for i in range(len(info["lines"]))]
        for p in subs:
            args += ["-i", str(p)]
        music = OUT / "clips" / f"{sid}.music.webm"
        if music.exists():
            args += ["-i", str(music)]
        n = len(info["lines"])
        # 画面：不足旁白长度时定格末帧补齐；按句叠字幕
        f = [f"[0:v]tpad=stop_mode=clone:stop_duration={length:.2f},trim=duration={length:.2f},fps={FPS},format=yuv420p[v0]"]
        for i, r in enumerate(info["lines"]):
            f.append(f"[v{i}][{1 + n + i}:v]overlay=0:0:enable='between(t,{r['start']},{r['end'] + 0.15})'[v{i + 1}]")
        # 声音：各句按起点延迟后混合，可选叠一层游戏配乐
        for i, r in enumerate(info["lines"]):
            ms = int(r["start"] * 1000)
            f.append(f"[{1 + i}:a]adelay={ms}|{ms}[a{i}]")
        mix = "".join(f"[a{i}]" for i in range(n))
        if music.exists():
            f.append(f"[{1 + 2 * n}:a]asetpts=PTS-STARTPTS,volume=0.35,atrim=0:{length:.2f}[bg]")
            mix += "[bg]"
            n_mix = n + 1
        else:
            n_mix = n
        f.append(f"{mix}amix=inputs={n_mix}:normalize=0:duration=longest,apad,atrim=0:{length:.2f},"
                 f"afade=t=in:d=0.2,afade=t=out:st={length - 0.3:.2f}:d=0.3[a]")
        f.append(f"[v{n}]fade=t=in:d=0.25,fade=t=out:st={length - 0.3:.2f}:d=0.3[v]")
        args += ["-filter_complex", ";".join(f), "-map", "[v]", "-map", "[a]", "-t", f"{length:.2f}",
                 "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", str(FPS),
                 "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", str(OUT / "segs" / f"{sid}.mp4")]
        run(*args)
        print(f"{sid}: {length:.1f}s")


def final():
    segs = [OUT / "segs" / f"{s['id']}.mp4" for s in script()["scenes"]]
    missing = [p.name for p in segs if not p.exists()]
    if missing:
        sys.exit("缺少分段：" + "、".join(missing))
    lst = OUT / "concat.txt"
    lst.write_text("".join(f"file '{p.resolve()}'\n" for p in segs))
    dst = OUT / "回放不夜城-演示视频.mp4"
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", str(dst))
    print(dst, f"{duration(dst):.1f}s")


if __name__ == "__main__":
    cmd, ids = sys.argv[1], sys.argv[2:]
    {"tts": lambda: tts(ids), "seg": lambda: seg(ids), "final": final}[cmd]()
