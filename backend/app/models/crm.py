from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _now():
    return datetime.now(timezone.utc)


class CrmCompany(Base):
    """CRM внутреннего отдела продаж JinnTell: компания-клиент и её место в воронке.
    Воронка: new → kp (КП отправлено) → call (звонок) → talks (переговоры) → won (клиент) | lost (отказ)."""
    __tablename__ = "crm_companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    contact_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stage: Mapped[str] = mapped_column(String(20), default="new", index=True)
    source: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)   # «Вручную», «Джин Марк», метка src
    responsible_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    next_action_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_action_note: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    lost_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    is_new: Mapped[bool] = mapped_column(Boolean, default=True)                 # заявка ещё не открыта в CRM
    created_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class CrmEvent(Base):
    """История по компании: создана, заметка, КП отправлено, звонок, встреча, смена этапа, заявка от джина."""
    __tablename__ = "crm_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    kind: Mapped[str] = mapped_column(String(20))       # created|note|kp_sent|call|meeting|stage|lead
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    author_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    author_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
