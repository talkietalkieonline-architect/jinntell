"""Отправка e-mail через SMTP (восстановление пароля и системные письма).

Использует встроенный smtplib в отдельном потоке (asyncio.to_thread),
чтобы не блокировать event loop и не тянуть доп. зависимости.
"""
import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings

_log = logging.getLogger("email")


def _send_sync(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    ctx = ssl.create_default_context()
    if int(settings.SMTP_PORT) == 465:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, int(settings.SMTP_PORT), context=ctx, timeout=20) as s:
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            s.send_message(msg)
    else:
        with smtplib.SMTP(settings.SMTP_HOST, int(settings.SMTP_PORT), timeout=20) as s:
            s.starttls(context=ctx)
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            s.send_message(msg)


async def send_email(to: str, subject: str, body: str) -> bool:
    """Отправляет письмо. Возвращает True при успехе, False если SMTP не настроен/ошибка."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        _log.warning("SMTP не сконфигурирован — письмо %s не отправлено", to)
        return False
    try:
        await asyncio.to_thread(_send_sync, to, subject, body)
        _log.info("Письмо отправлено на %s", to)
        return True
    except Exception as e:
        _log.warning("Ошибка отправки письма на %s: %s", to, e)
        return False


async def send_reset_email(to: str, code: str) -> bool:
    subject = "Код восстановления пароля — JinnTell"
    body = (
        "Здравствуйте!\n\n"
        f"Ваш код для восстановления пароля в JinnTell: {code}\n\n"
        "Код действует 15 минут. Если вы не запрашивали восстановление — "
        "просто проигнорируйте это письмо.\n\n"
        "— JinnTell"
    )
    return await send_email(to, subject, body)
