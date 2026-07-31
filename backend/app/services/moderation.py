"""Глобальный блок-лист проекта (модерация). Ставит админ (концептуально — Агент Контента).
Запрещённые темы: не попадают в Ленту/таргетинг И джинны их не обсуждают."""
import re

from app.services.settings_store import get_setting, set_setting

_KEY = "GLOBAL_BLOCKLIST"


async def get_global_blocklist() -> list:
    raw = await get_setting(_KEY)
    if not raw:
        return []
    parts = re.split(r"[\n,;]+", raw)
    return [p.strip() for p in parts if p.strip()]


async def set_global_blocklist_raw(raw: str) -> None:
    await set_setting(_KEY, (raw or "").strip())
