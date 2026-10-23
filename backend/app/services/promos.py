"""
Акции зазывалы (владелец 2026-10-23): у заведения несколько акций с расписанием —
«Завтраки» 08:00–12:00, затем «Сытый обед». Зазывала озвучивает ту, что действует СЕЙЧАС (время Москвы).
Хранятся в GeoTrigger.promos_json: [{"title","text","from":"HH:MM","to":"HH:MM","active":bool}].
Пустой список → старые поля GeoTrigger.title/message (совместимость).
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Moscow")
_HHMM = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def _mins(s: str) -> Optional[int]:
    m = _HHMM.match((s or "").strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def get_promos(gt) -> list:
    try:
        v = json.loads(getattr(gt, "promos_json", None) or "[]")
        return v if isinstance(v, list) else []
    except Exception:  # noqa: BLE001
        return []


def clean(promos) -> list:
    out = []
    for p in (promos or [])[:10]:
        if not isinstance(p, dict):
            continue
        title = str(p.get("title") or "").strip()[:100]
        text = str(p.get("text") or "").strip()[:600]
        if not title and not text:
            continue
        fr, to = str(p.get("from") or "").strip(), str(p.get("to") or "").strip()
        out.append({"title": title, "text": text,
                    "from": fr if _mins(fr) is not None else "", "to": to if _mins(to) is not None else "",
                    "active": bool(p.get("active", True))})
    return out


def _in_window(p: dict, now_m: int) -> bool:
    a, b = _mins(p.get("from", "")), _mins(p.get("to", ""))
    if a is None and b is None:
        return True                      # без времени — весь день
    a = 0 if a is None else a
    b = 24 * 60 if b is None else b
    return a <= now_m < b if a <= b else (now_m >= a or now_m < b)   # окно через полночь


def current(gt, now: Optional[datetime] = None) -> Optional[dict]:
    """Акция, которая действует сейчас: {"title","text"} или None (тогда зазывала молчит)."""
    promos = get_promos(gt)
    if not promos:
        t, m = (getattr(gt, "title", "") or "").strip(), (getattr(gt, "message", "") or "").strip()
        return {"title": t, "text": m} if (t or m) else None
    n = (now or datetime.now(TZ)).astimezone(TZ)
    now_m = n.hour * 60 + n.minute
    for p in promos:
        if p.get("active", True) and _in_window(p, now_m):
            return {"title": p.get("title", ""), "text": p.get("text", "")}
    return None
