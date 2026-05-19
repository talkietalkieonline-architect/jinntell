"""API пользователя — профиль, настройки"""
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    """Получить профиль текущего пользователя"""
    return UserOut.from_user(user)


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Обновить профиль"""
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
    await db.flush()
    return UserOut.from_user(user)
