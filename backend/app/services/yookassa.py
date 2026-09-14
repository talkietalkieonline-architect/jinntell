"""ЮKassa (YooKassa) — пополнение баланса пользователя. Ключи в app_settings:
YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY. Пока не заданы — пополнение отдаёт «не настроено»."""
import uuid
import base64
import httpx

API = "https://api.yookassa.ru/v3"


async def _keys():
    from app.services.settings_store import get_setting
    shop = (await get_setting("YOOKASSA_SHOP_ID")) or ""
    secret = (await get_setting("YOOKASSA_SECRET_KEY")) or ""
    return shop.strip(), secret.strip()


def _auth_header(shop: str, secret: str) -> str:
    raw = f"{shop}:{secret}".encode()
    return "Basic " + base64.b64encode(raw).decode()


async def create_payment(amount_rub: float, description: str, return_url: str, user_id: int) -> dict:
    """Создать платёж. Возвращает {ok, confirmation_url, payment_id} либо {ok:False, error}."""
    shop, secret = await _keys()
    if not shop or not secret:
        return {"ok": False, "error": "Пополнение пока не настроено (нет ключей ЮKassa)."}
    body = {
        "amount": {"value": f"{float(amount_rub):.2f}", "currency": "RUB"},
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": return_url},
        "description": description[:120],
        "metadata": {"user_id": str(user_id)},
    }
    headers = {
        "Authorization": _auth_header(shop, secret),
        "Idempotence-Key": str(uuid.uuid4()),
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{API}/payments", json=body, headers=headers)
            if r.status_code not in (200, 201):
                return {"ok": False, "error": f"ЮKassa {r.status_code}: {r.text[:200]}"}
            data = r.json()
            return {"ok": True, "payment_id": data.get("id"),
                    "confirmation_url": (data.get("confirmation") or {}).get("confirmation_url")}
    except Exception as e:
        return {"ok": False, "error": f"ЮKassa недоступна: {str(e)[:150]}"}


async def fetch_payment(payment_id: str) -> dict:
    """Перепроверить статус платежа на стороне ЮKassa (не доверяем телу вебхука)."""
    shop, secret = await _keys()
    if not shop or not secret:
        return {}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{API}/payments/{payment_id}",
                                  headers={"Authorization": _auth_header(shop, secret)})
            if r.status_code == 200:
                return r.json()
    except Exception as e:
        print(f"[yookassa] fetch err: {e}")
    return {}
