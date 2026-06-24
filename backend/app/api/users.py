"""API пользователя — профиль, настройки"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
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
    if body.theme is not None:
        user.theme = body.theme
    if body.avatar_color is not None:
        user.avatar_color = body.avatar_color
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
