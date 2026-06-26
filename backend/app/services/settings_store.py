"""Хранилище настроек: значение из БД (app_settings), иначе из .env/config."""
from sqlalchemy import select

from app.core.config import settings as _env
from app.core.database import async_session
from app.models.app_setting import AppSetting

_ENV_ATTR = {
    "YANDEX_SPEECHKIT_API_KEY": "YANDEX_SPEECHKIT_API_KEY",
    "YANDEX_SPEECHKIT_FOLDER_ID": "YANDEX_SPEECHKIT_FOLDER_ID",
}


async def get_setting(key: str) -> str:
    async with async_session() as db:
        row = (await db.execute(select(AppSetting).where(AppSetting.key == key))).scalar_one_or_none()
        if row and row.value:
            return row.value
    attr = _ENV_ATTR.get(key)
    return str(getattr(_env, attr, "") or "") if attr else ""


async def set_setting(key: str, value: str) -> None:
    async with async_session() as db:
        row = (await db.execute(select(AppSetting).where(AppSetting.key == key))).scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(AppSetting(key=key, value=value))
        await db.commit()
