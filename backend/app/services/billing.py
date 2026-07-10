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
