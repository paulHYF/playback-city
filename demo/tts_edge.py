"""批量调用微软在线神经语音（edge-tts）合成旁白。
  uv run --no-project --with edge-tts python demo/tts_edge.py jobs.json
jobs.json：{"voice": "...", "rate": "+0%", "jobs": [{"text": "...", "out": "xx.mp3"}]}
"""
import asyncio
import json
import sys

import edge_tts


async def main(path):
    spec = json.load(open(path))
    sem = asyncio.Semaphore(4)

    async def one(job):
        async with sem:
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(job["text"], spec["voice"], rate=spec["rate"]).save(job["out"])
                    return
                except Exception as e:  # 网络抖动重试
                    if attempt == 2:
                        raise
                    print("重试", job["out"], e)
                    await asyncio.sleep(1.5)

    await asyncio.gather(*(one(j) for j in spec["jobs"]))


asyncio.run(main(sys.argv[1]))
