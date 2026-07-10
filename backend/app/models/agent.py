"""Модель агента"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(primary_key=True)
    uid: Mapped[Optional[str]] = mapped_column(String(20), unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    profession: Mapped[str] = mapped_column(String(100), index=True)
    brand: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(20), default="#d4a843")
    agent_type: Mapped[str] = mapped_column(String(30), default="business", index=True)
    jinntell_link: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True)
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    rating_count: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    contractor_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("contractors.id"), nullable=True, index=True)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    template_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("agents.id"), nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), default="public")
    scope: Mapped[str] = mapped_column(String(20), default="federal")
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    unavailable_message: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # AI / LLM
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    llm_model: Mapped[str] = mapped_column(String(100), default="gpt-4o-mini")
    llm_max_tokens: Mapped[int] = mapped_column(Integer, default=1000)
    greeting: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # TTS (Text-to-Speech)
    tts_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    tts_provider: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    tts_voice_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tts_language: Mapped[str] = mapped_column(String(10), default="ru-RU")
    tts_speed: Mapped[float] = mapped_column(Float, default=1.0)
    tts_pitch: Mapped[float] = mapped_column(Float, default=1.0)
    tts_emotion: Mapped[str] = mapped_column(String(30), default="neutral")
    tts_sample_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    tts_audio_format: Mapped[str] = mapped_column(String(10), default="opus")

    # VIDEO (Talking avatar)
    video_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    video_provider: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    video_model: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    video_source_photo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    video_quality: Mapped[str] = mapped_column(String(20), default="standard")
    video_mode: Mapped[str] = mapped_column(String(20), default="bubble")
    video_fps: Mapped[int] = mapped_column(Integer, default=25)
    video_resolution: Mapped[str] = mapped_column(String(20), default="512x512")
    video_background: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Voice (legacy compat)
    voice_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    voice_speed: Mapped[float] = mapped_column(Float, default=1.0)
    voice_pitch: Mapped[float] = mapped_column(Float, default=1.0)

    # Appearance
    appearance_preset: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    appearance_face: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    appearance_hair: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    appearance_skin: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    appearance_body: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Outfit
    outfit_style: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    outfit_top: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    outfit_bottom: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    outfit_shoes: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    outfit_accessory: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Manner
    manner_style: Mapped[str] = mapped_column(String(50), default="friendly")
    manner_temperament: Mapped[str] = mapped_column(String(50), default="balanced")
    manner_humor: Mapped[bool] = mapped_column(Boolean, default=True)
    manner_emoji_use: Mapped[bool] = mapped_column(Boolean, default=True)

    # Knowledge
    knowledge_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    knowledge_urls: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    knowledge_files: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Skills
    skills_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Exclusions
    exclusions_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Modes
    mode_walk_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_walk_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_walk_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_shopping_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_shopping_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_shopping_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_drive_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_drive_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_drive_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_chat_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_chat_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_chat_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_work_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_work_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_work_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Фото агента (внешность = загруженное фото; аватар + источник видео)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AgentWardrobe(Base):
    """Гардероб агента — коллекция изображений нарядов (загруженных/сгенерированных)."""
    __tablename__ = "agent_wardrobe"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id"), index=True)
    image_url: Mapped[str] = mapped_column(String(500))
    label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    occasion: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
