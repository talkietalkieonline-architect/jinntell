"""Лист ожидания (предрегистрация): заявки до выдачи доступа. Дозирует нагрузку."""
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WaitlistEntry(Base):
    __tablename__ = "waitlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    contact: Mapped[str] = mapped_column(String(200), default="", index=True)  # email или телефон
    status: Mapped[str] = mapped_column(String(20), default="waitlisted", index=True)  # waitlisted | invited | active
    note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
