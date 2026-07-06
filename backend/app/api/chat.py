"""API чата — история сообщений"""
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
import re

from typing import Optional

from pydantic import BaseModel

from app.models.agent import Agent
from app.api.users import _STORAGE_ROOT
from app.models.message import Message
from app.models.room import Room, RoomMember
from app.models.user import User
from app.schemas.message import MessageOut, SendMessageRequest
from app.websocket.manager import manager

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/history", response_model=list[MessageOut])
async def get_history(
    room: str = Query("general"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """История сообщений. Для чата джинна (agent-{id}) агрегируем 1:1 + комнаты с этим джинном."""
    _dm = re.match(r"^dm-(\d+)-(\d+)$", room)
    if _dm and user.id not in (int(_dm.group(1)), int(_dm.group(2))):
        raise HTTPException(403, "Нет доступа")
    m = re.match(r"^agent-(\d+)(?:-u\d+)?$", room)
    rooms = [room]
    agent_id = None
    if m:
        agent_id = int(m.group(1))
        rids = (await db.execute(
            select(Room.id)
            .join(RoomMember, RoomMember.room_id == Room.id)
            .where(Room.owner_user_id == user.id, RoomMember.agent_id == agent_id)
        )).scalars().all()
        rooms += [f"room-{rid}" for rid in rids]
    result = await db.execute(
        select(Message)
        .where(Message.room.in_(rooms))
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = list(reversed(result.scalars().all()))
    out = []
    for msg in messages:
        mo = MessageOut.model_validate(msg)
        if agent_id is not None and msg.sender_type == "agent" \
                and msg.sender_agent_id is not None and msg.sender_agent_id != agent_id:
            mo.context = True
        out.append(mo)
    return out


class MyChatOut(BaseModel):
    room: str
    kind: str  # dm | room
    name: str
    color: str = "#6c7bff"
    photo: Optional[str] = None
    online: bool = False
    count: int = 0


@router.get("/my-chats", response_model=list[MyChatOut])
async def my_chats(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Серверный список чатов пользователя (DM + мои комнаты) — чтобы входящие появлялись в ленте."""
    out: list[MyChatOut] = []

    # DM-комнаты, где я участник
    res = await db.execute(
        select(Message.room).where(
            or_(Message.room.like(f"dm-{user.id}-%"), Message.room.like(f"dm-%-{user.id}"))
        ).distinct()
    )
    for room in res.scalars().all():
        m = re.match(r"^dm-(\d+)-(\d+)$", room)
        if not m:
            continue
        a, b = int(m.group(1)), int(m.group(2))
        other_id = b if a == user.id else a
        ures = await db.execute(select(User).where(User.id == other_id))
        ou = ures.scalar_one_or_none()
        if ou:
            out.append(MyChatOut(room=room, kind="dm", name=ou.display_name, color=ou.avatar_color or "#6c7bff", photo=ou.avatar_url, online=ou.is_online))

    # Мои комнаты (владелец)
    rres = await db.execute(select(Room).where(Room.owner_user_id == user.id))
    for r in rres.scalars().all():
        mres = await db.execute(
            select(Agent.name, Agent.color).join(RoomMember, RoomMember.agent_id == Agent.id).where(RoomMember.room_id == r.id)
        )
        members = mres.all()
        name = " + ".join(mm[0] for mm in members) if members else (r.title or "Комната")
        color = members[0][1] if members else "#6c7bff"
        out.append(MyChatOut(room=f"room-{r.id}", kind="room", name=name, color=color, count=len(members)))

    return out


_CHAT_MEDIA = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
               "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov"}


@router.post("/media")
async def upload_chat_media(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Загрузка медиа для чата (фото/видео/кружок) — возвращает URL для отправки в сообщении."""
    ct = (file.content_type or "").split(";")[0].strip().lower()
    ext = _CHAT_MEDIA.get(ct)
    if not ext:
        if ct.startswith("video/"):
            ext = "webm"
        elif ct.startswith("image/"):
            ext = "jpg"
        else:
            raise HTTPException(400, "Только изображения и видео")
    data = await file.read()
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(400, "Файл больше 50 МБ")
    d = os.path.join(_STORAGE_ROOT, "chat", str(user.id))
    os.makedirs(d, exist_ok=True)
    fname = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(d, fname), "wb") as f:
        f.write(data)
    mtype = "video" if ct.startswith("video/") else "image"
    return {"url": f"/api/storage/chat/{user.id}/{fname}", "type": mtype}


@router.post("/send", response_model=MessageOut)
async def send_message(
    body: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Отправить сообщение (HTTP fallback, основной путь — WebSocket)"""
    msg = Message(
        room=body.room,
        sender_type="user",
        sender_user_id=user.id,
        sender_name=user.display_name,
        text=body.text,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return MessageOut.model_validate(msg)


@router.delete("/history")
async def clear_history(
    room: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Очистить историю: в приватном чате (помощник/джинн) — все сообщения; в DM/комнате — только свои."""
    own_private = room == f"jim-{user.id}" or re.match(rf"^agent-\d+-u{user.id}$", room) is not None
    q = select(Message).where(Message.room == room)
    if not own_private:
        q = q.where(Message.sender_user_id == user.id)
    res = await db.execute(q)
    msgs = list(res.scalars().all())
    for m in msgs:
        await db.delete(m)
    await db.commit()
    await manager.broadcast(room, {"type": "clear", "room": room})
    return {"ok": True, "cleared": len(msgs)}


@router.delete("/message/{message_id}")
async def delete_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Удалить сообщение: только своё или в своём приватном чате. Realtime-удаление у всех участников."""
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    room = msg.room
    own_private = room == f"jim-{user.id}" or re.match(rf"^agent-\d+-u{user.id}$", room) is not None
    is_mine = msg.sender_user_id == user.id
    if not (is_mine or own_private):
        raise HTTPException(status_code=403, detail="Можно удалять только свои сообщения")
    await db.delete(msg)
    await db.commit()
    await manager.broadcast(room, {"type": "delete", "id": message_id, "room": room})
    return {"ok": True}
