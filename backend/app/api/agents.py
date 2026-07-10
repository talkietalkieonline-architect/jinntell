"""API Город Агентов — каталог, поиск, фильтры, конструктор"""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.models.agent import Agent
from app.models.agent_access import AgentAccess
from app.services.access import can_access_agent
from app.models.user_favorite import UserFavorite
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
    scope: str = Query("", description="Охват: city | federal"),
    city: str = Query("", description="Город (для scope=city)"),
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Каталог агентов с поиском и фильтрами"""
    query = select(Agent).where(Agent.is_active == True)

    # Скрываем core-агентов из публичного каталога
    query = query.where(Agent.visibility != "core")

    # Скрытые агенты — только владельцу и пользователям из списка доступа
    if user:
        accessible = select(AgentAccess.agent_id).where(AgentAccess.user_id == user.id)
        query = query.where(
            (Agent.visibility != "hidden") | Agent.id.in_(accessible) | (Agent.owner_id == user.id)
        )
    else:
        query = query.where(Agent.visibility != "hidden")

    if search:
        pattern = f"%{search}%"
        query = query.where(
            Agent.name.ilike(pattern)
            | Agent.profession.ilike(pattern)
            | Agent.brand.ilike(pattern)
            | Agent.description.ilike(pattern)
            | Agent.skills_text.ilike(pattern)
        )

    if profession:
        query = query.where(Agent.profession == profession)

    if agent_type:
        query = query.where(Agent.agent_type == agent_type)

    if scope:
        query = query.where(Agent.scope == scope)
        if scope == "city" and city:
            query = query.where(Agent.city == city)

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


@router.get("/favorites", response_model=list[AgentOut])
async def list_favorites(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Избранные джинны пользователя."""
    res = await db.execute(
        select(Agent).join(UserFavorite, UserFavorite.agent_id == Agent.id)
        .where(UserFavorite.user_id == user.id, Agent.is_active == True)
    )
    return [AgentOut.model_validate(a) for a in res.scalars().all()]


@router.post("/favorites/{agent_id}")
async def add_favorite(agent_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Добавить джинна в избранное (с проверкой доступа к скрытым)."""
    res = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.is_active == True))
    agent = res.scalar_one_or_none()
    if not agent or not await can_access_agent(db, agent, user.id):
        raise HTTPException(404, "Агент не найден")
    exists = await db.execute(
        select(UserFavorite).where(UserFavorite.user_id == user.id, UserFavorite.agent_id == agent_id)
    )
    if not exists.scalar_one_or_none():
        db.add(UserFavorite(user_id=user.id, agent_id=agent_id))
        await db.commit()
    return {"ok": True}


@router.delete("/favorites/{agent_id}")
async def remove_favorite(agent_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Убрать из избранного."""
    res = await db.execute(
        select(UserFavorite).where(UserFavorite.user_id == user.id, UserFavorite.agent_id == agent_id)
    )
    f = res.scalar_one_or_none()
    if f:
        await db.delete(f)
        await db.commit()
    return {"ok": True}


@router.get("/recommended", response_model=list[AgentOut])
async def recommended_agents(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db), limit: int = 8):
    """Рекомендованные джинны: публичные, не мои и не в избранном, в случайной ротации."""
    owned = select(Agent.id).where(Agent.owner_id == user.id)
    favs = select(UserFavorite.agent_id).where(UserFavorite.user_id == user.id)
    res = await db.execute(
        select(Agent).where(
            Agent.is_active == True,
            Agent.visibility == "public",
            Agent.id.notin_(owned),
            Agent.id.notin_(favs),
        ).order_by(func.random()).limit(limit)
    )
    return [AgentOut.model_validate(a) for a in res.scalars().all()]


@router.get("/discover", response_model=list[AgentOut])
async def discover_agents(
    q: str = Query("", description="Запрос на естественном языке: кто нужен"),
    limit: int = Query(20, ge=1, le=50),
    scope: str = Query(""),
    city: str = Query(""),
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Семантический поиск джиннов по смыслу (Qdrant + эмбеддинги)."""
    from app.services import discovery
    ranked = await discovery.discover(q, limit=limit * 2)
    if not ranked:
        return []
    ids = [aid for aid, _ in ranked]
    res = await db.execute(
        select(Agent).where(Agent.id.in_(ids), Agent.is_active == True, Agent.visibility != "core")
    )
    by_id = {a.id: a for a in res.scalars().all()}
    uid = user.id if user else None
    out = []
    for aid, _score in ranked:
        a = by_id.get(aid)
        if a is None:
            continue
        if scope:
            if a.scope != scope:
                continue
            if scope == "city" and city and a.city != city:
                continue
        if not await can_access_agent(db, a, uid):
            continue
        out.append(AgentOut.model_validate(a))
        if len(out) >= limit:
            break
    return out


@router.post("/reindex")
async def reindex_agents(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Переиндексировать Город для семантического поиска."""
    from app.services import discovery
    n = await discovery.reindex_all(db)
    return {"ok": True, "indexed": n}


@router.get("/my-jinn")
async def get_my_jinn(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Личный джинн-дубликат пользователя (или null)."""
    res = await db.execute(select(Agent).where(Agent.owner_id == user.id, Agent.agent_type == "personal", Agent.is_active == True))
    a = res.scalar_one_or_none()
    return AgentDetailOut.model_validate(a) if a else None


@router.post("/my-jinn", response_model=AgentDetailOut)
async def create_my_jinn(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Создать (или вернуть) личного джинна из профиля пользователя."""
    res = await db.execute(select(Agent).where(Agent.owner_id == user.id, Agent.agent_type == "personal", Agent.is_active == True))
    a = res.scalar_one_or_none()
    if a:
        return AgentDetailOut.model_validate(a)
    name = user.display_name or user.first_name or "Мой джинн"
    interests = (user.interests or "").strip()
    desc = f"Личный представитель {name} в Городе." + (f" Интересы: {interests}." if interests else "")
    prompt = (
        f"Ты — цифровой представитель человека по имени {name} в JinnTell. "
        f"Общайся от его лица дружелюбно и живо, помогай познакомиться, договориться о встрече или деле. "
        f"Не выдавай приватных данных о владельце. "
        + (f"Интересы владельца: {interests}. " if interests else "")
        + "Отвечай кратко, по-русски."
    )
    agent = Agent(
        name=name, profession="Житель", brand="", description=desc,
        color=user.avatar_color or "#6c7bff", agent_type="personal", visibility="public",
        owner_id=user.id, scope="city", city=user.city, photo_url=user.avatar_url,
        greeting=f"Привет! Я {name}. Рад(а) знакомству 🙂", system_prompt=prompt,
        skills_text=interests,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    try:
        from app.services import discovery
        await discovery.index_one(agent)
    except Exception as e:
        print(f"[discovery] my-jinn index failed: {e}")
    return AgentDetailOut.model_validate(agent)


@router.get("/link/{slug}")
async def get_agent_by_link(slug: str, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    """Карточка агента по jinntell_link (скрытые — только для списка доступа)"""
    result = await db.execute(
        select(Agent).where(Agent.jinntell_link == slug, Agent.is_active == True)
    )
    agent = result.scalar_one_or_none()
    if not agent or not await can_access_agent(db, agent, user.id if user else None):
        raise HTTPException(404, "Агент не найден")
    return AgentOut.model_validate(agent)


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: int, user: Optional[User] = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)):
    """Карточка агента (скрытые — только для списка доступа)"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.is_active == True))
    agent = result.scalar_one_or_none()
    if not agent or not await can_access_agent(db, agent, user.id if user else None):
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
            "scope", "city", "is_paid",
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
            "description", "scope", "city", "is_paid", "system_prompt", "llm_model", "greeting",
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
    try:
        from app.services import discovery
        await discovery.index_one(agent)
    except Exception as e:
        print(f"[discovery] index_one failed: {e}")
    return AgentDetailOut.model_validate(agent)
