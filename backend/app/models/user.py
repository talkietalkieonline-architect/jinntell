"""Модель пользователя"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text, BigInteger
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
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    balance_kopecks: Mapped[int] = mapped_column(BigInteger, default=0)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    about: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    birthday: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # ММ-ДД или ГГГГ-ММ-ДД (визитка → дни рождения в «Мой день»)

    # Персонализация помощника
    assistant_name: Mapped[str] = mapped_column(String(100), default="Джим")
    assistant_gender: Mapped[str] = mapped_column(String(20), default="male")  # male / female / animal / other
    assistant_voice: Mapped[str] = mapped_column(String(50), default="male_low")
    language: Mapped[str] = mapped_column(String(8), default="ru", server_default="ru")  # ru|en|ka — язык юзера (STT/голос/контент)
    owned_store_items: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")  # купленные позиции магазина (JSON id[])
    assistant_photo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # base64 data URL
    assistant_age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # возраст образа помощника
    assistant_traits: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: характеристики общения (тон/длина/юмор/эмодзи)
    assistant_initiative: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # proactive|reactive|command
    assistant_interests: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list: интересы, которые растит помощник
    assistant_blocklist: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list: заблокированные темы (барьер)
    custom_bg_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # свой фон (URL картинки)
    action_settings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: настройки действий (обращения/гео/акции)
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
    tariff_code: Mapped[str] = mapped_column(String(40), default="", server_default="")  # пусто = полный доступ
    token_balance: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    welcome_gift_claimed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    last_daily_gift: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # Настройки
    theme: Mapped[str] = mapped_column(String(50), default="light")
    avatar_color: Mapped[str] = mapped_column(String(20), default="#d4a843")
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # реальный (приватно)
    persona_gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # образ (публично)
    interests: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar_frame: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # рамка/декор аватара (виден другим)
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
