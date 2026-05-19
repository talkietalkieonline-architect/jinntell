"""Схемы авторизации — телефон + пароль, OAuth, восстановление через email"""
from typing import Optional

from pydantic import BaseModel


# === Регистрация ===

class RegisterRequest(BaseModel):
    phone: str          # Логин = номер телефона
    password: str       # Пользователь придумывает сам
    email: Optional[str] = None  # Для восстановления пароля
    display_name: Optional[str] = None


# === Вход ===

class LoginRequest(BaseModel):
    phone: str
    password: str


# === Восстановление пароля ===

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


# === Ответы ===

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    display_name: str
    is_admin: bool = False


class MessageResponse(BaseModel):
    message: str
    debug_code: Optional[str] = None  # Только в DEBUG


# === Legacy SMS (для обратной совместимости) ===

class SendSMSRequest(BaseModel):
    phone: str


class SendSMSResponse(BaseModel):
    message: str
    debug_code: Optional[str] = None


class VerifySMSRequest(BaseModel):
    phone: str
    code: str
