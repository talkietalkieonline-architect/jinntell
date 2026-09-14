"""«Мой день» — записи дня (ведут пользователь и помощник). См. vision_my_day."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.day_entry import DayEntry
from app.models.user import User

router = APIRouter(prefix="/api/day", tags=["day"])


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


class DayIn(BaseModel):
    title: str
    time: Optional[str] = None
    note: Optional[str] = None
    kind: str = "event"
    important: bool = False
    day: Optional[str] = None


class DayPatch(BaseModel):
    status: Optional[str] = None
    time: Optional[str] = None
    title: Optional[str] = None
    note: Optional[str] = None
    important: Optional[bool] = None


def _out(e: DayEntry) -> dict:
    return {"id": e.id, "day": e.day, "time": e.time, "title": e.title, "note": e.note,
            "kind": e.kind, "status": e.status, "author": e.author, "important": e.important}


async def _list(db: AsyncSession, user_id: int, day: str):
    return (await db.execute(
        select(DayEntry).where(DayEntry.user_id == user_id, DayEntry.day == day)
        .order_by(DayEntry.time.is_(None), DayEntry.time, DayEntry.id)
    )).scalars().all()


async def _signals(db: AsyncSession, user_id: int) -> list:
    """Пропущенные сигналы для ленты дня: входящие сообщения за ~сутки (последнее на комнату, с временем)."""
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import distinct, or_
    from app.models.message import Message
    try:
        rooms = [r for (r,) in (await db.execute(
            select(distinct(Message.room)).where(Message.sender_user_id == user_id)
        )).all()]
        if not rooms:
            return []
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        rows = (await db.execute(
            select(Message.room, Message.sender_name, Message.sender_type, Message.created_at)
            .where(Message.room.in_(rooms), Message.created_at >= since,
                   or_(Message.sender_user_id != user_id, Message.sender_user_id.is_(None)))
            .order_by(Message.created_at)
        )).all()
        last = {}
        for room, name, stype, created in rows:
            last[room] = (name, stype, created)
        out = []
        for room, (name, stype, created) in last.items():
            out.append({"time": created.astimezone().strftime("%H:%M"),
                        "name": name or ("джинн" if stype == "agent" else "контакт"),
                        "kind": "call" if stype == "call" else "message"})
        out.sort(key=lambda s: s["time"])
        return out[:20]
    except Exception as e:
        print(f"[day] signals skip: {e}")
        return []


async def _birthdays(db: AsyncSession, user_id: int, day_list: list) -> list:
    """Дни рождения контактов (User.birthday из визитки) на даты диапазона."""
    from app.models.contact import Contact
    from app.models.user import User
    try:
        rows = (await db.execute(
            select(User.display_name, User.birth_date)
            .join(Contact, Contact.contact_user_id == User.id)
            .where(Contact.owner_user_id == user_id, User.birth_date.isnot(None))
        )).all()
        want = {d[5:]: d for d in day_list}  # MM-DD -> YYYY-MM-DD
        out = []
        for name, bd in rows:
            if bd:
                mmdd = bd.strftime("%m-%d")
                if mmdd in want:
                    out.append({"day": want[mmdd], "name": name or "контакт"})
        return out
    except Exception as e:
        print(f"[day] birthdays skip: {e}")
        return []


@router.get("")
async def list_day(days: int = 1, back: int = 0, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Записи на диапазон дней: [сегодня-back, сегодня+days). entries помечены полем day."""
    from datetime import datetime, timedelta
    n_fwd = max(1, min(int(days or 1), 366))
    n_back = max(0, min(int(back or 0), 366))
    base = datetime.now().date()
    day_list = [(base + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(-n_back, n_fwd)]
    rows = (await db.execute(
        select(DayEntry).where(DayEntry.user_id == user.id, DayEntry.day.in_(day_list))
        .order_by(DayEntry.day, DayEntry.time.is_(None), DayEntry.time, DayEntry.id)
    )).scalars().all()
    return {"days": day_list, "entries": [_out(e) for e in rows],
            "signals": await _signals(db, user.id),
            "birthdays": await _birthdays(db, user.id, day_list)}


@router.post("")
async def add_day(body: DayIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    e = DayEntry(user_id=user.id, day=(body.day or _today()), time=body.time, title=(body.title or "")[:300],
                 note=body.note, kind=body.kind or "event", important=bool(body.important), author="user")
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return _out(e)


@router.patch("/{entry_id}")
async def patch_day(entry_id: int, body: DayPatch, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    e = (await db.execute(select(DayEntry).where(DayEntry.id == entry_id, DayEntry.user_id == user.id))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "not found")
    for f in ("status", "time", "title", "note", "important"):
        v = getattr(body, f)
        if v is not None:
            setattr(e, f, v)
    await db.commit()
    return _out(e)


@router.delete("/{entry_id}")
async def del_day(entry_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    e = (await db.execute(select(DayEntry).where(DayEntry.id == entry_id, DayEntry.user_id == user.id))).scalar_one_or_none()
    if e:
        await db.delete(e)
        await db.commit()
    return {"ok": True}
