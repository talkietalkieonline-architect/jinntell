"""
SMS Service — отправка SMS-кодов.
Провайдеры: sms.ru (основной), smsc (альт), debug (заглушка).
Настройки читаются из Redis (system:settings), перекрывая .env.
"""
import json

import httpx
import redis.asyncio as aioredis

from app.core.config import settings


async def _get_sms_settings() -> dict:
    """Получить актуальные SMS-настройки: Redis перекрывает .env"""
    result = {
        "sms_provider": settings.SMS_PROVIDER,
        "sms_ru_api_key": settings.SMS_RU_API_KEY,
        "smsc_login": settings.SMSC_LOGIN,
        "smsc_password": settings.SMSC_PASSWORD,
        "debug_mode": settings.DEBUG,
    }
    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        sys_json = await r.get("system:settings")
        await r.aclose()
        if sys_json:
            ss = json.loads(sys_json)
            if "sms_provider" in ss:
                result["sms_provider"] = ss["sms_provider"]
            if "sms_ru_api_key" in ss and ss["sms_ru_api_key"]:
                result["sms_ru_api_key"] = ss["sms_ru_api_key"]
            if "smsc_login" in ss and ss["smsc_login"]:
                result["smsc_login"] = ss["smsc_login"]
            if "smsc_password" in ss and ss["smsc_password"]:
                result["smsc_password"] = ss["smsc_password"]
            if "debug_mode" in ss:
                result["debug_mode"] = ss["debug_mode"]
    except Exception as e:
        print(f"[SMS] Redis read error: {e}")
    return result


async def send_sms_code(phone: str, code: str) -> bool:
    """
    Отправить SMS с кодом верификации.
    Возвращает True если отправлено, False если ошибка.
    В DEBUG-режиме не отправляет реально.
    """
    cfg = await _get_sms_settings()

    if cfg["debug_mode"]:
        print(f"[SMS DEBUG] {phone} → код: {code}")
        return True

    provider = cfg["sms_provider"].lower()

    if provider == "sms_ru":
        return await _send_via_sms_ru(phone, code, cfg["sms_ru_api_key"])
    elif provider == "smsc":
        return await _send_via_smsc(phone, code, cfg["smsc_login"], cfg["smsc_password"])
    else:
        print(f"[SMS] Неизвестный провайдер: {provider}, SMS не отправлено")
        return False


async def _send_via_sms_ru(phone: str, code: str, api_key: str = "") -> bool:
    """
    sms.ru — простой HTTP API.
    Документация: https://sms.ru/api/send
    """
    if not api_key:
        print("[SMS] SMS_RU_API_KEY не задан!")
        return False

    # Формируем текст
    text = f"JinnTell: ваш код {code}"

    url = "https://sms.ru/sms/send"
    params = {
        "api_id": api_key,
        "to": phone,
        "msg": text,
        "json": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            data = resp.json()

            # Успех: status_code == 100
            if data.get("status_code") == 100:
                print(f"[SMS] Отправлено на {phone}")
                return True
            else:
                print(f"[SMS] Ошибка sms.ru: {data}")
                return False
    except Exception as e:
        print(f"[SMS] Ошибка отправки: {e}")
        return False


async def _send_via_smsc(phone: str, code: str, login: str = "", password: str = "") -> bool:
    """
    smsc.ru — альтернативный провайдер.
    Документация: https://smsc.ru/api/http/
    """
    if not login or not password:
        print("[SMS] SMSC_LOGIN/SMSC_PASSWORD не заданы!")
        return False

    text = f"JinnTell: ваш код {code}"

    url = "https://smsc.ru/sys/send.php"
    params = {
        "login": login,
        "psw": password,
        "phones": phone,
        "mes": text,
        "fmt": 3,  # JSON
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            data = resp.json()

            # Успех: нет поля "error"
            if "error" not in data:
                print(f"[SMS] SMSC отправлено на {phone}")
                return True
            else:
                print(f"[SMS] Ошибка SMSC: {data}")
                return False
    except Exception as e:
        print(f"[SMS] Ошибка SMSC: {e}")
        return False
