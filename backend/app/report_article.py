"""直播质量分析报告 · 竹简版：同一份报告数据，由大模型写成一篇完整的复盘文章（成段文字，不出图表）。

数据口径与 report.channel_report 完全一致；模型只组织成文，不改任何数值。结果缓存在频道目录的 report_article.json。
"""
import json

from pydantic import BaseModel, Field, ValidationError

from app import storage
from app.config import get_settings
from app.db import now_ms
from app.llm.client import chat_json
from app.report import AI_SCENE, _lesson_brief, channel_report

ARTICLE_VERSION = 1

ARTICLE_PROMPT = """
{intro}

请把下面这份直播质量分析数据写成一篇完整的复盘报告文章，读者是这个频道的{role}本人，用「你」称呼{role}。
这篇文章会刻在竹简上逐列阅读，所以只写成段的文字：不要表格、不要列表符号、不要 Markdown、不要图表描述，数字直接写进句子里。

写作要求：
1. 现代汉语书面语，像一位资深顾问写给{role}的复盘长文：有判断、有证据、有温度，不客套、不说空话。章节标题可以用古雅的四字短语。
2. 数据全部由程序按真实数据算出，只能引用，不能改动或编造；数据里没有的不要推测成事实，缺失的数据在文中直说「这项数据没有采到」并给出补采办法。
3. 沿漏斗推进论述：{funnel}。找出流失最严重的一层作为全文主线。
4. 每个判断都要带证据：第几{unit}、mm:ss–mm:ss 时间段、对应的指标数值；两个以上信号互相印证的才写成定论，单一信号要说明「信号较弱」。
5. 区分症状和根因，根因落到{cause_hint}。
6. 建议要具体到{role}下一{unit}开播时怎么说、怎么做、放在第几分钟，按阶段（{stages}）展开，先写最该先改的。
7. 篇幅：全文 2500–4000 字；6–8 章，每章 2–4 段，每段 80–220 字。

只输出一个 JSON 对象：
{{
  "title": "文章标题 ≤20 字",
  "preface": "开篇引言一段，≤200 字：这{unit}直播是什么、这篇复盘要回答什么",
  "sections": [{{"heading": "章节标题 ≤12 字（不带序号）", "paragraphs": ["段落", "段落"]}}],
  "closing": "结语一段，≤200 字"
}}
章节建议依次覆盖：总体评价 → 到场与留存 → {middle} → 回放与长尾 → 问题与根因 → 关键时刻逐段复盘 → 下一{unit}的改进方案；没有数据支撑的章节可以合并，不要硬写。
"""

MIDDLE = {"course": "听懂与掌握（互动、答题、疑问）", "commerce": "种草与转化（卖点认知、意向、顾虑）"}


class _Section(BaseModel):
    heading: str
    paragraphs: list[str] = Field(min_length=1)


class Article(BaseModel):
    title: str
    preface: str
    sections: list[_Section] = Field(min_length=3)
    closing: str


def _path(cid: str):
    return storage.channel_dir(cid) / "report_article.json"


def cached_article(cid: str, scene: str) -> dict | None:
    """缓存的文章；版本或场景对不上就当没有，前端引导重新生成。"""
    p = _path(cid)
    art = storage.read_json(p) if p.is_file() else None
    return art if art and art.get("version") == ARTICLE_VERSION and art.get("scene") == scene else None


async def write_article(cid: str) -> dict:
    rep = channel_report(cid)
    ch, scene, summary = rep["channel"], rep["channel"]["scene"], rep["summary"]
    cfg = AI_SCENE[scene]
    dim = rep["dimensions"]["marketing" if scene == "commerce" else "training"]
    material = {
        "频道": {"名称": ch["name"], "回放城": ch["city"], cfg["role"]: ch["publisher"], "场景": "直播带货" if scene == "commerce" else "课程培训"},
        "综合得分": dim["score"],
        "指标": [{"指标": x["name"], "数值": x["display"], "得分": x["score"], "口径": x["tip"]} for x in dim["indicators"]],
        "程序诊断": dim["findings"],
        "汇总": {k: v for k, v in summary.items() if k != "topics"},
        "弹幕话题": summary.get("topics"),
        "各" + cfg["unit"]: [_lesson_brief(i, scene) for i in rep["replays"] if i["hasRaw"]],
        "已有 AI 复盘点评（可参考其判断，但以数据为准）": rep.get("ai"),
    }
    system = ARTICLE_PROMPT.format(**cfg, middle=MIDDLE[scene])
    text = json.dumps(material, ensure_ascii=False, default=str)
    data = await chat_json(get_settings(), system, text)
    try:
        art = Article.model_validate(data)
    except ValidationError as e:  # 结构不对回喂一次
        data = await chat_json(get_settings(), system, f"{text}\n\n[上次输出]\n{json.dumps(data, ensure_ascii=False)}\n\n[结构校验错误，请修正后重新输出完整 JSON]\n{e}")
        art = Article.model_validate(data)
    out = {"version": ARTICLE_VERSION, "scene": scene, "generatedAt": now_ms(),
           "channel": {"name": ch["name"], "city": ch["city"], "publisher": ch["publisher"]}, **art.model_dump()}
    storage.write_json(_path(cid), out)
    return out
