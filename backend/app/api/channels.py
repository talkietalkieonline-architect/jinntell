"""API каналов джиннов: посты, непрочитанное, отметка прочтения."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.channel_post import ChannelPost
from app.models.channel_read import ChannelRead
from app.models.user_favorite import UserFavorite
from app.models.agent import Agent
from app.models.user import User

router = APIRouter(prefix="/api/channels", tags=["channels"])


class ChannelPostOut(BaseModel):
    id: int
    agent_id: int
    title: str
    body: Optional[str] = None
    url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("")
async def channels_list(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Все каналы-джинны (у кого есть посты) — для полосы «Каналы» на главном."""
    chans = [c for c in (await db.execute(select(ChannelPost.agent_id).distinct())).scalars().all() if c]
    if not chans:
        return []
    reads = {a: lp for a, lp in (await db.execute(
        select(ChannelRead.agent_id, ChannelRead.last_post_id).where(
            ChannelRead.user_id == user.id, ChannelRead.agent_id.in_(chans))
    )).all()}
    out = []
    for aid in chans:
        ag = await db.get(Agent, aid)
        if not ag or not ag.is_active:
            continue
        last = reads.get(aid, 0)
        unread = (await db.execute(
            select(func.count(ChannelPost.id)).where(ChannelPost.agent_id == aid, ChannelPost.id > last)
        )).scalar() or 0
        out.append({"agent_id": aid, "name": ag.name, "color": ag.color, "unread": int(unread), "link_room": f"agent-{aid}-u{user.id}"})
    out.sort(key=lambda x: (-x["unread"], x["name"]))
    return out


@router.get("/unread")
async def channels_unread(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Непрочитанное по подписанным каналам (подписка = избранное)."""
    chans = (await db.execute(select(ChannelPost.agent_id).distinct())).scalars().all()
    chans = [c for c in chans if c]
    if not chans:
        return []
    favs = set((await db.execute(
        select(UserFavorite.agent_id).where(UserFavorite.user_id == user.id, UserFavorite.agent_id.in_(chans))
    )).scalars().all())
    if not favs:
        return []
    reads = {a: lp for a, lp in (await db.execute(
        select(ChannelRead.agent_id, ChannelRead.last_post_id).where(
            ChannelRead.user_id == user.id, ChannelRead.agent_id.in_(favs))
    )).all()}
    out = []
    for aid in favs:
        last = reads.get(aid, 0)
        cnt = (await db.execute(
            select(func.count(ChannelPost.id)).where(ChannelPost.agent_id == aid, ChannelPost.id > last)
        )).scalar() or 0
        if cnt > 0:
            ag = (await db.execute(select(Agent).where(Agent.id == aid))).scalar_one_or_none()
            out.append({
                "agent_id": aid, "name": ag.name if ag else "Канал",
                "color": ag.color if ag else "#6c7bff", "unread": int(cnt),
                "link_room": f"agent-{aid}-u{user.id}",
            })
    out.sort(key=lambda x: x["unread"], reverse=True)
    return out


@router.post("/{agent_id}/read")
async def channel_mark_read(agent_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    latest = (await db.execute(select(func.max(ChannelPost.id)).where(ChannelPost.agent_id == agent_id))).scalar() or 0
    r = (await db.execute(select(ChannelRead).where(
        ChannelRead.user_id == user.id, ChannelRead.agent_id == agent_id))).scalar_one_or_none()
    if r:
        r.last_post_id = latest
    else:
        db.add(ChannelRead(user_id=user.id, agent_id=agent_id, last_post_id=latest))
    await db.commit()
    return {"ok": True, "last_post_id": latest}


@router.get("/{agent_id}", response_model=list[ChannelPostOut])
async def channel_posts(agent_id: int, limit: int = 30, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(ChannelPost).where(ChannelPost.agent_id == agent_id)
        .order_by(ChannelPost.created_at.desc()).limit(min(limit, 50))
    )
    return [ChannelPostOut.model_validate(p) for p in res.scalars().all()]
