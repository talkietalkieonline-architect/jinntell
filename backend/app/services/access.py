"""Проверка доступа к агенту с учётом скрытой видимости."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.agent_access import AgentAccess


async def can_access_agent(db: AsyncSession, agent: Agent, user_id: int | None) -> bool:
    """Может ли пользователь видеть/общаться с агентом (скрытые — только владелец и список доступа)."""
    if agent.visibility != "hidden":
        return True
    if user_id and agent.owner_id == user_id:
        return True
    if not user_id:
        return False
    res = await db.execute(
        select(AgentAccess.id).where(AgentAccess.agent_id == agent.id, AgentAccess.user_id == user_id)
    )
    return res.scalar_one_or_none() is not None
