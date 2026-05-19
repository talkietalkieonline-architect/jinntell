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

    # system / business / citizen
    agent_type: Mapped[str] = mapped_column(String(30), default="business", index=True)

    # JinnTell Link — jinntell.com/a/tim-adidas
    jinntell_link: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True)

    rating: Mapped[float] = mapped_column(Float, default=0.0)
    rating_count: Mapped[int] = mapped_column(default=0)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Владелец агента (бизнес-пользователь). NULL = системный агент
    owner_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True, index=True
    )

    # Контрагент (бизнес-клиент). NULL = не привязан
    contractor_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("contractors.id"), nullable=True, index=True
    )

    # Болванки
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    template_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("agents.id"), nullable=True
    )

    # Видимость: public / link_only / private / personal
    visibility: Mapped[str] = mapped_column(String(20), default="public")

    # Кастомное сообщение при отключении (баланс 0 / отпуск)
    unavailable_message: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # ═══ AI / LLM ═══
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    llm_model: Mapped[str] = mapped_column(String(50), default="gpt-4o-mini")
    greeting: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ═══ ГОЛОС ═══
    # id голоса из библиотеки ("male-deep", "female-warm", ...), потом — TTS model id
    voice_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    voice_speed: Mapped[float] = mapped_column(Float, default=1.0)       # 0.5–2.0
    voice_pitch: Mapped[float] = mapped_column(Float, default=1.0)       # 0.5–2.0

    # ═══ ВНЕШНОСТЬ (будущее: аватар с мимикой) ═══
    # Пока пресеты; потом — ID 3D-модели / генерация
    appearance_preset: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    appearance_face: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    appearance_hair: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    appearance_skin: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    appearance_body: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # ═══ ОДЕЖДА (будущее: шкаф с нарядами) ═══
    outfit_style: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # formal / casual / sport / ...
    outfit_top: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    outfit_bottom: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    outfit_shoes: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    outfit_accessory: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # ═══ МАНЕРЫ / ХАРАКТЕР ═══
    manner_style: Mapped[str] = mapped_column(String(50), default="friendly")  # formal / friendly / playful / strict
    manner_temperament: Mapped[str] = mapped_column(String(50), default="balanced")  # calm / energetic / balanced / reserved
    manner_humor: Mapped[bool] = mapped_column(Boolean, default=True)
    manner_emoji_use: Mapped[bool] = mapped_column(Boolean, default=True)

    # ═══ ЗНАНИЯ / ДАННЫЕ (бизнес загружает) ═══
    knowledge_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # FAQ, описание товаров, правила
    knowledge_urls: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON список URL для парсинга (будущее)
    knowledge_files: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # JSON список загруженных файлов (будущее)

    # ═══ СКИЛЫ (навыки продаж, скрипты, воронки) ═══
    skills_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ═══ ОТМЕНА (исключения: стоп-слова, запретные темы) ═══
    exclusions_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ═══ РЕЖИМЫ РАБОТЫ ═══
    # Прогулка
    mode_walk_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_walk_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_walk_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Шоппинг
    mode_shopping_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_shopping_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_shopping_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Дорога
    mode_drive_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_drive_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_drive_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Общение
    mode_chat_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_chat_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_chat_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Работа
    mode_work_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mode_work_rules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode_work_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
