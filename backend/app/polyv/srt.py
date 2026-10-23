import re

_TIME = re.compile(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->")


def parse_srt(text: str) -> list[dict]:
    """SRT → [{t: 秒, text}]，供提示词按分段归组。"""
    lines = []
    for block in re.split(r"\r?\n\s*\r?\n", text.strip()):
        rows = [r for r in block.splitlines() if r.strip()]
        for i, row in enumerate(rows):
            m = _TIME.search(row)
            if m:
                h, mi, s, _ = map(int, m.groups())
                content = " ".join(rows[i + 1:]).strip()
                if content:
                    lines.append({"t": h * 3600 + mi * 60 + s, "text": content})
                break
    return lines
