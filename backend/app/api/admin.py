"""
Admin API — управление всеми агентами, пользователями, системой.
Доступен только пользователям с is_admin=True.
"""
import json
import os
import re
import time
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.core.security import hash_password
from app.models.agent import Agent
from app.models.contractor import Contractor
from app.models.user import User
from app.schemas.agent import AgentCreate, AgentDetailOut, AgentUpdate
from app.schemas.contractor import ContractorCreate, ContractorUpdate, ContractorOut, AddBalanceRequest, AssignAgentRequest


async def _generate_contractor_uid(db) -> str:
    """Генерация уникального UID для контрагента: C-00001, C-00002..."""
    from sqlalchemy import func as sqlfunc
    result = await db.execute(select(sqlfunc.max(Contractor.id)))
    max_id = result.scalar() or 0
    return f"C-{max_id + 1:05d}"


async def _generate_agent_uid(db) -> str:
    """Генерация уникального UID для агента: A-00001, A-00002..."""
    from sqlalchemy import func as sqlfunc
    result = await db.execute(select(sqlfunc.max(Agent.id)))
    max_id = result.scalar() or 0
    return f"A-{max_id + 1:05d}"

router = APIRouter(prefix="/api/admin", tags=["admin"])


# Список моделей для выпадающего списка
AVAILABLE_MODELS = [
    {"value": "deepseek-chat", "label": "DeepSeek V3 (рекомендуемый)", "group": "DeepSeek"},
    {"value": "deepseek-reasoner", "label": "DeepSeek R1 (рассуждающий)", "group": "DeepSeek"},
    {"value": "nvidia/nemotron-3-super-120b-a12b:free", "label": "Nemotron 3 Super 120B (бесплатная)", "group": "OpenRouter бесплатные"},
    {"value": "openai/gpt-oss-120b:free", "label": "GPT-OSS 120B (бесплатная)", "group": "OpenRouter бесплатные"},
    {"value": "google/gemma-4-31b-it:free", "label": "Gemma 4 31B (бесплатная)", "group": "OpenRouter бесплатные"},
    {"value": "deepseek/deepseek-v4-flash:free", "label": "DeepSeek V4 Flash (бесплатная)", "group": "OpenRouter бесплатные"},
    {"value": "qwen/qwen3-next-80b-a3b-instruct:free", "label": "Qwen3 Next 80B (бесплатная)", "group": "OpenRouter бесплатные"},
    {"value": "meta-llama/llama-3.3-70b-instruct:free", "label": "Llama 3.3 70B (бесплатная)", "group": "OpenRouter бесплатные"},
    {"value": "gpt-4o-mini", "label": "GPT-4o Mini", "group": "OpenAI"},
    {"value": "gpt-4o", "label": "GPT-4o", "group": "OpenAI"},
    {"value": "gemini-2.0-flash", "label": "Gemini 2.0 Flash", "group": "Gemini"},
    {"value": "llama-3.3-70b-versatile", "label": "Llama 3.3 70B", "group": "Groq"},
]

# Голос (TTS) — провайдеры для помощника
AVAILABLE_TTS = [
    {"value": "browser", "label": "Браузерный (Web Speech) — бесплатно", "group": "Базовый"},
    {"value": "yandex", "label": "Yandex SpeechKit", "group": "Облако"},
    {"value": "self", "label": "Self-hosted (GPT-SoVITS и др.)", "group": "Своё"},
]

# Видео (talking avatar) — провайдеры для помощника
AVAILABLE_VIDEO = [
    {"value": "", "label": "Выключено", "group": ""},
    {"value": "self", "label": "Self-hosted SadTalker", "group": "Своё"},
]

# Местоположение модели (где физически крутится)
MODEL_LOCATIONS = [
    {"value": "cloud", "label": "Облако (API провайдера)"},
    {"value": "self", "label": "Наш сервер"},
    {"value": "own_hw", "label": "Своё железо (GPU)"},
]


async def _get_redis():
    """Async Redis connection"""
    from app.core.config import settings
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


def _default_model_for_provider(provider: str) -> str:
    """Модель по умолчанию для провайдера"""
    from app.core.config import settings as s
    return {
        "deepseek": s.DEEPSEEK_MODEL,
        "openrouter": s.OPENROUTER_MODEL,
        "openai": s.OPENAI_MODEL,
        "gemini": s.GEMINI_MODEL,
        "groq": s.GROQ_MODEL,
    }.get(provider, s.DEEPSEEK_MODEL)


def _make_jinntell_link(name: str, brand: str) -> str:
    """Генерируем jinntell_link из имени и бренда"""
    slug = f"{name}-{brand}".lower().strip()
    slug = re.sub(r"[^a-z0-9\u0430-\u044f\u0451-]+", "-", slug)
    slug = slug.strip("-")[:80]
    return slug or "agent"


# ═══════════════════════════════════════════════
#  АГЕНТЫ
# ═══════════════════════════════════════════════

@router.get("/agents", response_model=list[AgentDetailOut])
async def admin_list_agents(
    search: str = Query("", description="Поиск"),
    agent_type: str = Query("", description="Фильтр: system / business / citizen / core / specialist"),
    include_inactive: bool = Query(False, description="Включая удалённых"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Все агенты (включая удалённых). Полные данные с промптами."""
    query = select(Agent)

    if not include_inactive:
        query = query.where(Agent.is_active == True)

    if search:
        pattern = f"%{search}%"
        query = query.where(
            Agent.name.ilike(pattern)
            | Agent.profession.ilike(pattern)
            | Agent.brand.ilike(pattern)
        )

    if agent_type:
        query = query.where(Agent.agent_type == agent_type)

    query = query.order_by(Agent.agent_type, Agent.name)
    result = await db.execute(query)
    agents = result.scalars().all()

    return [AgentDetailOut.model_validate(a) for a in agents]


@router.get("/agents/{agent_id}", response_model=AgentDetailOut)
async def admin_get_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Полная карточка агента с промптом и настройками"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")
    return AgentDetailOut.model_validate(agent)


@router.post("/agents", response_model=AgentDetailOut, status_code=201)
async def admin_create_agent(
    body: AgentCreate,
    owner_id: Optional[int] = Query(None, description="ID бизнес-пользователя (привязка)"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Создать агента (core, system, business, citizen, specialist)."""
    link = _make_jinntell_link(body.name, body.brand or "jinntell")

    existing = await db.execute(select(Agent).where(Agent.jinntell_link == link))
    if existing.scalar_one_or_none():
        cnt = (await db.execute(select(func.count(Agent.id)))).scalar() or 0
        link = f"{link}-{cnt + 1}"

    if owner_id:
        owner_result = await db.execute(select(User).where(User.id == owner_id, User.is_active == True))
        if not owner_result.scalar_one_or_none():
            raise HTTPException(400, f"Пользователь {owner_id} не найден")

    # Для core-агентов автоматически ставим visibility=core
    visibility = "core" if body.agent_type == "core" else "public"

    agent = Agent(
        name=body.name,
        profession=body.profession,
        brand=body.brand or "JinnTell",
        description=body.description,
        color=body.color,
        agent_type=body.agent_type,
        visibility=visibility,
        jinntell_link=link,
        uid=await _generate_agent_uid(db),
        system_prompt=body.system_prompt,
        llm_model=body.llm_model,
        greeting=body.greeting,
        owner_id=owner_id,
    )
    db.add(agent)
    await db.flush()
    await db.refresh(agent)
    return AgentDetailOut.model_validate(agent)


@router.patch("/agents/{agent_id}", response_model=AgentDetailOut)
async def admin_update_agent(
    agent_id: int,
    body: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Обновить любого агента (все поля)"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")

    for field in body.model_fields_set:
        value = getattr(body, field, None)
        if value is not None and hasattr(agent, field):
            setattr(agent, field, value)

    await db.flush()
    return AgentDetailOut.model_validate(agent)


@router.patch("/agents/{agent_id}/assign", response_model=AgentDetailOut)
async def admin_assign_agent(
    agent_id: int,
    owner_id: Optional[int] = Query(None, description="ID бизнес-пользователя (null = отвязать)"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Привязать/отвязать агента к бизнес-пользователю"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")

    if owner_id is not None:
        owner_result = await db.execute(select(User).where(User.id == owner_id, User.is_active == True))
        if not owner_result.scalar_one_or_none():
            raise HTTPException(400, f"Пользователь {owner_id} не найден")

    agent.owner_id = owner_id
    await db.flush()
    return AgentDetailOut.model_validate(agent)


@router.delete("/agents/{agent_id}", status_code=204)
async def admin_delete_agent(
    agent_id: int,
    hard: bool = Query(False, description="Жёсткое удаление (навсегда)"),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Удалить агента (мягкое по умолчанию, hard=true — навсегда)"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")

    if hard:
        await db.delete(agent)
    else:
        agent.is_active = False

    await db.flush()


@router.patch("/agents/{agent_id}/restore", response_model=AgentDetailOut)
async def admin_restore_agent(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Восстановить мягко-удалённого агента"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")

    agent.is_active = True
    await db.flush()
    return AgentDetailOut.model_validate(agent)


# ═══════════════════════════════════════════════
#  CORE AGENTS (системное ядро)
# ═══════════════════════════════════════════════

@router.get("/core-agents", response_model=list[AgentDetailOut])
async def admin_list_core_agents(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Список core-агентов (Помощник, Агент Админ, Агент Контента, Агент Железа)"""
    result = await db.execute(
        select(Agent).where(Agent.agent_type == "core").order_by(Agent.id)
    )
    agents = result.scalars().all()
    return [AgentDetailOut.model_validate(a) for a in agents]


# ═══════════════════════════════════════════════
#  ПОЛЬЗОВАТЕЛИ
# ═══════════════════════════════════════════════

@router.get("/users")
async def admin_list_users(
    search: str = Query(""),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Список пользователей"""
    query = select(User).where(User.is_active == True)

    if search:
        pattern = f"%{search}%"
        query = query.where(
            User.phone.ilike(pattern)
            | User.display_name.ilike(pattern)
        )

    query = query.order_by(User.created_at.desc())
    result = await db.execute(query)
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "phone": u.phone,
            "display_name": u.display_name,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "city": u.city,
            "is_admin": u.is_admin,
            "is_online": u.is_online,
            "is_verified": u.is_verified,
            "vk_linked": bool(u.vk_id),
            "telegram_linked": bool(u.telegram_id),
            "yandex_linked": bool(u.yandex_id),
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


# ═══════════════════════════════════════════════
#  СТАТИСТИКА
# ═══════════════════════════════════════════════

@router.get("/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Общая статистика платформы"""
    agents_total = (await db.execute(select(func.count(Agent.id)).where(Agent.is_active == True))).scalar() or 0
    agents_core = (await db.execute(select(func.count(Agent.id)).where(Agent.is_active == True, Agent.agent_type == "core"))).scalar() or 0
    agents_system = (await db.execute(select(func.count(Agent.id)).where(Agent.is_active == True, Agent.agent_type == "system"))).scalar() or 0
    agents_business = (await db.execute(select(func.count(Agent.id)).where(Agent.is_active == True, Agent.agent_type == "business"))).scalar() or 0
    agents_citizen = (await db.execute(select(func.count(Agent.id)).where(Agent.is_active == True, Agent.agent_type == "citizen"))).scalar() or 0
    agents_specialist = (await db.execute(select(func.count(Agent.id)).where(Agent.is_active == True, Agent.agent_type == "specialist"))).scalar() or 0
    users_total = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar() or 0

    return {
        "agents": {
            "total": agents_total,
            "core": agents_core,
            "system": agents_system,
            "business": agents_business,
            "citizen": agents_citizen,
            "specialist": agents_specialist,
        },
        "users": {
            "total": users_total,
        },
    }


# ═══════════════════════════════════════════════
#  LLM СТАТУС
# ═══════════════════════════════════════════════

@router.get("/llm-status")
async def admin_llm_status(
    admin: User = Depends(get_admin_user),
):
    """LLM статус: какие провайдеры подключены, ключи, модели"""
    from app.core.config import settings as s
    from app.services.llm import get_active_provider

    def mask_key(key: str) -> str:
        if not key:
            return ""
        if len(key) <= 8:
            return "****"
        return key[:4] + "..." + key[-4:]

    active = get_active_provider()

    return {
        "active_provider": active["name"],
        "active_model": active["model"],
        "default_provider": s.DEFAULT_LLM_PROVIDER,
        "providers": {
            "deepseek": {
                "connected": bool(s.DEEPSEEK_API_KEY),
                "key": mask_key(s.DEEPSEEK_API_KEY),
                "model": s.DEEPSEEK_MODEL,
            },
            "openrouter": {
                "connected": bool(s.OPENROUTER_API_KEY),
                "key": mask_key(s.OPENROUTER_API_KEY),
                "model": s.OPENROUTER_MODEL,
            },
            "openai": {
                "connected": bool(s.OPENAI_API_KEY),
                "key": mask_key(s.OPENAI_API_KEY),
                "model": s.OPENAI_MODEL,
            },
            "gemini": {
                "connected": bool(s.GEMINI_API_KEY),
                "key": mask_key(s.GEMINI_API_KEY),
                "model": s.GEMINI_MODEL,
            },
            "groq": {
                "connected": bool(s.GROQ_API_KEY),
                "key": mask_key(s.GROQ_API_KEY),
                "model": s.GROQ_MODEL,
            },
        },
    }


# ═══════════════════════════════════════════════
#  НАСТРОЙКИ МЭЛА (ex-Дворецкий)
# ═══════════════════════════════════════════════


@router.get("/assistant-settings")
async def admin_get_assistant_settings(
    admin: User = Depends(get_admin_user),
):
    """Текущие настройки Помощника (провайдер, модель, промпт)"""
    from app.core.config import settings as s
    from app.services.llm import MEL_SYSTEM_PROMPT

    provider = s.DEFAULT_LLM_PROVIDER
    model = _default_model_for_provider(provider)
    system_prompt = MEL_SYSTEM_PROMPT
    voice = {"provider": "browser", "model": "", "location": "cloud", "endpoint": "", "voice_id": ""}
    video = {"provider": "", "model": "", "location": "cloud", "endpoint": ""}

    try:
        r = await _get_redis()
        mel_json = await r.get("assistant:settings") or await r.get("butler:settings")
        mel_prompt = await r.get("assistant:system_prompt") or await r.get("butler:system_prompt")
        await r.aclose()

        if mel_json:
            bs = json.loads(mel_json)
            if bs.get("provider"):
                provider = bs["provider"]
            if bs.get("model"):
                model = bs["model"]
            if isinstance(bs.get("voice"), dict):
                voice.update(bs["voice"])
            if isinstance(bs.get("video"), dict):
                video.update(bs["video"])
        if mel_prompt:
            system_prompt = mel_prompt
    except Exception as e:
        print(f"[admin] Redis read error: {e}")

    return {
        "provider": provider,
        "model": model,
        "system_prompt": system_prompt,
        "voice": voice,
        "video": video,
        "available_models": AVAILABLE_MODELS,
        "available_tts": AVAILABLE_TTS,
        "available_video": AVAILABLE_VIDEO,
        "model_locations": MODEL_LOCATIONS,
    }



@router.patch("/assistant-settings")
async def admin_update_assistant_settings(
    body: dict = Body(...),
    admin: User = Depends(get_admin_user),
):
    """Обновить настройки Помощника (provider, model, system_prompt)"""
    from app.core.config import settings as s
    from app.services.llm import MEL_SYSTEM_PROMPT

    try:
        r = await _get_redis()

        existing_json = await r.get("assistant:settings") or await r.get("butler:settings")
        existing = json.loads(existing_json) if existing_json else {}

        if "provider" in body:
            existing["provider"] = body["provider"]
        if "model" in body:
            existing["model"] = body["model"]
        if isinstance(body.get("voice"), dict):
            existing["voice"] = {**existing.get("voice", {}), **body["voice"]}
        if isinstance(body.get("video"), dict):
            existing["video"] = {**existing.get("video", {}), **body["video"]}

        await r.set("assistant:settings", json.dumps(existing))

        if "system_prompt" in body:
            await r.set("assistant:system_prompt", body["system_prompt"])

        mel_prompt = await r.get("assistant:system_prompt")
        await r.aclose()

        return {
            "provider": existing.get("provider", s.DEFAULT_LLM_PROVIDER),
            "model": existing.get("model", _default_model_for_provider(s.DEFAULT_LLM_PROVIDER)),
            "system_prompt": mel_prompt or MEL_SYSTEM_PROMPT,
            "voice": existing.get("voice", {}),
            "video": existing.get("video", {}),
            "available_models": AVAILABLE_MODELS,
            "available_tts": AVAILABLE_TTS,
            "available_video": AVAILABLE_VIDEO,
            "model_locations": MODEL_LOCATIONS,
        }
    except Exception as e:
        print(f"[admin] Redis write error: {e}")
        raise HTTPException(500, f"Ошибка сохранения: {e}")



@router.post("/assistant-test")
async def admin_test_assistant(
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Тест Помощника: отправить сообщение, получить ответ"""
    from app.core.config import settings as s
    from app.services.llm import MEL_SYSTEM_PROMPT, get_llm_reply

    message = body.get("message", "").strip()
    if not message:
        raise HTTPException(400, "Сообщение не может быть пустым")

    # Берём настройки из карточки core-агента «Помощник Джим» — как реальный Джим
    result = await db.execute(select(Agent).where(Agent.jinntell_link == "jim"))
    asst = result.scalar_one_or_none()
    model = asst.llm_model if asst else _default_model_for_provider(s.DEFAULT_LLM_PROVIDER)
    system_prompt = asst.system_prompt if (asst and asst.system_prompt) else MEL_SYSTEM_PROMPT
    max_tokens = asst.llm_max_tokens if asst else 1000
    provider = (model.split("/")[0] if "/" in model else ("deepseek" if model.startswith("deepseek") else s.DEFAULT_LLM_PROVIDER))

    start = time.time()
    reply = await get_llm_reply(
        user_message=message,
        system_prompt=system_prompt,
        model=model,
        max_tokens=max_tokens,
    )
    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "reply": reply,
        "provider": provider,
        "model": model,
        "response_time_ms": elapsed_ms,
    }



# ═══════════════════════════════════════════════
#  СИСТЕМА (LLM провайдеры, сервисы, инфраструктура)
# ═══════════════════════════════════════════════

@router.get("/system-info")
async def admin_system_info(
    admin: User = Depends(get_admin_user),
):
    """Полная информация о системе: LLM, сервисы, инфраструктура"""
    from app.core.config import settings as s

    def mask_key(key: str) -> str:
        if not key:
            return ""
        if len(key) <= 8:
            return "****"
        return key[:4] + "..." + key[-4:]

    # Проверка сервисов
    services = {}

    # Redis
    try:
        r = await _get_redis()
        await r.ping()
        redis_info = await r.info("memory")
        services["redis"] = {
            "status": "ok",
            "memory_used": redis_info.get("used_memory_human", "?"),
            "url": s.REDIS_URL.replace(s.REDIS_URL.split("@")[0] + "@" if "@" in s.REDIS_URL else "", "***@"),
        }
        await r.aclose()
    except Exception as e:
        services["redis"] = {"status": "error", "error": str(e)[:100]}

    # Qdrant
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{s.QDRANT_URL}/collections")
            if resp.status_code == 200:
                collections = resp.json().get("result", {}).get("collections", [])
                services["qdrant"] = {
                    "status": "ok",
                    "url": s.QDRANT_URL,
                    "collections": len(collections),
                    "collection_names": [c["name"] for c in collections],
                }
            else:
                services["qdrant"] = {"status": "error", "http_code": resp.status_code}
    except Exception as e:
        services["qdrant"] = {"status": "error", "error": str(e)[:100]}

    # PostgreSQL
    try:
        from app.core.database import async_session
        async with async_session() as db:
            result = await db.execute(select(func.count(User.id)))
            services["postgres"] = {
                "status": "ok",
                "total_users": result.scalar() or 0,
            }
    except Exception as e:
        services["postgres"] = {"status": "error", "error": str(e)[:100]}

    # Embedding
    services["embedding"] = {
        "provider": s.EMBEDDING_PROVIDER,
        "model": s.EMBEDDING_MODEL,
        "key_set": bool(s.JINA_API_KEY),
        "key": mask_key(s.JINA_API_KEY) if s.EMBEDDING_PROVIDER == "jina" else mask_key(s.OPENAI_API_KEY),
    }

    # SMS
    sms_provider = s.SMS_PROVIDER
    try:
        r = await _get_redis()
        sys_json = await r.get("system:settings")
        await r.aclose()
        if sys_json:
            ss = json.loads(sys_json)
            sms_provider = ss.get("sms_provider", sms_provider)
    except:
        pass

    services["sms"] = {
        "provider": sms_provider,
        "sms_ru_key_set": bool(s.SMS_RU_API_KEY),
        "smsc_configured": bool(s.SMSC_LOGIN and s.SMSC_PASSWORD),
        "debug_mode": s.DEBUG,
    }

    return {
        "services": services,
        "llm_providers": {
            "deepseek": {"connected": bool(s.DEEPSEEK_API_KEY), "key": mask_key(s.DEEPSEEK_API_KEY), "model": s.DEEPSEEK_MODEL},
            "openrouter": {"connected": bool(s.OPENROUTER_API_KEY), "key": mask_key(s.OPENROUTER_API_KEY), "model": s.OPENROUTER_MODEL},
            "openai": {"connected": bool(s.OPENAI_API_KEY), "key": mask_key(s.OPENAI_API_KEY), "model": s.OPENAI_MODEL},
            "gemini": {"connected": bool(s.GEMINI_API_KEY), "key": mask_key(s.GEMINI_API_KEY), "model": s.GEMINI_MODEL},
            "groq": {"connected": bool(s.GROQ_API_KEY), "key": mask_key(s.GROQ_API_KEY), "model": s.GROQ_MODEL},
        },
        "default_llm_provider": s.DEFAULT_LLM_PROVIDER,
    }


# ═══════════════════════════════════════════════
#  СИСТЕМНЫЕ НАСТРОЙКИ (SMS, DEBUG и др.)
# ═══════════════════════════════════════════════


@router.get("/system-settings")
async def admin_get_system_settings(
    admin: User = Depends(get_admin_user),
):
    """Системные настройки платформы (SMS, DEBUG и др.)"""
    from app.core.config import settings as s

    sms_provider = s.SMS_PROVIDER
    sms_ru_api_key = s.SMS_RU_API_KEY
    smsc_login = s.SMSC_LOGIN
    smsc_password = s.SMSC_PASSWORD
    debug_mode = s.DEBUG
    embedding_provider = s.EMBEDDING_PROVIDER
    jina_api_key = s.JINA_API_KEY

    try:
        r = await _get_redis()
        sys_json = await r.get("system:settings")
        await r.aclose()

        if sys_json:
            ss = json.loads(sys_json)
            sms_provider = ss.get("sms_provider", sms_provider)
            sms_ru_api_key = ss.get("sms_ru_api_key", sms_ru_api_key)
            smsc_login = ss.get("smsc_login", smsc_login)
            smsc_password = ss.get("smsc_password", smsc_password)
            debug_mode = ss.get("debug_mode", debug_mode)
            embedding_provider = ss.get("embedding_provider", embedding_provider)
            jina_api_key = ss.get("jina_api_key", jina_api_key)
    except Exception as e:
        print(f"[admin] Redis read error (system): {e}")

    def mask(val: str) -> str:
        if not val:
            return ""
        if len(val) <= 8:
            return "****"
        return val[:4] + "..." + val[-4:]

    return {
        "sms_provider": sms_provider,
        "sms_ru_api_key": mask(sms_ru_api_key),
        "sms_ru_api_key_set": bool(sms_ru_api_key),
        "smsc_login": smsc_login or "",
        "smsc_password_set": bool(smsc_password),
        "debug_mode": debug_mode,
        "embedding_provider": embedding_provider,
        "jina_api_key": mask(jina_api_key),
        "jina_api_key_set": bool(jina_api_key),
    }


@router.patch("/system-settings")
async def admin_update_system_settings(
    body: dict = Body(...),
    admin: User = Depends(get_admin_user),
):
    """Обновить системные настройки (SMS провайдер, ключи, debug)"""
    try:
        r = await _get_redis()

        existing_json = await r.get("system:settings")
        existing = json.loads(existing_json) if existing_json else {}

        allowed_fields = ["sms_provider", "sms_ru_api_key", "smsc_login", "smsc_password", "debug_mode", "embedding_provider", "jina_api_key"]
        for field in allowed_fields:
            if field in body:
                existing[field] = body[field]

        await r.set("system:settings", json.dumps(existing))
        await r.aclose()

        return {"status": "ok", "updated": [f for f in allowed_fields if f in body]}
    except Exception as e:
        print(f"[admin] Redis write error (system): {e}")
        raise HTTPException(500, f"Ошибка сохранения: {e}")


# ═════════════════════════════════════════════
#  КОНТРАГЕНТЫ
# ═════════════════════════════════════════════


@router.get("/contractors", response_model=list[ContractorOut])
async def admin_list_contractors(
    search: str = Query(""),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Список всех контрагентов"""
    query = select(Contractor)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            Contractor.company_name.ilike(pattern)
            | Contractor.login.ilike(pattern)
            | Contractor.inn.ilike(pattern)
        )
    query = query.order_by(Contractor.created_at.desc())
    result = await db.execute(query)
    contractors = result.scalars().all()
    return [ContractorOut.model_validate(c) for c in contractors]


@router.post("/contractors", response_model=ContractorOut, status_code=201)
async def admin_create_contractor(
    body: ContractorCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Создать контрагента"""
    existing = await db.execute(select(Contractor).where(Contractor.login == body.login))
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Логин '{body.login}' уже занят")

    contractor = Contractor(
        company_name=body.company_name,
        login=body.login,
        password_hash=hash_password(body.password),
        inn=body.inn,
        legal_address=body.legal_address,
        actual_address=body.actual_address,
        bank_details=body.bank_details,
        director_name=body.director_name,
        contact_name=body.contact_name,
        contact_phone=body.contact_phone,
        contact_email=body.contact_email,
        discount_percent=body.discount_percent or 0,
    )
    db.add(contractor)
    await db.flush()
    await db.refresh(contractor)
    contractor.uid = f"C-{contractor.id:05d}"
    await db.flush()
    await db.refresh(contractor)
    return ContractorOut.model_validate(contractor)


@router.get("/contractors/{contractor_id}", response_model=ContractorOut)
async def admin_get_contractor(
    contractor_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Карточка контрагента"""
    result = await db.execute(select(Contractor).where(Contractor.id == contractor_id))
    contractor = result.scalar_one_or_none()
    if not contractor:
        raise HTTPException(404, "Контрагент не найден")
    return ContractorOut.model_validate(contractor)


@router.patch("/contractors/{contractor_id}", response_model=ContractorOut)
async def admin_update_contractor(
    contractor_id: int,
    body: ContractorUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Обновить контрагента"""
    result = await db.execute(select(Contractor).where(Contractor.id == contractor_id))
    contractor = result.scalar_one_or_none()
    if not contractor:
        raise HTTPException(404, "Контрагент не найден")

    for field in body.model_fields_set:
        value = getattr(body, field, None)
        if value is not None and hasattr(contractor, field):
            setattr(contractor, field, value)

    await db.flush()
    await db.refresh(contractor)
    return ContractorOut.model_validate(contractor)


@router.delete("/contractors/{contractor_id}", status_code=204)
async def admin_delete_contractor(
    contractor_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Деактивировать контрагента"""
    result = await db.execute(select(Contractor).where(Contractor.id == contractor_id))
    contractor = result.scalar_one_or_none()
    if not contractor:
        raise HTTPException(404, "Контрагент не найден")
    contractor.is_active = False
    await db.flush()


@router.post("/contractors/{contractor_id}/add-balance", response_model=ContractorOut)
async def admin_add_balance(
    contractor_id: int,
    body: AddBalanceRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Пополнить баланс контрагента"""
    result = await db.execute(select(Contractor).where(Contractor.id == contractor_id))
    contractor = result.scalar_one_or_none()
    if not contractor:
        raise HTTPException(404, "Контрагент не найден")
    contractor.balance_kopecks += body.amount_kopecks
    await db.flush()
    await db.refresh(contractor)
    return ContractorOut.model_validate(contractor)


@router.post("/contractors/{contractor_id}/assign-agent", response_model=AgentDetailOut)
async def admin_assign_agent_to_contractor(
    contractor_id: int,
    body: AssignAgentRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Привязать агента к контрагенту"""
    c_result = await db.execute(select(Contractor).where(Contractor.id == contractor_id))
    if not c_result.scalar_one_or_none():
        raise HTTPException(404, "Контрагент не найден")

    a_result = await db.execute(select(Agent).where(Agent.id == body.agent_id))
    agent = a_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")

    agent.contractor_id = contractor_id
    await db.flush()
    await db.refresh(agent)
    return AgentDetailOut.model_validate(agent)
