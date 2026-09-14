"""Магазин: обои / живые обои / голоса. Оплата с рублёвого баланса (balance_kopecks).
Каталог хранится в app_settings STORE_ITEMS (JSON), админ-редактируемо. Владение — users.owned_store_items."""
import json
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/store", tags=["store"])

# Дефолтный каталог (пока нет своих ассетов — превью=эмодзи/градиент; premium=платно).
_DEFAULT_STORE = [
    {"id": "bg_soft", "category": "wallpaper", "name": "Мягкий", "preview": "🌤", "price_rub": 0, "premium": False, "payload_kind": "background", "payload": "soft"},
    {"id": "bg_aurora", "category": "wallpaper", "name": "Аврора", "preview": "🌌", "price_rub": 0, "premium": False, "payload_kind": "background", "payload": "aurora"},
    {"id": "bg_lava", "category": "live_wallpaper", "name": "Лава-лампа", "preview": "🫧", "price_rub": 149, "premium": True, "payload_kind": "background", "payload": "lava"},
    {"id": "bg_kenburns", "category": "live_wallpaper", "name": "Живой пейзаж", "preview": "🏞", "price_rub": 149, "premium": True, "payload_kind": "background", "payload": "kenburns"},
    {"id": "voice_male_low", "category": "voice", "name": "Мужской (низкий)", "preview": "🎙", "price_rub": 0, "premium": False, "payload_kind": "voice", "payload": "male_low"},
    {"id": "voice_female_soft", "category": "voice", "name": "Женский (мягкий)", "preview": "🎙", "price_rub": 0, "premium": False, "payload_kind": "voice", "payload": "female_soft"},
    {"id": "voice_premium_1", "category": "voice", "name": "Премиум-голос «Бархат»", "preview": "✨", "price_rub": 99, "premium": True, "payload_kind": "voice", "payload": "premium_velvet"},
]


async def _get_items() -> list:
    from app.services.settings_store import get_setting
    raw = await get_setting("STORE_ITEMS")
    try:
        items = json.loads(raw) if raw else []
    except Exception:
        items = []
    return items or _DEFAULT_STORE


async def _currency_symbol() -> str:
    from app.services.settings_store import get_setting
    code = ((await get_setting("WALLET_CURRENCY")) or "RUB").strip().upper()
    return {"RUB": "₽", "GEL": "₾", "USD": "$", "EUR": "€", "AMD": "֏"}.get(code, code)


def _owned(user) -> list:
    try:
        return json.loads(user.owned_store_items or "[]")
    except Exception:
        return []


@router.get("")
async def store_list(user: User = Depends(get_current_user)):
    owned = _owned(user)
    items = await _get_items()
    return {
        "currency": await _currency_symbol(),
        "balance_rub": round(int(user.balance_kopecks or 0) / 100, 2),
        "owned": owned,
        "items": items,
    }


@router.post("/buy")
async def store_buy(body: dict = Body(...), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    item_id = (body.get("item_id") or "").strip()
    items = await _get_items()
    it = next((x for x in items if x.get("id") == item_id), None)
    if not it:
        raise HTTPException(404, "позиция не найдена")
    owned = _owned(user)
    if item_id in owned:
        return {"ok": True, "already": True, "owned": owned}
    price_kop = round(float(it.get("price_rub") or 0) * 100)
    if price_kop > 0:
        if int(user.balance_kopecks or 0) < price_kop:
            raise HTTPException(400, "Недостаточно средств — пополните баланс")
        u = await db.get(User, user.id)
        u.balance_kopecks = (u.balance_kopecks or 0) - price_kop
        try:
            from app.models.wallet_ledger import WalletLedger
            db.add(WalletLedger(user_id=user.id, kind="spend", amount_kopecks=-price_kop,
                                balance_after=int(u.balance_kopecks), description=f"Магазин: {it.get('name','')}"))
        except Exception:
            pass
        owned = _owned(u)
        owned.append(item_id)
        u.owned_store_items = json.dumps(owned, ensure_ascii=False)
        await db.commit()
        return {"ok": True, "owned": owned, "balance_rub": round(int(u.balance_kopecks or 0) / 100, 2)}
    # бесплатное — просто в наличии
    u = await db.get(User, user.id)
    owned = _owned(u)
    owned.append(item_id)
    u.owned_store_items = json.dumps(owned, ensure_ascii=False)
    await db.commit()
    return {"ok": True, "owned": owned, "balance_rub": round(int(u.balance_kopecks or 0) / 100, 2)}


@router.post("/apply")
async def store_apply(body: dict = Body(...), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    item_id = (body.get("item_id") or "").strip()
    items = await _get_items()
    it = next((x for x in items if x.get("id") == item_id), None)
    if not it:
        raise HTTPException(404, "позиция не найдена")
    owned = _owned(user)
    if float(it.get("price_rub") or 0) > 0 and item_id not in owned:
        raise HTTPException(403, "Сначала купите эту позицию")
    u = await db.get(User, user.id)
    kind = it.get("payload_kind")
    payload = it.get("payload") or ""
    if kind == "background":
        u.background = str(payload)[:50]
    elif kind == "bg_url":
        u.custom_bg_url = str(payload)
    elif kind == "voice":
        u.assistant_voice = str(payload)[:50]
    else:
        raise HTTPException(400, "нечего применять")
    await db.commit()
    return {"ok": True, "applied": kind, "value": payload}
