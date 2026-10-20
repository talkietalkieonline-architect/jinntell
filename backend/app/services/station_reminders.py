"""
Напоминания станции через ЛИЧНОГО ПОМОЩНИКА пользователя (без ботов и телефонии).

Талон очереди: за 30 / 10 / 5 мин до назначенного времени. Предзаказ к приезду: за 15 мин.
Помощник получает событие assistant_say (персональный канал user-{uid}) → показывает и ПРОИЗНОСИТ своим голосом,
если JinnTell открыт; плюс запись в истории помощника (jim-{uid}). Напоминание шлём, только если момент наступил
ПОСЛЕ создания записи (короткая запись «через 15 минут» не получит «за 30»).
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import async_session
from app.models.agent import Agent
from app.models.fuel_queue import FuelQueueEntry, StationOrder
from app.models.message import Message
from app.models.user import User
from app.services import fuel_station

QUEUE_POINTS = (30, 10, 5)
ORDER_POINTS = (15,)


def _due(points, target: datetime, created: datetime, sent: set, now: datetime):
    """Ближайшая неотправленная точка напоминания, которая уже наступила (берём самую позднюю)."""
    hit = None
    for n in sorted(points, reverse=True):  # 30, 10, 5
        moment = target - timedelta(minutes=n)
        if str(n) in sent or now < moment or now >= target:
            continue
        if created and created > moment - timedelta(seconds=30):
            sent.add(str(n))  # запись создана позже этой точки — пропускаем её
            continue
        hit = n
    return hit


def _queue_text(n: int, e: FuelQueueEntry, station: str) -> str:
    t = fuel_station.hhmm(e.slot_at)
    name = f"{e.client_name}, " if e.client_name else ""
    if n >= 30:
        return f"{name}напоминаю: в {t} ваше время заправки на станции «{station}» — через {n} минут. Пора выезжать! Талон {e.code} — в чате со станцией."
    if n >= 10:
        return f"{name}через {n} минут ваше время на «{station}» ({t}). Если опоздаете — талон сгорит."
    return f"{name}через {n} минут ваша заправка на «{station}». Покажите QR-талон оператору."


def _order_text(o: StationOrder, station: str) -> str:
    t = fuel_station.hhmm(o.ready_at)
    try:
        items = [i.get("name") for i in json.loads(o.items_json or "[]")]
    except Exception:  # noqa: BLE001
        items = []
    what = ", ".join(([f"{o.fuel_type} {o.liters} л" if o.liters else o.fuel_type] if o.fuel_type else []) + items)
    name = f"{o.client_name}, " if o.client_name else ""
    return f"{name}станция «{station}» ждёт вас к {t}: {what}. Пора выезжать — всё подготовят к приезду!"


async def _say(db, user_id: int, text: str, agent_id: int) -> None:
    from app.websocket.manager import manager
    u = await db.get(User, user_id)
    if not u:
        return
    aname = u.assistant_name or "Джим"
    db.add(Message(room=f"jim-{user_id}", sender_type="assistant", sender_name=aname, text=text))
    await db.commit()
    await manager.broadcast(f"user-{user_id}", {"type": "assistant_say", "text": text, "assistant_name": aname,
                                                "agent_id": agent_id, "room": f"agent-{agent_id}-u{user_id}"})


async def tick() -> int:
    now = datetime.now(timezone.utc)
    sent_n = 0
    async with async_session() as db:
        await fuel_station.expire_overdue(db)
        names: dict = {}

        async def station(aid: int) -> str:
            if aid not in names:
                a = await db.get(Agent, aid)
                names[aid] = a.name if a else "АЗС"
            return names[aid]

        horizon = now + timedelta(minutes=max(QUEUE_POINTS + ORDER_POINTS) + 1)
        tickets = (await db.execute(select(FuelQueueEntry).where(
            FuelQueueEntry.status == "waiting", FuelQueueEntry.user_id.is_not(None),
            FuelQueueEntry.slot_at.is_not(None), FuelQueueEntry.slot_at > now, FuelQueueEntry.slot_at <= horizon))).scalars().all()
        for e in tickets:
            sent = set(filter(None, (e.reminded or "").split(",")))
            n = _due(QUEUE_POINTS, e.slot_at, e.created_at, sent, now)
            if n:
                await _say(db, e.user_id, _queue_text(n, e, await station(e.agent_id)), e.agent_id)
                sent |= {str(p) for p in QUEUE_POINTS if p >= n}  # более ранние точки уже не нужны
                sent_n += 1
            e.reminded = ",".join(sorted(sent))
        orders = (await db.execute(select(StationOrder).where(
            StationOrder.status == "new", StationOrder.user_id.is_not(None), StationOrder.queue_code.is_(None),
            StationOrder.ready_at.is_not(None), StationOrder.ready_at > now, StationOrder.ready_at <= horizon))).scalars().all()
        for o in orders:
            sent = set(filter(None, (o.reminded or "").split(",")))
            n = _due(ORDER_POINTS, o.ready_at, o.created_at, sent, now)
            if n:
                await _say(db, o.user_id, _order_text(o, await station(o.agent_id)), o.agent_id)
                sent.add(str(n))
                sent_n += 1
            o.reminded = ",".join(sorted(sent))
        await db.commit()
    return sent_n


async def reminders_scheduler():
    await asyncio.sleep(20)
    while True:
        try:
            n = await tick()
            if n:
                print(f"[station_reminders] sent {n}")
        except Exception as e:  # noqa: BLE001
            print(f"[station_reminders] err: {e}")
        await asyncio.sleep(60)
