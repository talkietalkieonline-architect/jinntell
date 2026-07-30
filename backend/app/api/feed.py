"""API Ленты — личные события/уведомления пользователя."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.feed import FeedEvent
from app.models.user import User

router = APIRouter(prefix="/api/feed", tags=["feed"])


class FeedEventOut(BaseModel):
    id: int
    kind: str
    icon: Optional[str] = None
    title: str
    body: Optional[str] = None
    link_room: Optional[str] = None
    agent_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


async def create_feed_event(db: AsyncSession, user_id: int, title: str, *, kind: str = "info",
                            body: Optional[str] = None, icon: Optional[str] = None,
                            link_room: Optional[str] = None, agent_id: Optional[int] = None) -> FeedEvent:
    """Создать событие Ленты для пользователя (используется помощником/системой)."""
    ev = FeedEvent(user_id=user_id, title=title, kind=kind, body=body,
                   icon=icon, link_room=link_room, agent_id=agent_id)
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return ev


_LAST_MATCH: dict = {}


async def _deliver_interests(db: AsyncSession, user: User) -> None:
    """Fan-out-on-read: матчим посты джиннов под интересы пользователя и материализуем в Ленту.
    Троттлинг (не чаще раза в 5 мин на юзера) + дедуп по заголовку. Барьер — внутри match_for_user."""
    import time
    now = time.time()
    if now - _LAST_MATCH.get(user.id, 0) < 300:
        return
    _LAST_MATCH[user.id] = now
    from app.services.targeting import match_for_user
    r = await match_for_user(user.id, top_k=5)
    if not (r.get("ok") and r.get("posts")):
        return
    existing = set((await db.execute(
        select(FeedEvent.title).where(FeedEvent.user_id == user.id, FeedEvent.kind == "interest")
    )).scalars().all())
    created = 0
    for pst in r["posts"]:
        if created >= 3:
            break
        if pst["title"] in existing:
            continue
        await create_feed_event(
            db, user.id, pst["title"], kind="interest", icon="\u2728",
            body=(pst.get("body") or "")[:160] or None, agent_id=pst.get("agent_id"),
        )
        created += 1


@router.get("", response_model=list[FeedEventOut])
async def list_feed(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await _deliver_interests(db, user)
    except Exception as _e:
        print(f"[feed] interest delivery failed: {_e}")
    res = await db.execute(
        select(FeedEvent).where(FeedEvent.user_id == user.id).order_by(desc(FeedEvent.created_at)).limit(50)
    )
    items = list(res.scalars().all())
    if not items:
        welcome = await create_feed_event(
            db, user.id, "Добро пожаловать в JinnTell", kind="info", icon="\U0001F9DE",
            body="Здесь будет важное: напоминания, события и сообщения от джиннов. Зовите джиннов через звезду Избранного.",
        )
        items = [welcome]
    return items


@router.post("/{event_id}/read")
async def mark_read(event_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(FeedEvent).where(FeedEvent.id == event_id, FeedEvent.user_id == user.id))
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Событие не найдено")
    ev.is_read = True
    await db.commit()
    return {"ok": True}


@router.delete("/{event_id}")
async def dismiss(event_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(FeedEvent).where(FeedEvent.id == event_id, FeedEvent.user_id == user.id))
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(404, "Событие не найдено")
    await db.delete(ev)
    await db.commit()
    return {"ok": True}
