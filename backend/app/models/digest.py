"""Подборка (digest) — документ, собранный помощником из ответов нескольких джиннов Города
по запросу пользователя, с АТРИБУЦИЕЙ (кто что сказал). См. [[design_home_strips]] Блок 2."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Digest(Base):
    __tablename__ = "digests"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    query: Mapped[str] = mapped_column(String(500))
    # sections: JSON-строка [{agent_id, agent_name, color, text}] — вклад каждого джинна
    sections: Mapped[str] = mapped_column(Text, default="[]")
    # МУЛЬТИТИП «Портфель»: результат джина любого типа
    kind: Mapped[str] = mapped_column(String(16), default="doc", server_default="doc")   # doc|image|video|file|link
    media_url: Mapped[str | None] = mapped_column(Text, nullable=True)                    # для image/video/file/link
    source_agent_id: Mapped[int | None] = mapped_column(Integer, nullable=True)           # какой джин сделал
    source_agent_name: Mapped[str] = mapped_column(String(120), default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
