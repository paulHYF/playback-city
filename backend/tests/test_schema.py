from pathlib import Path

import pytest
from pydantic import ValidationError

from app.polyv.srt import parse_srt
from app.storage import read_json
from app.pipeline.schema import Game

SAMPLE = Path(__file__).parent.parent / "data/samples/course-3958201-demo/game.json"


def test_sample_game_is_valid():
    game = Game.model_validate(read_json(SAMPLE))
    assert game.boss_room == 3
    assert all(len(it.options) == 4 for r in game.rooms for it in r.items)


def test_source_time_must_fall_in_room():
    data = read_json(SAMPLE)
    data["rooms"][0]["items"][0]["source_time"] = 99999
    with pytest.raises(ValidationError, match="source_time"):
        Game.model_validate(data)


def test_boss_room_defaults_to_highest_fail_rate():
    data = read_json(SAMPLE)
    data["boss_room"] = None
    assert Game.model_validate(data).boss_room == 3


def test_parse_srt():
    text = "1\n00:12:41,000 --> 00:12:44,000\na[-1] 就是最后一个\n\n2\n00:12:45,500 --> 00:12:48,000\n从尾巴往回数\n"
    assert parse_srt(text) == [{"t": 761, "text": "a[-1] 就是最后一个"}, {"t": 765, "text": "从尾巴往回数"}]


def sample_world():
    return {
        "theme": "song_palace", "name": "列表地宫", "intro": "子时三刻，地宫的灯一盏盏亮起。",
        "palette": {"wall": "#2a3036", "accent": "#c9a45c", "fog": 0.16},
        "rooms": [
            {"room": 1, "name": "索引长廊", "layout": "corridor", "mechanic": "chest_quiz"},
            {"room": 2, "name": "双门殿", "mechanic": "twin_doors",
             "twin_doors": {"prompt": "想把 3、4 逐个加进列表", "left": "append", "right": "extend", "answer": "right",
                            "explain": "extend 拆开逐个加入", "source_time": 1290}},
            {"room": 5, "name": "词频庭院", "layout": "courtyard", "mechanic": "order_steps",
             "order_steps": {"prompt": "统计词频的步骤", "steps": ["建空字典", "遍历每个词", "get 默认 0 再加 1", "按次数排序"],
                             "source_time": 3720}},
        ],
        "boss": {"archetype": "tomb_beast", "name": "KeyError 镇墓兽", "weakness": "get", "taunt": "取不到的键，就别想过去"},
        "npcs": [{"archetype": "scholar_ghost", "room": 1, "faq": 0, "line": "二十七人问过我同一个问题……"}],
    }


def test_world_is_valid():
    data = read_json(SAMPLE) | {"world": sample_world()}
    game = Game.model_validate(data)
    assert game.world.rooms[1].mechanic == "twin_doors"


@pytest.mark.parametrize("mutate, error", [
    (lambda w: w["rooms"][1]["twin_doors"].update(source_time=99999), "source_time"),
    (lambda w: w["rooms"][2].pop("order_steps"), "缺少同名配置"),
    (lambda w: w.update(theme="night_market"), "不匹配"),
    (lambda w: w["rooms"].append({"room": 1, "name": "重复"}), "越界或重复"),
])
def test_world_rules(mutate, error):
    w = sample_world()
    mutate(w)
    with pytest.raises(ValidationError, match=error):
        Game.model_validate(read_json(SAMPLE) | {"world": w})


def chain_world():
    w = sample_world()
    w["items"] = [{"id": "oil", "name": "灯油", "desc": "一小壶灯油", "use": "点亮双门殿"}]
    w["rooms"][0].update(door={"item": "q11"}, reward="oil")
    w["rooms"][1]["requires"] = "oil"
    return w


def test_tool_chain_is_valid():
    game = Game.model_validate(read_json(SAMPLE) | {"world": chain_world()})
    assert game.world.rooms[1].requires == "oil"


@pytest.mark.parametrize("mutate, error", [
    (lambda w: w["rooms"][0].update(door={"item": "qb1"}), "不在本房"),
    (lambda w: w["rooms"][1].update(requires="key"), "更早的殿室"),
    (lambda w: (w["rooms"][0].update(requires="oil"), w["rooms"][1].update(requires=None, door={"item": "q21"}, reward="oil")), "更早的殿室|重复发放"),
    (lambda w: w["rooms"][0].pop("door"), "没有门题"),
])
def test_tool_chain_rules(mutate, error):
    w = chain_world()
    mutate(w)
    with pytest.raises(ValidationError, match=error):
        Game.model_validate(read_json(SAMPLE) | {"world": w})
