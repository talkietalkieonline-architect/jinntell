"""API распознавания речи (STT): аудио -> текст. Провайдер настраивается в админке."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.deps import get_current_user
from app.models.user import User
from app.services import stt as stt_service

router = APIRouter(prefix="/api/stt", tags=["stt"])


@router.post("")
async def recognize(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Короткая запись (≤ ~30 сек) -> распознанный текст."""
    audio = await file.read()
    if not audio:
        raise HTTPException(400, "Пустое аудио")
    if len(audio) > 5 * 1024 * 1024:
        raise HTTPException(413, "Слишком длинная запись (макс ~30 сек)")
    try:
        text = await stt_service.transcribe(audio, file.content_type or "")
    except Exception as e:
        raise HTTPException(502, f"STT: {e}")
    return {"text": text}
