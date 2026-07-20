"""Запись в журнал действий. Всегда безопасна: своя сессия, ошибки не всплывают."""
from typing import Optional

from app.core.crypto import encrypt_text

# Действия, которые разрешено присылать с клиента (UI-события, backend их не видит).
CLIENT_ACTIONS = {
    "chat.open", "chat.close", "chat.reopen", "chat.clear",
    "view.open", "call.start", "call.end",
    "flow.start", "flow.stop",
    "media.send", "note.record",
}


async def log(
    action: str,
    *,
    user_id: Optional[int] = None,
    actor: str = "user",
    actor_agent_id: Optional[int] = None,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    target_name: Optional[str] = None,
    room: Optional[str] = None,
    result: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    """Записать событие. Никогда не бросает исключений — журнал не должен ломать работу."""
    try:
        from app.core.database import async_session
        from app.models.activity import ActivityLog
        async with async_session() as db:
            db.add(ActivityLog(
                user_id=user_id or None,
                actor=actor,
                actor_agent_id=actor_agent_id,
                action=(action or "")[:60],
                target_type=target_type,
                target_id=target_id,
                target_name=(target_name or None) and str(target_name)[:120],
                room=(room or None) and str(room)[:80],
                result=result,
                detail=encrypt_text(str(detail)[:2000]) if detail else None,
            ))
            await db.commit()
    except Exception:
        pass  # журнал молчит, работа продолжается
