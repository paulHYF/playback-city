"""城级数据 city.json：大模型只给命名、分组和文案；楼高、亮灯、解锁这些数值由程序按真实数据算。

校验不过回喂一次，仍不过用程序兜底，保证城永远能生成。
"""
import json
import re
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, model_validator

from app.config import Settings
from app.llm.client import LLMError, chat_json

Kind = Literal["pavilion", "hall", "shop", "tower"]


class Street(BaseModel):
    name: str = Field(max_length=12)
    replays: list[str]


class Building(BaseModel):
    replay: str
    name: str = Field(max_length=10, description="楼名")
    plaque: str = Field(max_length=6, description="匾额")
    kind: Kind = "pavilion"
    blurb: str = Field(max_length=60, description="一句话介绍这一讲")


class CityNpc(BaseModel):
    replay: str
    name: str = Field(max_length=8)
    line: str = Field(max_length=60)


class City(BaseModel):
    name: str = Field(max_length=20)
    intro: str = Field(max_length=120)
    streets: list[Street]
    buildings: list[Building]
    npcs: list[CityNpc] = Field(default_factory=list)

    def check_replays(self, ids: list[str]) -> "City":
        """每个已生成的讲次恰好一座楼、恰好在一条街上；不认识的 id 一律报错。"""
        want = set(ids)
        built = [b.replay for b in self.buildings]
        on_street = [r for s in self.streets for r in s.replays]
        for label, got in (("buildings", built), ("streets", on_street)):
            if sorted(got) != sorted(want):
                raise ValueError(f"{label} 必须恰好覆盖这些回放各一次：{sorted(want)}，实际 {sorted(got)}")
        for n in self.npcs:
            if n.replay not in want:
                raise ValueError(f"npcs 里的 replay {n.replay} 不存在")
        return self


PROMPT = """你是「回放不夜城」的城市规划师。一个直播频道是一座宋风夜市古城，频道下每一讲回放是城里的一座建筑，进去就是这一讲的密室闯关。
根据给你的频道信息和每一讲的内容摘要，给这座城起名、分街、给每座建筑起名题匾，写一位更夫/伙计的台词。

规则：
- 只输出一个 JSON 对象，不要任何解释。
- 不编造课程里没有的内容；名字要贴合这一讲讲的东西，宋风、克制，不用网络流行语、不用感叹号。
- name ≤ 20 字；intro ≤ 120 字，一段开场旁白，夜巡口吻。
- streets：按内容主题把回放分成 1–4 条街，同一系列按讲次顺序；每条回放恰好出现在一条街上。街名 ≤ 12 字，如「容器街」。
- buildings：每条回放恰好一座。name ≤ 10 字（如「列表楼」），plaque 匾额 ≤ 6 字，kind 只能是 pavilion（楼阁）/ hall（殿）/ shop（店铺，带货场景用）/ tower（塔，全场最难的一讲）之一，blurb ≤ 60 字。
- npcs：0–3 位，replay 指向某条回放，name ≤ 8 字，line ≤ 60 字，可以提到这一讲大家最常问的问题。
- 所有 replay 字段必须原样使用输入里的回放 id。

输出结构：
{"name": "", "intro": "", "streets": [{"name": "", "replays": ["<id>"]}],
 "buildings": [{"replay": "<id>", "name": "", "plaque": "", "kind": "pavilion", "blurb": ""}],
 "npcs": [{"replay": "<id>", "name": "", "line": ""}]}
"""


def material(channel: dict, replays: list[dict]) -> str:
    """输入材料：频道信息 + 每讲标题、时长、殿室标题摘要、高频问题（取自已生成的 game.json）。"""
    lessons = []
    for r in replays:
        g = r["game_json"] or {}
        lessons.append({
            "id": r["id"], "讲次": r["sort_no"], "标题": r["title"], "时长秒": r["duration_s"],
            "殿室": [{"标题": rm["title"], "摘要": rm["summary"][:80], "错误率": rm.get("fail_rate", 0)} for rm in g.get("rooms", [])],
            "高频问题": [f["question"] for f in g.get("faq", [])[:3]],
        })
    scene = "直播带货" if channel["scene"] == "commerce" else "课程培训"
    return json.dumps({"频道": channel["name"], "主持人": channel["publisher"], "场景": scene, "回放": lessons}, ensure_ascii=False)


def fallback(channel: dict, replays: list[dict]) -> City:
    """模型不可用或输出不合规时：一条街，楼名取标题前 6 字。"""
    shop = channel["scene"] == "commerce"
    return City(
        name=f"{channel['name'][:14]} · 不夜城",
        intro="入夜，城里的灯一盏盏亮起。每一座楼里，都锁着一讲回放。",
        streets=[{"name": "夜市大街" if shop else "书院街", "replays": [r["id"] for r in replays]}],
        buildings=[{"replay": r["id"], "name": _short(r["title"], 6) + ("铺" if shop else "楼"), "plaque": f"第{r['sort_no']}{'场' if shop else '讲'}",
                    "kind": "shop" if shop else "pavilion", "blurb": _short(r["title"], 60)} for r in replays],
    )


def reconcile(channel: dict, city: dict, replays: list[dict]) -> dict:
    """后台调整前对齐当前已生成的讲次：新生成的讲次按兜底补一座楼、排到最后一条街；已不在列表里的讲次去掉。"""
    ids = [r["id"] for r in replays]
    fb = fallback(channel, replays).model_dump()
    built = {b["replay"] for b in city["buildings"] if b["replay"] in ids}
    missing = [r for r in ids if r not in built]
    streets = [{**s, "replays": [r for r in s["replays"] if r in ids]} for s in city["streets"]]
    streets = [s for s in streets if s["replays"]] or [{**fb["streets"][0], "replays": []}]
    streets[-1]["replays"] += [r for r in missing if all(r not in s["replays"] for s in streets)]
    return {
        **city, "streets": streets,
        "buildings": [b for b in city["buildings"] if b["replay"] in ids] + [b for b in fb["buildings"] if b["replay"] in missing],
        "npcs": [n for n in city.get("npcs", []) if n["replay"] in ids],
    }


def _short(title: str, n: int) -> str:
    """「课程-Python入门第3讲-频道8655755.mp4」→ 取最长的一段「Python入门第3讲」。"""
    parts = [p.strip() for p in re.split(r"[-·：:|_]", re.sub(r"\.(mp4|flv|m3u8)$", "", title)) if p.strip() and not re.fullmatch(r"频道\d+", p.strip())]
    return max(parts, key=len)[:n] if parts else title[:n]


async def generate_city(settings: Settings, channel: dict, replays: list[dict]) -> tuple[City, str]:
    """返回 (城数据, 说明)；说明里写明是模型生成还是兜底。"""
    ids = [r["id"] for r in replays]
    text = material(channel, replays)
    try:
        data = await chat_json(settings, PROMPT, text)
    except LLMError as e:
        return fallback(channel, replays), f"模型不可用，已按标题兜底：{e}"
    for attempt in range(2):
        try:
            return City.model_validate(data).check_replays(ids), "模型生成"
        except (ValidationError, ValueError) as e:
            if attempt:
                return fallback(channel, replays), f"模型输出两次未通过校验，已按标题兜底：{str(e)[:200]}"
            data = await chat_json(settings, PROMPT, f"{text}\n\n[上次输出]\n{json.dumps(data, ensure_ascii=False)}\n\n[校验错误，请修正后重新输出完整 JSON]\n{e}")
    raise AssertionError("unreachable")
