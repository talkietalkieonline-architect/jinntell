"""API комнат с несколькими джиннами (приватные, на владельца)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.agent import Agent
from app.models.room import Room, RoomMember
from app.models.user import User
from app.services.access import can_access_agent

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


class CreateRoomIn(BaseModel):
    agent_ids: list[int]
    title: Optional[str] = None


class InviteIn(BaseModel):
    agent_id: int


class RoomMemberOut(BaseModel):
    id: int
    name: str
    profession: str
    color: str
    photo_url: Optional[str] = None

    class Config:
        from_attributes = True


class RoomOut(BaseModel):
    id: int
    room: str
    title: Optional[str] = None
    members: list[RoomMemberOut]


async def _members(db: AsyncSession, room_id: int) -> list[RoomMemberOut]:
    res = await db.execute(
        select(Agent).join(RoomMember, RoomMember.agent_id == Agent.id).where(RoomMember.room_id == room_id)
    )
    return [RoomMemberOut.model_validate(a) for a in res.scalars().all()]


async def _own_room(db: AsyncSession, room_id: int, user_id: int) -> Room:
    res = await db.execute(select(Room).where(Room.id == room_id, Room.owner_user_id == user_id))
    room = res.scalar_one_or_none()
    if not room:
        raise HTTPException(404, "Комната не найдена")
    return room


@router.post("", response_model=RoomOut)
async def create_room(body: CreateRoomIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ids = [i for i in dict.fromkeys(body.agent_ids)]  # уникальные, с сохранением порядка
    if not ids:
        raise HTTPException(400, "Нужен хотя бы один джинн")
    res = await db.execute(select(Agent).where(Agent.id.in_(ids), Agent.is_active == True))
    agents = {a.id: a for a in res.scalars().all()}
    accessible = []
    for i in ids:
        if i in agents and await can_access_agent(db, agents[i], user.id):
            accessible.append(i)
    ids = accessible
    if not ids:
        raise HTTPException(400, "Джинны не найдены или нет доступа")
    room = Room(owner_user_id=user.id, title=body.title)
    db.add(room)
    await db.commit()
    await db.refresh(room)
    for aid in ids:
        db.add(RoomMember(room_id=room.id, agent_id=aid))
    await db.commit()
    return RoomOut(id=room.id, room=f"room-{room.id}", title=room.title, members=await _members(db, room.id))


@router.post("/{room_id}/invite", response_model=RoomOut)
async def invite(room_id: int, body: InviteIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    room = await _own_room(db, room_id, user.id)
    res = await db.execute(select(Agent).where(Agent.id == body.agent_id, Agent.is_active == True))
    ag = res.scalar_one_or_none()
    if not ag:
        raise HTTPException(404, "Джинн не найден")
    if not await can_access_agent(db, ag, user.id):
        raise HTTPException(403, "Нет доступа к этому джинну")
    exists = await db.execute(
        select(RoomMember).where(RoomMember.room_id == room_id, RoomMember.agent_id == body.agent_id)
    )
    if not exists.scalar_one_or_none():
        db.add(RoomMember(room_id=room_id, agent_id=body.agent_id))
        await db.commit()
    return RoomOut(id=room.id, room=f"room-{room.id}", title=room.title, members=await _members(db, room.id))


@router.get("/{room_id}", response_model=RoomOut)
async def get_room(room_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    room = await _own_room(db, room_id, user.id)
    return RoomOut(id=room.id, room=f"room-{room.id}", title=room.title, members=await _members(db, room.id))
