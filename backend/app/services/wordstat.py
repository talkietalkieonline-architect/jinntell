"""Yandex Wordstat (внутри Yandex Search API) — спрос по фразе.

topRequests: {totalCount, topRequests:[{phrase,count}], associations:[{phrase,count}]}.
Auth = IAM-токен из того же SA поиска (YANDEX_SEARCH_SA_KEY_JSON). Напрямую, без прокси.
"""
import logging

import httpx

from app.services.settings_store import get_setting
from app.services.yandex_billing import _get_iam_token

_log = logging.getLogger("wordstat")

_URL = "https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests"


def _items(lst):
    out = []
    for x in (lst or []):
        try:
            out.append({"phrase": x.get("phrase", ""), "count": int(x.get("count", 0) or 0)})
        except Exception:
            pass
    return out


async def top_requests(phrase: str, num: int = 15) -> dict:
    """{"ok", "phrase", "total", "top":[{phrase,count}], "assoc":[{phrase,count}], "reason"}"""
    phrase = (phrase or "").strip()
    if not phrase:
        return {"ok": False, "reason": "empty"}
    key = await get_setting("YANDEX_SEARCH_SA_KEY_JSON")
    if not key:
        return {"ok": False, "reason": "no_key"}
    folder = (await get_setting("YANDEX_FOLDER_ID")) or "b1gbs4tviutikrahehhj"
    try:
        iam = await _get_iam_token(key)
        async with httpx.AsyncClient(timeout=25.0) as c:
            r = await c.post(_URL, json={"phrase": phrase, "numPhrases": max(1, min(50, num)), "folderId": folder},
                             headers={"Authorization": f"Bearer {iam}"})
        if r.status_code != 200:
            return {"ok": False, "reason": f"http_{r.status_code}"}
        d = r.json()
        return {
            "ok": True, "phrase": phrase,
            "total": int(d.get("totalCount", 0) or 0),
            "top": _items(d.get("topRequests")),
            "assoc": _items(d.get("associations")),
        }
    except Exception as e:
        _log.warning("wordstat error: %s", e)
        return {"ok": False, "reason": "error"}
