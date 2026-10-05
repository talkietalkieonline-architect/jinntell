"""
Архитектор-фабрика: по краткому ТЗ генерирует персону джина, создаёт его в БД
и проводит через ПРОЦЕДУРУ РОЖДЕНИЯ (jinn_birth.birth verify=True — найден в Городе + реально отвечает).

draft(db, brief, ...) -> отчёт. Используется админ-эндпоинтом; позже — инструментом самого Архитектора.
"""
from __future__ import annotations

import json
import re
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.services.llm import get_llm_reply
from app.services import jinn_birth

_SYS = (
    "Ты — Архитектор JinnTell. По краткому ТЗ создай персону нового джина-специалиста для Города. "
    "Ответь СТРОГО одним JSON-объектом, без пояснений и без markdown. Поля: "
    "name (имя + кратко кто он, по-русски), profession (короткая профессия), "
    "description (1-2 предложения о нём), "
    "system_prompt (инструкция джину: кто он, как общается, о чём помогает, чего НЕ делает; 3-6 предложений), "
    "greeting (короткое приветствие от первого лица), "
    "topic_scope (темы через запятую, по которым он отвечает), "
    "color (hex-цвет), "
    "manner_style (одно из: friendly, formal, playful, strict), "
    "manner_temperament (одно из: calm, balanced, energetic, reserved)."
)

_STYLES = ("friendly", "formal", "playful", "strict")
_TEMPERS = ("calm", "balanced", "energetic", "reserved")


def _parse(raw: str) -> dict:
    s = (raw or "").strip()
    s = re.sub(r"^```(json)?", "", s).strip()
    s = re.sub(r"```$", "", s).strip()
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if m:
        s = m.group(0)
    return json.loads(s)


async def draft(db: AsyncSession, brief: str, *, owner_id: Optional[int] = None,
                contractor_id: Optional[int] = None, is_paid: bool = False,
                visibility: str = "public", model: Optional[str] = None,
                agent_type: str = "specialist") -> dict:
    brief = (brief or "").strip()
    if not brief:
        return {"ok": False, "error": "пустое ТЗ"}

    raw = await get_llm_reply(user_message=f"ТЗ: {brief}", system_prompt=_SYS, model=model, max_tokens=900)
    try:
        p = _parse(raw)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"не удалось разобрать персону: {e}", "raw": (raw or "")[:400]}

    name = (str(p.get("name") or "Джин")).strip()[:100] or "Джин"
    ms = p.get("manner_style") if p.get("manner_style") in _STYLES else "friendly"
    mt = p.get("manner_temperament") if p.get("manner_temperament") in _TEMPERS else "balanced"
    color = str(p.get("color") or "#6d8bff").strip()
    if not color.startswith("#"):
        color = "#" + color
    if not re.match(r"^#[0-9a-fA-F]{6}$", color):
        color = "#6d8bff"

    agent = Agent(
        name=name,
        profession=(str(p.get("profession") or "Специалист")).strip()[:100],
        brand="",
        description=(str(p.get("description") or "")).strip(),
        system_prompt=(str(p.get("system_prompt") or "")).strip(),
        greeting=(str(p.get("greeting") or "")).strip() or None,
        topic_scope=(str(p.get("topic_scope") or "")).strip() or None,
        color=color[:20],
        agent_type=agent_type,
        visibility=visibility,
        is_paid=bool(is_paid),
        llm_model=model or "deepseek-chat",
        owner_id=owner_id,
        contractor_id=contractor_id,
        manner_style=ms,
        manner_temperament=mt,
    )
    db.add(agent)
    await db.flush()
    if not agent.jinntell_link:
        agent.jinntell_link = f"jinn-{agent.id}"
    await db.flush()

    report = await jinn_birth.birth(db, agent, verify=True)
    return {
        "ok": True,
        "agent_id": agent.id,
        "slug": agent.jinntell_link,
        "name": agent.name,
        "profession": agent.profession,
        "birth": report,
    }
