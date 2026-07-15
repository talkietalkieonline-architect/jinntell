"""Публичные (без авторизации) настройки платформы для фронта — фиче-флаги."""
import json
from fastapi import APIRouter

from app.api.admin import _get_redis

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/config")
async def public_config():
    """Глобальные фиче-флаги, читаемые фронтом без авторизации.
    shader_bg_enabled — рубильник фон-шейдеров (Paper Shaders). Если выключить в
    админке, фронт прячет пресеты «Аврора» и откатывается на обычный фон.
    """
    shader = True
    try:
        r = await _get_redis()
        sys_json = await r.get("system:settings")
        await r.aclose()
        if sys_json:
            ss = json.loads(sys_json)
            shader = bool(ss.get("shader_bg_enabled", True))
    except Exception:
        pass
    return {"shader_bg_enabled": shader}
