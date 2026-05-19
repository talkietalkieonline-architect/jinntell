"""Зависимости (dependencies) для FastAPI"""
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Получить текущего пользователя по JWT-токену"""
    if not credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Требуется авторизация")

    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Невалидный токен")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")

    return user


async def get_admin_user(
    user: User = Depends(get_current_user),
) -> User:
    """Проверить что пользователь — админ"""
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Доступ запрещён")
    return user
