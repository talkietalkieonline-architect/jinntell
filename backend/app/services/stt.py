"""Распознавание речи (STT). Провайдер переключается в админке (STT_PROVIDER).

Сейчас поддержан Yandex SpeechKit (тот же ключ, что у TTS/эмбеддингов).
На будущее — своё (Whisper/Vosk) на выделенной коробке.
"""
import asyncio
import logging

import httpx

from app.services.settings_store import get_setting

log = logging.getLogger("jinntell")

YANDEX_STT_URL = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize"


async def _to_oggopus(audio: bytes) -> bytes:
    """Перекодировать любое аудио (webm/opus с Android и т.п.) в ogg/opus mono через ffmpeg.

    Яндекс v1 sync принимает oggopus/lpcm. Если ffmpeg недоступен/упал — вернём как есть
    (вдруг это уже oggopus, например из нашего TTS)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-i", "pipe:0", "-vn", "-ac", "1", "-c:a", "libopus", "-f", "ogg", "pipe:1",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await proc.communicate(input=audio)
        if proc.returncode == 0 and out:
            return out
        log.warning("[stt] ffmpeg rc=%s: %s", proc.returncode, (err or b"")[:200])
    except FileNotFoundError:
        log.warning("[stt] ffmpeg не найден — отправляю аудио как есть")
    except Exception as e:
        log.warning("[stt] ffmpeg ошибка: %s", e)
    return audio


async def transcribe(audio: bytes, content_type: str = "") -> str:
    """Аудио -> текст. Провайдер из настроек (STT_PROVIDER)."""
    provider = (await get_setting("STT_PROVIDER")) or "yandex"
    if provider == "off":
        return ""
    if provider == "yandex":
        return await _yandex_stt(audio)
    log.warning("[stt] неизвестный провайдер: %s", provider)
    return ""


async def _yandex_stt(audio: bytes) -> str:
    key = await get_setting("YANDEX_SPEECHKIT_API_KEY")
    folder = await get_setting("YANDEX_SPEECHKIT_FOLDER_ID")
    if not key or not folder:
        raise RuntimeError("Yandex STT не настроен (нужны SpeechKit ключ и folder_id)")
    data = await _to_oggopus(audio)
    params = {"folderId": folder, "lang": "ru-RU", "format": "oggopus"}
    headers = {"Authorization": f"Api-Key {key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(YANDEX_STT_URL, params=params, headers=headers, content=data)
    if r.status_code != 200:
        raise RuntimeError(f"SpeechKit STT {r.status_code}: {r.text[:200]}")
    return (r.json().get("result") or "").strip()
