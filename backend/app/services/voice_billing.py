"""Списание за ГОЛОС (распознавание речи + озвучка Яндекс SpeechKit) — тем же путём, что и нейросеть.

Платит тот же плательщик, что за ответы джинна (billing.resolve_payer): за бизнес-джинна — контрагент,
за платного специалиста — пользователь; помощник/core/бесплатные — никто (расход несём мы, он виден в счётчиках).
Ставки продажи — в админке «Модели» (VOICE_SELL_STT_CALL ₽ за фразу, VOICE_SELL_TTS_1K ₽ за 1000 знаков);
сверху — та же «наценка бизнесу» (BIZ_MARKUP) и индивидуальные исключения (PRICE_OVERRIDES), что у нейросети.
Ошибки списания никогда не ломают сам голос.
"""
import json

DEFAULT_STT_CALL = 1.0   # ₽ за одну распознанную фразу (наша оценка себестоимости ≈0,5)
DEFAULT_TTS_1K = 1.0     # ₽ за 1000 знаков озвучки (наша оценка себестоимости ≈0,4)


async def voice_rates() -> dict:
    from app.services.settings_store import get_setting

    async def f(key, dflt):
        try:
            v = await get_setting(key)
            return float(v) if v not in (None, "") else dflt
        except Exception:  # noqa: BLE001
            return dflt
    return {"stt_call": await f("VOICE_SELL_STT_CALL", DEFAULT_STT_CALL),
            "tts_1k": await f("VOICE_SELL_TTS_1K", DEFAULT_TTS_1K)}


async def charge_voice(agent_id, user_id, kind: str, units: int) -> None:
    """kind: 'stt' (units = фраз) | 'tts' (units = знаков)."""
    if not agent_id or not units or units <= 0:
        return
    try:
        from app.core.database import async_session
        from app.models.agent import Agent
        from app.services.billing import resolve_payer, charge_generation
        from app.services.settings_store import get_setting
        async with async_session() as db:
            agent = await db.get(Agent, int(agent_id))
            if not agent:
                return
            payer_type, payer_id = resolve_payer(agent, user_id or 0)
            if payer_type not in ("contractor", "user") or not payer_id:
                return
            rates = await voice_rates()
            if kind == "stt":
                rub = rates["stt_call"] * units
                desc = f"{agent.name}: голос — распознавание"
            else:
                rub = rates["tts_1k"] * units / 1000.0
                desc = f"{agent.name}: голос — озвучка {units} знаков"
            if payer_type == "contractor":
                rub *= float(await get_setting("BIZ_MARKUP") or 1) or 1
            ov = json.loads(await get_setting("PRICE_OVERRIDES") or "{}").get(f"{payer_type}:{payer_id}")
            if ov:
                if ov.get("free"):
                    return
                if ov.get("mult") is not None:
                    rub *= float(ov.get("mult"))
            kop = max(1, round(rub * 100)) if rub > 0 else 0
            if kop:
                await charge_generation(db, payer_type, payer_id, agent.id, kop, desc)
                await db.commit()
    except Exception as e:  # noqa: BLE001
        print(f"[voice_billing] {kind} charge skip: {e}")
