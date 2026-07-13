"""Резолвер плательщика за токены джинна (см. правила монетизации)."""


def resolve_payer(agent, chatter_user_id: int = 0):
    """Возвращает (payer_type, payer_id): contractor | user | free."""
    at = getattr(agent, "agent_type", "") or ""
    if at == "core":
        return ("free", None)
    if at == "business":
        return ("contractor", getattr(agent, "contractor_id", None) or getattr(agent, "owner_id", None))
    if at == "personal":
        return ("user", getattr(agent, "owner_id", None))
    if getattr(agent, "visibility", "") == "hidden":  # корпоративный
        return ("contractor", getattr(agent, "contractor_id", None) or getattr(agent, "owner_id", None))
    if getattr(agent, "is_paid", False):  # платный специалист
        return ("user", chatter_user_id or None)
    return ("free", None)  # бесплатный специалист


async def payer_balance(payer_type, payer_id) -> int:
    """Баланс плательщика в копейках (unknown -> 1, чтобы не блокировать)."""
    if not payer_id:
        return 1
    from app.core.database import async_session
    async with async_session() as db:
        if payer_type == "contractor":
            from app.models.contractor import Contractor
            c = await db.get(Contractor, payer_id)
            return int(c.balance_kopecks) if c and c.balance_kopecks is not None else 0
        if payer_type == "user":
            from app.models.user import User
            u = await db.get(User, payer_id)
            return int(u.balance_kopecks) if u and u.balance_kopecks is not None else 0
    return 1
