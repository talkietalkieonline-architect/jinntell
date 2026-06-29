"""Модель события Ленты — личное уведомление пользователя (НЕ общее)."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FeedEvent(Base):
    __tablename__ = "feed_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    # kind: info | reminder | offer | event
    kind: Mapped[str] = mapped_column(String(20), default="info")
    icon: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # переход в чат/комнату по тапу
    link_room: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    agent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("agents.id"), nullable=True)

    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
