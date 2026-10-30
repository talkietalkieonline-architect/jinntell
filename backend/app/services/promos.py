"""
Акции зазывалы (владелец 2026-10-23): у заведения несколько акций с расписанием —
«Завтраки» 08:00–12:00, затем «Сытый обед». Зазывала озвучивает ту, что действует СЕЙЧАС (время Москвы).
Хранятся в GeoTrigger.promos_json: [{"title","text","from":"HH:MM","to":"HH:MM","active":bool,"attach":{…}|null}].
attach — что джин дарит вместе со стуком: купон / ваучер / визитка (лежит в «Приглашениях» человека).
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


ATTACH_KINDS = {"coupon": "Купон", "voucher": "Ваучер", "card": "Визитка"}
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def clean_attach(a) -> Optional[dict]:
    """Купон {title, code, terms, until} / ваучер {title, terms, until} / визитка {address, hours, phone, site}."""
    if not isinstance(a, dict) or a.get("kind") not in ATTACH_KINDS:
        return None
    lim = {"title": 100, "code": 40, "terms": 300, "address": 200, "hours": 100, "phone": 40, "site": 200}
    out = {"kind": a["kind"]}
    for k, n in lim.items():
        v = str(a.get(k) or "").strip()[:n]
        if v:
            out[k] = v
    until = str(a.get("until") or "").strip()
    if _DATE.match(until):
        out["until"] = until
    return out if len(out) > 1 else None


def attach_line(a: Optional[dict]) -> str:
    """Одна строка для сообщения джина: «🎟 Купон: …, код …, до 31.10»."""
    if not a:
        return ""
    if a["kind"] == "card":
        parts = [a.get("address"), a.get("hours"), a.get("phone"), a.get("site")]
        return "📇 Визитка: " + " · ".join(p for p in parts if p)
    until = a.get("until")
    until_s = f", до {until[8:10]}.{until[5:7]}" if until else ""
    head = "🎟 Купон" if a["kind"] == "coupon" else "🎁 Ваучер"
    code = f", код {a['code']}" if a.get("code") else ""
    terms = f" ({a['terms']})" if a.get("terms") else ""
    return f"{head}: {a.get('title') or 'подарок'}{terms}{code}{until_s}"


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
                    "active": bool(p.get("active", True)), "attach": clean_attach(p.get("attach"))})
    return out


def _in_window(p: dict, now_m: int) -> bool:
    a, b = _mins(p.get("from", "")), _mins(p.get("to", ""))
    if a is None and b is None:
        return True                      # без времени — весь день
    a = 0 if a is None else a
    b = 24 * 60 if b is None else b
    return a <= now_m < b if a <= b else (now_m >= a or now_m < b)   # окно через полночь


def current(gt, now: Optional[datetime] = None) -> Optional[dict]:
    """Акция, которая действует сейчас: {"title","text","attach"} или None (тогда зазывала молчит)."""
    promos = get_promos(gt)
    if not promos:
        t, m = (getattr(gt, "title", "") or "").strip(), (getattr(gt, "message", "") or "").strip()
        return {"title": t, "text": m, "attach": None} if (t or m) else None
    n = (now or datetime.now(TZ)).astimezone(TZ)
    now_m = n.hour * 60 + n.minute
    for p in promos:
        if p.get("active", True) and _in_window(p, now_m):
            return {"title": p.get("title", ""), "text": p.get("text", ""), "attach": clean_attach(p.get("attach"))}
    return None


def zazyvala_on(agent) -> bool:
    """Функция «Зазывала» включена в «Функциях» джина (флаг в tools_json, не LLM-инструмент)."""
    try:
        return "zazyvala" in (json.loads(getattr(agent, "tools_json", None) or "[]") or [])
    except Exception:  # noqa: BLE001
        return False
