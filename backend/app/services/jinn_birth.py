"""
Единая процедура РОЖДЕНИЯ джина — «прописка в жизнь».

Создание джина ≠ запись строки в БД. Чтобы джин «попал в жизнь», он должен пройти
набор шагов: дефолты/санити → проверка плательщика → память → индексация в поиске
Города (Qdrant) → (опц.) самотест (находится ли + реально ли отвечает).

Идемпотентно. Вызывается из точек создания/обновления агента и из админ-эндпоинтов.
Обратная сторона — retire() (убрать из индекса при отставке/удалении).
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent

DEF_SESSION_LIMIT = 30
DEF_DAILY_LIMIT = 50


def _ensure_defaults(a: Agent) -> None:
    """Санити-дефолты, без которых джин «полуживой»."""
    if not getattr(a, "visibility", None):
        a.visibility = "public"
    if getattr(a, "is_active", None) is None:
        a.is_active = True
    if not getattr(a, "llm_model", None):
        a.llm_model = "deepseek-chat"
    if not getattr(a, "session_msg_limit", None):
        a.session_msg_limit = DEF_SESSION_LIMIT
    if not getattr(a, "daily_msg_limit", None):
        a.daily_msg_limit = DEF_DAILY_LIMIT


def _payer_ok(a: Agent) -> bool:
    """Есть ли, с кого списывать генерацию (владелец-юзер или контрагент)."""
    return bool(getattr(a, "owner_id", None) or getattr(a, "contractor_id", None))


async def _index(a: Agent) -> None:
    from app.services import discovery
    await discovery.index_one(a)


async def _self_test(a: Agent) -> dict:
    """Проверка, что джин действительно живёт: находится в Городе и реально отвечает."""
    out: dict = {}
    try:
        from app.services import discovery
        ranked = await discovery.discover(a.profession or a.name or "", limit=10)
        out["discoverable"] = a.id in [aid for aid, _ in ranked]
    except Exception as e:  # noqa: BLE001
        out["discoverable"] = f"err: {e}"
    try:
        from app.services.llm import get_agent_reply
        ans = await get_agent_reply(
            agent_name=a.name, agent_profession=a.profession, agent_description=a.description or "",
            system_prompt=a.system_prompt, llm_model=a.llm_model or "deepseek-chat",
            manner_style=getattr(a, "manner_style", None), manner_temperament=getattr(a, "manner_temperament", None),
            manner_humor=getattr(a, "manner_humor", None), manner_emoji_use=getattr(a, "manner_emoji_use", None),
            knowledge_text=getattr(a, "knowledge_text", None), skills_text=getattr(a, "skills_text", None),
            exclusions_text=getattr(a, "exclusions_text", None), rag_context=None, conversation_history=[],
            user_id=None, agent_id=a.id, user_message="Представься одним коротким предложением.", max_tokens=80)
        out["responds"] = bool(ans and len(ans.strip()) > 2)
        out["sample"] = (ans or "").replace("\n", " ")[:80]
    except Exception as e:  # noqa: BLE001
        out["responds"] = f"err: {e}"
    return out


async def birth(db: AsyncSession, agent: Agent, *, verify: bool = False) -> dict:
    """Провести джина через рождение. Идемпотентно. Возвращает отчёт по шагам.

    verify=True — дополнительно самотест (находится в Городе + реально отвечает);
    делает один вызов LLM, поэтому в горячих путях create/update не включается.
    """
    report: dict = {"agent_id": getattr(agent, "id", None), "steps": {}, "warnings": []}

    _ensure_defaults(agent)
    report["steps"]["defaults"] = "ok"

    report["steps"]["payer"] = "ok" if _payer_ok(agent) else "none"
    if not _payer_ok(agent):
        report["warnings"].append("нет плательщика (owner/contractor) — генерация может не оплачиваться")

    # Память: RAG-коллекция джина создаётся лениво при индексации его знаний —
    # отдельного действия на рождении не требует.
    report["steps"]["memory"] = "lazy"

    try:
        await _index(agent)
        report["steps"]["discovery"] = "indexed"
    except Exception as e:  # noqa: BLE001
        report["steps"]["discovery"] = f"err: {e}"
        report["warnings"].append(f"индекс поиска Города: {e}")

    if verify:
        report["steps"]["verify"] = await _self_test(agent)

    return report


async def retire(agent_id: int) -> None:
    """«Отставка» джина — убрать из индекса поиска Города (обратная сторона рождения)."""
    try:
        from app.services import discovery
        await discovery.remove_one(agent_id)
    except Exception as e:  # noqa: BLE001
        print(f"[jinn_birth] retire skip: {e}")
