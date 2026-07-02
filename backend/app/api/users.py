"""API пользователя — профиль, настройки"""
from datetime import date
import re

import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token
from app.models.contractor import Contractor
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return UserOut.from_user(user)


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.jinntell_link is not None:
        handle = re.sub(r"[^a-z0-9_-]", "", (body.jinntell_link or "").strip().lstrip("@").lower())[:30]
        if handle and handle != user.jinntell_link:
            if len(handle) < 3:
                raise HTTPException(400, "@username минимум 3 символа (a-z, 0-9, _, -)")
            taken = await db.execute(select(User).where(User.jinntell_link == handle, User.id != user.id))
            if taken.scalar_one_or_none():
                raise HTTPException(400, "Этот @username уже занят")
            user.jinntell_link = handle
    if body.theme is not None:
        user.theme = body.theme
    if body.avatar_color is not None:
        user.avatar_color = body.avatar_color
    if body.background is not None:
        user.background = body.background
    if body.custom_accent is not None:
        user.custom_accent = body.custom_accent
    if body.bio is not None:
        user.bio = body.bio
    # Персональные данные
    if body.email is not None:
        user.email = body.email.strip().lower() if body.email else None
    if body.first_name is not None:
        user.first_name = body.first_name
    if body.last_name is not None:
        user.last_name = body.last_name
    if body.birth_date is not None:
        user.birth_date = date.fromisoformat(body.birth_date) if body.birth_date else None
    if body.city is not None:
        user.city = body.city
    if body.gender is not None:
        user.gender = body.gender
    if body.persona_gender is not None:
        user.persona_gender = body.persona_gender
    if body.interests is not None:
        user.interests = body.interests
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url
    if body.about is not None:
        user.about = body.about
    # Персонализация помощника
    if body.assistant_name is not None:
        user.assistant_name = body.assistant_name
    if body.assistant_gender is not None:
        user.assistant_gender = body.assistant_gender
    if body.assistant_voice is not None:
        user.assistant_voice = body.assistant_voice
    if body.assistant_photo is not None:
        user.assistant_photo = body.assistant_photo
    await db.flush()
    return UserOut.from_user(user)


@router.get("/me/businesses")
async def my_businesses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Бизнес-аккаунты, привязанные к текущему пользователю (для переключателя ролей)."""
    rows = (await db.execute(
        select(Contractor).where(Contractor.user_id == user.id, Contractor.is_active == True)
        .order_by(Contractor.company_name)
    )).scalars().all()
    return [{"id": c.id, "company_name": c.company_name} for c in rows]


@router.post("/me/businesses/{contractor_id}/token")
async def my_business_token(
    contractor_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Выдать токен бизнес-кабинета по пользовательской сессии — без отдельного пароля."""
    c = (await db.execute(
        select(Contractor).where(
            Contractor.id == contractor_id,
            Contractor.user_id == user.id,
            Contractor.is_active == True,
        )
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Бизнес-аккаунт не найден или не привязан к вам")
    token = create_access_token(c.id, token_type="contractor")
    return {"access_token": token, "company_name": c.company_name, "contractor_id": c.id}


_STORAGE_ROOT = "/app/storage"
_ALLOWED_IMG = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


@router.post("/me/assistant-photo")
async def upload_assistant_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Загрузить фото/изображение для своего помощника."""
    ext = _ALLOWED_IMG.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Только изображения: jpg, png, webp, gif")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "Файл больше 20 МБ")
    d = os.path.join(_STORAGE_ROOT, "users", str(user.id))
    os.makedirs(d, exist_ok=True)
    for fn in os.listdir(d):
        if fn.startswith("assistant."):
            try:
                os.remove(os.path.join(d, fn))
            except OSError:
                pass
    fname = f"assistant.{ext}"
    with open(os.path.join(d, fname), "wb") as f:
        f.write(data)
    url = f"/api/storage/users/{user.id}/{fname}"
    user.assistant_photo = url
    await db.flush()
    return {"photo_url": url}


@router.delete("/me/assistant-photo")
async def delete_assistant_photo(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.assistant_photo and user.assistant_photo.startswith("/api/storage/"):
        rel = user.assistant_photo.replace("/api/storage/", "", 1)
        try:
            os.remove(os.path.join(_STORAGE_ROOT, rel))
        except OSError:
            pass
    user.assistant_photo = None
    await db.flush()
    return {"ok": True}


@router.post("/me/avatar")
async def upload_user_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Загрузить аватар пользователя."""
    ext = _ALLOWED_IMG.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Только изображения: jpg, png, webp, gif")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "Файл больше 20 МБ")
    d = os.path.join(_STORAGE_ROOT, "users", str(user.id))
    os.makedirs(d, exist_ok=True)
    for fn in os.listdir(d):
        if fn.startswith("avatar."):
            try:
                os.remove(os.path.join(d, fn))
            except OSError:
                pass
    fname = f"avatar.{ext}"
    with open(os.path.join(d, fname), "wb") as f:
        f.write(data)
    user.avatar_url = f"/api/storage/users/{user.id}/{fname}"
    await db.flush()
    return {"avatar_url": user.avatar_url}


@router.delete("/me/avatar")
async def delete_user_avatar(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.avatar_url and user.avatar_url.startswith("/api/storage/"):
        rel = user.avatar_url.replace("/api/storage/", "", 1)
        try:
            os.remove(os.path.join(_STORAGE_ROOT, rel))
        except OSError:
            pass
    user.avatar_url = None
    await db.flush()
    return {"ok": True}
