"""
Станция АЗС: живые остатки топлива, брони очереди и расчёт «сколько можно забронировать».

Источник правды по остаткам — ОПЕРАТОР станции (сообщает джину в чате или правит в реестре).
Джин бронирует ПРОТИВ остатка, оставляя запас под живую (параллельную) очередь у колонок:
    можно забронировать = остаток − уже забронировано (ждут + подъехали) − запас (queue_buffer_pct % остатка)
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select, func, update

from app.models.fuel_queue import FuelQueueEntry, StationOperator

ACTIVE = ("waiting", "arrived")
STALE_HOURS = 3
TZ = ZoneInfo("Europe/Moscow")   # станции демо — СПб
LEAD_MIN = 15                    # первое окно не раньше чем через 15 мин (доехать)


def hhmm(d: Optional[datetime]) -> str:
    return d.astimezone(TZ).strftime("%H:%M") if d else "—"


async def day_add(user_id: Optional[int], when: Optional[datetime], title: str, note: str) -> None:
    """Пункт в «Мой день» пользователя (автор — помощник). Связь с талоном/заказом — по коду в note."""
    if not user_id:
        return
    try:
        from app.core.database import async_session
        from app.models.day_entry import DayEntry
        w = (when or datetime.now(timezone.utc)).astimezone(TZ)
        async with async_session() as s:
            s.add(DayEntry(user_id=user_id, day=w.strftime("%Y-%m-%d"), time=w.strftime("%H:%M"), title=title[:300],
                           note=note, kind="plan", status="planned", author="assistant", important=True))
            await s.commit()
        from app.websocket.manager import manager
        await manager.broadcast(f"user-{user_id}", {"type": "day_ping"})
    except Exception as e:  # noqa: BLE001
        print(f"[day] add err: {e}")


async def day_status(db, codes: list, status: str) -> None:
    """Обновить статус пунктов «Мой день» по коду талона/заказа: done | cancelled."""
    if not codes:
        return
    try:
        from sqlalchemy import or_
        from app.models.day_entry import DayEntry
        rows = (await db.execute(select(DayEntry).where(or_(*[DayEntry.note.contains(c) for c in codes]),
                                                        DayEntry.status == "planned"))).scalars().all()
        uids = set()
        for e in rows:
            e.status = status
            uids.add(e.user_id)
        await db.commit()
        from app.websocket.manager import manager
        for u in uids:
            await manager.broadcast(f"user-{u}", {"type": "day_ping"})
    except Exception as e:  # noqa: BLE001
        print(f"[day] status err: {e}")


async def expire_overdue(db, agent_id: Optional[int] = None) -> int:
    """Талоны, по которым не подъехали к назначенному времени, сгорают (бронь освобождается)."""
    q = select(FuelQueueEntry.code).where(FuelQueueEntry.status == "waiting", FuelQueueEntry.slot_at.is_not(None),
                                          FuelQueueEntry.slot_at < datetime.now(timezone.utc))
    if agent_id:
        q = q.where(FuelQueueEntry.agent_id == agent_id)
    codes = list((await db.execute(q)).scalars().all())
    if not codes:
        return 0
    await db.execute(update(FuelQueueEntry).where(FuelQueueEntry.code.in_(codes)).values(status="expired"))
    await db.commit()
    await day_status(db, codes, "cancelled")
    return len(codes)


def parse_time(s: str) -> Optional[datetime]:
    """«14:30», «в 9.15», «через 40 минут», «через час», «через 2 часа» → дата-время (UTC)."""
    t = (s or "").lower()
    m = re.search(r"через\s*(\d+)\s*(мин|ч)", t)
    if m:
        n = int(m.group(1))
        return datetime.now(timezone.utc) + (timedelta(hours=n) if m.group(2).startswith("ч") else timedelta(minutes=n))
    if re.search(r"через\s*(час|полчаса)", t):
        return datetime.now(timezone.utc) + timedelta(minutes=30 if "полчаса" in t else 60)
    m = re.search(r"(\d{1,2})[:.](\d{2})", s or "")
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        return None
    now = datetime.now(TZ)
    d = now.replace(hour=h, minute=mi, second=0, microsecond=0)
    if d < now:
        d += timedelta(days=1)
    return d.astimezone(timezone.utc)


async def next_slot(db, agent, preferred: Optional[datetime] = None) -> datetime:
    """Ближайшее свободное окно: не раньше чем через LEAD_MIN, не раньше желаемого, с шагом queue_slot_min."""
    step = max(3, int(getattr(agent, "queue_slot_min", 10) or 10))
    now = datetime.now(timezone.utc)
    t = now + timedelta(minutes=LEAD_MIN)
    t = t.replace(second=0, microsecond=0) + timedelta(minutes=(5 - t.minute % 5) % 5)
    if preferred and preferred > t:
        t = preferred
    taken = {e.replace(second=0, microsecond=0) for e in (await db.execute(select(FuelQueueEntry.slot_at).where(
        FuelQueueEntry.agent_id == agent.id, FuelQueueEntry.status == "waiting",
        FuelQueueEntry.slot_at.is_not(None)))).scalars().all()}
    for _ in range(500):
        if all(abs((t - s).total_seconds()) >= step * 60 for s in taken):
            return t
        t += timedelta(minutes=step)
    return t


def norm_fuel(s: str) -> str:
    """«95», «аи95», «АИ-95 евро» → «АИ-95»; «дизель», «дт» → «ДТ»; «газ», «пропан» → «Газ»."""
    t = (s or "").strip().lower().replace("ё", "е")
    if re.search(r"дизел|\bдт\b|^дт|diesel", t):
        return "ДТ"
    if re.search(r"газ|пропан|метан|lpg|cng", t):
        return "Газ"
    m = re.search(r"(100|98|95|92)", t)
    if m:
        return f"АИ-{m.group(1)}"
    return (s or "").strip()[:40] or "?"


def get_stock(agent) -> dict:
    try:
        d = json.loads(getattr(agent, "fuel_stock_json", None) or "{}")
        return d if isinstance(d, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def set_stock(agent, fuel: str, liters: float, by_user: Optional[int] = None) -> dict:
    d = get_stock(agent)
    d[norm_fuel(fuel)] = {"liters": max(0.0, float(liters)), "updated_at": datetime.now(timezone.utc).isoformat(), "by": by_user}
    agent.fuel_stock_json = json.dumps(d, ensure_ascii=False)
    return d


async def is_operator(db, agent_id: int, user_id: Optional[int]) -> bool:
    if not user_id:
        return False
    r = await db.execute(select(StationOperator.id).where(
        StationOperator.agent_id == agent_id, StationOperator.user_id == user_id))
    return r.scalar_one_or_none() is not None


async def reserved_by_fuel(db, agent_id: int) -> dict:
    rows = (await db.execute(select(FuelQueueEntry.fuel_type, func.sum(FuelQueueEntry.liters), func.count()).where(
        FuelQueueEntry.agent_id == agent_id, FuelQueueEntry.status.in_(ACTIVE)).group_by(FuelQueueEntry.fuel_type))).all()
    out: dict = {}
    for fuel, lit, n in rows:
        k = norm_fuel(fuel)
        cur = out.setdefault(k, {"liters": 0.0, "cars": 0})
        cur["liters"] += float(lit or 0)
        cur["cars"] += int(n or 0)
    return out


def _age_hours(iso: str) -> Optional[float]:
    try:
        return (datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds() / 3600
    except Exception:  # noqa: BLE001
        return None


async def availability(db, agent) -> dict:
    """Сводка по каждому виду топлива: остаток, забронировано, запас под живую очередь, можно забронировать."""
    await expire_overdue(db, agent.id)
    stock = get_stock(agent)
    res = await reserved_by_fuel(db, agent.id)
    pct = max(0, min(int(getattr(agent, "queue_buffer_pct", 30) or 30), 90))
    limit = int(getattr(agent, "queue_limit_liters", 30) or 30)
    fuels: dict = {}
    for k in sorted(set(stock) | set(res)):
        st = stock.get(k) or {}
        rv = res.get(k) or {"liters": 0.0, "cars": 0}
        known = "liters" in st
        lit = float(st.get("liters") or 0)
        buf = round(lit * pct / 100) if known else None
        bookable = max(0, int(lit - rv["liters"] - buf)) if known else None
        age = _age_hours(st.get("updated_at") or "") if known else None
        fuels[k] = {
            "stock": int(lit) if known else None, "reserved": int(rv["liters"]), "reserved_cars": rv["cars"],
            "buffer": buf, "bookable": bookable,
            "per_car": (min(limit, bookable) if bookable is not None else limit),
            "updated_hours_ago": round(age, 1) if age is not None else None,
            "stale": (age is None or age > STALE_HOURS) if known else True,
        }
    return {"buffer_pct": pct, "limit_per_car": limit, "fuels": fuels}


def format_for_jinn(av: dict, operator: bool) -> str:
    if not av["fuels"]:
        return "Остатки топлива оператор ещё не сообщил."
    lines = []
    for k, f in av["fuels"].items():
        if f["stock"] is None:
            lines.append(f"- {k}: остаток неизвестен (оператор не сообщил); забронировано {f['reserved']} л ({f['reserved_cars']} авто)")
            continue
        stale = f" — данные {f['updated_hours_ago']} ч назад, уточнить у оператора" if f["stale"] else ""
        if operator:
            cars = f["bookable"] // max(1, av["limit_per_car"])
            lines.append(f"- {k}: остаток {f['stock']} л; забронировано {f['reserved']} л ({f['reserved_cars']} авто); "
                         f"запас под живую очередь {f['buffer']} л ({av['buffer_pct']}%); "
                         f"можно ещё забронировать {f['bookable']} л ≈ {cars} авто по {av['limit_per_car']} л{stale}")
        else:
            if f["bookable"] <= 0:
                lines.append(f"- {k}: под запись свободного объёма нет (топливо уходит живой очереди){stale}")
            else:
                lines.append(f"- {k}: можно записаться, до {f['per_car']} л на авто{stale}")
    return "\n".join(lines)


async def context_note(db, agent, user_id: Optional[int]) -> str:
    """Блок для системного промпта джина АЗС: кто собеседник + живые остатки (важнее данных в промпте)."""
    op = await is_operator(db, agent.id, user_id)
    av = await availability(db, agent)
    data = format_for_jinn(av, op)
    if op:
        return ("\n\nСОБЕСЕДНИК — ОПЕРАТОР ЭТОЙ АЗС (сотрудник станции, не клиент). Ты его помощник: "
                "НЕ предлагай ему записаться в очередь. Если он называет остатки — сохрани КАЖДЫЙ вид топлива через "
                "update_fuel_stock. Если остатки давно не обновлялись — сам попроси их назвать. По запросу дай сводку "
                "(fuel_status) и подскажи, сколько можно отдать под бронь, чтобы хватило и живой очереди у колонок; "
                "если запаса мало — посоветуй закрыть запись по этому топливу или уменьшить литры на авто. Сам ты лимит, "
                "запас и запись НЕ меняешь — это оператор делает в реестре jinntell.ru/operator; не обещай сделать это сам.\n"
                f"ДАННЫЕ СТАНЦИИ СЕЙЧАС:\n{data}")
    return ("\n\nЖИВЫЕ ДАННЫЕ ПО ЗАПИСИ В ОЧЕРЕДЬ (важнее цифр из промпта):\n" + data +
            "\nПеред записью узнай ИМЯ, ГОС-НОМЕР, ВИД ТОПЛИВА и ЛИТРЫ (и удобное время, если клиент хочет), затем вызови "
            "queue_register — он сам назначит время заправки и выдаст уникальный талон с QR в чат. Обязательно скажи "
            "назначенное время и предупреди: если не подъехать к этому времени — талон сгорает. Честно предупреждай: "
            "это бронь, параллельно работает и живая очередь у колонок. Точные литры остатков клиенту не называй.")
