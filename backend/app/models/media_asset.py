"""Библиотека «Образы» — ассеты аккаунта (лица/одежда/аксессуары), генерённые или загруженные.
Уровень аккаунта (бизнес/юзер), переиспользуются на любом джине/помощнике. См. list_master_tracker (видео/образы)."""
from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    owner_contractor_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("contractors.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(20), default="face", index=True)  # face|outfit|accessory|background
    url: Mapped[str] = mapped_column(Text)
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="generated")  # generated|uploaded|store
    label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
