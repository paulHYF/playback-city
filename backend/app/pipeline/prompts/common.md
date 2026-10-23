## 输出规则（两个场景共用）

- 只输出一个 JSON 对象，严格符合下面的 game.json 结构，不输出任何解释文字。
- 可溯源：每道题、每条 FAQ、每个混淆对都必须带 source_time（秒）和 source_quote（原话）；在材料里找不到原话就不生成。
- 不编造：只使用输入材料里出现过的信息。
- 选项：每题正好 4 个互不相同的选项，options[0] 是正确答案；干扰项优先用聊天里出现过的错误理解。
- 粒度：每个分段 1–3 个可考核的点，全场 10–18 题；rooms 3–8 个，按 start 升序且不重叠。
- source_time 必须落在所属 room 的 [start, end] 内。
- 聊天昵称一律脱敏（保留首字，其余用 * 代替）。

## game.json 结构

```json
{
  "version": 1,
  "scene": "course | commerce",
  "replay": { "channelId": "", "fileId": "", "title": "", "duration": 0, "host": "" },
  "rooms": [{
    "title": "", "start": 0, "end": 0, "summary": "", "keywords": [""],
    "watched_ratio": 1.0, "fail_rate": 0.0,
    "items": [{ "id": "q01", "keyword": "", "question": "", "code": "",
                "options": ["正确答案", "干扰项", "干扰项", "干扰项"],
                "explain": "", "source_time": 0, "source_quote": "" }]
  }],
  "boss_room": null,
  "faq": [{ "room": 0, "count": 1, "question": "", "answer": "", "source_time": 0, "samples": [["阿*", "原话", "mm:ss"]] }],
  "pairs": [{ "a": "", "b": "", "diff": "", "source_time": 0 }],
  "handout": { "title": "", "markdown": "" },
  "skin": "dungeon | market"
}
```

## 输入材料怎么用

- [大纲与 AI 测验] 是平台对这场回放生成的大纲（outlineContent，时间格式 HH:MM:SS,mmm）和测验（questions）。rooms 优先沿用大纲分段，相邻过短的分段可以合并，保证 3–8 间。
- 平台测验里的多选题、选项不是 4 个的题，要改写成 4 选 1 的单选；改写后仍要能在字幕里找到依据。
- source_quote 必须逐字取自 [字幕] 的某一句，source_time 取那一句的 t。
- [聊天] 里的观众发言用来提炼 faq（count 填同类问题的条数）和干扰项；昵称按规则脱敏。
- fail_rate 统一填 0：程序会用答题卡的真实作答结果计算殿室错误率并确定 Boss。[问卷结果] 可用来判断哪些段落难（如「哪些部分没听懂」）。

## world：闯关配置

在 game.json 里再输出一个 world 对象，决定这场回放长成什么样的关卡。枚举字段只能用下面给出的值，名字、台词、旁白可以自由写，但要贴合本场内容。

```json
"world": {
  "theme": "song_palace | night_market",          // 课程用 song_palace，带货用 night_market
  "name": "关卡名，4–8 字",
  "intro": "开场旁白，1–2 句",
  "palette": { "wall": "#rrggbb", "accent": "#rrggbb", "fog": 0.05–0.3 },
  "rooms": [{
    "room": 0,                                      // 对应 rooms 下标，每间最多一条
    "name": "地名，如「索引长廊」",
    "layout": "hall | corridor | courtyard | stall_row",
    "mood": "lit | dim | misty",
    "mechanic": "chest_quiz | twin_doors | order_steps | code_fill | calc",
    "twin_doors":  { "prompt": "", "left": "", "right": "", "answer": "left|right", "explain": "", "source_time": 0 },
    "order_steps": { "prompt": "", "steps": ["按正确顺序 3–6 步"], "source_time": 0 },
    "code_fill":   { "prompt": "", "code": "含 ___ 空位的代码", "options": ["正确填法", "干扰", "干扰", "干扰"], "explain": "", "source_time": 0 },
    "calc":        { "prompt": "", "answer": "", "explain": "", "source_time": 0 }
  }],
  "boss": { "archetype": "tomb_beast | haggler", "name": "", "weakness": "Boss 所在段的关键词", "taunt": "一句挑衅" },
  "npcs": [{ "archetype": "scholar_ghost | shop_clerk", "room": 0, "faq": 0, "line": "开场台词" }]
}
```

按内容选机制（每间只选一种，只填与 mechanic 同名的那一个配置）：
- 概念、定义、事实 → chest_quiz（直接用该房 items，不需要额外配置）
- 易混的一对概念（对应 pairs）→ twin_doors
- 有先后顺序的步骤、流程 → order_steps
- 代码片段里的关键写法 → code_fill
- 价格、优惠、规则计算 → calc
- 全场至少一半的房间用 chest_quiz；同一种非 chest_quiz 机制不超过 2 间。

约束：
- 每个机制配置的 source_time 必须落在所在房间的 [start, end] 内，内容必须出自字幕或商品详情，找不到依据就用 chest_quiz。
- Boss 落在哪间由程序按答题卡结果决定，boss 只写外观与台词；weakness 写全场最易错的那个关键词。
- npcs 的 faq 指向 faq 数组下标，room 与该 faq 的 room 一致；台词可以引用提问人数。

### 密室逃脱：门题、道具链、时辰

world 里再补充以下字段，让关卡有密室逃脱的节奏：
- `world.rooms[].door`：`{"item": "本房最重要的一道题的 id"}`。门上写着这道题的疑问，答对才开门。尽量每间都有门题。
- `world.items`：道具清单 `[{"id": "oil", "name": "灯油", "desc": "", "use": "在哪里、怎么用"}]`，2–4 件。道具名贴合宋代夜巡（灯油、铜鱼符、卷宗残页、更牌、钥匙），用途要具体。
- `world.rooms[].reward`：开门后得到的道具 id；`world.rooms[].requires`：进入本房需要的道具 id。需要的道具必须由更早（room 下标更小）的殿室给出，每件道具只从一处得到。
- `world.boss.points`（战胜得到的积分）、`world.boss.reward`（可选，战胜得到的道具）。
- `world.clock.real_minutes`：一夜十二时辰折合的真实分钟数，5–8。
- 用词去低龄：不要「宝箱」「怪兽」「金币」这类说法，用卷宗、灯、众惑、刁客、积分等。
