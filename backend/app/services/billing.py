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
            money = int(u.balance_kopecks) if u and u.balance_kopecks is not None else 0
            # бонусы тоже считаются наличием средств (не блокируем, если есть бонус)
            try:
                from app.models.bonus_grant import BonusGrant
                from sqlalchemy import select, func as _f
                bonus = (await db.execute(select(_f.coalesce(_f.sum(BonusGrant.remaining_kopecks), 0))
                                          .where(BonusGrant.user_id == payer_id, BonusGrant.active == True))).scalar() or 0
            except Exception:
                bonus = 0
            return money + int(bonus)
    return 1


async def charge_generation(db, payer_type, payer_id, agent_id, kop: int, description: str = ""):
    """Списать стоимость генерации: у юзера СНАЧАЛА бонусы (привязанные к джину → общие), потом рубли.
    Пишет строки в wallet_ledger; расход бонуса из кампании уменьшает её бюджет. Всё в одной сессии db."""
    if not kop or kop <= 0 or not payer_id:
        return
    from app.models.wallet_ledger import WalletLedger
    if payer_type == "contractor":
        from app.models.contractor import Contractor
        c = await db.get(Contractor, payer_id)
        if c:
            c.balance_kopecks = (c.balance_kopecks or 0) - kop
            db.add(WalletLedger(contractor_id=payer_id, kind="spend", amount_kopecks=-kop,
                                balance_after=int(c.balance_kopecks), agent_id=agent_id, description=description))
        return
    if payer_type != "user":
        return
    from app.models.user import User
    remaining = int(kop)
    # 1) бонусные гранты
    try:
        from app.models.bonus_grant import BonusGrant
        from app.models.sponsor_campaign import SponsorCampaign
        from sqlalchemy import select
        import datetime as _dt
        now = _dt.datetime.now(_dt.timezone.utc)
        grants = (await db.execute(select(BonusGrant).where(
            BonusGrant.user_id == payer_id, BonusGrant.active == True,
            BonusGrant.remaining_kopecks > 0))).scalars().all()

        def _prio(g):
            return (0 if (agent_id and g.agent_id == agent_id) else 1, g.id)

        for g in sorted(grants, key=_prio):
            if remaining <= 0:
                break
            try:
                if g.expires_at and g.expires_at < now:
                    continue
            except Exception:
                pass
            if g.agent_id and agent_id and g.agent_id != agent_id:
                continue  # грант привязан к другому джину
            take = min(int(g.remaining_kopecks), remaining)
            if take <= 0:
                continue
            g.remaining_kopecks = int(g.remaining_kopecks) - take
            remaining -= take
            if g.remaining_kopecks <= 0:
                g.active = False
            db.add(WalletLedger(user_id=payer_id, kind="bonus_spend", amount_kopecks=-take,
                                agent_id=agent_id, description=(f"{description} · бонус {g.label}".strip(" ·")),
                                ref=f"grant:{g.id}"))
            if g.campaign_id:
                camp = await db.get(SponsorCampaign, g.campaign_id)
                if camp:
                    camp.spent_kopecks = int(camp.spent_kopecks or 0) + take
    except Exception as _e:
        print(f"[billing] bonus charge err: {_e}")
    # 2) остаток — с денежного баланса (рубли)
    if remaining > 0:
        u = await db.get(User, payer_id)
        if u:
            u.balance_kopecks = (u.balance_kopecks or 0) - remaining
            db.add(WalletLedger(user_id=payer_id, kind="spend", amount_kopecks=-remaining,
                                balance_after=int(u.balance_kopecks), agent_id=agent_id, description=description))


async def credit(db, user_id: int, kop: int, kind: str = "topup", description: str = "", ref: str = ""):
    """Начислить рубли пользователю (пополнение/возврат/корректировка). Возвращает новый баланс (коп)."""
    from app.models.user import User
    from app.models.wallet_ledger import WalletLedger
    u = await db.get(User, user_id)
    if not u:
        return None
    u.balance_kopecks = (u.balance_kopecks or 0) + int(kop)
    db.add(WalletLedger(user_id=user_id, kind=kind, amount_kopecks=int(kop),
                        balance_after=int(u.balance_kopecks), description=description, ref=ref))
    return int(u.balance_kopecks)


async def grant_bonus(db, user_id: int, kopecks: int, display_tokens: int = 0, label: str = "",
                      agent_id=None, source: str = "platform", campaign_id=None, expires_at=None):
    """Выдать бонусный (неденежный) грант. Тратится ПЕРВЫМ, не выводится."""
    from app.models.bonus_grant import BonusGrant
    from app.models.wallet_ledger import WalletLedger
    g = BonusGrant(user_id=user_id, agent_id=agent_id, label=label, remaining_kopecks=int(kopecks),
                   initial_kopecks=int(kopecks), display_tokens=int(display_tokens or 0),
                   source=source, campaign_id=campaign_id, expires_at=expires_at)
    db.add(g)
    await db.flush()
    db.add(WalletLedger(user_id=user_id, kind="bonus_grant", amount_kopecks=int(kopecks), agent_id=agent_id,
                        description=(f"Бонус {label}".strip()), ref=(f"campaign:{campaign_id}" if campaign_id else source)))
    return g


async def active_campaign_for(db, agent_id):
    """Активная спонсорская кампания для джина (в окне дат, с остатком бюджета)."""
    if not agent_id:
        return None
    try:
        from app.models.sponsor_campaign import SponsorCampaign
        from sqlalchemy import select
        import datetime as _dt
        now = _dt.datetime.now(_dt.timezone.utc)
        rows = (await db.execute(select(SponsorCampaign).where(
            SponsorCampaign.agent_id == agent_id, SponsorCampaign.active == True))).scalars().all()
        for c in rows:
            try:
                if c.starts_at and c.starts_at > now:
                    continue
                if c.ends_at and c.ends_at < now:
                    continue
            except Exception:
                pass
            if int(c.spent_kopecks or 0) + int(c.bonus_kopecks or 0) > int(c.budget_kopecks or 0):
                continue  # бюджета не хватит на ещё один грант
            return c
    except Exception as _e:
        print(f"[billing] active_campaign err: {_e}")
    return None


async def maybe_grant_sponsor(db, user_id, agent_id):
    """При первом использовании спонсируемого джина — выдать грант один раз на юзера+кампанию."""
    if not user_id or not agent_id:
        return None
    camp = await active_campaign_for(db, agent_id)
    if not camp:
        return None
    try:
        from app.models.bonus_grant import BonusGrant
        from sqlalchemy import select
        existing = (await db.execute(select(BonusGrant).where(
            BonusGrant.user_id == user_id, BonusGrant.campaign_id == camp.id))).first()
        if existing:
            return None
        g = await grant_bonus(db, user_id, int(camp.bonus_kopecks or 0), display_tokens=int(camp.bonus_tokens or 0),
                              label=camp.sponsor_name or "Спонсор", agent_id=agent_id, source="sponsor",
                              campaign_id=camp.id)
        return {"granted": True, "sponsor": camp.sponsor_name, "tokens": int(camp.bonus_tokens or 0),
                "message": camp.message or ""}
    except Exception as _e:
        print(f"[billing] maybe_grant_sponsor err: {_e}")
        return None
