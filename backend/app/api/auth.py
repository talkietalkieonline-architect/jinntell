"""
API авторизации:
  - Регистрация (телефон + пароль + email)
  - Вход (телефон + пароль)
  - Восстановление пароля через email
  - OAuth заготовки (ВК, Telegram, Яндекс)
  - Legacy SMS-вход (совместимость)
"""
import random
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    SendSMSRequest,
    SendSMSResponse,
    TokenResponse,
    VerifySMSRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _normalize_phone(raw: str) -> str:
    """Нормализация телефона → +7XXXXXXXXXX"""
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    if not digits.startswith("7"):
        digits = "7" + digits
    return "+" + digits[:11]


# ── Rate-limit (Redis, fail-open: если Redis недоступен — НЕ блокируем вход) ──
def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


async def _rl_client():
    try:
        import redis.asyncio as aioredis
        return aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        return None


async def _rate_hit(key: str, limit: int, window: int) -> bool:
    """Инкремент счётчика попыток. True = в пределах лимита, False = превышен. Fail-open."""
    r = await _rl_client()
    if not r:
        return True
    try:
        n = await r.incr(key)
        if n == 1:
            await r.expire(key, window)
        return n <= limit
    except Exception:
        return True
    finally:
        try:
            await r.aclose()
        except Exception:
            pass


async def _rate_reset(key: str) -> None:
    r = await _rl_client()
    if not r:
        return
    try:
        await r.delete(key)
    except Exception:
        pass
    finally:
        try:
            await r.aclose()
        except Exception:
            pass


_TOO_MANY = "Слишком много попыток. Попробуйте позже (через несколько минут)."

import logging as _logging
_sec_log = _logging.getLogger("jinntell.security")


# =====================================
#  РЕГИСТРАЦИЯ
# =====================================

@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Регистрация: телефон + пароль + email (опционально)"""
    phone = _normalize_phone(body.phone)
    # анти-спам: не более 10 регистраций с одного IP в час
    if not await _rate_hit(f"rl:reg:ip:{_client_ip(request)}", 10, 3600):
        _sec_log.warning("rate-limit: регистрация заблокирована ip=%s", _client_ip(request))
        raise HTTPException(429, _TOO_MANY)
    if len(re.sub(r"\D", "", phone)) < 11:
        raise HTTPException(400, "Некорректный номер телефона")

    if len(body.password) < 6:
        raise HTTPException(400, "Пароль должен быть не менее 6 символов")

    # Проверка: телефон уже занят?
    result = await db.execute(select(User).where(User.phone == phone))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Пользователь с таким номером уже зарегистрирован")

    # Проверка email уникальности (если указан)
    email = body.email.strip().lower() if body.email else None
    if email:
        email_exists = await db.execute(select(User).where(User.email == email))
        if email_exists.scalar_one_or_none():
            raise HTTPException(409, "Этот email уже используется")

    user = User(
        phone=phone,
        password_hash=hash_password(body.password),
        email=email,
        display_name=body.display_name or "Пользователь",
        is_verified=True,
        is_online=True,
        last_seen=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    user.jinntell_link = f"user-{user.id}"

    # Админ по номеру
    if settings.ADMIN_PHONES and phone in settings.ADMIN_PHONES:
        user.is_admin = True

    await db.flush()

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        display_name=user.display_name,
        is_admin=user.is_admin,
    )


# =====================================
#  ВХОД
# =====================================

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Вход по телефону + паролю"""
    phone = _normalize_phone(body.phone)
    ip = _client_ip(request)
    # анти-брутфорс: лимит попыток на IP и на номер (счётчик сбрасывается при успехе)
    if not await _rate_hit(f"rl:login:ip:{ip}", 40, 900):
        _sec_log.warning("rate-limit: вход по IP заблокирован ip=%s", ip)
        raise HTTPException(429, _TOO_MANY)
    if not await _rate_hit(f"rl:login:phone:{phone}", 8, 900):
        _sec_log.warning("rate-limit: вход по номеру заблокирован phone=%s ip=%s", phone, ip)
        raise HTTPException(429, _TOO_MANY)

    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(401, "Неверный номер или пароль")

    if not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Неверный номер или пароль")

    if not user.is_active:
        raise HTTPException(403, "Аккаунт деактивирован")

    # успех — сбрасываем счётчик неудач по номеру
    await _rate_reset(f"rl:login:phone:{phone}")
    user.is_online = True
    user.last_seen = datetime.now(timezone.utc)
    await db.flush()

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        display_name=user.display_name,
        is_admin=user.is_admin,
    )


# =====================================
#  ВОССТАНОВЛЕНИЕ ПАРОЛЯ
# =====================================

@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Запрос кода восстановления на email"""
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(400, "Введите email")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    # Всегда отвечаем успехом (безопасность — не раскрываем существование аккаунта)
    debug_code = None
    if user:
        code = "".join([str(random.randint(0, 9)) for _ in range(6)])
        user.reset_code = code
        user.reset_code_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
        await db.flush()

        if settings.DEBUG:
            debug_code = code
            print(f"[auth] Reset code for {email}: {code}")
        else:
            # TODO: отправка почты (SMTP / API)
            print(f"[auth] Would send reset email to {email} with code {code}")

    return MessageResponse(
        message="Если аккаунт с таким email существует, код восстановления отправлен",
        debug_code=debug_code,
    )


@router.post("/reset-password", response_model=TokenResponse)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Сброс пароля по коду из email"""
    email = body.email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.reset_code:
        raise HTTPException(400, "Неверный код или email")

    if user.reset_code_expires and user.reset_code_expires < datetime.now(timezone.utc):
        raise HTTPException(400, "Код истёк, запросите новый")

    if user.reset_code != body.code:
        raise HTTPException(400, "Неверный код")

    if len(body.new_password) < 6:
        raise HTTPException(400, "Пароль должен быть не менее 6 символов")

    user.password_hash = hash_password(body.new_password)
    user.reset_code = None
    user.reset_code_expires = None
    user.is_online = True
    user.last_seen = datetime.now(timezone.utc)
    await db.flush()

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        display_name=user.display_name,
        is_admin=user.is_admin,
    )


# =====================================
#  OAuth заготовки (ВК, Telegram, Яндекс)
# =====================================

@router.get("/oauth/vk")
async def oauth_vk_start():
    """Редирект на ВК OAuth"""
    if not settings.VK_CLIENT_ID:
        raise HTTPException(501, "Вход через ВК ещё не настроен")
    redirect_uri = f"{settings.SITE_URL}/api/auth/oauth/vk/callback"
    url = (
        f"https://oauth.vk.com/authorize"
        f"?client_id={settings.VK_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&display=page&scope=email,phone&response_type=code&v=5.131"
    )
    return RedirectResponse(url)


@router.get("/oauth/vk/callback")
async def oauth_vk_callback(
    code: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Обмен code на токен ВК, создание/поиск пользователя"""
    import httpx

    redirect_uri = f"{settings.SITE_URL}/api/auth/oauth/vk/callback"

    # Обмен code на access_token
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://oauth.vk.com/access_token",
            params={
                "client_id": settings.VK_CLIENT_ID,
                "client_secret": settings.VK_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "code": code,
            },
        )
    data = resp.json()
    if "error" in data:
        return RedirectResponse(f"{settings.SITE_URL}/?auth_error=vk")

    vk_id = str(data.get("user_id", ""))
    vk_email = data.get("email")
    access_token_vk = data.get("access_token")

    # Получаем профиль
    name = "Пользователь"
    if access_token_vk:
        async with httpx.AsyncClient() as client:
            profile_resp = await client.get(
                "https://api.vk.com/method/users.get",
                params={"access_token": access_token_vk, "v": "5.131", "fields": "first_name,last_name,photo_200"},
            )
        profile_data = profile_resp.json()
        if "response" in profile_data and profile_data["response"]:
            p = profile_data["response"][0]
            name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or "Пользователь"

    # Ищем по vk_id
    result = await db.execute(select(User).where(User.vk_id == vk_id))
    user = result.scalar_one_or_none()

    if not user and vk_email:
        # Пробуем найти по email и привязать
        result2 = await db.execute(select(User).where(User.email == vk_email.lower()))
        user = result2.scalar_one_or_none()
        if user:
            user.vk_id = vk_id

    if not user:
        # Создаём нового (OAuth — без пароля, без телефона пока)
        user = User(
            phone=f"vk_{vk_id}",  # временный placeholder
            display_name=name,
            email=vk_email.lower() if vk_email else None,
            vk_id=vk_id,
            is_verified=True,
            is_online=True,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        user.jinntell_link = f"user-{user.id}"

    user.is_online = True
    user.last_seen = datetime.now(timezone.utc)
    await db.flush()

    token = create_access_token(user.id)
    return RedirectResponse(f"{settings.SITE_URL}/?auth_token={token}")


@router.get("/oauth/yandex")
async def oauth_yandex_start():
    """Редирект на Яндекс OAuth"""
    if not settings.YANDEX_CLIENT_ID:
        raise HTTPException(501, "Вход через Яндекс ещё не настроен")
    redirect_uri = f"{settings.SITE_URL}/api/auth/oauth/yandex/callback"
    url = (
        f"https://oauth.yandex.ru/authorize"
        f"?client_id={settings.YANDEX_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
    )
    return RedirectResponse(url)


@router.get("/oauth/yandex/callback")
async def oauth_yandex_callback(
    code: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Обмен code на токен Яндекс, создание/поиск пользователя"""
    import httpx

    # Обмен code на access_token
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth.yandex.ru/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.YANDEX_CLIENT_ID,
                "client_secret": settings.YANDEX_CLIENT_SECRET,
            },
        )
    data = resp.json()
    if "error" in data:
        return RedirectResponse(f"{settings.SITE_URL}/?auth_error=yandex")

    ya_token = data.get("access_token", "")

    # Профиль
    async with httpx.AsyncClient() as client:
        profile_resp = await client.get(
            "https://login.yandex.ru/info",
            headers={"Authorization": f"OAuth {ya_token}"},
            params={"format": "json"},
        )
    profile = profile_resp.json()
    ya_id = str(profile.get("id", ""))
    ya_email = profile.get("default_email")
    ya_name = profile.get("display_name") or profile.get("real_name", "Пользователь")
    ya_phone = profile.get("default_phone", {}).get("number")

    # Ищем по yandex_id
    result = await db.execute(select(User).where(User.yandex_id == ya_id))
    user = result.scalar_one_or_none()

    if not user and ya_email:
        result2 = await db.execute(select(User).where(User.email == ya_email.lower()))
        user = result2.scalar_one_or_none()
        if user:
            user.yandex_id = ya_id

    if not user and ya_phone:
        norm_phone = _normalize_phone(ya_phone)
        result3 = await db.execute(select(User).where(User.phone == norm_phone))
        user = result3.scalar_one_or_none()
        if user:
            user.yandex_id = ya_id

    if not user:
        phone_val = _normalize_phone(ya_phone) if ya_phone else f"ya_{ya_id}"
        user = User(
            phone=phone_val,
            display_name=ya_name,
            email=ya_email.lower() if ya_email else None,
            yandex_id=ya_id,
            is_verified=True,
            is_online=True,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        user.jinntell_link = f"user-{user.id}"

    user.is_online = True
    user.last_seen = datetime.now(timezone.utc)
    await db.flush()

    token = create_access_token(user.id)
    return RedirectResponse(f"{settings.SITE_URL}/?auth_token={token}")


@router.post("/oauth/telegram")
async def oauth_telegram(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Telegram Login Widget — фронт присылает данные от виджета.
    Проверка подписи через HMAC-SHA256.
    """
    import hashlib
    import hmac

    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(501, "Вход через Telegram ещё не настроен")

    # Проверка подписи
    tg_hash = body.pop("hash", "")
    check_data = "\n".join(f"{k}={v}" for k, v in sorted(body.items()) if v is not None)
    secret = hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode()).digest()
    computed = hmac.new(secret, check_data.encode(), hashlib.sha256).hexdigest()

    if computed != tg_hash:
        raise HTTPException(403, "Неверная подпись Telegram")

    tg_id = str(body.get("id", ""))
    tg_name = f"{body.get('first_name', '')} {body.get('last_name', '')}".strip() or "Пользователь"

    result = await db.execute(select(User).where(User.telegram_id == tg_id))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            phone=f"tg_{tg_id}",
            display_name=tg_name,
            telegram_id=tg_id,
            is_verified=True,
            is_online=True,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        user.jinntell_link = f"user-{user.id}"

    user.is_online = True
    user.last_seen = datetime.now(timezone.utc)
    await db.flush()

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        display_name=user.display_name,
        is_admin=user.is_admin,
    )


# =====================================
#  Legacy SMS-вход (обратная совместимость)
# =====================================

@router.post("/send-sms", response_model=SendSMSResponse)
async def send_sms(body: SendSMSRequest, db: AsyncSession = Depends(get_db)):
    """Отправить SMS-код (legacy, оставлено для совместимости)"""
    from app.services.sms import send_sms_code

    phone = _normalize_phone(body.phone)
    code = "".join([str(random.randint(0, 9)) for _ in range(settings.SMS_CODE_LENGTH)])
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.SMS_CODE_EXPIRE_MINUTES)

    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if user:
        user.sms_code = code
        user.sms_code_expires = expires
    else:
        user = User(phone=phone, sms_code=code, sms_code_expires=expires)
        db.add(user)

    await db.flush()

    sms_sent = await send_sms_code(phone, code)
    if not sms_sent and not settings.DEBUG:
        raise HTTPException(500, "Не удалось отправить SMS")

    return SendSMSResponse(message="Код отправлен", debug_code=code if settings.DEBUG else None)


@router.post("/verify-sms", response_model=TokenResponse)
async def verify_sms(body: VerifySMSRequest, db: AsyncSession = Depends(get_db)):
    """Проверить SMS-код (legacy)"""
    phone = _normalize_phone(body.phone)
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if not user or not user.sms_code:
        raise HTTPException(400, "Сначала запросите SMS-код")
    if user.sms_code_expires and user.sms_code_expires < datetime.now(timezone.utc):
        raise HTTPException(400, "Код истёк")
    if user.sms_code != body.code:
        raise HTTPException(400, "Неверный код")

    user.is_verified = True
    user.sms_code = None
    user.sms_code_expires = None
    user.is_online = True
    user.last_seen = datetime.now(timezone.utc)
    if not user.jinntell_link:
        user.jinntell_link = f"user-{user.id}"
    if settings.ADMIN_PHONES and user.phone in settings.ADMIN_PHONES:
        user.is_admin = True
    await db.flush()

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        display_name=user.display_name,
        is_admin=user.is_admin,
    )
