"""game.json 结构与校验规则，对应需求文档第 8 节。前端 src/types/game.ts 与这里保持一致。"""
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

Scene = Literal["course", "commerce"]


class Replay(BaseModel):
    channelId: str
    fileId: str = ""
    title: str
    duration: int
    host: str = ""


class Item(BaseModel):
    id: str
    keyword: str
    question: str
    code: str = ""
    options: list[str] = Field(description="正好 4 个，[0] 为正确答案，展示时打乱")
    explain: str
    source_time: int
    source_quote: str

    @model_validator(mode="after")
    def check_options(self):
        if len(self.options) != 4 or len(set(self.options)) != 4:
            raise ValueError(f"{self.id}: options 必须是 4 个互不相同的选项")
        return self


class Room(BaseModel):
    title: str
    start: int
    end: int
    summary: str
    keywords: list[str]
    watched_ratio: float = 1.0
    fail_rate: float = 0.0
    items: list[Item]

    @model_validator(mode="after")
    def check_items(self):
        for it in self.items:
            if not self.start <= it.source_time <= self.end:
                raise ValueError(f"{it.id}: source_time {it.source_time} 不在房间 [{self.start}, {self.end}] 内")
        return self


class Faq(BaseModel):
    room: int
    count: int = Field(gt=0)
    question: str
    answer: str
    source_time: int
    samples: list[tuple[str, str, str]] = Field(default_factory=list, description="[脱敏昵称, 原话, mm:ss]")


class Pair(BaseModel):
    a: str
    b: str
    diff: str
    source_time: int


class Handout(BaseModel):
    title: str
    markdown: str


# ───────── world：AI 生成的闯关配置（需求文档 8.3）─────────
# 只能从引擎支持的枚举里选；名字、台词、旁白可自由发挥。画面由引擎积木组合，不生成代码和图片。

# 地宫主题模版，与 frontend/src/game/nightcity/themes.ts 一一对应；任何场景都可选，按内容挑
Theme = Literal["song_palace", "night_market", "tomb", "dungeon", "escape", "haunted", "festival", "library", "mohist", "dragon", "dunhuang"]
Layout = Literal["hall", "corridor", "courtyard", "stall_row"]
Mood = Literal["lit", "dim", "misty"]
# 殿室机制：前 5 种要配同名题面（chest_quiz 直接用本房 items），后 5 种是引擎内置玩法、不需要配置；全部已在引擎实现，所有主题通用
Mechanic = Literal["chest_quiz", "twin_doors", "order_steps", "code_fill", "calc", "lamps", "evidence", "sort", "assemble", "beasts"]
PAYLOAD_MECHANICS = ("twin_doors", "order_steps", "code_fill", "calc")



class TwinDoors(BaseModel):
    """双门辨析：易混的一对概念，选对的门才能过。"""
    prompt: str
    left: str
    right: str
    answer: Literal["left", "right"]
    explain: str
    source_time: int

    @model_validator(mode="after")
    def check_doors(self):
        if self.left == self.right:
            raise ValueError("twin_doors 两扇门不能相同")
        return self


class OrderSteps(BaseModel):
    """机关排序：steps 按正确顺序给出，展示时打乱。"""
    prompt: str
    steps: list[str] = Field(min_length=3, max_length=6)
    source_time: int

    @field_validator("steps")
    @classmethod
    def unique_steps(cls, v):
        if len(set(v)) != len(v):
            raise ValueError("order_steps 步骤不能重复")
        return v


class CodeFill(BaseModel):
    """补全咒文：code 里用 ___ 标出空位，options[0] 为正确填法。"""
    prompt: str
    code: str
    options: list[str]
    explain: str
    source_time: int

    @model_validator(mode="after")
    def check_code(self):
        if "___" not in self.code:
            raise ValueError("code_fill 的 code 必须含 ___ 空位")
        if len(self.options) != 4 or len(set(self.options)) != 4:
            raise ValueError("code_fill 的 options 必须是 4 个互不相同的选项")
        return self


class Calc(BaseModel):
    """算账关：规则或价格计算，answer 为标准答案文本。"""
    prompt: str
    answer: str
    explain: str
    source_time: int


class Door(BaseModel):
    """密室门题：门上写一个疑问，取本房最重要的一道选择题，答对开门。"""
    item: str = Field(description="本房 items 里的题目 id")


class Tool(BaseModel):
    """道具：某一关的开启工具（如灯油点亮墨雾房、铜鱼符开 Boss 门）。"""
    id: str
    name: str
    desc: str
    use: str = Field(description="在哪里、怎么用")


class Clock(BaseModel):
    """时辰倒计时：一局为一夜十二时辰，折合真实分钟数。"""
    real_minutes: int = Field(default=6, ge=5, le=8)


class WorldRoom(BaseModel):
    room: int = Field(description="对应 rooms 的下标")
    name: str = Field(description="地名，如「索引长廊」")
    layout: Layout = "hall"
    mood: Mood = "lit"
    mechanic: Mechanic = "chest_quiz"
    door: Door | None = None
    reward: str | None = Field(default=None, description="开门得到的道具 id")
    requires: str | None = Field(default=None, description="进入本房需要持有的道具 id")
    twin_doors: TwinDoors | None = None
    order_steps: OrderSteps | None = None
    code_fill: CodeFill | None = None
    calc: Calc | None = None

    @model_validator(mode="after")
    def check_payload(self):
        payloads = {"twin_doors": self.twin_doors, "order_steps": self.order_steps, "code_fill": self.code_fill, "calc": self.calc}
        if self.mechanic in PAYLOAD_MECHANICS and payloads[self.mechanic] is None:
            raise ValueError(f"world.rooms[{self.room}] 机制 {self.mechanic} 缺少同名配置")
        extra = [k for k, v in payloads.items() if v is not None and k != self.mechanic]
        if extra:
            raise ValueError(f"world.rooms[{self.room}] 多出与机制无关的配置 {extra}")
        return self

    def source_times(self) -> list[int]:
        payload = getattr(self, self.mechanic, None) if self.mechanic in PAYLOAD_MECHANICS else None
        return [payload.source_time] if payload else []


class Boss(BaseModel):
    """Boss 落在哪间由程序按答题卡真实错误率决定（game.boss_room），这里只配外观与台词。"""
    archetype: Literal["tomb_beast", "haggler"]
    name: str
    weakness: str = Field(description="弱点关键词，取自 Boss 房的 keywords")
    taunt: str
    points: int = Field(default=100, ge=0, description="战胜得到的积分")
    reward: str | None = Field(default=None, description="战胜得到的道具 id")


class Npc(BaseModel):
    archetype: Literal["scholar_ghost", "shop_clerk"]
    room: int
    faq: int = Field(description="对应 faq 的下标")
    line: str = Field(description="开场台词，如「二十七人问过我同一个问题……」")


class Palette(BaseModel):
    wall: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    fog: float = Field(ge=0.05, le=0.3)


class World(BaseModel):
    theme: Theme
    name: str
    intro: str
    palette: Palette
    rooms: list[WorldRoom]
    boss: Boss
    npcs: list[Npc] = Field(default_factory=list)
    items: list[Tool] = Field(default_factory=list)
    clock: Clock = Field(default_factory=Clock)


class Game(BaseModel):
    version: int = 1
    scene: Scene
    replay: Replay
    rooms: list[Room] = Field(min_length=3, max_length=8)
    boss_room: int | None = None
    faq: list[Faq] = Field(default_factory=list)
    pairs: list[Pair] = Field(default_factory=list)
    handout: Handout
    skin: Literal["dungeon", "market"] = "dungeon"
    world: World | None = None

    @model_validator(mode="after")
    def check_game(self):
        for prev, cur in zip(self.rooms, self.rooms[1:]):
            if cur.start < prev.end:
                raise ValueError(f"房间「{cur.title}」与上一间时间重叠或未按 start 升序")
        if self.boss_room is None:
            self.boss_room = max(range(len(self.rooms)), key=lambda i: self.rooms[i].fail_rate)
        if not 0 <= self.boss_room < len(self.rooms) or len(self.rooms[self.boss_room].items) < 3:
            raise ValueError("boss_room 越界或该房间不足 3 道题")
        for f in self.faq:
            if not 0 <= f.room < len(self.rooms):
                raise ValueError(f"faq.room {f.room} 越界")
        if self.world:
            self.check_world(self.world)
        return self

    def check_world(self, w: World):
        seen = set()
        for wr in w.rooms:
            if not 0 <= wr.room < len(self.rooms) or wr.room in seen:
                raise ValueError(f"world.rooms 的 room {wr.room} 越界或重复")
            seen.add(wr.room)
            r = self.rooms[wr.room]
            for t in wr.source_times():
                if not r.start <= t <= r.end:
                    raise ValueError(f"world.rooms[{wr.room}] source_time {t} 不在房间 [{r.start}, {r.end}] 内")
        for n in w.npcs:
            if not 0 <= n.room < len(self.rooms) or not 0 <= n.faq < len(self.faq):
                raise ValueError(f"world.npcs 的 room {n.room} 或 faq {n.faq} 越界")
        self.check_tool_chain(w)

    def check_tool_chain(self, w: World):
        """道具链必须走得通：门题在本房、每个道具只从一处得到、需要的道具在更早的殿室就能拿到。"""
        tools = {t.id for t in w.items}
        if len(tools) != len(w.items):
            raise ValueError("world.items 的 id 重复")
        source: dict[str, int] = {}
        for wr in w.rooms:
            if wr.door and wr.door.item not in {it.id for it in self.rooms[wr.room].items}:
                raise ValueError(f"world.rooms[{wr.room}] 的门题 {wr.door.item} 不在本房 items 里")
            if wr.reward:
                if wr.reward not in tools or wr.reward in source:
                    raise ValueError(f"world.rooms[{wr.room}] 的 reward {wr.reward} 未定义或重复发放")
                if not wr.door:
                    raise ValueError(f"world.rooms[{wr.room}] 有 reward 但没有门题")
                source[wr.reward] = wr.room
        if w.boss.reward:
            if w.boss.reward not in tools or w.boss.reward in source:
                raise ValueError(f"world.boss.reward {w.boss.reward} 未定义或重复发放")
        for wr in w.rooms:
            if wr.requires and not (wr.requires in source and source[wr.requires] < wr.room):
                raise ValueError(f"world.rooms[{wr.room}] 需要的道具 {wr.requires} 必须由更早的殿室给出")


# Pydantic 内置校验的常见报错译成中文，其余（自定义规则）本身就是中文
_MSG = {
    "missing": "缺少这个字段", "string_too_long": "不能超过 {max_length} 个字", "string_too_short": "至少 {min_length} 个字",
    "too_long": "最多 {max_length} 项", "too_short": "至少 {min_length} 项", "literal_error": "只能取 {expected}",
    "greater_than": "必须大于 {gt}", "greater_than_equal": "不能小于 {ge}", "less_than_equal": "不能大于 {le}",
    "string_pattern_mismatch": "格式不对", "int_parsing": "必须是整数", "float_parsing": "必须是数字", "string_type": "必须是文本",
}


def error_lines(e: ValidationError | ValueError) -> list[str]:
    """校验错误 → 后台能看懂的逐条说明：「rooms.0.items.1：q11: options 必须是 4 个互不相同的选项」。"""
    if not isinstance(e, ValidationError):
        return [str(e)]
    out = []
    for err in e.errors():
        msg = _MSG[err["type"]].format(**err.get("ctx", {})).replace(" or ", ", ") if err["type"] in _MSG else err["msg"].removeprefix("Value error, ")
        out.append(f"{'.'.join(map(str, err['loc'])) or '整体'}：{msg}")
    return out
