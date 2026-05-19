"""Схемы пользователя"""
from typing import Optional

from pydantic import BaseModel


class UserOut(BaseModel):
    id: int
    phone: str
    display_name: str
    jinntell_link: Optional[str] = None
    theme: str
    avatar_color: str
    is_online: bool
    is_admin: bool = False
    # Персональные данные
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[str] = None  # ISO date string
    city: Optional[str] = None
    about: Optional[str] = None
    bio: Optional[str] = None
    # OAuth привязки (только флаги — привязан/нет)
    vk_linked: bool = False
    telegram_linked: bool = False
    yandex_linked: bool = False

    class Config:
        from_attributes = True

    @classmethod
    def from_user(cls, user) -> "UserOut":
        """Build UserOut from User model with computed fields"""
        return cls(
            id=user.id,
            phone=user.phone,
            display_name=user.display_name,
            jinntell_link=user.jinntell_link,
            theme=user.theme,
            avatar_color=user.avatar_color,
            is_online=user.is_online,
            is_admin=user.is_admin,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            birth_date=user.birth_date.isoformat() if user.birth_date else None,
            city=user.city,
            about=user.about,
            bio=user.bio,
            vk_linked=bool(user.vk_id),
            telegram_linked=bool(user.telegram_id),
            yandex_linked=bool(user.yandex_id),
        )


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    theme: Optional[str] = None
    avatar_color: Optional[str] = None
    bio: Optional[str] = None
    # Персональные данные
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[str] = None  # ISO date string YYYY-MM-DD
    city: Optional[str] = None
    about: Optional[str] = None
