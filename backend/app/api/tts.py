"""API синтеза речи через Yandex SpeechKit (ключ остаётся на сервере)."""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
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


@router.post("")
async def synthesize(body: TTSRequest, user: User = Depends(get_current_user)):
    """Синтез речи: текст -> аудио (Ogg Opus)."""
    if not settings.YANDEX_SPEECHKIT_API_KEY:
        raise HTTPException(503, "TTS не настроен")
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Пустой текст")

    data = {
        "text": text[:5000],
        "lang": "ru-RU",
        "voice": body.voice or "ermil",
        "emotion": body.emotion or "neutral",
        "speed": str(max(0.1, min(3.0, body.speed or 1.0))),
        "format": "oggopus",
    }
    if settings.YANDEX_SPEECHKIT_FOLDER_ID:
        data["folderId"] = settings.YANDEX_SPEECHKIT_FOLDER_ID

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                settings.YANDEX_SPEECHKIT_URL,
                headers={"Authorization": f"Api-Key {settings.YANDEX_SPEECHKIT_API_KEY}"},
                data=data,
            )
    except Exception as e:
        raise HTTPException(502, f"SpeechKit недоступен: {e}")

    if r.status_code != 200:
        raise HTTPException(502, f"SpeechKit error {r.status_code}: {r.text[:200]}")

    return Response(content=r.content, media_type="audio/ogg")
