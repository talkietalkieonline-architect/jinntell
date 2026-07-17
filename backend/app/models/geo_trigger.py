"""Геотриггер — гео-таргетированное «обращение» бизнес-джинна (бывший режим «Прогулка»).
Джинн привязан к точке; когда пользователь (с включённой геолокацией) рядом — «стучится»
с промо-текстом/купоном. Платно для контрагента (списание за показ). См. настройки действий юзера.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GeoTrigger(Base):
    __tablename__ = "geo_triggers"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    radius_m: Mapped[int] = mapped_column(Integer, default=200)          # радиус действия, метры
    title: Mapped[str] = mapped_column(String(200), default="")          # заголовок призыва
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # текст-призыв
    media_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # флаер/картинка (url или data:)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    cooldown_hours: Mapped[int] = mapped_column(Integer, default=24)     # не чаще раза в N часов на юзера
    price_kopecks: Mapped[int] = mapped_column(Integer, default=200)     # цена показа контрагенту (2 ₽)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class GeoTriggerHit(Base):
    """Кулдаун: когда триггер последний раз срабатывал на конкретного пользователя."""
    __tablename__ = "geo_trigger_hits"

    id: Mapped[int] = mapped_column(primary_key=True)
    trigger_id: Mapped[int] = mapped_column(Integer, index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    last_fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
