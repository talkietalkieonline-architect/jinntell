"""Журнал действий — что делали пользователь, помощник и джинны (анализ, контроль, разбор инцидентов).

Пишется «мимо» основного потока: своя сессия, ошибки глотаются — журнал никогда не ломает работу.
Свободное поле detail шифруется at-rest, как и тексты сообщений.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Чей сеанс: пользователь, в контексте которого произошло действие
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    # Кто действовал: user | assistant | agent | system
    actor: Mapped[str] = mapped_column(String(20), default="user")
    # Если действовал джинн/помощник от лица агента
    actor_agent_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Что произошло: chat.open, chat.close, assistant.command, ping.send, favorite.add ...
    action: Mapped[str] = mapped_column(String(60), index=True)
    # На кого/на что направлено
    target_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    target_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Имя цели «как было» — чтобы читать журнал без джойнов и после удаления цели
    target_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    room: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    # Чем кончилось: ok | fail | timeout | denied | not_found
    result: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Подробности (реплика пользователя, причина отказа) — шифруется
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
