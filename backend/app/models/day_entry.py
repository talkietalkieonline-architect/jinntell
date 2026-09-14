from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Integer, String, Text, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DayEntry(Base):
    """Запись «Мой день» — ведёт пользователь И помощник (author). См. vision_my_day."""
    __tablename__ = "day_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    day: Mapped[str] = mapped_column(String(10), index=True)            # YYYY-MM-DD
    time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)  # HH:MM
    title: Mapped[str] = mapped_column(String(300))
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    kind: Mapped[str] = mapped_column(String(20), default="event")      # event|plan|reminder|hint
    status: Mapped[str] = mapped_column(String(20), default="planned")  # planned|done|cancelled|moved
    author: Mapped[str] = mapped_column(String(20), default="user")     # user|assistant
    important: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
