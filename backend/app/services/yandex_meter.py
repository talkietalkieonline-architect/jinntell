"""Само-метринг расхода Yandex-инструментов (TTS/STT/эмбеддинги).

Redis-счётчики (атомарный INCRBY) — без миграций БД. Показывается в Диспетчерской
(admin /balances). Тарифы для ₽-оценки настраиваются в админ-настройках (дефолты — ориентир).
"""
import datetime
import logging

from app.core.config import settings

_log = logging.getLogger("yandex_meter")


def _month() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m")


async def _redis():
    import redis.asyncio as aioredis
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


async def add(service: str, units: int) -> None:
    """service: tts_chars | stt_calls | emb_units. Тихо игнорирует ошибки (учёт не должен ломать вызов)."""
    try:
        units = int(units)
        if units <= 0:
            return
        r = await _redis()
        m = _month()
        await r.incrby(f"ymeter:{service}:{m}", units)
        await r.incrby(f"ymeter:{service}:total", units)
        try:
            await r.aclose()
        except Exception:
            pass
    except Exception as e:
        _log.debug("meter skip %s: %s", service, e)


async def _rate(key: str, default: float) -> float:
    from app.services.settings_store import get_setting
    try:
        v = await get_setting(key)
        return float(v) if v else default
    except Exception:
        return default


async def report() -> dict:
    """Метрики текущего месяца + ₽-оценка по (настраиваемым) тарифам."""
    m = _month()
    r = await _redis()

    async def g(svc: str) -> int:
        v = await r.get(f"ymeter:{svc}:{m}")
        return int(v) if v else 0

    tts = await g("tts_chars")
    stt = await g("stt_calls")
    emb = await g("emb_units")
    try:
        await r.aclose()
    except Exception:
        pass

    rate_tts = await _rate("YM_RATE_TTS_1K", 0.4)    # ₽ за 1000 символов синтеза
    rate_stt = await _rate("YM_RATE_STT_CALL", 0.5)  # ₽ за одно распознавание
    rate_emb = await _rate("YM_RATE_EMB_1K", 0.2)    # ₽ за 1000 эмбеддингов
    return {
        "month": m,
        "tts_chars": tts, "tts_cost": round(tts / 1000 * rate_tts, 2),
        "stt_calls": stt, "stt_cost": round(stt * rate_stt, 2),
        "emb_units": emb, "emb_cost": round(emb / 1000 * rate_emb, 2),
    }
