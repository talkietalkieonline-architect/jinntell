"""API каналов джиннов (посты)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.channel_post import ChannelPost

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


@router.get("/{agent_id}", response_model=list[ChannelPostOut])
async def channel_posts(agent_id: int, limit: int = 30, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(ChannelPost).where(ChannelPost.agent_id == agent_id)
        .order_by(ChannelPost.created_at.desc()).limit(min(limit, 50))
    )
    return [ChannelPostOut.model_validate(p) for p in res.scalars().all()]
