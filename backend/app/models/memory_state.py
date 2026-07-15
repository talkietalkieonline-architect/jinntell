"""Прогресс извлечения памяти по пользователю."""
from datetime import datetime, timezone
from sqlalchemy import DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class MemoryState(Base):
    __tablename__ = "memory_state"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_msg_id: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
