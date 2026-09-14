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
    {"value": "qwen-plus", "label": "Qwen Plus (Alibaba)", "group": "Qwen"},
    {"value": "qwen-max", "label": "Qwen Max (Alibaba)", "group": "Qwen"},
    {"value": "qwen-turbo", "label": "Qwen Turbo (Alibaba)", "group": "Qwen"},
    {"value": "qwen-vl-max", "label": "Qwen-VL Max (зрение)", "group": "Qwen"},
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
    try:
        from app.services import discovery
        await discovery.index_one(agent)
    except Exception as _e:
        print(f"[discovery] index_one (create) skip: {_e}")
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
    try:
        from app.services import discovery
        await discovery.index_one(agent)
    except Exception as _e:
        print(f"[discovery] index_one (update) skip: {_e}")
    return AgentDetailOut.model_validate(agent)


@router.get("/global-blocklist")
async def admin_get_global_blocklist(admin: User = Depends(get_admin_user)):
    """Глобальный блок-лист проекта (сырой текст)."""
    from app.services.settings_store import get_setting
    return {"raw": (await get_setting("GLOBAL_BLOCKLIST")) or ""}


@router.post("/global-blocklist")
async def admin_set_global_blocklist(body: dict = Body(...), admin: User = Depends(get_admin_user)):
    """Задать глобальный блок-лист (темы через запятую/с новой строки)."""
    from app.services.moderation import set_global_blocklist_raw
    await set_global_blocklist_raw(body.get("raw") or "")
    return {"ok": True}


# ============ ДИСПЕТЧЕРСКАЯ: баланс/расходы + арендованное железо ============

async def _eff_key(name: str) -> str:
    """Эффективный ключ: из админки (app_settings), иначе из .env/config."""
    from app.services.settings_store import get_setting
    from app.core.config import settings as _s
    return (await get_setting(name)) or (getattr(_s, name, "") or "")


@router.get("/balances")
async def admin_balances(admin: User = Depends(get_admin_user)):
    """Баланс/остатки по провайдерам. Где есть API — тянем цифру, где нет — ссылка на кабинет."""
    import httpx
    out = []

    # DeepSeek — работает из РФ напрямую
    ds_key = await _eff_key("DEEPSEEK_API_KEY")
    if ds_key:
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get("https://api.deepseek.com/user/balance",
                                headers={"Authorization": f"Bearer {ds_key}", "Accept": "application/json"})
            if r.status_code == 200:
                infos = (r.json() or {}).get("balance_infos") or []
                if infos:
                    b = infos[0]
                    out.append({"provider": "deepseek", "label": "DeepSeek", "status": "ok",
                                "value": b.get("total_balance"), "unit": b.get("currency", ""),
                                "detail": "остаток на счёте"})
                else:
                    out.append({"provider": "deepseek", "label": "DeepSeek", "status": "ok", "value": "0", "unit": "", "detail": "нет данных о балансе"})
            else:
                out.append({"provider": "deepseek", "label": "DeepSeek", "status": "error", "detail": f"HTTP {r.status_code}"})
        except Exception as e:
            out.append({"provider": "deepseek", "label": "DeepSeek", "status": "error", "detail": str(e)[:120]})
    else:
        out.append({"provider": "deepseek", "label": "DeepSeek", "status": "na", "detail": "нет ключа", "cabinet_url": "https://platform.deepseek.com/usage"})

    # OpenRouter — только через прокси (гео-блок РФ)
    or_key = await _eff_key("OPENROUTER_API_KEY")
    if or_key:
        try:
            from app.services.llm import _llm_client
            async with await _llm_client(15) as c:
                r = await c.get("https://openrouter.ai/api/v1/credits",
                                headers={"Authorization": f"Bearer {or_key}"})
            if r.status_code == 200:
                d = (r.json() or {}).get("data") or {}
                total = d.get("total_credits") or 0
                used = d.get("total_usage") or 0
                out.append({"provider": "openrouter", "label": "OpenRouter", "status": "ok",
                            "value": round(float(total) - float(used), 4), "unit": "$",
                            "detail": f"кредиты (истрачено ${used})"})
            else:
                out.append({"provider": "openrouter", "label": "OpenRouter", "status": "error",
                            "detail": f"HTTP {r.status_code} — нужен прокси (OUTBOUND_PROXY)"})
        except Exception as e:
            out.append({"provider": "openrouter", "label": "OpenRouter", "status": "error", "detail": f"нужен прокси? {str(e)[:80]}"})
    else:
        out.append({"provider": "openrouter", "label": "OpenRouter", "status": "na", "detail": "нет ключа", "cabinet_url": "https://openrouter.ai/credits"})

    # Yandex Cloud — реальный баланс через billing-SA (JWT→IAM→Billing API), если настроен ключ
    y_sa = await _eff_key("YANDEX_SA_KEY_JSON")
    y_bid = await _eff_key("YANDEX_BILLING_ACCOUNT_ID")
    if y_sa and y_bid:
        try:
            from app.services.yandex_billing import get_billing
            b = await get_billing(y_sa, y_bid)
            out.append({"provider": "yandex", "label": "Yandex Cloud", "status": "ok",
                        "value": b.get("balance"), "unit": b.get("currency", "RUB"),
                        "detail": f"баланс биллинга {b.get('name', '')}".strip(),
                        "cabinet_url": "https://console.yandex.cloud/billing"})
        except Exception as e:
            out.append({"provider": "yandex", "label": "Yandex Cloud", "status": "error",
                        "detail": str(e)[:120], "cabinet_url": "https://console.yandex.cloud/billing"})
    else:
        out.append({"provider": "yandex", "label": "Yandex Cloud", "status": "cabinet",
                    "detail": "добавьте YANDEX_SA_KEY_JSON + YANDEX_BILLING_ACCOUNT_ID", "cabinet_url": "https://console.yandex.cloud/billing"})
    out.append({"provider": "gemini", "label": "Gemini (Google)", "status": "cabinet", "detail": "по биллингу Google Cloud", "cabinet_url": "https://console.cloud.google.com/billing"})
    out.append({"provider": "groq", "label": "Groq", "status": "cabinet", "detail": "лимиты в кабинете", "cabinet_url": "https://console.groq.com/settings/billing"})
    out.append({"provider": "tavily", "label": "Tavily", "status": "cabinet", "detail": "квота в кабинете", "cabinet_url": "https://app.tavily.com/"})
    # Само-метринг расхода Yandex-инструментов (наш учёт, ₽-оценка по тарифам)
    try:
        from app.services.yandex_meter import report as _yreport
        u = await _yreport()
        out.append({"provider": "yandex-tts", "label": "Yandex голос (TTS)", "status": "ok",
                    "value": u["tts_chars"], "unit": f"симв/{u['month']}", "detail": f"~{u['tts_cost']} ₽ (оценка)"})
        out.append({"provider": "yandex-stt", "label": "Yandex распознавание (STT)", "status": "ok",
                    "value": u["stt_calls"], "unit": f"запр/{u['month']}", "detail": f"~{u['stt_cost']} ₽ (оценка)"})
        out.append({"provider": "yandex-emb", "label": "Yandex эмбеддинги", "status": "ok",
                    "value": u["emb_units"], "unit": f"ед/{u['month']}", "detail": f"~{u['emb_cost']} ₽ (оценка)"})
    except Exception:
        pass
    return {"balances": out}


@router.get("/hardware")
async def admin_get_hardware(admin: User = Depends(get_admin_user)):
    """Реестр арендованного железа (JSON-список из настроек)."""
    from app.services.settings_store import get_setting
    raw = (await get_setting("RENTED_HARDWARE")) or "[]"
    try:
        items = json.loads(raw)
        if not isinstance(items, list):
            items = []
    except Exception:
        items = []
    return {"items": items}


@router.post("/hardware")
async def admin_set_hardware(body: dict = Body(...), admin: User = Depends(get_admin_user)):
    """Сохранить весь реестр железа (body.items = [...])."""
    from app.services.settings_store import set_setting
    items = body.get("items")
    if not isinstance(items, list):
        raise HTTPException(400, "items должен быть списком")
    await set_setting("RENTED_HARDWARE", json.dumps(items, ensure_ascii=False))
    return {"ok": True, "count": len(items)}


@router.get("/security-report")
async def admin_security_report(
    hours: int = Query(24),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Отчёт Шерифа: security-события из журнала за N часов (rate-limit, инъекции) — агрегаты + свежие."""
    from datetime import datetime, timezone, timedelta
    from app.models.activity import ActivityLog
    since = datetime.now(timezone.utc) - timedelta(hours=max(1, min(hours, 168)))
    rows = (await db.execute(
        select(ActivityLog).where(ActivityLog.action.like("security.%"), ActivityLog.created_at >= since)
        .order_by(ActivityLog.id.desc()).limit(500)
    )).scalars().all()
    by_action: dict = {}
    by_source: dict = {}
    recent = []
    for r in rows:
        by_action[r.action] = by_action.get(r.action, 0) + 1
        src = r.target_name or "?"
        by_source[src] = by_source.get(src, 0) + 1
        if len(recent) < 20:
            recent.append({"action": r.action, "source": src, "room": r.room, "at": r.created_at.isoformat()})
    top = sorted(by_source.items(), key=lambda x: -x[1])[:10]
    return {
        "window_hours": hours,
        "total": len(rows),
        "by_action": by_action,
        "top_sources": [{"source": k, "count": v} for k, v in top],
        "recent": recent,
    }


@router.post("/security/block")
async def admin_block_ip(body: dict = Body(...), admin: User = Depends(get_admin_user)):
    """Заблокировать IP на N часов (инструмент Шерифа/админа; проверяется на входе)."""
    ip = (body.get("ip") or "").strip()
    hours = max(1, min(int(body.get("hours", 24)), 720))
    if not ip:
        raise HTTPException(400, "Не указан ip")
    r = await _get_redis()
    try:
        await r.set(f"sec:blocked:ip:{ip}", "1", ex=hours * 3600)
    finally:
        try: await r.aclose()
        except Exception: pass
    return {"ok": True, "ip": ip, "hours": hours}


@router.post("/security/unblock")
async def admin_unblock_ip(body: dict = Body(...), admin: User = Depends(get_admin_user)):
    """Снять блокировку IP."""
    ip = (body.get("ip") or "").strip()
    r = await _get_redis()
    try:
        await r.delete(f"sec:blocked:ip:{ip}")
    finally:
        try: await r.aclose()
        except Exception: pass
    return {"ok": True, "ip": ip}


@router.get("/security/blocked")
async def admin_list_blocked(admin: User = Depends(get_admin_user)):
    """Список заблокированных IP (+ сколько осталось до снятия)."""
    r = await _get_redis()
    out = []
    try:
        async for k in r.scan_iter(match="sec:blocked:ip:*"):
            ttl = await r.ttl(k)
            out.append({"ip": k.split("sec:blocked:ip:")[-1], "ttl_sec": ttl})
    finally:
        try: await r.aclose()
        except Exception: pass
    return {"blocked": out}


@router.post("/agents/{agent_id}/post")
async def admin_publish_post(
    agent_id: int,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Опубликовать пост в канал джинна (доставится избранникам + по интересам в Ленту)."""
    agent = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Агент не найден")
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "Нужен заголовок поста")
    from app.services.targeting import publish_post
    pid = await publish_post(agent_id, title, (body.get("body") or "").strip(), (body.get("url") or "").strip())
    return {"ok": True, "post_id": pid}


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

@router.post("/users/{user_id}/add-balance")
async def admin_add_user_balance(user_id: int, amount_kopecks: int = Body(..., embed=True),
                                 admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Пользователь не найден")
    u.balance_kopecks = (getattr(u, "balance_kopecks", 0) or 0) + int(amount_kopecks)
    await db.commit()
    return {"ok": True, "balance_kopecks": u.balance_kopecks}


@router.get("/usage")
async def admin_usage(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Сводка расхода LLM: выручка/себестоимость/маржа по моделям (ставки за 1 млн токенов), плательщикам и контрагентам."""
    from sqlalchemy import func, select as _sel
    from app.models.llm_usage import LlmUsage
    rates = await _get_rates()
    cur = await _get_currency()

    def _rate(m):
        r = rates.get(m) or rates.get("default") or {"cost": 0, "sell": 0}
        return float(r.get("cost", 0) or 0), float(r.get("sell", 0) or 0)

    tok = func.coalesce(func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0)
    rows = (await db.execute(_sel(
        LlmUsage.payer_type, LlmUsage.payer_id, LlmUsage.model, tok, func.count(LlmUsage.id)
    ).group_by(LlmUsage.payer_type, LlmUsage.payer_id, LlmUsage.model))).all()

    total_tokens = total_calls = billable_tok = 0
    total_rev = total_cost = 0.0
    bytype = {k: {"tokens": 0, "revenue": 0.0, "cost": 0.0} for k in ("contractor", "user", "free")}
    contr, usrs, models = {}, {}, {}
    for pt, pid, model, tk, calls in rows:
        pt = pt if pt in ("contractor", "user") else "free"
        tk = int(tk or 0); calls = int(calls or 0)
        cost_m, sell_m = _rate(model)
        r = tk / 1_000_000.0 * sell_m
        c = tk / 1_000_000.0 * cost_m
        total_tokens += tk; total_calls += calls; total_cost += c
        m = models.setdefault(model or "?", {"tokens": 0, "revenue": 0.0, "cost": 0.0, "calls": 0})
        m["tokens"] += tk; m["cost"] += c; m["calls"] += calls
        bytype[pt]["tokens"] += tk; bytype[pt]["cost"] += c
        if pt in ("contractor", "user"):
            billable_tok += tk; total_rev += r; bytype[pt]["revenue"] += r; m["revenue"] += r
            tgt = contr if pt == "contractor" else usrs
            e = tgt.setdefault(pid, {"tokens": 0, "revenue": 0.0, "cost": 0.0, "calls": 0})
            e["tokens"] += tk; e["revenue"] += r; e["cost"] += c; e["calls"] += calls

    def _fmt(v):
        return {k: (round(x, 2) if isinstance(x, float) else x) for k, x in v.items()}

    def _top(dct):
        out = [{"payer_id": pid, **_fmt(v), "margin": round(v["revenue"] - v["cost"], 2)} for pid, v in dct.items()]
        return sorted(out, key=lambda x: x["revenue"], reverse=True)[:15]

    return {
        "currency": cur,
        "total_calls": total_calls,
        "total_tokens": total_tokens,
        "billable_tokens": billable_tok,
        "free_tokens": bytype["free"]["tokens"],
        "revenue": round(total_rev, 2),
        "cost": round(total_cost, 2),
        "margin": round(total_rev - total_cost, 2),
        "by_payer_type": {k: _fmt(v) for k, v in bytype.items()},
        "contractors": _top(contr),
        "paying_users": _top(usrs),
        "by_model": sorted(
            [{"model": mm, **_fmt(v), "margin": round(v["revenue"] - v["cost"], 2)} for mm, v in models.items()],
            key=lambda x: x["tokens"], reverse=True),
    }


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
            "balance_kopecks": getattr(u, "balance_kopecks", 0) or 0,
            "tariff_code": getattr(u, "tariff_code", "") or "",
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


@router.get("/monitor")
async def admin_monitor(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Мониторинг платформы (Агент Админ): агенты, активность, пользователи, нагрузка LLM за 24ч."""
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import func, select as _sel
    from app.models.message import Message
    from app.models.agent import Agent
    from app.models.user import User as _U
    from app.models.contractor import Contractor
    from app.models.llm_usage import LlmUsage

    now = datetime.now(timezone.utc)
    d1 = now - timedelta(days=1)
    d7 = now - timedelta(days=7)

    total_agents = (await db.execute(_sel(func.count(Agent.id)).where(Agent.is_active == True))).scalar() or 0
    by_type = {t: int(c) for t, c in (await db.execute(
        _sel(Agent.agent_type, func.count(Agent.id)).where(Agent.is_active == True).group_by(Agent.agent_type))).all()}

    msgs_24h = (await db.execute(_sel(func.count(Message.id)).where(Message.created_at >= d1))).scalar() or 0
    msgs_7d = (await db.execute(_sel(func.count(Message.id)).where(Message.created_at >= d7))).scalar() or 0

    top_rows = (await db.execute(
        _sel(Message.sender_agent_id, func.count(Message.id).label("c"))
        .where(Message.created_at >= d1, Message.sender_type == "agent", Message.sender_agent_id.isnot(None))
        .group_by(Message.sender_agent_id).order_by(func.count(Message.id).desc()).limit(5))).all()
    top_active = []
    for aid, c in top_rows:
        ag = await db.get(Agent, aid)
        top_active.append({"name": ag.name if ag else f"#{aid}", "msgs_24h": int(c)})

    total_users = (await db.execute(_sel(func.count(_U.id)))).scalar() or 0
    online_users = (await db.execute(_sel(func.count(_U.id)).where(_U.is_online == True))).scalar() or 0
    active_24h = (await db.execute(_sel(func.count(_U.id)).where(_U.last_seen >= d1))).scalar() or 0

    tok = func.coalesce(func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0)
    llm_calls = (await db.execute(_sel(func.count(LlmUsage.id)).where(LlmUsage.created_at >= d1))).scalar() or 0
    llm_tokens = (await db.execute(_sel(tok).where(LlmUsage.created_at >= d1))).scalar() or 0
    total_contractors = (await db.execute(_sel(func.count(Contractor.id)))).scalar() or 0

    return {
        "agents": {"total": int(total_agents), "by_type": by_type, "top_active": top_active},
        "activity": {"messages_24h": int(msgs_24h), "messages_7d": int(msgs_7d),
                     "active_users_24h": int(active_24h), "online_users": int(online_users), "total_users": int(total_users)},
        "llm_24h": {"calls": int(llm_calls), "tokens": int(llm_tokens)},
        "contractors": int(total_contractors),
    }


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
    shader_bg_enabled = True
    rag_min_score = float(getattr(s, "RAG_MIN_SCORE", 0.55) or 0.55)
    guardian_enabled = True

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
            shader_bg_enabled = bool(ss.get("shader_bg_enabled", True))
            if ss.get("rag_min_score") not in (None, ""):
                rag_min_score = float(ss.get("rag_min_score"))
            guardian_enabled = bool(ss.get("guardian_enabled", True))
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
        "shader_bg_enabled": shader_bg_enabled,
        "rag_min_score": rag_min_score,
        "guardian_enabled": guardian_enabled,
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

        allowed_fields = ["sms_provider", "sms_ru_api_key", "smsc_login", "smsc_password", "debug_mode", "embedding_provider", "jina_api_key", "shader_bg_enabled", "rag_min_score", "guardian_enabled"]
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


@router.post("/agents/{agent_id}/test")
async def admin_test_agent(
    agent_id: int,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Тест конкретного агента: прямой диалог с его моделью (+RAG для специалистов)."""
    import time as _t
    from app.services.llm import get_agent_reply
    from app.services import rag as rag_service

    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(400, "Сообщение не может быть пустым")
    # История диалога (многоходовый чат в админке): [{"role":"user"|"assistant","content":str}]
    raw_history = body.get("history") or []
    history = [
        {"role": ("assistant" if h.get("role") == "assistant" else "user"), "content": str(h.get("content") or h.get("text") or "")}
        for h in raw_history if isinstance(h, dict) and (h.get("content") or h.get("text"))
    ][-10:]
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    rag_context = None
    if agent.agent_type == "specialist":
        try:
            results = await rag_service.search(agent_id, message, top_k=5)
            if results:
                parts = []
                for i, r in enumerate(results, 1):
                    art = getattr(r, "article_number", "") or ""
                    prefix = (art + ": ") if art else ""
                    parts.append("[" + str(i) + "]" + prefix + r.text)
                rag_context = "\n\n".join(parts)
        except Exception as e:
            print("[admin] RAG search error (test):", e)

    start = _t.time()
    reply = await get_agent_reply(
        agent_name=agent.name,
        agent_profession=agent.profession,
        agent_description=agent.description or "",
        system_prompt=agent.system_prompt,
        llm_model=agent.llm_model or "deepseek-chat",
        user_message=message,
        conversation_history=history,
        manner_style=agent.manner_style or "friendly",
        manner_temperament=agent.manner_temperament or "balanced",
        manner_humor=agent.manner_humor if agent.manner_humor is not None else True,
        manner_emoji_use=agent.manner_emoji_use if agent.manner_emoji_use is not None else True,
        knowledge_text=agent.knowledge_text,
        skills_text=agent.skills_text,
        exclusions_text=agent.exclusions_text,
        rag_context=rag_context,
        max_tokens=agent.llm_max_tokens or 1000,
    )
    return {"reply": reply, "model": agent.llm_model, "rag_used": bool(rag_context), "response_time_ms": int((_t.time() - start) * 1000)}


INTEGRATION_KEYS = [
    {"key": "YANDEX_SPEECHKIT_API_KEY", "label": "Yandex SpeechKit — API-ключ"},
    {"key": "YANDEX_SPEECHKIT_FOLDER_ID", "label": "Yandex SpeechKit — Folder ID"},
    {"key": "YANDEX_EMBEDDING_API_KEY", "label": "Yandex Embeddings — API-ключ (роль ai.languageModels.user; folder тот же, что у SpeechKit)"},
    {"key": "YANDEX_SEARCH_SA_KEY_JSON", "label": "Yandex Search API + Wordstat — авторизованный ключ сервис-аккаунта (JSON целиком, роль search-api)"},
    {"key": "YANDEX_FOLDER_ID", "label": "Yandex — Folder ID (для Search API и Wordstat)"},
    {"key": "YANDEX_SA_KEY_JSON", "label": "Yandex Billing — авторизованный ключ сервис-аккаунта billing-viewer (JSON целиком)"},
    {"key": "YANDEX_BILLING_ACCOUNT_ID", "label": "Yandex Billing — ID биллинг-аккаунта"},
    {"key": "GEMINI_API_KEY", "label": "Gemini — API-ключ (нужен прокси из РФ)"},
    {"key": "OPENAI_API_KEY", "label": "OpenAI — API-ключ"},
    {"key": "ANTHROPIC_API_KEY", "label": "Claude (Anthropic) — API-ключ для Архитектора (мозг системы; модели claude-*). Может требовать не-РФ IP"},
    {"key": "MOONSHOT_API_KEY", "label": "Kimi / Moonshot AI — API-ключ (модели kimi-*/moonshot-*; китайский, из РФ обычно ок)"},
    {"key": "MINIMAX_API_KEY", "label": "MiniMax — API-ключ (прямой, api.minimax.io; модели minimax-m3/m2; дёшево, открытые веса)"},
    {"key": "ORCAROUTER_API_KEY", "label": "OrcaRouter — хаб моделей (второстепенно: тесты/фри-токены; id формата orcarouter/vendor/model)"},
    {"key": "OMNIROUTER_API_KEY", "label": "OmniRoute — хаб моделей (self-host, ключ опционален; id формата omniroute/vendor/model)"},
    {"key": "OMNIROUTER_BASE_URL", "label": "OmniRoute — base URL (если self-host; по умолч. http://localhost:20128/v1)"},
    {"key": "REQUESTS_AUTORESOLVE", "label": "Обращения: авто-обработка Архитектором/Супер-помощником без админа (on/off, по умолч on). Код/инструмент («Строитель») всегда требует человека"},
    {"key": "WALLET_CURRENCY", "label": "Валюта кошелька: RUB (₽, по умолч), GEL (₾ Грузия), USD, EUR, AMD. Провайдер пополнения привязан к валюте (RUB→ЮKassa)"},
    {"key": "TOKEN_PRICE_KOPECKS", "label": "Цена 1 бонусного токена в копейках (конвертация витринных токенов в стоимость; по умолч. 10)"},
    {"key": "YOOKASSA_SHOP_ID", "label": "ЮKassa — shopId (пополнение баланса пользователей рублями)"},
    {"key": "YOOKASSA_SECRET_KEY", "label": "ЮKassa — секретный ключ (Basic-auth; вебхук на /api/wallet/yookassa-webhook)"},
    {"key": "JINA_API_KEY", "label": "Jina — API-ключ"},
    {"key": "TAVILY_API_KEY", "label": "Веб-поиск: Tavily — API-ключ (бесплатный тариф ~1000/мес)"},
    {"key": "BRAVE_API_KEY", "label": "Веб-поиск: Brave Search — API-ключ (альтернатива Tavily)"},
    {"key": "VIDEO_SEARCH_PROVIDER", "label": "Видео-поиск: провайдер (off | youtube | telegram | instagram). «Поставил ключ ниже — заработало»"},
    {"key": "YOUTUBE_API_KEY", "label": "Видео-поиск: YouTube Data API v3 — ключ (из РФ через OUTBOUND_PROXY). Показывает ролики по запросу"},
    {"key": "TELEGRAM_SEARCH_TOKEN", "label": "Видео-поиск: Telegram — доступ (заглушка; нужна кастомная интеграция поиска)"},
    {"key": "INSTAGRAM_SEARCH_TOKEN", "label": "Видео-поиск: Instagram — доступ (заглушка; нужна кастомная интеграция)"},
    # Генерация видео (агрегаторы — один ключ = много моделей)
    {"key": "HIGGSFIELD_API_KEY", "label": "Генерация видео: Higgsfield — API-ключ (хостит Seedance/Kling/Veo/Hailuo и др., MCP без ключа тоже есть)"},
    {"key": "DASHSCOPE_API_KEY", "label": "Qwen (Alibaba Model Studio) — API-ключ (чат qwen-plus/max + зрение qwen-vl + видео Wan)"},
    {"key": "DASHSCOPE_BASE_URL", "label": "Qwen — Base URL (OpenAI-совместимый, workspace-домен Model Studio)"},
    {"key": "FAL_API_KEY", "label": "Генерация видео: fal.ai — API-ключ (мультимодельный, Seedance/Kling/Veo/Wan…)"},
    {"key": "REPLICATE_API_KEY", "label": "Генерация видео: Replicate — API-ключ (open-source: Wan, LTX, CogVideoX)"},
]

EMBEDDING_CONFIG = [
    {"key": "EMBEDDING_PROVIDER", "label": "Провайдер эмбеддингов", "options": ["yandex", "gemini", "openai", "jina"]},
    {"key": "OUTBOUND_PROXY", "label": "Исходящий прокси (зарубежные LLM/эмбеддинги из РФ: OpenRouter, Gemini, Groq, Jina). Формат: http://user:pass@host:port", "options": None},
    {"key": "WEB_SEARCH_PROVIDER", "label": "Провайдер веб-поиска помощника (yandex — Search API, наш ключ)", "options": ["off", "yandex", "tavily", "brave"]},
    {"key": "STT_PROVIDER", "label": "Распознавание речи (STT): yandex — SpeechKit (тот же ключ), off — выключить", "options": ["yandex", "off"]},
    {"key": "VIDEO_GEN_ENABLED", "label": "Видеогенерация (Wan i2v, ключ DashScope): интро-ролики визиток / видео-помощник. off — выключить (платный ресурс)", "options": ["off", "on"]},
    {"key": "IMAGE_GEN_ENABLED", "label": "Генерация изображений (Qwen-Image, ключ DashScope): лица/образы джиннов и помощника. off — выключить (платный ресурс)", "options": ["off", "on"]},
    {"key": "WAITLIST_MODE", "label": "Лист ожидания: on — на входе только предрегистрация (дозируем нагрузку), off — обычная регистрация", "options": ["off", "on"]},
    # Генерация видео — провайдер и модель (ключи выше; ключи собираем позже)
    {"key": "VIDEO_GEN_PROVIDER", "label": "Генерация видео: провайдер/агрегатор", "options": ["off", "higgsfield", "fal", "replicate", "runway", "self-host"]},
    {"key": "VIDEO_GEN_MODEL", "label": "Генерация видео: модель (лидер — Seedance 2.0; open-source для self-host — Wan/LTX)", "options": ["seedance-2", "veo-3.1", "kling-3", "sora", "hailuo", "runway-gen4", "luma", "wan-2.7", "ltx-2.3", "cogvideox"]},
]


@router.get("/integrations")
async def admin_get_integrations(admin: User = Depends(get_admin_user)):
    """Список ключей интеграций (значения замаскированы)."""
    from app.services.settings_store import get_setting
    out = []
    for it in INTEGRATION_KEYS:
        val = await get_setting(it["key"])
        if not val:
            masked = ""
        elif len(val) > 8:
            masked = val[:4] + "…" + val[-4:]
        else:
            masked = "•••"
        out.append({"key": it["key"], "label": it["label"], "is_set": bool(val), "masked": masked})
    return out


@router.patch("/integrations/{key}")
async def admin_set_integration(
    key: str,
    value: str = Body(..., embed=True),
    admin: User = Depends(get_admin_user),
):
    """Установить значение ключа интеграции."""
    if key not in {k["key"] for k in INTEGRATION_KEYS}:
        raise HTTPException(404, "Неизвестный ключ")
    from app.services.settings_store import set_setting
    await set_setting(key, value.strip())
    return {"ok": True}


@router.get("/embedding-config")
async def admin_get_embedding_config(admin: User = Depends(get_admin_user)):
    """Провайдер эмбеддингов + прокси (значения открыты)."""
    from app.services.settings_store import get_setting
    out = []
    for it in EMBEDDING_CONFIG:
        out.append({"key": it["key"], "label": it["label"], "options": it["options"], "value": await get_setting(it["key"]) or ""})
    return out


@router.patch("/embedding-config/{key}")
async def admin_set_embedding_config(
    key: str,
    value: str = Body(..., embed=True),
    admin: User = Depends(get_admin_user),
):
    if key not in {k["key"] for k in EMBEDDING_CONFIG}:
        raise HTTPException(404, "Неизвестный ключ")
    from app.services.settings_store import set_setting
    await set_setting(key, value.strip())
    return {"ok": True}


import json as _json

_DEFAULT_RATES = {"default": {"cost": 30.0, "sell": 150.0}}

# Известные модели, которые ДОЛЖНЫ показываться в реестре (цены за 1 млн токенов, ₽; ×~3 маржа).
# Только заполняют ОТСУТСТВУЮЩИЕ ключи — ручные правки в админке не перетираются.
_SEED_MODELS = {
    # MiniMax — прямой (OpenAI-совместимый, api.minimax.io); дёшево, есть фри-эвал.
    "minimax-m3": {"provider": "MiniMax (прямой)", "cost_in": 25, "cost_out": 95, "sell_in": 75, "sell_out": 285,
                   "note": "428B MoE, открытые веса; $0.23/$0.96 за 1M. Ключ MINIMAX_API_KEY."},
    "minimax-m2": {"provider": "MiniMax (прямой)", "cost_in": 25, "cost_out": 100, "sell_in": 75, "sell_out": 300,
                   "note": "Дешевле/легче M3; $0.255/$1.02 за 1M."},
    # Qwen3.8-Max-0902 — НЕ бесплатный. Через хаб OrcaRouter (или напрямую DashScope позже).
    "orcarouter/qwen/qwen3.8-max-0902": {"provider": "OrcaRouter (хаб)", "cost_in": 190, "cost_out": 570,
                   "sell_in": 570, "sell_out": 1710,
                   "note": "2.4T MoE (95B актив.), 1M контекст, мультимодал вход. ~$2/$6 за 1M через хаб. НЕ фри."},
}


async def _get_rates() -> dict:
    """Ставки за 1 млн токенов по моделям: {model: {cost, sell}} + default."""
    from app.services.settings_store import get_setting
    raw = await get_setting("MODEL_RATES")
    try:
        r = _json.loads(raw) if raw else {}
    except Exception:
        r = {}
    if "default" not in r:
        r["default"] = dict(_DEFAULT_RATES["default"])
    for m, seed in _SEED_MODELS.items():
        if m not in r:
            r[m] = dict(seed)
    return r


async def _get_currency() -> str:
    from app.services.settings_store import get_setting
    return (await get_setting("TOKEN_CURRENCY")) or "₽"


@router.get("/pricing")
async def admin_get_pricing(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select as _sel
    from app.models.llm_usage import LlmUsage
    seen = [m for m in (await db.execute(_sel(LlmUsage.model).distinct())).scalars().all() if m]
    from app.services.settings_store import get_setting as _gsp
    return {"currency": await _get_currency(), "rates": await _get_rates(), "models_seen": seen,
            "overrides": _json.loads(await _gsp("PRICE_OVERRIDES") or "{}"), "biz_markup": await _gsp("BIZ_MARKUP") or "1"}


@router.patch("/pricing")
async def admin_set_pricing(body: dict = Body(...), admin: User = Depends(get_admin_user)):
    from app.services.settings_store import set_setting
    if "currency" in body:
        await set_setting("TOKEN_CURRENCY", str(body["currency"]).strip())
        return {"ok": True}
    if "biz_markup" in body:
        await set_setting("BIZ_MARKUP", str(float(body.get("biz_markup") or 1)))
        return {"ok": True}
    if "override_key" in body:
        from app.services.settings_store import get_setting as _gso
        ov = _json.loads(await _gso("PRICE_OVERRIDES") or "{}")
        key = str(body["override_key"]).strip()
        if body.get("override_delete"):
            ov.pop(key, None)
        elif key:
            e = {}
            if body.get("free"):
                e["free"] = True
            if body.get("mult") not in (None, ""):
                e["mult"] = float(body.get("mult") or 0)
            ov[key] = e
        await set_setting("PRICE_OVERRIDES", _json.dumps(ov, ensure_ascii=False))
        return {"ok": True, "overrides": ov}
    model = (body.get("model") or "").strip()
    if not model:
        raise HTTPException(400, "нужна модель или currency")
    rates = await _get_rates()
    entry = {"cost": float(body.get("cost", 0) or 0), "sell": float(body.get("sell", 0) or 0)}
    for f in ("cost_in", "cost_out", "sell_in", "sell_out"):
        if f in body and str(body.get(f)) not in ("", "None"):
            entry[f] = float(body.get(f) or 0)
    for f in ("valid_until", "provider", "note"):
        v = (body.get(f) or "").strip()
        if v:
            entry[f] = v
    rates[model] = entry
    await set_setting("MODEL_RATES", _json.dumps(rates))
    return {"ok": True, "rates": rates}


@router.delete("/pricing/{model}")
async def admin_del_pricing(model: str, admin: User = Depends(get_admin_user)):
    from app.services.settings_store import set_setting
    rates = await _get_rates()
    if model in rates and model != "default":
        del rates[model]
        await set_setting("MODEL_RATES", _json.dumps(rates))
    return {"ok": True}


@router.get("/models")
async def admin_models(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Реестр моделей: ставки/сроки/провайдер + расход и в скольких джиннах используется."""
    from sqlalchemy import func, select as _sel
    from app.models.llm_usage import LlmUsage
    from app.models.agent import Agent
    rates = await _get_rates()
    cur = await _get_currency()
    tok = func.coalesce(func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0)
    urows = {m: (int(t or 0), int(c or 0)) for m, t, c in (await db.execute(
        _sel(LlmUsage.model, tok, func.count(LlmUsage.id)).group_by(LlmUsage.model))).all()}
    brows = {m: int(t or 0) for m, t in (await db.execute(
        _sel(LlmUsage.model, tok).where(LlmUsage.payer_type.in_(["contractor", "user"])).group_by(LlmUsage.model))).all()}
    arows = {m: int(c) for m, c in (await db.execute(
        _sel(Agent.llm_model, func.count(Agent.id)).where(Agent.is_active == True).group_by(Agent.llm_model))).all()}
    names = (set(rates.keys()) | set(urows.keys()) | set(arows.keys()))
    names.discard("default")
    names.discard(None)
    out = []
    for m in sorted(n for n in names if n):
        r = rates.get(m) or {}
        d = rates["default"]
        def _rf(field, legacy):
            v = r.get(field)
            if v in (None, ""):
                v = d.get(field)
            if v in (None, ""):
                v = r.get(legacy) if r.get(legacy) not in (None, "") else d.get(legacy)
            return float(v or 0)
        cost = float((r.get("cost") if r else None) or (d.get("cost") or 0))
        sell = float((r.get("sell") if r else None) or (d.get("sell") or 0))
        cost_in = _rf("cost_in", "cost"); cost_out = _rf("cost_out", "cost")
        sell_in = _rf("sell_in", "sell"); sell_out = _rf("sell_out", "sell")
        tk, calls = urows.get(m, (0, 0))
        btk = brows.get(m, 0)
        revenue = round(btk / 1_000_000.0 * sell, 2)
        cost_total = round(tk / 1_000_000.0 * cost, 2)
        out.append({
            "model": m, "provider": r.get("provider", ""), "cost": cost, "sell": sell,
            "cost_in": cost_in, "cost_out": cost_out, "sell_in": sell_in, "sell_out": sell_out,
            "valid_until": r.get("valid_until", ""), "note": r.get("note", ""),
            "tokens": tk, "calls": calls, "revenue": revenue, "cost_total": cost_total,
            "margin": round(revenue - cost_total, 2), "agents": arows.get(m, 0),
            "has_rate": m in rates,
        })
    import json as _jj
    from app.services.settings_store import get_setting as _gs2
    from app.core.config import settings as _st
    async def _pk(name: str) -> bool:
        return bool((await _gs2(name)) or getattr(_st, name, "") or "")
    provider_keys = {
        "deepseek": await _pk("DEEPSEEK_API_KEY"),
        "openrouter": await _pk("OPENROUTER_API_KEY"),
        "orcarouter": await _pk("ORCAROUTER_API_KEY"),
        "omnirouter": await _pk("OMNIROUTER_API_KEY"),
        "gemini": await _pk("GEMINI_API_KEY"),
        "openai": await _pk("OPENAI_API_KEY"),
        "groq": await _pk("GROQ_API_KEY"),
        "zai": await _pk("ZAI_API_KEY"),
        "dashscope": await _pk("DASHSCOPE_API_KEY"),
        "anthropic": await _pk("ANTHROPIC_API_KEY"),
        "moonshot": await _pk("MOONSHOT_API_KEY"),
        "minimax": await _pk("MINIMAX_API_KEY"),
    }
    return {"currency": cur, "default": rates.get("default"), "models": out,
            "biz_markup": await _gs2("BIZ_MARKUP") or "1",
            "overrides": _jj.loads(await _gs2("PRICE_OVERRIDES") or "{}"),
            "provider_keys": provider_keys}



# ═══════════════════════ ТАРИФЫ (Фаза 1) ═══════════════════════
import json as _tjson
from pydantic import BaseModel as _TBase
from app.models.tariff import Tariff


class TariffIn(_TBase):
    code: str
    name: str = ""
    description: str = ""
    llm_model: str = "deepseek-chat"
    msgs_per_day: int = 0
    jinn_calls_per_day: int = 0
    context_limit: int = 0
    gates: dict = {}
    is_default: bool = False
    sort: int = 0


class TariffOut(TariffIn):
    id: int


def _tariff_out(t: Tariff) -> TariffOut:
    try:
        g = _tjson.loads(t.gates or "{}")
    except Exception:
        g = {}
    return TariffOut(
        id=t.id, code=t.code, name=t.name, description=t.description or "",
        llm_model=t.llm_model, msgs_per_day=t.msgs_per_day, jinn_calls_per_day=t.jinn_calls_per_day,
        context_limit=t.context_limit, gates=g, is_default=t.is_default, sort=t.sort,
    )


@router.get("/tariffs", response_model=list[TariffOut])
async def admin_list_tariffs(db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin_user)):
    rows = (await db.execute(select(Tariff).order_by(Tariff.sort, Tariff.id))).scalars().all()
    return [_tariff_out(t) for t in rows]


@router.post("/tariffs", response_model=TariffOut, status_code=201)
async def admin_create_tariff(body: TariffIn, db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin_user)):
    if (await db.execute(select(Tariff).where(Tariff.code == body.code))).scalar_one_or_none():
        raise HTTPException(400, f"Код тарифа '{body.code}' уже есть")
    if body.is_default:
        for t in (await db.execute(select(Tariff).where(Tariff.is_default == True))).scalars().all():  # noqa: E712
            t.is_default = False
    t = Tariff(
        code=body.code, name=body.name, description=body.description, llm_model=body.llm_model,
        msgs_per_day=body.msgs_per_day, jinn_calls_per_day=body.jinn_calls_per_day, context_limit=body.context_limit,
        gates=_tjson.dumps(body.gates, ensure_ascii=False), is_default=body.is_default, sort=body.sort,
    )
    db.add(t)
    await db.flush()
    await db.refresh(t)
    return _tariff_out(t)


@router.put("/tariffs/{tariff_id}", response_model=TariffOut)
async def admin_update_tariff(tariff_id: int, body: TariffIn, db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin_user)):
    t = (await db.execute(select(Tariff).where(Tariff.id == tariff_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Тариф не найден")
    if body.is_default and not t.is_default:
        for o in (await db.execute(select(Tariff).where(Tariff.is_default == True))).scalars().all():  # noqa: E712
            o.is_default = False
    t.code = body.code; t.name = body.name; t.description = body.description; t.llm_model = body.llm_model
    t.msgs_per_day = body.msgs_per_day; t.jinn_calls_per_day = body.jinn_calls_per_day; t.context_limit = body.context_limit
    t.gates = _tjson.dumps(body.gates, ensure_ascii=False); t.is_default = body.is_default; t.sort = body.sort
    await db.flush()
    await db.refresh(t)
    return _tariff_out(t)


@router.delete("/tariffs/{tariff_id}", status_code=204)
async def admin_delete_tariff(tariff_id: int, db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin_user)):
    t = (await db.execute(select(Tariff).where(Tariff.id == tariff_id))).scalar_one_or_none()
    if t:
        await db.delete(t)
    return


@router.post("/users/{user_id}/tariff")
async def admin_set_user_tariff(user_id: int, code: str = Body("", embed=True), db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin_user)):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Пользователь не найден")
    u.tariff_code = code or ""
    await db.flush()
    return {"ok": True, "user_id": user_id, "tariff_code": u.tariff_code}


# ═══════════════════════ ДОКИ (реестр документов/генераций) ═══════════════════════
from app.services.settings_store import get_setting as _docs_get, set_setting as _docs_set


@router.get("/docs")
async def admin_list_docs(admin: User = Depends(get_admin_user)):
    raw = await _docs_get("ADMIN_DOCS")
    try:
        return _tjson.loads(raw or "[]")
    except Exception:
        return []


@router.post("/docs")
async def admin_save_docs(docs: list = Body(..., embed=True), admin: User = Depends(get_admin_user)):
    await _docs_set("ADMIN_DOCS", _tjson.dumps(docs, ensure_ascii=False))
    return {"ok": True, "count": len(docs)}


# ═══════════════════════ ТОКЕНЫ (пакеты + подарки) ═══════════════════════
@router.get("/token-config")
async def admin_get_token_config(admin: User = Depends(get_admin_user)):
    raw = await _docs_get("TOKEN_CONFIG")
    try:
        return _tjson.loads(raw or "{}")
    except Exception:
        return {}


@router.post("/token-config")
async def admin_save_token_config(config: dict = Body(..., embed=True), admin: User = Depends(get_admin_user)):
    await _docs_set("TOKEN_CONFIG", _tjson.dumps(config, ensure_ascii=False))
    return {"ok": True}


# ═══════════════════════ КАТАЛОГ (магазин фишек) ═══════════════════════
@router.get("/catalog")
async def admin_get_catalog(admin: User = Depends(get_admin_user)):
    raw = await _docs_get("CATALOG")
    try:
        return _tjson.loads(raw or "[]")
    except Exception:
        return []


@router.post("/catalog")
async def admin_save_catalog(items: list = Body(..., embed=True), admin: User = Depends(get_admin_user)):
    await _docs_set("CATALOG", _tjson.dumps(items, ensure_ascii=False))
    return {"ok": True, "count": len(items)}


# ═══════════════════════ #4 ОБРАЩЕНИЯ (внутренний helpdesk) ═══════════════════════
# Маршрутизация обращений по ДОМЕНУ к внутренним джиннам. id core-джиннов:
#   Джим=1, Админ=2, Контент=3, Железо=4, Маркетолог=37, Архитектор=47, Супер-помощник=48
INTERNAL_TARGETS = {
    "super_assistant": {"label": "Супер-помощник", "agent_id": 48, "domain": "how-to/рутина помощника"},
    "architect":       {"label": "Архитектор",     "agent_id": 47, "domain": "доработка/код/инструмент/знание"},
    "admin":           {"label": "Админ",          "agent_id": 2,  "domain": "сбой/ошибка/аномалия"},
    "content":         {"label": "Контент",        "agent_id": 3,  "domain": "тексты/контент"},
    "marketing":       {"label": "Маркетолог",     "agent_id": 37, "domain": "PR/реклама/рост"},
    "hardware":        {"label": "Железо",          "agent_id": 4,  "domain": "железо/ресурсы/сервер"},
    "other":           {"label": "Не распознано",  "agent_id": 47, "domain": "по умолчанию → Архитектор"},
}


def _route_target(text: str) -> str:
    """Простой доменный роутер по ключевым словам. Возвращает ключ target."""
    s = (text or "").lower()
    def has(*ws): return any(w in s for w in ws)
    if has("как ", "how", "где найти", "настро", "голос", "образ", "скопир", "инструкц", "не понимаю как"):
        return "super_assistant"
    if has("сбой", "ошибк", "аномал", "упал", "не работает", "виснет", "баг", "500", "401"):
        return "admin"
    if has("текст", "контент", "пост", "описан", "статья", "перепиш"):
        return "content"
    if has("реклам", "продвиж", "seo", "трафик", "маркет", "канал"):
        return "marketing"
    if has("железо", "ресурс", "память", "сервер", "gpu", "диск", "ram", "cpu"):
        return "hardware"
    if has("код", "доработ", "функци", "инструмент", "фич", "не могу", "невозможно", "добав", "интеграц", "api"):
        return "architect"
    return "architect"  # дефолтный триажёр


def _areq_out(r) -> dict:
    try:
        thread = _tjson.loads(r.thread or "[]")
    except Exception:
        thread = []
    tinfo = INTERNAL_TARGETS.get(r.target) or INTERNAL_TARGETS["other"]
    return {
        "id": r.id, "user_id": r.user_id, "source_agent_id": r.source_agent_id,
        "task_text": r.task_text, "reason": r.reason, "context": r.context,
        "target": r.target, "target_label": tinfo["label"], "target_agent_id": r.target_agent_id,
        "triage_category": r.triage_category, "triage_analysis": r.triage_analysis,
        "thread": thread, "status": r.status, "resolution_type": r.resolution_type,
        "admin_notes": r.admin_notes, "response_to_user": r.response_to_user, "assigned_to": r.assigned_to,
        "auto_resolved": bool(getattr(r, "auto_resolved", False)),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


@router.get("/requests")
async def admin_list_requests(status: str = Query(""), admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.models.assistant_request import AssistantRequest
    q = select(AssistantRequest).order_by(AssistantRequest.created_at.desc())
    if status:
        q = q.where(AssistantRequest.status == status)
    rows = (await db.execute(q)).scalars().all()
    # счётчики по статусам
    counts = {}
    for st, c in (await db.execute(
        select(AssistantRequest.status, func.count(AssistantRequest.id)).group_by(AssistantRequest.status))).all():
        counts[st] = int(c)
    return {"requests": [_areq_out(r) for r in rows], "counts": counts, "targets": INTERNAL_TARGETS}


@router.get("/requests/{req_id}")
async def admin_get_request(req_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.models.assistant_request import AssistantRequest
    r = (await db.execute(select(AssistantRequest).where(AssistantRequest.id == req_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "обращение не найдено")
    return _areq_out(r)


@router.post("/requests")
async def admin_create_request(body: dict = Body(...), admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Создать обращение вручную (тест/ручной ввод). Авто-маршрутизация если target не задан."""
    from app.models.assistant_request import AssistantRequest
    task = (body.get("task_text") or "").strip()
    reason = (body.get("reason") or "").strip()
    if not task and not reason:
        raise HTTPException(400, "нужен task_text или reason")
    target = (body.get("target") or "").strip() or _route_target(task + " " + reason)
    tinfo = INTERNAL_TARGETS.get(target) or INTERNAL_TARGETS["other"]
    r = AssistantRequest(
        user_id=body.get("user_id"), source_agent_id=body.get("source_agent_id"),
        task_text=task, reason=reason, context=(body.get("context") or "").strip(),
        target=target, target_agent_id=tinfo["agent_id"], status="new",
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return _areq_out(r)


@router.patch("/requests/{req_id}")
async def admin_patch_request(req_id: int, body: dict = Body(...), admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.models.assistant_request import AssistantRequest
    r = (await db.execute(select(AssistantRequest).where(AssistantRequest.id == req_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "обращение не найдено")
    if "target" in body:
        r.target = str(body["target"]).strip() or r.target
        tinfo = INTERNAL_TARGETS.get(r.target) or INTERNAL_TARGETS["other"]
        r.target_agent_id = tinfo["agent_id"]
    for f in ("status", "resolution_type", "admin_notes", "response_to_user", "triage_category", "triage_analysis"):
        if f in body:
            setattr(r, f, str(body[f] or ""))
    if "assigned_to" in body:
        r.assigned_to = body["assigned_to"] or admin.id
    # Доставка: как только статус «Отвечено» и есть ответ — отправить юзеру (лента + пинг), статус → delivered
    if r.status == "answered" and (r.response_to_user or "").strip():
        try:
            from app.services import requests_flow
            await requests_flow.deliver(db, r)
        except Exception as _de:
            print(f"[admin] deliver err: {_de}")
    await db.commit()
    await db.refresh(r)
    return _areq_out(r)


async def _internal_jinn_reply(db, target: str, prompt: str, extra_system: str = "") -> tuple[str, str]:
    """Вызвать внутреннего джина домена. Возвращает (reply, model)."""
    from app.services.llm import get_llm_reply
    from app.core.config import settings as s
    tinfo = INTERNAL_TARGETS.get(target) or INTERNAL_TARGETS["other"]
    agent = (await db.execute(select(Agent).where(Agent.id == tinfo["agent_id"]))).scalar_one_or_none()
    model = (agent.llm_model if agent and agent.llm_model else _default_model_for_provider(s.DEFAULT_LLM_PROVIDER))
    sysp = (agent.system_prompt if agent and agent.system_prompt else f"Ты — {tinfo['label']}, внутренний джинн команды JinnTell.")
    if extra_system:
        sysp = sysp + "\n\n" + extra_system
    reply = await get_llm_reply(user_message=prompt, system_prompt=sysp, model=model,
                                max_tokens=(agent.llm_max_tokens if agent else 1000))
    return reply or "", model


@router.post("/requests/{req_id}/triage")
async def admin_triage_request(req_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """ИИ-триаж: внутренний джинн домена анализирует обращение → категория + черновик решения."""
    from app.models.assistant_request import AssistantRequest
    r = (await db.execute(select(AssistantRequest).where(AssistantRequest.id == req_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "обращение не найдено")
    prompt = (
        "Проанализируй обращение помощника, который НЕ смог выполнить задачу пользователя.\n"
        f"ЗАДАЧА ЮЗЕРА: {r.task_text}\n"
        f"ПОЧЕМУ НЕ СМОГ: {r.reason}\n"
        f"КОНТЕКСТ: {r.context}\n\n"
        "Ответь СТРОГО двумя блоками:\n"
        "КАТЕГОРИЯ: <одно из: нет инструмента | нет знаний | вне зоны | нужен код | how-to | прочее>\n"
        "РЕШЕНИЕ: <кратко, что нужно сделать, чтобы закрыть пробел>"
    )
    reply, _ = await _internal_jinn_reply(db, r.target, prompt)
    cat = ""
    low = reply.lower()
    for c in ("нет инструмента", "нет знаний", "вне зоны", "нужен код", "how-to", "прочее"):
        if c in low:
            cat = c
            break
    r.triage_category = cat or "прочее"
    r.triage_analysis = reply
    if r.status == "new":
        r.status = "triaged"
    await db.commit()
    await db.refresh(r)
    return _areq_out(r)


@router.post("/requests/{req_id}/ask")
async def admin_ask_internal(req_id: int, body: dict = Body(...), admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Чат админ↔внутренний джинн ПО обращению. Сохраняет нить в thread."""
    from app.models.assistant_request import AssistantRequest
    r = (await db.execute(select(AssistantRequest).where(AssistantRequest.id == req_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "обращение не найдено")
    msg = (body.get("message") or "").strip()
    if not msg:
        raise HTTPException(400, "пустое сообщение")
    try:
        thread = _tjson.loads(r.thread or "[]")
    except Exception:
        thread = []
    ctx = (f"Обращение по задаче: {r.task_text}. Причина: {r.reason}. "
           f"Ты помогаешь живому админу решить этот пробел. Отвечай по делу, можешь предлагать код/знания/инструменты.")
    hist = "\n".join(f"{m.get('role')}: {m.get('text')}" for m in thread[-6:])
    prompt = (hist + "\nadmin: " + msg) if hist else msg
    reply, model = await _internal_jinn_reply(db, r.target, prompt, extra_system=ctx)
    import datetime as _dt
    now = _dt.datetime.utcnow().isoformat()
    thread.append({"role": "admin", "text": msg, "at": now})
    thread.append({"role": "jinn", "text": reply, "at": now})
    r.thread = _tjson.dumps(thread, ensure_ascii=False)
    if r.status in ("new", "triaged"):
        r.status = "in_progress"
    await db.commit()
    await db.refresh(r)
    return {"reply": reply, "model": model, "request": _areq_out(r)}


# ═══════════════════════ #5 КОШЕЛЁК: бонусы + спонсорские кампании ═══════════════════════
async def _token_price_kop() -> int:
    """Цена 1 токена в копейках (для конвертации витринных токенов в реальную стоимость генерации)."""
    from app.services.settings_store import get_setting
    try:
        v = int(float(await get_setting("TOKEN_PRICE_KOPECKS") or 0))
    except Exception:
        v = 0
    return v or 10  # по умолчанию 1 токен = 10 коп


@router.post("/users/{user_id}/bonus")
async def admin_grant_bonus(user_id: int, body: dict = Body(...), admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Выдать пользователю бонусный (неденежный) грант. tokens → копейки по TOKEN_PRICE."""
    from app.services import billing
    import datetime as _dt
    tokens = int(float(body.get("tokens") or 0))
    if tokens <= 0:
        raise HTTPException(400, "нужно tokens > 0")
    kop = tokens * (await _token_price_kop())
    agent_id = body.get("agent_id") or None
    label = (body.get("label") or "Подарок").strip()
    exp = None
    days = int(float(body.get("expires_days") or 0))
    if days > 0:
        exp = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=days)
    g = await billing.grant_bonus(db, user_id, kop, display_tokens=tokens, label=label,
                                  agent_id=agent_id, source="platform", expires_at=exp)
    await db.commit()
    return {"ok": True, "grant_id": g.id, "kopecks": kop, "tokens": tokens}


def _camp_out(c) -> dict:
    return {"id": c.id, "sponsor_name": c.sponsor_name, "agent_id": c.agent_id,
            "bonus_tokens": c.bonus_tokens, "bonus_kopecks": c.bonus_kopecks,
            "budget_kopecks": c.budget_kopecks, "spent_kopecks": c.spent_kopecks,
            "budget_rub": round((c.budget_kopecks or 0) / 100, 2), "spent_rub": round((c.spent_kopecks or 0) / 100, 2),
            "message": c.message, "active": c.active,
            "starts_at": c.starts_at.isoformat() if c.starts_at else None,
            "ends_at": c.ends_at.isoformat() if c.ends_at else None}


@router.get("/campaigns")
async def admin_list_campaigns(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.models.sponsor_campaign import SponsorCampaign
    rows = (await db.execute(select(SponsorCampaign).order_by(SponsorCampaign.id.desc()))).scalars().all()
    return {"campaigns": [_camp_out(c) for c in rows]}


@router.post("/campaigns")
async def admin_save_campaign(body: dict = Body(...), admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Создать/обновить спонсорскую кампанию. Бюджет/бонус задаются в РУБЛЯХ (конвертим в копейки)."""
    from app.models.sponsor_campaign import SponsorCampaign
    import datetime as _dt
    cid = body.get("id")
    c = (await db.get(SponsorCampaign, int(cid))) if cid else None
    if not c:
        c = SponsorCampaign()
        db.add(c)
    c.sponsor_name = (body.get("sponsor_name") or "").strip()
    c.agent_id = body.get("agent_id") or None
    c.bonus_tokens = int(float(body.get("bonus_tokens") or 0))
    c.bonus_kopecks = c.bonus_tokens * (await _token_price_kop())
    if body.get("budget_rub") is not None:
        c.budget_kopecks = round(float(body.get("budget_rub") or 0) * 100)
    c.message = (body.get("message") or "").strip()
    c.active = bool(body.get("active", True))
    for f, attr in (("starts_at", "starts_at"), ("ends_at", "ends_at")):
        v = body.get(f)
        if v:
            try:
                setattr(c, attr, _dt.datetime.fromisoformat(str(v).replace("Z", "+00:00")))
            except Exception:
                pass
    await db.commit()
    await db.refresh(c)
    return _camp_out(c)


@router.delete("/campaigns/{cid}")
async def admin_del_campaign(cid: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    from app.models.sponsor_campaign import SponsorCampaign
    c = await db.get(SponsorCampaign, cid)
    if c:
        await db.delete(c)
        await db.commit()
    return {"ok": True}


# ═══════════════════════ #7 СОВЕЩАТЕЛЬНАЯ КОМНАТА ═══════════════════════
_ARCHITECT_ID = 47


async def _agent_say(db, agent, prompt: str, max_tokens: int = 400) -> str:
    """Один голос совещания: агент отвечает своей моделью+характером."""
    from app.services.llm import get_llm_reply
    from app.core.config import settings as s
    model = agent.llm_model or _default_model_for_provider(s.DEFAULT_LLM_PROVIDER)
    sysp = agent.system_prompt or f"Ты — {agent.name}, {agent.profession or 'джинн'} команды JinnTell."
    try:
        return (await get_llm_reply(user_message=prompt, system_prompt=sysp, model=model, max_tokens=max_tokens)) or ""
    except Exception as e:
        print(f"[council] say err {getattr(agent,'id','?')}: {e}")
        return "(не смог ответить)"


@router.get("/council/candidates")
async def council_candidates(mode: str = Query("core"), q: str = Query(""), admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Кандидаты в участники: core-джинны (оперативка) или публичные джинны Города (совет)."""
    stmt = select(Agent).where(Agent.is_active == True)
    if mode == "city":
        stmt = stmt.where(Agent.agent_type.in_(["business", "citizen", "personal", "specialist"]))
        if q:
            stmt = stmt.where(Agent.name.ilike(f"%{q}%") | Agent.profession.ilike(f"%{q}%"))
        stmt = stmt.limit(80)
    else:
        stmt = stmt.where(Agent.agent_type == "core")
    rows = (await db.execute(stmt.order_by(Agent.id))).scalars().all()
    return {"candidates": [{"id": a.id, "name": a.name, "profession": a.profession or "", "type": a.agent_type} for a in rows]}


@router.post("/council/convene")
async def council_convene(body: dict = Body(...), admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Собрать совещание: раунд мнений участников → сводка Архитектора → сохранить транскрипт."""
    import json as _j
    from app.models.council_session import CouncilSession
    topic = (body.get("topic") or "").strip()
    mode = (body.get("mode") or "core").strip()
    ids = body.get("participant_ids") or []
    if not topic:
        raise HTTPException(400, "нужна тема")
    if not ids:
        raise HTTPException(400, "выберите участников")
    ids = [int(x) for x in ids]
    agents = (await db.execute(select(Agent).where(Agent.id.in_(ids)))).scalars().all()
    order = {x: i for i, x in enumerate(ids)}
    agents.sort(key=lambda a: order.get(a.id, 999))
    transcript = []
    prior = ""
    for a in agents:
        prompt = (f"Совещание команды JinnTell. ТЕМА: {topic}\n"
                  + (f"\nЧто уже сказали коллеги:\n{prior}\n" if prior else "")
                  + f"\nТы — {a.name} ({a.profession or 'участник'}). Дай мнение по теме КОРОТКО (2–4 предложения) со своей экспертизы. Не повторяй сказанное — дополняй.")
        say = await _agent_say(db, a, prompt)
        transcript.append({"agent_id": a.id, "name": a.name, "text": say})
        prior += f"- {a.name}: {say}\n"
    summary = ""
    arch = await db.get(Agent, _ARCHITECT_ID)
    if arch and transcript:
        sump = (f"Ты — Архитектор, модератор совещания JinnTell. ТЕМА: {topic}\n\nМнения участников:\n{prior}\n\n"
                "Сведи в ИТОГ: 1) главные тезисы; 2) разногласия (если есть); 3) конкретные РЕШЕНИЯ / следующие шаги списком. Кратко и структурно.")
        summary = await _agent_say(db, arch, sump, max_tokens=700)
    sess = CouncilSession(topic=topic, mode=mode,
                          participants=_j.dumps([{"id": a.id, "name": a.name} for a in agents], ensure_ascii=False),
                          transcript=_j.dumps(transcript, ensure_ascii=False), summary=summary)
    db.add(sess)
    await db.commit()
    await db.refresh(sess)
    try:
        from app.services import activity
        await activity.log("council", actor="architect", target_type="council_session", result="done", detail=topic[:120])
    except Exception:
        pass
    return {"id": sess.id, "topic": topic, "mode": mode, "transcript": transcript, "summary": summary,
            "created_at": sess.created_at.isoformat() if sess.created_at else None}


@router.get("/council")
async def council_list(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    import json as _j
    from app.models.council_session import CouncilSession
    rows = (await db.execute(select(CouncilSession).order_by(CouncilSession.created_at.desc()).limit(30))).scalars().all()

    def _out(s):
        try:
            parts = _j.loads(s.participants or "[]")
        except Exception:
            parts = []
        return {"id": s.id, "topic": s.topic, "mode": s.mode, "participants": parts,
                "summary": s.summary, "created_at": s.created_at.isoformat() if s.created_at else None}
    return {"sessions": [_out(s) for s in rows]}


@router.get("/council/{sid}")
async def council_get(sid: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    import json as _j
    from app.models.council_session import CouncilSession
    s = await db.get(CouncilSession, sid)
    if not s:
        raise HTTPException(404, "не найдено")

    def _load(x):
        try:
            return _j.loads(x or "[]")
        except Exception:
            return []
    return {"id": s.id, "topic": s.topic, "mode": s.mode, "participants": _load(s.participants),
            "transcript": _load(s.transcript), "summary": s.summary,
            "created_at": s.created_at.isoformat() if s.created_at else None}
