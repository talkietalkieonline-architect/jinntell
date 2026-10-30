"""Чей это разговор: кто может читать и писать в комнату по её имени.

Личные комнаты (jim-{uid}, user-{uid}, agent-{id}-u{uid}) — только их пользователь; dm-{a}-{b} — двое;
room-{id} (несколько джиннов, планёрка) — владелец комнаты. Общие (general, agent-{id}) — все.
"""
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.room import Room

_OWN = (re.compile(r"^jim-(\d+)$"), re.compile(r"^user-(\d+)$"), re.compile(r"^agent-\d+-u(\d+)$"))


async def can_use_room(db: AsyncSession, user_id: int, room: str) -> bool:
    for rx in _OWN:
        m = rx.match(room or "")
        if m:
            return int(m.group(1)) == user_id
    m = re.match(r"^dm-(\d+)-(\d+)$", room or "")
    if m:
        return user_id in (int(m.group(1)), int(m.group(2)))
    m = re.match(r"^room-(\d+)$", room or "")
    if m:
        owner = (await db.execute(select(Room.owner_user_id).where(Room.id == int(m.group(1))))).scalar_one_or_none()
        return owner is not None and owner == user_id
    return True
