"""Yandex Cloud Billing — баланс/потребление через сервис-аккаунт.

Поток: JWT (подписан приватным ключом SA, PS256) → обмен на IAM-токен →
запрос к Billing API. PS256 подписываем напрямую через cryptography
(python-jose PS256 не поддерживает). Без новых зависимостей.

Конфиг (из админ-настроек или .env):
  YANDEX_SA_KEY_JSON        — авторизованный ключ SA (JSON: id, service_account_id, private_key)
  YANDEX_BILLING_ACCOUNT_ID — ID биллинг-аккаунта
"""
import base64
import json
import time
import logging

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

_log = logging.getLogger("yandex_billing")
_iam_cache: dict = {}  # service_account_id -> {"token": str, "exp": float}


def _b64url(b: bytes) -> bytes:
    return base64.urlsafe_b64encode(b).rstrip(b"=")


def _make_jwt(sa: dict) -> str:
    now = int(time.time())
    header = {"alg": "PS256", "typ": "JWT", "kid": sa["id"]}
    payload = {
        "aud": "https://iam.api.cloud.yandex.net/iam/v1/tokens",
        "iss": sa["service_account_id"],
        "iat": now,
        "exp": now + 3600,
    }
    signing_input = (
        _b64url(json.dumps(header, separators=(",", ":")).encode())
        + b"."
        + _b64url(json.dumps(payload, separators=(",", ":")).encode())
    )
    pem = sa["private_key"]
    pem = pem[pem.index("-----BEGIN"):]  # отрезаем префикс "PLEASE DO NOT REMOVE..."
    key = serialization.load_pem_private_key(pem.encode(), password=None)
    sig = key.sign(
        signing_input,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
        hashes.SHA256(),
    )
    return (signing_input + b"." + _b64url(sig)).decode()


async def _get_iam_token(sa_key_json: str) -> str:
    sa = json.loads(sa_key_json)
    said = sa.get("service_account_id", "")
    now = time.time()
    cached = _iam_cache.get(said)
    if cached and cached["exp"] > now + 60:
        return cached["token"]
    token_jwt = _make_jwt(sa)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post("https://iam.api.cloud.yandex.net/iam/v1/tokens", json={"jwt": token_jwt})
    r.raise_for_status()
    iam = r.json()["iamToken"]
    _iam_cache[said] = {"token": iam, "exp": now + 3600}  # IAM-токен живёт ~12ч, кэшируем 1ч
    return iam


async def get_billing(sa_key_json: str, billing_account_id: str) -> dict:
    """Возвращает объект биллинг-аккаунта: {id, name, balance, currency, active, ...}."""
    iam = await _get_iam_token(sa_key_json)
    url = f"https://billing.api.cloud.yandex.net/billing/v1/billingAccounts/{billing_account_id}"
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(url, headers={"Authorization": f"Bearer {iam}"})
    r.raise_for_status()
    return r.json()
