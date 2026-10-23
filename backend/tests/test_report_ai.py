"""AI 复盘点评：按场景取提示词、输出结构校验。"""
import pytest
from pydantic import ValidationError

from app.report import AI_COMMON, AI_SCENE, AiReview, _sample


@pytest.mark.parametrize("scene, role, other", [("course", "讲师", "营销转化"), ("commerce", "主播", "教学效果")])
def test_prompt_is_single_view_and_addressed_to_host(scene, role, other):
    cfg = AI_SCENE[scene]
    system = cfg["intro"] + AI_COMMON.format(**cfg)
    assert f"不分析{other}" in system and f"{role}本人" in system
    assert "{" not in system.split("只输出一个 JSON 对象")[0]  # 占位符都已替换


def test_review_requires_diagnosis_and_plan():
    ok = {"verdict": "v", "summary": "s", "diagnosis": [{"title": "t", "evidence": "e", "cause": "c"}],
          "plan": [{"stage": "开场", "action": "a", "priority": "P0"}]}
    assert AiReview.model_validate(ok).diagnosis[0].confidence == "high"
    with pytest.raises(ValidationError):
        AiReview.model_validate({**ok, "plan": []})
    with pytest.raises(ValidationError):
        AiReview.model_validate({**ok, "plan": [{"stage": "开场", "action": "a", "priority": "P9"}]})


def test_sample_keeps_ends():
    assert _sample(list(range(100)), 5) == [0, 25, 50, 74, 99]
    assert _sample([1, 2], 5) == [1, 2]
