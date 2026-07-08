"""Шифрование чувствительных полей at-rest. Ключ выводится из SECRET_KEY (стабилен)."""
import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import settings

_PREFIX = "enc::"
_cache = None


def _fernet() -> Fernet:
    global _cache
    if _cache is None:
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest())
        _cache = Fernet(key)
    return _cache


def encrypt_text(value):
    if value is None:
        return value
    if isinstance(value, str) and value.startswith(_PREFIX):
        return value  # уже зашифровано
    try:
        return _PREFIX + _fernet().encrypt(str(value).encode("utf-8")).decode("ascii")
    except Exception:
        return value  # не ломаем запись


def decrypt_text(value):
    if not isinstance(value, str) or not value.startswith(_PREFIX):
        return value  # legacy plaintext или не строка
    try:
        return _fernet().decrypt(value[len(_PREFIX):].encode("ascii")).decode("utf-8")
    except Exception:
        return value  # не ломаем чтение
