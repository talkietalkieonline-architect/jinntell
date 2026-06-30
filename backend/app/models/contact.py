"""Контакты пользователя (адресная книга людей)."""
from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("owner_user_id", "contact_user_id", name="uq_contact"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    contact_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
