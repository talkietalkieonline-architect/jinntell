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
    background: str
    custom_accent: str
    is_online: bool
    is_admin: bool = False
    # Персональные данные
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[str] = None
    city: Optional[str] = None
    about: Optional[str] = None
    bio: Optional[str] = None
    gender: Optional[str] = None
    persona_gender: Optional[str] = None
    interests: Optional[str] = None
    avatar_url: Optional[str] = None
    # Персонализация помощника
    assistant_name: str = "Джим"
    assistant_gender: str = "male"
    assistant_voice: str = "male_low"
    assistant_photo: Optional[str] = None
    # OAuth привязки
    vk_linked: bool = False
    telegram_linked: bool = False
    yandex_linked: bool = False

    class Config:
        from_attributes = True

    @classmethod
    def from_user(cls, user) -> "UserOut":
        return cls(
            id=user.id,
            phone=user.phone,
            display_name=user.display_name,
            jinntell_link=user.jinntell_link,
            theme=user.theme,
            avatar_color=user.avatar_color,
            background=user.background,
            custom_accent=user.custom_accent,
            is_online=user.is_online,
            is_admin=user.is_admin,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            birth_date=user.birth_date.isoformat() if user.birth_date else None,
            city=user.city,
            about=user.about,
            bio=user.bio,
            gender=user.gender,
            persona_gender=user.persona_gender,
            interests=user.interests,
            avatar_url=user.avatar_url,
            assistant_name=user.assistant_name or "Джим",
            assistant_gender=user.assistant_gender or "male",
            assistant_voice=user.assistant_voice or "male_low",
            assistant_photo=user.assistant_photo,
            vk_linked=bool(user.vk_id),
            telegram_linked=bool(user.telegram_id),
            yandex_linked=bool(user.yandex_id),
        )


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    jinntell_link: Optional[str] = None
    theme: Optional[str] = None
    avatar_color: Optional[str] = None
    background: Optional[str] = None
    custom_accent: Optional[str] = None
    bio: Optional[str] = None
    # Персональные данные
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[str] = None
    city: Optional[str] = None
    about: Optional[str] = None
    gender: Optional[str] = None
    persona_gender: Optional[str] = None
    interests: Optional[str] = None
    avatar_url: Optional[str] = None
    # Персонализация помощника
    assistant_name: Optional[str] = None
    assistant_gender: Optional[str] = None
    assistant_voice: Optional[str] = None
    assistant_photo: Optional[str] = None
