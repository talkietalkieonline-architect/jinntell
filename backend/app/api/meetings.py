"""Планёрка бизнеса — разговор руководителя с несколькими своими джинами сразу.

Это обычная комната room-{id} (как круглый стол в Потоке) с contractor_id: собрал в кабинете на компьютере →
продолжил на телефоне в Потоке по QR, там все, кто был на собрании, и вся история. Доклады — только по просьбе
руководителя и по фактам системы (services/meeting_facts.py, маршрутизация — chat_ws._room_reply).
"""
import asyncio
import io
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.contractor_agents import _require_contractor
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.agent import Agent
from app.models.contractor import Contractor
from app.models.message import Message
from app.models.room import Room, RoomMember
from app.models.user import User
from app.websocket.manager import manager

router = APIRouter(tags=["meetings"])

_PUBLIC_BASE = "https://jinntell.ru"
_PASS_MIN = 15  # QR-пропуск на телефон живёт 15 минут


class MeetingIn(BaseModel):
    agent_ids: list[int]
    title: Optional[str] = None


class SayIn(BaseModel):
    text: str


class PassIn(BaseModel):
    token: str


def _member(a: Agent) -> dict:
    return {"id": a.id, "name": a.name, "profession": a.profession or "", "color": a.color, "photo_url": a.photo_url}


def _msg(m: Message) -> dict:
    return {"id": m.id, "sender_type": m.sender_type, "sender_name": m.sender_name, "text": m.text,
            "media_url": m.media_url, "created_at": m.created_at.isoformat() if m.created_at else None}


async def _members(db: AsyncSession, room_id: int) -> list[Agent]:
    return list((await db.execute(
        select(Agent).join(RoomMember, RoomMember.agent_id == Agent.id).where(RoomMember.room_id == room_id).order_by(RoomMember.id)
    )).scalars().all())


async def _meeting(db: AsyncSession, mid: int, c: Contractor) -> Room:
    r = (await db.execute(select(Room).where(Room.id == mid, Room.contractor_id == c.id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Планёрка не найдена")
    return r


# ── Кабинет (компьютер) ──────────────────────────────────────────────

@router.get("/api/contractor/meetings")
async def meetings_list(c: Contractor = Depends(_require_contractor), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Room).where(Room.contractor_id == c.id).order_by(Room.id.desc()).limit(20))).scalars().all()
    out = []
    for r in rows:
        last = (await db.execute(select(Message).where(Message.room == f"room-{r.id}").order_by(Message.id.desc()).limit(1))).scalar_one_or_none()
        out.append({"id": r.id, "title": r.title, "created_at": r.created_at.isoformat() if r.created_at else None,
                    "members": [a.name for a in await _members(db, r.id)],
                    "last": (last.text or "")[:120] if last else ""})
    return {"items": out}


@router.post("/api/contractor/meetings")
async def meeting_create(body: MeetingIn, c: Contractor = Depends(_require_contractor), db: AsyncSession = Depends(get_db)):
    ids = list(dict.fromkeys(body.agent_ids))[:8]
    agents = (await db.execute(select(Agent).where(Agent.id.in_(ids), Agent.contractor_id == c.id, Agent.is_active == True))).scalars().all()
    if len(agents) < 1:
        raise HTTPException(400, "Выберите хотя бы одного своего джина")
    title = (body.title or "").strip()[:120] or f"{c.company_name} · планёрка {datetime.now(timezone(timedelta(hours=3))):%d.%m}"
    r = Room(owner_user_id=c.user_id, contractor_id=c.id, title=title)
    db.add(r)
    await db.flush()
    by_id = {a.id: a for a in agents}
    for i in ids:
        if i in by_id:
            db.add(RoomMember(room_id=r.id, agent_id=i))
    await db.commit()
    return {"id": r.id, "room": f"room-{r.id}", "title": r.title, "members": [_member(by_id[i]) for i in ids if i in by_id]}


@router.get("/api/contractor/meetings/{mid}")
async def meeting_get(mid: int, after: int = 0, c: Contractor = Depends(_require_contractor), db: AsyncSession = Depends(get_db)):
    r = await _meeting(db, mid, c)
    q = select(Message).where(Message.room == f"room-{r.id}")
    if after:
        q = q.where(Message.id > after).order_by(Message.id)
        msgs = (await db.execute(q)).scalars().all()
    else:
        msgs = list(reversed((await db.execute(q.order_by(Message.id.desc()).limit(100))).scalars().all()))
    return {"id": r.id, "room": f"room-{r.id}", "title": r.title, "members": [_member(a) for a in await _members(db, r.id)],
            "messages": [_msg(m) for m in msgs], "on_phone": bool(r.owner_user_id)}


@router.post("/api/contractor/meetings/{mid}/say")
async def meeting_say(mid: int, body: SayIn, c: Contractor = Depends(_require_contractor), db: AsyncSession = Depends(get_db)):
    """Руководитель говорит на планёрке из кабинета; ответы джинов приходят следом (кабинет опрашивает, Поток — по сокету)."""
    from app.websocket.chat_ws import _room_reply
    r = await _meeting(db, mid, c)
    text = (body.text or "").strip()[:2000]
    if not text:
        raise HTTPException(400, "Пустое сообщение")
    room = f"room-{r.id}"
    owner = await db.get(User, r.owner_user_id) if r.owner_user_id else None
    name = (owner.display_name if owner else "") or c.contact_name or c.director_name or "Руководитель"
    m = Message(room=room, sender_type="user", sender_user_id=r.owner_user_id, sender_name=name, text=text)
    db.add(m)
    await db.commit()
    await db.refresh(m)
    await manager.broadcast(room, {"type": "message", "id": m.id, "room": room, "sender_type": "user",
                                   "sender_user_id": r.owner_user_id, "sender_name": name, "text": text,
                                   "media_url": None, "media_type": None, "created_at": m.created_at.isoformat()})
    members = [a for a in await _members(db, r.id) if a.is_active]
    asyncio.create_task(_room_reply(room, text, members, r.owner_user_id or 0,
                                    (owner.assistant_name if owner else None) or "Секретарь"))
    return _msg(m)


@router.post("/api/contractor/meetings/{mid}/phone")
async def meeting_phone_pass(mid: int, c: Contractor = Depends(_require_contractor), db: AsyncSession = Depends(get_db)):
    """QR «продолжить на телефоне»: короткий пропуск в эту планёрку (не вход в аккаунт — на телефоне нужен свой вход)."""
    import segno
    r = await _meeting(db, mid, c)
    tok = jwt.encode({"sub": str(r.id), "type": "meet", "cid": c.id, "jti": uuid.uuid4().hex,
                      "exp": datetime.now(timezone.utc) + timedelta(minutes=_PASS_MIN)},
                     settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    url = f"{_PUBLIC_BASE}/?meet={tok}"
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", scale=5, border=2, dark="#1c2230", light="#ffffff")
    return {"url": url, "svg": buf.getvalue().decode(), "minutes": _PASS_MIN}


# ── Телефон (Поток) ──────────────────────────────────────────────────

def _read_pass(token: str) -> tuple[int, int, str]:
    try:
        p = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(410, "QR устарел — откройте новый в кабинете")
    if p.get("type") != "meet":
        raise HTTPException(400, "Это не QR планёрки")
    return int(p["sub"]), int(p["cid"]), str(p.get("jti") or "")


async def _claim(jti: str, user_id: int) -> None:
    """QR одноразовый для одного человека: кто первым вошёл по нему, тот и может входить повторно (до истечения)."""
    from redis import asyncio as aioredis
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        k = f"meet:pass:{jti}"
        if not await r.set(k, str(user_id), nx=True, ex=_PASS_MIN * 60 + 60):
            if await r.get(k) != str(user_id):
                raise HTTPException(410, "По этому QR уже вошли — откройте новый в кабинете")
    finally:
        await r.aclose()


async def _pass_target(db: AsyncSession, token: str) -> tuple[Room, Contractor]:
    rid, cid, _ = _read_pass(token)
    r = (await db.execute(select(Room).where(Room.id == rid, Room.contractor_id == cid))).scalar_one_or_none()
    c = await db.get(Contractor, cid)
    if not r or not c or not c.is_active:
        raise HTTPException(404, "Планёрка не найдена")
    return r, c


@router.post("/api/meetings/peek")
async def meeting_peek(body: PassIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Что за планёрка по QR — до входа: телефон спрашивает подтверждение, если кабинет ещё не привязан."""
    r, c = await _pass_target(db, body.token)
    if c.user_id and c.user_id != user.id:
        raise HTTPException(403, "Этот кабинет привязан к другому аккаунту — войдите в Поток под ним")
    return {"company": c.company_name, "title": r.title, "needs_link": not c.user_id}


@router.post("/api/meetings/join")
async def meeting_join(body: PassIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Войти в планёрку на телефоне. Кабинет без аккаунта привязывается к вошедшему (телефон подтвердил),
    и все планёрки компании становятся его комнатами в Потоке."""
    r, c = await _pass_target(db, body.token)
    await _claim(_read_pass(body.token)[2], user.id)
    if c.user_id and c.user_id != user.id:
        raise HTTPException(403, "Этот кабинет привязан к другому аккаунту — войдите в Поток под ним")
    if not c.user_id:
        c.user_id = user.id
    for room in (await db.execute(select(Room).where(Room.contractor_id == c.id, Room.owner_user_id.is_(None)))).scalars().all():
        room.owner_user_id = user.id
    await db.commit()
    members = await _members(db, r.id)
    return {"room": f"room-{r.id}", "title": r.title, "members": [_member(a) for a in members]}
