"""Генерация видео (Wan i2v) + интро-ролики визиток. Тумблер VIDEO_GEN_ENABLED (админ)."""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_admin_user
from app.models.agent import Agent
from app.models.user import User
from app.services import wan_video

router = APIRouter(prefix="/api/video", tags=["video"])


def _public(url: str) -> str:
    """Абсолютный публично-доступный URL для серверов Wan."""
    u = (url or "").strip()
    if not u:
        return ""
    if u.startswith("http://") or u.startswith("https://"):
        return u
    return "https://jinntell.ru" + (u if u.startswith("/") else "/" + u)


@router.get("/status")
async def video_status():
    return {"enabled": await wan_video.enabled()}


@router.post("/generate")
async def generate(body: dict = Body(...), user: User = Depends(get_current_user)):
    """Сгенерировать видео из изображения (для теста/ручной генерации). Гейт VIDEO_GEN_ENABLED."""
    if not await wan_video.enabled():
        raise HTTPException(403, "Видеогенерация выключена администратором.")
    img = _public(body.get("image_url") or "")
    if not img:
        raise HTTPException(400, "Нужна ссылка на изображение.")
    url = await wan_video.generate_i2v(img, (body.get("prompt") or "").strip())
    if not url:
        raise HTTPException(502, "Не удалось сгенерировать видео.")
    url = await wan_video.rehost(url) or url
    return {"video_url": url}


@router.post("/agent/{agent_id}/intro")
async def gen_agent_intro(agent_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Сгенерировать интро-ролик визитки джина из его фото и сохранить в intro_video_url."""
    if not await wan_video.enabled():
        raise HTTPException(403, "Видеогенерация выключена.")
    a = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Джинн не найден")
    photo = _public(getattr(a, "photo_url", "") or getattr(a, "appearance_face", "") or "")
    if not photo:
        raise HTTPException(400, "У джина нет фото для генерации ролика.")
    url = await wan_video.generate_i2v(photo, f"Дружелюбная живая мини-презентация: {a.name}, {a.profession}")
    if not url:
        raise HTTPException(502, "Не удалось сгенерировать ролик.")
    a.intro_video_url = await wan_video.rehost(url) or url
    await db.commit()
    return {"video_url": a.intro_video_url}
