"""Список доступа к скрытому агенту: какие пользователи видят корпоративного/внутреннего джинна."""
from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentAccess(Base):
    __tablename__ = "agent_access"
    __table_args__ = (UniqueConstraint("agent_id", "user_id", name="uq_agent_access"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id"), index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
