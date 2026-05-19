"""JWT-токены и хеширование паролей"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int, expires_delta: Optional[timedelta] = None, token_type: str = "user") -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {"sub": str(user_id), "type": token_type, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[int]:
    """Возвращает user_id или None если токен невалидный"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        return int(user_id) if user_id else None
    except (JWTError, ValueError):
        return None


def decode_contractor_token(token: str) -> Optional[int]:
    """Возвращает contractor_id или None. Проверяет type=contractor."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "contractor":
            return None
        sub = payload.get("sub")
        return int(sub) if sub else None
    except (JWTError, ValueError):
        return None
