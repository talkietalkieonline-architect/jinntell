"""
Contractor Agents API — управление агентами контрагента + аналитика диалогов.
Контрагент видит только свои агенты, может настраивать их и смотреть статистику.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_contractor_token
from app.models.agent import Agent, AgentWardrobe
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
        "voice_id", "voice_speed", "voice_pitch", "tts_voice_id", "tts_emotion",
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


# ════════════════════════════════════════════════════════════════
#  Хранилище: фото агента, гардероб, объём данных контрагента
# ════════════════════════════════════════════════════════════════
STORAGE_ROOT = "/app/storage"
STORAGE_QUOTA_MB = 500
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
_ALLOWED_IMAGE = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
}


def _contractor_dir(cid: int) -> str:
    return os.path.join(STORAGE_ROOT, "contractors", str(cid))


def _agent_dir(cid: int, aid: int) -> str:
    return os.path.join(_contractor_dir(cid), "agents", str(aid))


def _dir_size(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for fn in files:
            try:
                total += os.path.getsize(os.path.join(root, fn))
            except OSError:
                pass
    return total


async def _save_upload(file: UploadFile, dest_dir: str, basename: str) -> str:
    ext = _ALLOWED_IMAGE.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Только изображения: jpg, png, webp, gif")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "Файл больше 20 МБ")
    os.makedirs(dest_dir, exist_ok=True)
    fname = f"{basename}.{ext}"
    with open(os.path.join(dest_dir, fname), "wb") as f:
        f.write(data)
    return fname


def _remove_by_url(image_url: str) -> None:
    if not image_url:
        return
    rel = image_url.replace("/api/storage/", "", 1)
    try:
        os.remove(os.path.join(STORAGE_ROOT, rel))
    except OSError:
        pass


@router.get("/storage")
async def contractor_storage_usage(
    contractor: Contractor = Depends(_require_contractor),
):
    """Объём данных контрагента на сервере (фото, гардероб, в будущем RAG-база)."""
    used = _dir_size(_contractor_dir(contractor.id))
    return {
        "used_bytes": used,
        "used_mb": round(used / 1048576, 2),
        "quota_mb": STORAGE_QUOTA_MB,
        "percent": round(min(100.0, used / (STORAGE_QUOTA_MB * 1048576) * 100), 1),
    }


@router.post("/agents/{agent_id}/photo")
async def contractor_upload_photo(
    agent_id: int,
    file: UploadFile = File(...),
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    """Загрузить фото агента (внешность = фото). Заменяет прежнее."""
    agent = await _get_owned_agent(agent_id, contractor, db)
    d = _agent_dir(contractor.id, agent_id)
    if os.path.isdir(d):
        for fn in os.listdir(d):
            if fn.startswith("photo."):
                try:
                    os.remove(os.path.join(d, fn))
                except OSError:
                    pass
    fname = await _save_upload(file, d, "photo")
    url = f"/api/storage/contractors/{contractor.id}/agents/{agent_id}/{fname}"
    agent.photo_url = url
    await db.flush()
    return {"photo_url": url}


@router.delete("/agents/{agent_id}/photo")
async def contractor_delete_photo(
    agent_id: int,
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    agent = await _get_owned_agent(agent_id, contractor, db)
    if agent.photo_url:
        _remove_by_url(agent.photo_url)
        agent.photo_url = None
        await db.flush()
    return {"ok": True}


@router.get("/agents/{agent_id}/wardrobe")
async def contractor_wardrobe_list(
    agent_id: int,
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_agent(agent_id, contractor, db)
    rows = (await db.execute(
        select(AgentWardrobe).where(AgentWardrobe.agent_id == agent_id)
        .order_by(AgentWardrobe.created_at.desc())
    )).scalars().all()
    return [{
        "id": w.id, "image_url": w.image_url, "label": w.label,
        "occasion": w.occasion, "is_active": w.is_active,
    } for w in rows]


@router.post("/agents/{agent_id}/wardrobe")
async def contractor_wardrobe_add(
    agent_id: int,
    file: UploadFile = File(...),
    label: str = Form(None),
    occasion: str = Form(None),
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_agent(agent_id, contractor, db)
    d = os.path.join(_agent_dir(contractor.id, agent_id), "wardrobe")
    fname = await _save_upload(file, d, uuid.uuid4().hex)
    url = f"/api/storage/contractors/{contractor.id}/agents/{agent_id}/wardrobe/{fname}"
    item = AgentWardrobe(agent_id=agent_id, image_url=url, label=label or None, occasion=occasion or None)
    db.add(item)
    await db.flush()
    return {"id": item.id, "image_url": url, "label": item.label, "occasion": item.occasion, "is_active": item.is_active}


@router.patch("/agents/{agent_id}/wardrobe/{item_id}")
async def contractor_wardrobe_activate(
    agent_id: int,
    item_id: int,
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    """Сделать наряд активным (остальные — снять)."""
    await _get_owned_agent(agent_id, contractor, db)
    items = (await db.execute(
        select(AgentWardrobe).where(AgentWardrobe.agent_id == agent_id)
    )).scalars().all()
    found = False
    for w in items:
        w.is_active = (w.id == item_id)
        if w.id == item_id:
            found = True
    if not found:
        raise HTTPException(404, "Наряд не найден")
    await db.flush()
    return {"ok": True, "active_id": item_id}


@router.delete("/agents/{agent_id}/wardrobe/{item_id}")
async def contractor_wardrobe_delete(
    agent_id: int,
    item_id: int,
    contractor: Contractor = Depends(_require_contractor),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_agent(agent_id, contractor, db)
    w = (await db.execute(
        select(AgentWardrobe).where(AgentWardrobe.id == item_id, AgentWardrobe.agent_id == agent_id)
    )).scalar_one_or_none()
    if not w:
        raise HTTPException(404, "Наряд не найден")
    _remove_by_url(w.image_url)
    await db.delete(w)
    await db.flush()
    return {"ok": True}
