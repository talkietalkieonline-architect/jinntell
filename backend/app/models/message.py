"""Модель сообщения в чате"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    room: Mapped[str] = mapped_column(String(100), index=True, default="general")

    # sender_type: "user" | "butler" | "agent"
    sender_type: Mapped[str] = mapped_column(String(20))
    sender_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    sender_agent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("agents.id"), nullable=True)
    sender_name: Mapped[str] = mapped_column(String(100))

    text: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
