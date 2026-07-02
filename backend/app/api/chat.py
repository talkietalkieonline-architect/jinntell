"""API чата — история сообщений"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
import re

from pydantic import BaseModel

from app.models.agent import Agent
from app.models.message import Message
from app.models.room import Room, RoomMember
from app.models.user import User
from app.schemas.message import MessageOut, SendMessageRequest

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
            out.append(MyChatOut(room=room, kind="dm", name=ou.display_name, color=ou.avatar_color or "#6c7bff"))

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
