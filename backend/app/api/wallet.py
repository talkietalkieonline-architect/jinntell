"""Кошелёк пользователя — РУБЛИ (юзер видит деньги, не токены).
Баланс + история списаний/пополнений + бонусы + пополнение через ЮKassa."""
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


def _rub(kop) -> float:
    return round(int(kop or 0) / 100, 2)


async def _currency() -> dict:
    """Валюта кошелька. Пока глобально (RUB/₽). На старте в Грузии — GEL/₾ (позже per-user).
    Провайдер пополнения привязан к валюте: RUB→ЮKassa; GEL→другой провайдер (заложить в Грузии)."""
    from app.services.settings_store import get_setting
    code = ((await get_setting("WALLET_CURRENCY")) or "RUB").strip().upper()
    sym = {"RUB": "₽", "GEL": "₾", "USD": "$", "EUR": "€", "AMD": "֏"}.get(code, code)
    return {"code": code, "symbol": sym}


@router.get("")
async def get_wallet(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.wallet_ledger import WalletLedger
    from app.models.bonus_grant import BonusGrant
    cur = await _currency()
    rows = (await db.execute(select(WalletLedger).where(WalletLedger.user_id == user.id)
                             .order_by(desc(WalletLedger.created_at)).limit(50))).scalars().all()
    grants = (await db.execute(select(BonusGrant).where(BonusGrant.user_id == user.id,
                               BonusGrant.active == True, BonusGrant.remaining_kopecks > 0))).scalars().all()
    return {
        "currency": cur["symbol"], "currency_code": cur["code"],
        "balance_rub": _rub(user.balance_kopecks),
        "balance_kopecks": int(user.balance_kopecks or 0),
        "bonuses": [{
            "label": g.label, "agent_id": g.agent_id, "display_tokens": g.display_tokens,
            "remaining_rub": _rub(g.remaining_kopecks), "source": g.source,
        } for g in grants],
        "history": [{
            "kind": r.kind, "amount_rub": _rub(r.amount_kopecks), "balance_after_rub": _rub(r.balance_after),
            "agent_id": r.agent_id, "description": r.description,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows],
    }


@router.post("/topup")
async def topup(body: dict = Body(...), request: Request = None, user: User = Depends(get_current_user)):
    from app.services import yookassa
    try:
        amount = float(body.get("amount_rub") or 0)
    except Exception:
        amount = 0
    if amount < 10:
        raise HTTPException(400, "Минимум 10 ₽")
    if amount > 100000:
        raise HTTPException(400, "Слишком большая сумма")
    origin = ""
    try:
        origin = (request.headers.get("origin") or "").rstrip("/") if request else ""
    except Exception:
        origin = ""
    return_url = (origin or "https://jinntell.ru") + "/wallet"
    res = await yookassa.create_payment(amount, f"Пополнение баланса JinnTell (user {user.id})", return_url, user.id)
    if not res.get("ok"):
        raise HTTPException(400, res.get("error") or "Не удалось создать платёж")
    return {"confirmation_url": res.get("confirmation_url"), "payment_id": res.get("payment_id")}


@router.post("/yookassa-webhook")
async def yookassa_webhook(body: dict = Body(...), db: AsyncSession = Depends(get_db)):
    """ЮKassa уведомляет об оплате. Не доверяем телу — перепроверяем статус в API, затем зачисляем."""
    from app.services import yookassa, billing
    from app.models.wallet_ledger import WalletLedger
    try:
        event = body.get("event") or ""
        obj = body.get("object") or {}
        payment_id = obj.get("id")
        if event != "payment.succeeded" or not payment_id:
            return {"ok": True}  # игнорируем прочее, отвечаем 200
        # идемпотентность: уже зачисляли этот payment_id?
        seen = (await db.execute(select(WalletLedger).where(
            WalletLedger.kind == "topup", WalletLedger.ref == payment_id))).first()
        if seen:
            return {"ok": True}
        pay = await yookassa.fetch_payment(payment_id)
        if (pay.get("status") != "succeeded") or not (pay.get("paid")):
            return {"ok": True}
        uid = int(((pay.get("metadata") or {}).get("user_id")) or 0)
        val = float((pay.get("amount") or {}).get("value") or 0)
        if uid and val > 0:
            await billing.credit(db, uid, round(val * 100), kind="topup",
                                 description="Пополнение (ЮKassa)", ref=payment_id)
            await db.commit()
        return {"ok": True}
    except Exception as e:
        print(f"[wallet] webhook err: {e}")
        return {"ok": True}


@router.get("/price/{agent_id}")
async def price_hint(agent_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Ориентир стоимости для юзера: ~₽ за сообщение и за документ у этого джина."""
    from app.models.agent import Agent
    import json as _j
    from app.services.settings_store import get_setting
    a = await db.get(Agent, agent_id)
    if not a:
        raise HTTPException(404, "джинн не найден")
    if not getattr(a, "is_paid", False):
        return {"paid": False, "note": "Бесплатный джинн — списаний нет."}
    rates = _j.loads(await get_setting("MODEL_RATES") or "{}")
    rr = rates.get(a.llm_model) or rates.get("default") or {}
    d = rates.get("default") or {}

    def _pick(f, legacy):
        v = rr.get(f)
        if v in (None, ""):
            v = d.get(f)
        if v in (None, ""):
            v = rr.get(legacy) if rr.get(legacy) not in (None, "") else d.get(legacy)
        return float(v or 0)
    sell_in = _pick("sell_in", "sell")
    sell_out = _pick("sell_out", "sell")
    # типовое сообщение ~600 вход / 300 выход; документ ~1500 / 1200
    msg = (600 / 1_000_000 * sell_in + 300 / 1_000_000 * sell_out)
    doc = (1500 / 1_000_000 * sell_in + 1200 / 1_000_000 * sell_out)
    return {"paid": True, "per_message_rub": round(msg, 2), "per_document_rub": round(doc, 2),
            "note": "Ориентир — фактически спишется по числу токенов."}


@router.get("/promos")
async def wallet_promos(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Активные спонсорские промо по джиннам — чтобы в Городе показать «🎁 бонус»."""
    from app.models.sponsor_campaign import SponsorCampaign
    import datetime as _dt
    now = _dt.datetime.now(_dt.timezone.utc)
    rows = (await db.execute(select(SponsorCampaign).where(SponsorCampaign.active == True))).scalars().all()
    out = []
    for c in rows:
        try:
            if c.starts_at and c.starts_at > now:
                continue
            if c.ends_at and c.ends_at < now:
                continue
        except Exception:
            pass
        if not c.agent_id:
            continue
        if int(c.spent_kopecks or 0) + int(c.bonus_kopecks or 0) > int(c.budget_kopecks or 0):
            continue  # бюджет исчерпан
        out.append({"agent_id": c.agent_id, "sponsor_name": c.sponsor_name,
                    "bonus_tokens": c.bonus_tokens, "message": c.message})
    return {"promos": out}
