"""Guardian (Агент Контента) — контроль ответов джиннов: анти-галлюцинации.

Сверяет ответ джинна с его базой знаний (RAG). Если находит выдумки/противоречия —
сигналит, и вызывающий код перегенерирует ответ строго по фактам (STRICT_SUFFIX).
Латентно-критичен: дешёвая модель, малый max_tokens, кэш конфига, toggle в админке.
Fail-open: при любой ошибке возвращает ok=True — Guardian никогда не ломает ответ.
"""
import json
import re
import time as _time

from app.core.config import settings
from app.services.llm import get_llm_reply

_CFG_CACHE = {"v": None, "t": 0.0}


async def config() -> dict:
    now = _time.time()
    c = _CFG_CACHE
    if c["v"] is not None and now - c["t"] < 60:
        return c["v"]
    cfg = {"enabled": True, "model": ""}
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        sj = await r.get("system:settings")
        await r.aclose()
        if sj:
            ss = json.loads(sj)
            if ss.get("guardian_enabled") is not None:
                cfg["enabled"] = bool(ss.get("guardian_enabled"))
            cfg["model"] = ss.get("guardian_model") or ""
    except Exception:
        pass
    c["v"] = cfg
    c["t"] = now
    return cfg


async def enabled() -> bool:
    return (await config())["enabled"]


# Добавка к промпту при перегенерации после провала проверки
STRICT_SUFFIX = (
    "\n\nВАЖНО (контроль качества): отвечай СТРОГО на основе приведённых справочных "
    "фактов и базы знаний. НЕ добавляй сведения, цифры, статьи и детали, которых там нет. "
    "Если точных данных нет — честно скажи, что не уверен, и предложи уточнить у первоисточника."
)

_VERIFY_SYS = (
    "Ты — Агент Контента, контролёр качества ответов на платформе JinnTell. "
    "Тебе дают СПРАВОЧНЫЕ ФАКТЫ (база знаний), ВОПРОС пользователя и ОТВЕТ джинна. "
    "Проверь, есть ли в ОТВЕТЕ фактические утверждения, которые ПРОТИВОРЕЧАТ фактам "
    "или НЕ ПОДТВЕРЖДАЮТСЯ ими (выдуманные цифры, суммы, статьи, детали). Вежливые "
    "фразы, переформулировки и здравые уточнения — это нормально, не придирайся. "
    "Ответь РОВНО так и ничего лишнего до вердикта: "
    "если всё соответствует фактам — напиши одно слово OK; "
    "если есть выдумка или противоречие — напиши FAIL и через тире кратко причину."
)


async def verify(question: str, knowledge: str, answer: str, model: str = "") -> dict:
    """Проверить ответ на галлюцинации относительно базы знаний. Возвращает {ok, issue}."""
    if not knowledge or not answer:
        return {"ok": True, "issue": ""}
    cfg = await config()
    use_model = model or cfg.get("model") or None
    payload = (
        f"=== СПРАВОЧНЫЕ ФАКТЫ ===\n{knowledge}\n\n"
        f"=== ВОПРОС ===\n{question}\n\n"
        f"=== ОТВЕТ ДЖИННА ===\n{answer}\n\n"
        "Верни JSON."
    )
    try:
        raw = await get_llm_reply(
            user_message=payload,
            system_prompt=_VERIFY_SYS,
            model=use_model,
            max_tokens=220,
            payer_type="free",
        )
    except Exception as e:
        print(f"[guardian] verify error: {e}")
        return {"ok": True, "issue": ""}
    # Простой вердикт OK / FAIL — устойчив к чистке reasoning (в отличие от JSON)
    v = (raw or "").strip()
    if re.search(r"\bfail\b", v, re.I):
        issue = re.sub(r"^.*?\bfail\b[\s:.,—\-]*", "", v, flags=re.I | re.S).strip()[:200]
        return {"ok": False, "issue": issue}
    return {"ok": True, "issue": ""}
