"""后台调整：校验错误说明、城数据与已生成讲次对齐。"""
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.pipeline.city import City, reconcile
from app.pipeline.schema import Game, error_lines
from app.storage import read_json

SAMPLE = Path(__file__).parent.parent / "data/samples/course-3958201-demo/game.json"

CHANNEL = {"name": "Python 入门", "scene": "course"}


def replay(rid: str, no: int) -> dict:
    return {"id": rid, "sort_no": no, "title": f"课程-第{no}讲"}


def test_error_lines_point_to_field():
    data = read_json(SAMPLE)
    data["rooms"][0]["items"][0]["options"] = ["a", "a", "b", "c"]
    with pytest.raises(ValidationError) as e:
        Game.model_validate(data)
    lines = error_lines(e.value)
    assert lines[0].startswith("rooms.0.items.0：") and "4 个互不相同" in lines[0]


def test_error_lines_translate_builtin_errors():
    from app.pipeline.city import Building
    with pytest.raises(ValidationError) as e:
        Building.model_validate({"replay": "a", "name": "列表楼", "plaque": "七个字的匾额啊", "kind": "castle", "blurb": ""})
    assert error_lines(e.value) == ["plaque：不能超过 6 个字", "kind：只能取 'pavilion', 'hall', 'shop', 'tower'"]


def test_error_lines_plain_value_error():
    assert error_lines(ValueError("buildings 必须恰好覆盖")) == ["buildings 必须恰好覆盖"]


def test_reconcile_adds_new_and_drops_gone_replays():
    city = {
        "name": "汴河夜市", "intro": "入夜", "streets": [{"name": "容器街", "replays": ["a", "gone"]}, {"name": "空街", "replays": ["gone"]}],
        "buildings": [{"replay": "a", "name": "列表楼", "plaque": "容器为先", "kind": "pavilion", "blurb": ""},
                      {"replay": "gone", "name": "旧楼", "plaque": "旧", "kind": "hall", "blurb": ""}],
        "npcs": [{"replay": "gone", "name": "更夫", "line": "……"}],
    }
    out = reconcile(CHANNEL, city, [replay("a", 1), replay("b", 2)])
    assert out["streets"] == [{"name": "容器街", "replays": ["a", "b"]}]
    assert [b["replay"] for b in out["buildings"]] == ["a", "b"] and out["buildings"][0]["name"] == "列表楼"
    assert out["npcs"] == []
    City.model_validate(out).check_replays(["a", "b"])
