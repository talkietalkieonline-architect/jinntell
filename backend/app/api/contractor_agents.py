"""
Contractor Agents API — управление агентами контрагента.
Контрагент видит только свои агенты и может настраивать их.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_contractor_token
from app.models.agent import Agent
from app.models.contractor import Contractor
from app.schemas.agent import AgentDetailOut, AgentUpdate

router = APIRouter(prefix="/api/contractor", tags=["contractor"])


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


@router.get("/agents", response_model=list[AgentDetailOut])
async def contractor_get_agents(
    token: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Список агентов контрагента."""
    contractor = await _get_contractor_from_token(token, db)

    result = await db.execute(
        select(Agent).where(
            Agent.contractor_id == contractor.id,
        ).order_by(Agent.name)
    )
    agents = result.scalars().all()
    return [AgentDetailOut.model_validate(a) for a in agents]


@router.get("/agents/{agent_id}", response_model=AgentDetailOut)
async def contractor_get_agent(
    agent_id: int,
    token: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Полная карточка агента (только свой)."""
    contractor = await _get_contractor_from_token(token, db)

    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.contractor_id == contractor.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")
    return AgentDetailOut.model_validate(agent)


@router.patch("/agents/{agent_id}", response_model=AgentDetailOut)
async def contractor_update_agent(
    agent_id: int,
    body: AgentUpdate,
    token: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Обновить настройки агента. Контрагент НЕ может менять: name, profession, brand, agent_type, is_active."""
    contractor = await _get_contractor_from_token(token, db)

    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.contractor_id == contractor.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")

    # Разрешённые поля для контрагента
    allowed_fields = {
        "description", "greeting", "system_prompt", "llm_model",
        "manner_style", "manner_temperament", "manner_humor", "manner_emoji_use",
        "knowledge_text", "knowledge_urls", "knowledge_files",
        "voice_id", "voice_speed", "voice_pitch",
        "appearance_preset", "appearance_face", "appearance_hair", "appearance_skin", "appearance_body",
        "outfit_style", "outfit_top", "outfit_bottom", "outfit_shoes", "outfit_accessory",
        "unavailable_message",
    }

    for field in body.model_fields_set:
        if field in allowed_fields:
            value = getattr(body, field, None)
            if value is not None and hasattr(agent, field):
                setattr(agent, field, value)

    await db.flush()
    await db.refresh(agent)
    return AgentDetailOut.model_validate(agent)
