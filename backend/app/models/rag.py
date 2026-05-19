"""Модели для RAG (Retrieval-Augmented Generation) — агенты-специалисты"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Date, Integer, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentSource(Base):
    """Источник данных для агента-специалиста (URL закона, документа и т.д.)"""
    __tablename__ = "agent_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id"), index=True)

    # Тип источника: consultant / garant / pravo / custom
    source_type: Mapped[str] = mapped_column(String(30), default="custom")

    # URL источника
    url: Mapped[str] = mapped_column(Text, nullable=False)

    # Название (человекочитаемое)
    title: Mapped[str] = mapped_column(String(300), default="")

    # Слой знаний: law / changes / explanations
    layer: Mapped[str] = mapped_column(String(30), default="law")

    # Парсинг
    last_parsed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_change_found_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    chunks_count: Mapped[int] = mapped_column(Integer, default=0)

    # Расписание: manual / daily / weekly
    schedule: Mapped[str] = mapped_column(String(20), default="manual")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AgentRAGChunk(Base):
    """Чанк текста, проиндексированный в Qdrant"""
    __tablename__ = "agent_rag_chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id"), index=True)
    source_id: Mapped[int] = mapped_column(Integer, ForeignKey("agent_sources.id"), index=True)

    # Слой знаний: law / changes / explanations
    layer: Mapped[str] = mapped_column(String(30), default="law")

    # Номер статьи / раздела (для навигации)
    article_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Текст чанка
    text: Mapped[str] = mapped_column(Text, nullable=False)

    # Дата редакции (если применимо)
    edition_date: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)

    # Метаданные (JSON): title, section, subsection и т.д.
    chunk_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # ID точки в Qdrant (для обновления/удаления)
    qdrant_point_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AgentParseLog(Base):
    """Лог парсинга — отслеживание изменений в источниках"""
    __tablename__ = "agent_parse_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id"), index=True)
    source_id: Mapped[int] = mapped_column(Integer, ForeignKey("agent_sources.id"), index=True)

    # Действие: parsed / added / updated / deleted / error
    action: Mapped[str] = mapped_column(String(20), default="parsed")

    # Детали
    article_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    chunks_added: Mapped[int] = mapped_column(Integer, default=0)
    chunks_updated: Mapped[int] = mapped_column(Integer, default=0)
    chunks_deleted: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    parsed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
