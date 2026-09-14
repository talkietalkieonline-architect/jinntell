from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class CouncilSession(Base):
    """Совещательная комната: тема + участники (core/город) → раунд мнений →
    сводка Архитектора. Транскрипт хранится для истории. См. vision_council_room."""
    __tablename__ = "council_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    topic: Mapped[str] = mapped_column(Text, default="")
    mode: Mapped[str] = mapped_column(String(20), default="core")          # core | city
    participants: Mapped[str] = mapped_column(Text, default="[]")          # JSON [{id,name}]
    transcript: Mapped[str] = mapped_column(Text, default="[]")            # JSON [{agent_id,name,text}]
    summary: Mapped[str] = mapped_column(Text, default="")                 # сводка Архитектора
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
