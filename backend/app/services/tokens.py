"""
Токены JinnTell — наша внутренняя «валюта моделей» (решение владельца 2026-10-21).

- Токен ≠ токен модели: фиксированный курс TOKEN_PRICE_KOPECKS (по умолч. 1 токен = 10 коп).
  Любая генерация считается в реальных копейках (себестоимость модели + наценка) → для витрины переводится в токены.
  Дорогая модель просто «съедает» больше наших токенов; курс для пользователя не меняется.
- Токены = ПОДАРКИ (мы / спонсор / владелец джинна), под любого джинна или под конкретного.
  Не деньги: не выводятся, не передаются другим людям, сгорают (BONUS_EXPIRE_DAYS, по умолч. 60 дн).
  Хранятся как BonusGrant (копейки стоимости генерации), тратятся раньше рублей (billing.charge_generation).
- Рубли в кошельке — деньги пользователя (пополнение ЮKassa).
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, func

from app.services.settings_store import get_setting


async def _int_setting(key: str, default: int) -> int:
    try:
        v = int(float(await get_setting(key) or 0))
    except Exception:  # noqa: BLE001
        v = 0
    return v or default


async def price_kop() -> int:
    """Цена 1 токена в копейках."""
    return await _int_setting("TOKEN_PRICE_KOPECKS", 10)


async def expire_days() -> int:
    return await _int_setting("BONUS_EXPIRE_DAYS", 60)


async def tokens_for_kop(kop: int) -> int:
    """Стоимость действия в токенах для витрины: вверх и не меньше 1."""
    if not kop or kop <= 0:
        return 0
    return max(1, math.ceil(kop / await price_kop()))


async def grant(db, user_id: int, tokens: int, label: str, *, source: str = "platform",
                agent_id: Optional[int] = None, campaign_id: Optional[int] = None,
                days: Optional[int] = None):
    """Подарить токены (неденежный грант). Возвращает BonusGrant или None."""
    from app.services import billing
    tokens = int(tokens or 0)
    if tokens <= 0 or not user_id:
        return None
    kop = tokens * await price_kop()
    exp = datetime.now(timezone.utc) + timedelta(days=days or await expire_days())
    return await billing.grant_bonus(db, user_id, kop, display_tokens=tokens, label=label,
                                     agent_id=agent_id, source=source, campaign_id=campaign_id, expires_at=exp)


async def balance(db, user_id: int) -> dict:
    """Живые токены пользователя: всего и по целевым (под конкретного джинна)."""
    from app.models.bonus_grant import BonusGrant
    now = datetime.now(timezone.utc)
    rows = (await db.execute(select(BonusGrant).where(
        BonusGrant.user_id == user_id, BonusGrant.active.is_(True), BonusGrant.remaining_kopecks > 0))).scalars().all()
    p = await price_kop()
    live = [g for g in rows if not g.expires_at or g.expires_at > now]
    total = sum(int(g.remaining_kopecks) for g in live)
    soon = min((g.expires_at for g in live if g.expires_at), default=None)
    return {
        "tokens": total // p,                      # витрина вниз — не обещаем лишнего
        "token_price_kop": p,
        "nearest_expiry": soon.isoformat() if soon else None,
        "grants": [{"label": g.label, "agent_id": g.agent_id, "source": g.source,
                    "tokens": int(g.remaining_kopecks) // p,
                    "expires_at": g.expires_at.isoformat() if g.expires_at else None} for g in live],
    }


async def welcome(db, user) -> int:
    """Подарок за регистрацию (один раз). Размер — TOKEN_CONFIG.gifts.welcome, по умолч. 100."""
    import json
    if getattr(user, "welcome_gift_claimed", False) or getattr(user, "is_guest", False):
        return 0
    try:
        cfg = json.loads(await get_setting("TOKEN_CONFIG") or "{}")
    except Exception:  # noqa: BLE001
        cfg = {}
    n = int(((cfg.get("gifts") or {}).get("welcome")) or 100)
    await grant(db, user.id, n, "Подарок за регистрацию", source="platform")
    user.welcome_gift_claimed = True
    return n


async def first_topup_bonus(db, user_id: int, paid_kop: int) -> int:
    """+N% токенами к ПЕРВОМУ пополнению (FIRST_TOPUP_BONUS_PCT, по умолч. 20)."""
    from app.models.wallet_ledger import WalletLedger
    n_topups = (await db.execute(select(func.count()).select_from(WalletLedger).where(
        WalletLedger.user_id == user_id, WalletLedger.kind == "topup"))).scalar() or 0
    if n_topups != 1:  # вызывается ПОСЛЕ зачисления: ровно одно пополнение = первое
        return 0
    pct = await _int_setting("FIRST_TOPUP_BONUS_PCT", 20)
    tokens = (int(paid_kop) * pct // 100) // await price_kop()
    if tokens > 0:
        await grant(db, user_id, tokens, f"+{pct}% к первому пополнению", source="platform")
    return tokens


async def migrate_legacy(db) -> int:
    """Старое поле users.token_balance → гранты (один раз). Возвращает число перенесённых пользователей."""
    from app.models.user import User
    rows = (await db.execute(select(User).where(User.token_balance > 0))).scalars().all()
    for u in rows:
        await grant(db, u.id, int(u.token_balance), "Перенесено со старого баланса", source="platform")
        u.token_balance = 0
    return len(rows)


async def fair_use_exceeded(user_id: int) -> bool:
    """Скрытый суточный предохранитель для зарегистрированных (вместо тарифов): USER_DAILY_MSG_LIMIT, по умолч. 300.
    Считает сообщения пользователя джиннам и помощнику за сутки. Обычный человек не упрётся; бот/скрипт — да."""
    if not user_id:
        return False
    try:
        from datetime import date
        from redis import asyncio as aioredis
        from app.core.config import settings
        lim = await _int_setting("USER_DAILY_MSG_LIMIT", 300)
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            k = f"lim:u:{user_id}:{date.today().isoformat()}"
            n = await r.incr(k)
            if n == 1:
                await r.expire(k, 86400)
            return n > lim
        finally:
            await r.aclose()
    except Exception:  # noqa: BLE001 — fail-open: предохранитель не должен ломать разговор
        return False


FAIR_USE_TEXT = ("На сегодня вы очень активно общались — сработала защита от перегрузки. "
                 "Продолжим завтра 🙂 Если это нужно для работы, напишите нам — снимем ограничение.")
