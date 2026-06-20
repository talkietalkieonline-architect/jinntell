"""
Contractor Agents API — управление агентами контрагента + аналитика диалогов.
Контрагент видит только свои агенты, может настраивать их и смотреть статистику.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_contractor_token
from app.models.agent import Agent
from app.models.contractor import Contractor
from app.models.message import Message
from app.models.user import User
from app.schemas.agent import AgentDetailOut, AgentUpdate

router = APIRouter(prefix="/api/contractor", tags=["contractor"])

# Потолок длины ответа: бизнес выбирает не выше (защита от слива баланса)
MAX_RESPONSE_TOKENS = 2000
MIN_RESPONSE_TOKENS = 100


async def _get_contractor_from_token(token: str, db: AsyncSession) -> Contractor:
    """Декодировать токен и загрузить контрагента."""
    if not token:
        raise HTTPException(401, "Токен не передан")
    contractor_id = decode_contractor_token(token)
    if not contractor_id:
        raise HTTPException(401, "Невалидный токен")
    result = await db.execute(
        select(Contractor).where(Contractor.id == contractor_id, Contractor.is_active == True)
    )
    contractor = result.scalar_one_or_none()
    if not contractor:
        raise HTTPException(401, "Контрагент не найден или деактивирован")
    return contractor


async def _require_contractor(
    authorization: str | None = Header(default=None),
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> Contractor:
    """Токен из заголовка Authorization: Bearer ИЛИ из query ?token=."""
    raw = token
    if not raw and authorization and authorization.lower().startswith("bearer "):
        raw = authorization[7:]
    return await _get_contractor_from_token(raw, db)


async def _get_owned_agent(agent_id: int, contractor: Contractor, db: AsyncSession) -> Agent:
    """Загрузить агента, убедившись что он принадлежит контрагенту."""
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.contractor_id == contractor.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")
    return agent


async def _agent_rooms(agent_id: int, db: AsyncSession) -> list[str]:
    """Комнаты, где участвовал агент (по его репликам) + каноничная agent-{id}.

    Заложено наперёд под мульти-агентные комнаты (Телеграм-тип): берём по участию
    агента, а не только по имени комнаты.
    """
    rows = await db.execute(
        select(Message.room).where(Message.sender_agent_id == agent_id).distinct()
    )
    rooms = {r[0] for r in rows.all()}
    rooms.add(f"agent-{agent_id}")
    return list(rooms)


@router.get("/agents", response_model=list[AgentDetailOut])
async def contractor_get_agents(
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    """Список агентов контрагента."""
    result = await db.execute(
        select(Agent).where(Agent.contractor_id == contractor.id).order_by(Agent.name)
    )
    agents = result.scalars().all()
    return [AgentDetailOut.model_validate(a) for a in agents]


@router.get("/agents/{agent_id}", response_model=AgentDetailOut)
async def contractor_get_agent(
    agent_id: int,
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    """Полная карточка агента (только свой)."""
    agent = await _get_owned_agent(agent_id, contractor, db)
    return AgentDetailOut.model_validate(agent)


@router.patch("/agents/{agent_id}", response_model=AgentDetailOut)
async def contractor_update_agent(
    agent_id: int,
    body: AgentUpdate,
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    """Обновить настройки агента. Контрагент НЕ может менять name, profession, brand, agent_type, is_active."""
    agent = await _get_owned_agent(agent_id, contractor, db)

    allowed_fields = {
        "description", "greeting", "system_prompt", "llm_model", "llm_max_tokens",
        "manner_style", "manner_temperament", "manner_humor", "manner_emoji_use",
        "knowledge_text", "knowledge_urls", "knowledge_files",
        "voice_id", "voice_speed", "voice_pitch",
        "appearance_preset", "appearance_face", "appearance_hair", "appearance_skin", "appearance_body",
        "outfit_style", "outfit_top", "outfit_bottom", "outfit_shoes", "outfit_accessory",
        "unavailable_message",
    }

    for field in body.model_fields_set:
        if field not in allowed_fields:
            continue
        value = getattr(body, field, None)
        if value is None or not hasattr(agent, field):
            continue
        # Длина ответа — зажимаем в наш потолок
        if field == "llm_max_tokens":
            value = max(MIN_RESPONSE_TOKENS, min(MAX_RESPONSE_TOKENS, int(value)))
        setattr(agent, field, value)

    await db.flush()
    await db.refresh(agent)
    return AgentDetailOut.model_validate(agent)


@router.get("/agents/{agent_id}/stats")
async def contractor_agent_stats(
    agent_id: int,
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    """Сводная статистика по агенту: обращения, клиенты, активность по часам/дням."""
    agent = await _get_owned_agent(agent_id, contractor, db)
    rooms = await _agent_rooms(agent_id, db)
    base = Message.room.in_(rooms)
    now = datetime.now(timezone.utc)
    d7 = now - timedelta(days=7)
    d30 = now - timedelta(days=30)

    total_messages = (await db.execute(select(func.count(Message.id)).where(base))).scalar() or 0
    msgs_7d = (await db.execute(select(func.count(Message.id)).where(base, Message.created_at >= d7))).scalar() or 0
    msgs_30d = (await db.execute(select(func.count(Message.id)).where(base, Message.created_at >= d30))).scalar() or 0
    last_activity = (await db.execute(select(func.max(Message.created_at)).where(base))).scalar()

    clients_total = (await db.execute(
        select(func.count(func.distinct(Message.sender_user_id))).where(base, Message.sender_user_id.isnot(None))
    )).scalar() or 0

    day = func.date(Message.created_at)
    per_user_days = (await db.execute(
        select(Message.sender_user_id, func.count(func.distinct(day)))
        .where(base, Message.sender_user_id.isnot(None))
        .group_by(Message.sender_user_id)
    )).all()
    returning_total = sum(1 for _, d in per_user_days if (d or 0) > 1)

    user_msgs = (await db.execute(
        select(func.count(Message.id)).where(base, Message.sender_type == "user")
    )).scalar() or 0
    avg_dialog_len = round(user_msgs / clients_total, 1) if clients_total else 0

    hour = func.extract("hour", Message.created_at)
    by_hour_rows = (await db.execute(
        select(hour, func.count(Message.id)).where(base, Message.sender_type == "user").group_by(hour)
    )).all()
    by_hour = [0] * 24
    for h, c in by_hour_rows:
        if h is not None:
            by_hour[int(h)] = c

    by_day_rows = (await db.execute(
        select(day, func.count(Message.id))
        .where(base, Message.created_at >= now - timedelta(days=14), Message.sender_type == "user")
        .group_by(day).order_by(day)
    )).all()
    by_day = [{"date": str(d), "count": c} for d, c in by_day_rows]

    return {
        "total_messages": total_messages,
        "messages_7d": msgs_7d,
        "messages_30d": msgs_30d,
        "last_activity": last_activity.isoformat() if last_activity else None,
        "clients_total": clients_total,
        "returning_total": returning_total,
        "new_total": max(0, clients_total - returning_total),
        "avg_dialog_len": avg_dialog_len,
        "rating": agent.rating,
        "rating_count": agent.rating_count,
        "by_hour": by_hour,
        "by_day": by_day,
    }


@router.get("/agents/{agent_id}/dialogs")
async def contractor_agent_dialogs(
    agent_id: int,
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    """Список диалогов (по клиентам): кто обращался, сколько сообщений, последнее сообщение."""
    await _get_owned_agent(agent_id, contractor, db)
    rooms = await _agent_rooms(agent_id, db)
    base = Message.room.in_(rooms)

    rows = (await db.execute(
        select(Message.sender_user_id, func.count(Message.id), func.max(Message.created_at))
        .where(base, Message.sender_user_id.isnot(None))
        .group_by(Message.sender_user_id)
        .order_by(func.max(Message.created_at).desc())
    )).all()

    result = []
    for uid, cnt, last in rows:
        name = (await db.execute(select(User.display_name).where(User.id == uid))).scalar()
        last_text = (await db.execute(
            select(Message.text).where(base, Message.sender_user_id == uid)
            .order_by(Message.created_at.desc()).limit(1)
        )).scalar()
        result.append({
            "user_id": uid,
            "user_name": name or f"Клиент {uid}",
            "message_count": cnt,
            "last_message": (last_text or "")[:120],
            "last_active": last.isoformat() if last else None,
        })
    return result


@router.get("/agents/{agent_id}/dialogs/{user_id}")
async def contractor_agent_dialog(
    agent_id: int,
    user_id: int,
    contractor: Contractor = Depends(_require_contractor),
    limit: int = 300,
    db: AsyncSession = Depends(get_db),
):
    """Переписка конкретного клиента: его сообщения + реплики ЭТОГО агента.

    Чужие пользователи и чужие агенты в выдачу не попадают (приватность).
    """
    await _get_owned_agent(agent_id, contractor, db)
    rooms = await _agent_rooms(agent_id, db)

    msgs = (await db.execute(
        select(Message).where(
            Message.room.in_(rooms),
            or_(Message.sender_user_id == user_id, Message.sender_agent_id == agent_id),
        ).order_by(Message.created_at.asc()).limit(limit)
    )).scalars().all()

    return [{
        "id": m.id,
        "sender_type": m.sender_type,
        "sender_name": m.sender_name,
        "text": m.text,
        "created_at": m.created_at.isoformat(),
    } for m in msgs]
