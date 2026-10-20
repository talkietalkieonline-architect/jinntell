"""
JinnTemplate — «шкафчик Архитектора»: склад готовых джинов-профессий, скачанных с GitHub
(agency-agents, wshobson/agents …). Только ТЕКСТ (md-описание агента), скрипты репо не запускаются.
Архитектор достаёт заготовку → адаптирует (наши инструменты + модель + данные) → рождает джина.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func

from app.core.database import Base


class JinnTemplate(Base):
    __tablename__ = "jinn_templates"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(120), index=True, nullable=False)   # owner/repo
    license = Column(String(40), default="")                   # SPDX (MIT …)
    path = Column(String(300), nullable=False)                 # путь файла в репо
    slug = Column(String(160), index=True, nullable=False)     # уникален в пределах source
    division = Column(String(80), index=True, default="")      # раздел репо (sales, marketing …)

    name = Column(String(200), default="")                     # как в оригинале (англ.)
    description = Column(Text, default="")
    emoji = Column(String(16), default="")
    vibe = Column(Text, default="")
    body = Column(Text, default="")                            # полная инструкция-персона (англ.)

    name_ru = Column(String(200), default="")                  # перевод для поиска/витрины
    summary_ru = Column(Text, default="")
    tags_ru = Column(Text, default="")                         # ключевые слова через запятую

    safety = Column(String(16), default="ok", index=True)      # ok | flagged
    safety_notes = Column(Text, default="")
    adopted_count = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
