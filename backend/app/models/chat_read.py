"""Отметка прочтения чата/комнаты пользователем (для счётчика непрочитанных)."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ChatRead(Base):
    __tablename__ = "chat_reads"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    room: Mapped[str] = mapped_column(String(120), index=True)
    last_read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
