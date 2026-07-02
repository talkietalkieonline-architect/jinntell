"""Модель пользователя"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    display_name: Mapped[str] = mapped_column(String(100), default="Пользователь")
    jinntell_link: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True)

    # Персональные данные
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    about: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Персонализация помощника
    assistant_name: Mapped[str] = mapped_column(String(100), default="Джим")
    assistant_gender: Mapped[str] = mapped_column(String(20), default="male")  # male / female / animal / other
    assistant_voice: Mapped[str] = mapped_column(String(50), default="male_low")
    assistant_photo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # base64 data URL
    user_age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # legacy, не используется

    # OAuth — привязка внешних аккаунтов
    vk_id: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)
    telegram_id: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)
    yandex_id: Mapped[Optional[str]] = mapped_column(String(50), unique=True, nullable=True)

    # Восстановление пароля
    reset_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    reset_code_expires: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Статус
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    # Настройки
    theme: Mapped[str] = mapped_column(String(50), default="light")
    avatar_color: Mapped[str] = mapped_column(String(20), default="#d4a843")
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # реальный (приватно)
    persona_gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # образ (публично)
    interests: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    background: Mapped[str] = mapped_column(String(50), default="soft")
    custom_accent: Mapped[str] = mapped_column(String(20), default="#6c7bff")

    # SMS-верификация (legacy)
    sms_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    sms_code_expires: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Мета
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
