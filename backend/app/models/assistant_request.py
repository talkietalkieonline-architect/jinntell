from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AssistantRequest(Base):
    """Внутренний helpdesk: обращение, когда джинн/помощник НЕ смог сам.
    Маршрутизируется по домену к нужному ВНУТРЕННЕМУ джину (Супер-помощник/
    Архитектор/Админ/Контент/Маркетолог/Железо…), живой админ видит всё и закрывает.
    Каждое обращение = обнаруженный ПРОБЕЛ возможностей. См. design_assistant_escalation_architect."""
    __tablename__ = "assistant_requests"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Кто и по какому поводу
    user_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)       # конечный юзер
    source_agent_id: Mapped[int | None] = mapped_column(Integer, nullable=True)           # джинн/помощник, поднявший
    task_text: Mapped[str] = mapped_column(Text, default="")                              # что просил юзер
    reason: Mapped[str] = mapped_column(Text, default="")                                 # почему не смог
    context: Mapped[str] = mapped_column(Text, default="")                                # фрагмент диалога

    # Маршрутизация по домену
    target: Mapped[str] = mapped_column(String(40), default="architect", index=True)      # super_assistant|architect|admin|content|marketing|hardware|other
    target_agent_id: Mapped[int | None] = mapped_column(Integer, nullable=True)            # разрешённый внутренний джинн

    # Триаж (авто-анализ роутера/Архитектора)
    triage_category: Mapped[str] = mapped_column(String(60), default="")                   # нет инструмента|нет знаний|вне зоны|нужен код|how-to…
    triage_analysis: Mapped[str] = mapped_column(Text, default="")                         # черновик решения от ИИ

    # Диалог админ↔внутренний джинн по обращению (JSON-массив {role,text,at})
    thread: Mapped[str] = mapped_column(Text, default="[]")

    # Решение
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)             # new|triaged|in_progress|answered|closed|rejected
    resolution_type: Mapped[str] = mapped_column(String(20), default="")                   # code|knowledge|tool|explain|rejected
    admin_notes: Mapped[str] = mapped_column(Text, default="")
    response_to_user: Mapped[str] = mapped_column(Text, default="")                        # что помощник вернёт юзеру
    assigned_to: Mapped[int | None] = mapped_column(Integer, nullable=True)                # админ

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    auto_resolved: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # закрыто ИИ без живого админа
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
