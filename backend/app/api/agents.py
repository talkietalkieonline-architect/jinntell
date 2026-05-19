"""API Город Агентов — каталог, поиск, фильтры, конструктор"""
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.agent import Agent
from app.models.user import User
from app.schemas.agent import AgentDetailOut, AgentListResponse, AgentOut, AgentUpdate

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _make_jinntell_link(name: str, brand: str) -> str:
    """Генерируем jinntell_link из имени и бренда"""
    slug = f"{name}-{brand}".lower().strip()
    slug = re.sub(r"[^a-z0-9\u0430-\u044f\u0451-]+", "-", slug)
    slug = slug.strip("-")[:80]
    return slug or "agent"


@router.get("", response_model=AgentListResponse)
async def list_agents(
    search: str = Query("", description="Поиск по имени, профессии, бренду"),
    profession: str = Query("", description="Фильтр по профессии"),
    agent_type: str = Query("", description="Фильтр по типу: business, citizen, system"),
    db: AsyncSession = Depends(get_db),
):
    """Каталог агентов с поиском и фильтрами"""
    query = select(Agent).where(Agent.is_active == True)

    # Скрываем core-агентов из публичного каталога
    query = query.where(Agent.visibility != "core")

    if search:
        pattern = f"%{search}%"
        query = query.where(
            Agent.name.ilike(pattern)
            | Agent.profession.ilike(pattern)
            | Agent.brand.ilike(pattern)
        )

    if profession:
        query = query.where(Agent.profession == profession)

    if agent_type:
        query = query.where(Agent.agent_type == agent_type)

    query = query.order_by(Agent.rating.desc(), Agent.name)

    result = await db.execute(query)
    agents = result.scalars().all()

    # Счётчики (по всей базе, не по фильтру)
    total_result = await db.execute(select(func.count(Agent.id)).where(Agent.is_active == True))
    total = total_result.scalar() or 0

    biz_result = await db.execute(
        select(func.count(Agent.id)).where(Agent.is_active == True, Agent.agent_type == "business")
    )
    business_count = biz_result.scalar() or 0

    cit_result = await db.execute(
        select(func.count(Agent.id)).where(Agent.is_active == True, Agent.agent_type == "citizen")
    )
    citizen_count = cit_result.scalar() or 0

    sys_result = await db.execute(
        select(func.count(Agent.id)).where(Agent.is_active == True, Agent.agent_type == "system")
    )
    system_count = sys_result.scalar() or 0

    return AgentListResponse(
        agents=[AgentOut.model_validate(a) for a in agents],
        total=total,
        business_count=business_count,
        citizen_count=citizen_count,
        system_count=system_count,
    )


@router.get("/my", response_model=list[AgentDetailOut])
async def my_agents(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Мои агенты (привязанные ко мне) — полные данные для настройки"""
    result = await db.execute(
        select(Agent).where(Agent.owner_id == user.id, Agent.is_active == True)
        .order_by(Agent.created_at.desc())
    )
    agents = result.scalars().all()
    return [AgentDetailOut.model_validate(a) for a in agents]


@router.get("/link/{slug}")
async def get_agent_by_link(slug: str, db: AsyncSession = Depends(get_db)):
    """Публичная карточка агента по jinntell_link (для JinnTell Links)"""
    result = await db.execute(
        select(Agent).where(Agent.jinntell_link == slug, Agent.is_active == True)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")
    return AgentOut.model_validate(agent)


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    """Карточка агента"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.is_active == True))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")
    return AgentOut.model_validate(agent)


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: int,
    body: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Обновить агента (владелец или админ)"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.is_active == True))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")
    if agent.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Нет доступа")

    # Админ — всё; Бизнес — настройки персонажа + AI + знания, но НЕ имя/тип/цвет
    if user.is_admin:
        editable = [
            "name", "profession", "brand", "description", "color",
            "system_prompt", "llm_model", "greeting",
            "voice_id", "voice_speed", "voice_pitch",
            "appearance_preset", "appearance_face", "appearance_hair", "appearance_skin", "appearance_body",
            "outfit_style", "outfit_top", "outfit_bottom", "outfit_shoes", "outfit_accessory",
            "manner_style", "manner_temperament", "manner_humor", "manner_emoji_use",
            "knowledge_text", "knowledge_urls", "knowledge_files",
        ]
    else:
        # Бизнес: всё кроме name, profession, brand, color, agent_type
        editable = [
            "description", "system_prompt", "llm_model", "greeting",
            "voice_id", "voice_speed", "voice_pitch",
            "appearance_preset", "appearance_face", "appearance_hair", "appearance_skin", "appearance_body",
            "outfit_style", "outfit_top", "outfit_bottom", "outfit_shoes", "outfit_accessory",
            "manner_style", "manner_temperament", "manner_humor", "manner_emoji_use",
            "knowledge_text", "knowledge_urls", "knowledge_files",
        ]

    for field in editable:
        value = getattr(body, field, None)
        if value is not None:
            setattr(agent, field, value)

    await db.flush()
    return AgentDetailOut.model_validate(agent)
