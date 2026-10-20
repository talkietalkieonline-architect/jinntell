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
    agent_name: Optional[str] = None   # кто оставил (для «Гостей» на главной)
    agent_color: Optional[str] = None
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
        _aid = pst.get("agent_id")
        await create_feed_event(
            db, user.id, pst["title"], kind="interest", icon="\u2728",
            body=(pst.get("body") or "")[:160] or None, agent_id=_aid,
            link_room=(f"agent-{_aid}-u{user.id}" if _aid else None),
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
    # имя/цвет джинна-автора — для раздела «Гости» (джинны, оставившие предложение)
    from app.models.agent import Agent as _Agent
    ids = {e.agent_id for e in items if e.agent_id}
    names = {}
    if ids:
        for a in (await db.execute(select(_Agent).where(_Agent.id.in_(ids)))).scalars().all():
            names[a.id] = (a.name, a.color)
    out = []
    for e in items:
        d = FeedEventOut.model_validate(e).model_dump()
        if e.agent_id in names:
            d["agent_name"], d["agent_color"] = names[e.agent_id]
        out.append(d)
    return out


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
