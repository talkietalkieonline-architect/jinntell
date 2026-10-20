"""API синтеза речи через Yandex SpeechKit (ключ остаётся на сервере)."""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from typing import Optional

from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/tts", tags=["tts"])


class TTSRequest(BaseModel):
    text: str
    voice: str = "ermil"
    emotion: str = "neutral"
    speed: float = 1.0
    agent_id: Optional[int] = None  # чей голос: озвучка ответа джинна идёт в счёт его плательщику


# Голоса Яндекс SpeechKit. Устаревшие/выдуманные значения (напр. дефолт профиля "male_low") Яндекс отклоняет
# ошибкой 400 → тишина у пользователя. Поэтому неизвестный голос подменяем рабочим.
_YANDEX_VOICES = {"alena", "filipp", "ermil", "jane", "madirus", "omazh", "zahar", "dasha", "julia",
                  "lera", "masha", "marina", "alexander", "kirill", "anton"}
_VOICE_ALIASES = {"male_low": "filipp", "male": "filipp", "male_high": "ermil", "female": "alena",
                  "female_high": "jane"}


def _safe_voice(v: str) -> str:
    v = (v or "").strip().lower()
    if v in _YANDEX_VOICES:
        return v
    return _VOICE_ALIASES.get(v, "alena")


@router.post("")
async def synthesize(body: TTSRequest, user: User = Depends(get_current_user)):
    """Синтез речи: текст -> аудио (Ogg Opus)."""
    from app.services.settings_store import get_setting
    api_key = await get_setting("YANDEX_SPEECHKIT_API_KEY")
    folder = await get_setting("YANDEX_SPEECHKIT_FOLDER_ID")
    if not api_key:
        raise HTTPException(503, "TTS не настроен")
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Пустой текст")

    base = {
        "text": text[:5000],
        "lang": "ru-RU",
        "voice": _safe_voice(body.voice or "ermil"),
        "speed": str(max(0.1, min(3.0, body.speed or 1.0))),
        "format": "oggopus",
    }
    if folder:
        base["folderId"] = folder

    headers = {"Authorization": f"Api-Key {api_key}"}
    emotion = body.emotion or "neutral"

    async def _post(emo: str):
        data = dict(base)
        if emo and emo != "neutral":
            data["emotion"] = emo
        async with httpx.AsyncClient(timeout=30) as client:
            return await client.post(settings.YANDEX_SPEECHKIT_URL, headers=headers, data=data)

    try:
        r = await _post(emotion)
        # Если голос не поддерживает эмоцию — повторяем без неё
        if r.status_code != 200 and emotion != "neutral":
            r = await _post("neutral")
    except Exception as e:
        raise HTTPException(502, f"SpeechKit недоступен: {e}")

    try:
        if r.status_code == 200:
            from app.services import yandex_meter
            await yandex_meter.add("tts_chars", len(text))
    except Exception:
        pass

    if r.status_code != 200:
        raise HTTPException(502, f"SpeechKit error {r.status_code}: {r.text[:200]}")

    if body.agent_id:
        from app.services.voice_billing import charge_voice
        await charge_voice(body.agent_id, user.id, "tts", len(text[:5000]))

    return Response(content=r.content, media_type="audio/ogg")
