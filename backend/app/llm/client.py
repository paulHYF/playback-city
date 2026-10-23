import json

import httpx

from app.config import Settings


class LLMError(RuntimeError):
    pass


async def chat_json(settings: Settings, system: str, user: str) -> dict:
    """调用 OpenAI 兼容的 chat/completions，要求返回 JSON 对象。模型选型待定（需求文档 Q3），换厂商只改 .env。"""
    if not settings.llm_api_key or not settings.llm_model:
        raise LLMError("未配置 LLM_API_KEY / LLM_MODEL")
    async with httpx.AsyncClient(base_url=settings.llm_base_url, timeout=600) as http:
        resp = await http.post(
            "/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            json={
                "model": settings.llm_model,
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            },
        )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise LLMError(f"模型没有返回合法 JSON：{content[:200]}") from e
