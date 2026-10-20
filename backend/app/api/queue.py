"""API очереди на заправку (функция queue_register джина АЗС).

Водитель получает уникальный талон с QR (ссылка /q/{code}). QR — только ссылка: ПОДТВЕРЖДЕНИЕ — это запись
в списке станции на нашем сервере (гос-номер + время заявки). Оператор станции (вход по телефону, привязка
station_operators) сканирует QR / ищет по гос-номеру → сверяет со списком → «подъехал» → «заправлен».
Талон одноразовый: повторный показ (скриншот, пересылка) виден как «уже использован».
"""
import io
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.models.agent import Agent
from app.models.user import User
from app.models.fuel_queue import FuelQueueEntry, StationOperator, StationOrder
from app.services import fuel_station

router = APIRouter(prefix="/api/queue", tags=["queue"])

_PUBLIC_BASE = "https://jinntell.ru"
_STATUS_RU = {"waiting": "ждёт", "arrived": "подъехал", "served": "заправлен", "cancelled": "отменён",
              "expired": "сгорел (опоздание)"}


def _iso(d):
    return d.isoformat() if d else None


async def _can_operate(db: AsyncSession, user: Optional[User], agent_id: int) -> bool:
    if not user:
        return False
    if user.is_admin:
        return True
    return await fuel_station.is_operator(db, agent_id, user.id)


async def _require_operator(db: AsyncSession, user: User, agent_id: int):
    if not await _can_operate(db, user, agent_id):
        raise HTTPException(403, "Нет доступа: вы не оператор этой АЗС")


async def _entry(db: AsyncSession, code: str) -> FuelQueueEntry:
    await fuel_station.expire_overdue(db)
    e = (await db.execute(select(FuelQueueEntry).where(FuelQueueEntry.code == code.strip().upper()))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Талона нет в списке")
    return e


def _row(e: FuelQueueEntry) -> dict:
    return {"code": e.code, "number": e.number, "client_name": e.client_name or "", "car_plate": e.car_plate,
            "fuel_type": e.fuel_type, "liters": e.liters, "status": e.status, "status_ru": _STATUS_RU.get(e.status, e.status),
            "agent_id": e.agent_id, "created_at": _iso(e.created_at), "arrived_at": _iso(e.arrived_at),
            "slot_at": _iso(e.slot_at), "slot_hhmm": fuel_station.hhmm(e.slot_at) if e.slot_at else "",
            "served_at": _iso(e.served_at)}


@router.get("/my-stations")
async def my_stations(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Станции, где текущий пользователь — оператор (админ видит все станции с очередью)."""
    if user.is_admin:
        q = select(Agent).where(Agent.queue_enabled.is_(True))
    else:
        q = select(Agent).join(StationOperator, StationOperator.agent_id == Agent.id).where(StationOperator.user_id == user.id)
    return [{"agent_id": a.id, "name": a.name} for a in (await db.execute(q.order_by(Agent.id))).scalars().all()]


@router.get("/station/{agent_id}")
async def queue_station(agent_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Реестр станции: кто ждёт и кто подъехал + остатки и свободный объём под запись."""
    await _require_operator(db, user, agent_id)
    a = await db.get(Agent, agent_id)
    if not a:
        raise HTTPException(404, "Станция не найдена")
    await fuel_station.expire_overdue(db, agent_id)
    rows = (await db.execute(select(FuelQueueEntry).where(
        FuelQueueEntry.agent_id == agent_id, FuelQueueEntry.status.in_(fuel_station.ACTIVE)
    ).order_by(FuelQueueEntry.slot_at.nulls_last(), FuelQueueEntry.number))).scalars().all()
    return {"station": {"agent_id": a.id, "name": a.name, "limit_per_car": a.queue_limit_liters,
                        "buffer_pct": a.queue_buffer_pct},
            "availability": await fuel_station.availability(db, a),
            "queue": [_row(e) for e in rows]}


@router.get("/station/{agent_id}/find")
async def queue_find(agent_id: int, plate: str = "", db: AsyncSession = Depends(get_db),
                     user: User = Depends(get_current_user)):
    """Поиск по гос-номеру в списке станции (если QR нет или он сомнительный). Последние записи за сутки."""
    await _require_operator(db, user, agent_id)
    await fuel_station.expire_overdue(db, agent_id)
    p = re.sub(r"[^A-ZА-Я0-9]", "", (plate or "").upper())
    if len(p) < 3:
        raise HTTPException(400, "Введите гос-номер (минимум 3 символа)")
    since = datetime.now(timezone.utc).timestamp() - 86400
    rows = (await db.execute(select(FuelQueueEntry).where(
        FuelQueueEntry.agent_id == agent_id, FuelQueueEntry.car_plate.contains(p)
    ).order_by(FuelQueueEntry.created_at.desc()).limit(10))).scalars().all()
    return [_row(e) for e in rows if e.created_at and e.created_at.timestamp() >= since]


@router.put("/station/{agent_id}/stock")
async def queue_stock(agent_id: int, payload: dict = Body(...), db: AsyncSession = Depends(get_db),
                      user: User = Depends(get_current_user)):
    """Оператор правит остатки: {"АИ-95": 9500, "ДТ": 4000} (+ необязательно buffer_pct)."""
    await _require_operator(db, user, agent_id)
    a = await db.get(Agent, agent_id)
    if not a:
        raise HTTPException(404, "Станция не найдена")
    for fuel, lit in (payload.get("stock") or {}).items():
        try:
            fuel_station.set_stock(a, fuel, float(lit), user.id)
        except (TypeError, ValueError):
            continue
    if payload.get("buffer_pct") is not None:
        try:
            a.queue_buffer_pct = max(0, min(int(payload["buffer_pct"]), 90))
        except (TypeError, ValueError):
            pass
    await db.commit()
    return await fuel_station.availability(db, a)


# ── Заказы станции к приезду (кофе/еда, услуги АЗС) ──
_ORDER_RU = {"new": "принят", "ready": "готов", "done": "выдан", "cancelled": "отменён"}


def _order_row(o: StationOrder) -> dict:
    import json as _j
    try:
        items = _j.loads(o.items_json or "[]")
    except Exception:
        items = []
    if o.fuel_type:  # топливо — первой строкой предзаказа
        items = [{"name": f"{o.fuel_type}" + (f" {o.liters} л" if o.liters else ""), "qty": 1, "price": 0, "fuel": True}] + items
    return {"code": o.code, "kind": o.kind, "kind_ru": {"cafe": "Кафе", "services": "Услуга"}.get(o.kind, "Предзаказ"), "items": items,
            "total": o.total, "client_name": o.client_name or "", "car_plate": o.car_plate or "",
            "ready_at": _iso(o.ready_at), "ready_hhmm": fuel_station.hhmm(o.ready_at) if o.ready_at else "",
            "queue_code": o.queue_code, "status": o.status, "status_ru": _ORDER_RU.get(o.status, o.status),
            "agent_id": o.agent_id, "created_at": _iso(o.created_at)}


async def _order(db: AsyncSession, code: str) -> StationOrder:
    o = (await db.execute(select(StationOrder).where(StationOrder.code == code.strip().upper()))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Заказа нет в списке")
    return o


@router.get("/station/{agent_id}/orders")
async def station_orders(agent_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Оператор: активные заказы станции (принят/готов), по времени готовности."""
    await _require_operator(db, user, agent_id)
    rows = (await db.execute(select(StationOrder).where(
        StationOrder.agent_id == agent_id, StationOrder.status.in_(("new", "ready"))
    ).order_by(StationOrder.ready_at.nulls_last(), StationOrder.id))).scalars().all()
    return [_order_row(o) for o in rows]


@router.get("/order/{code}")
async def order_lookup(code: str, db: AsyncSession = Depends(get_db),
                       user: Optional[User] = Depends(get_current_user_optional)):
    o = await _order(db, code)
    a = await db.get(Agent, o.agent_id)
    out = _order_row(o)
    out["station_name"] = a.name if a else ""
    out["can_operate"] = await _can_operate(db, user, o.agent_id)
    if out["can_operate"]:
        out["verdict"] = ({"ok": True, "text": "Заказ найден в списке станции"} if o.status in ("new", "ready")
                          else {"ok": False, "text": f"Заказ уже «{_ORDER_RU.get(o.status, o.status)}» — повторный показ"})
    return out


@router.post("/order/{code}/{action}")
async def order_action(code: str, action: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """ready — приготовлен; done — выдан/услуга оказана; cancel — отменён (оператор или сам клиент)."""
    o = await _order(db, code)
    is_op = await _can_operate(db, user, o.agent_id)
    if action == "cancel":
        if not (is_op or (o.user_id and o.user_id == user.id)):
            raise HTTPException(403, "Нет доступа")
    elif not is_op:
        raise HTTPException(403, "Нет доступа: вы не оператор этой АЗС")
    if o.status in ("done", "cancelled"):
        raise HTTPException(409, f"Заказ уже «{_ORDER_RU.get(o.status, o.status)}»")
    if action == "ready":
        o.status = "ready"
    elif action == "done":
        o.status = "done"
        o.done_at = datetime.now(timezone.utc)
    elif action == "cancel":
        o.status = "cancelled"
    else:
        raise HTTPException(400, "Неизвестное действие")
    await db.commit()
    if o.status in ("done", "cancelled"):
        await fuel_station.day_status(db, [o.code], o.status)
    return _order_row(o)


@router.get("/{code}")
async def queue_lookup(code: str, station: int = 0, db: AsyncSession = Depends(get_db),
                       user: Optional[User] = Depends(get_current_user_optional)):
    """Талон. Водителю — его данные; оператору — ещё и СВЕРКА со списком станции (verdict)."""
    e = await _entry(db, code)
    a = await db.get(Agent, e.agent_id)
    out = _row(e)
    out["station_name"] = a.name if a else ""
    can = await _can_operate(db, user, e.agent_id)
    out["can_operate"] = can
    if user and not can and station:
        # оператор ДРУГОЙ станции отсканировал чужой талон
        if await _can_operate(db, user, station):
            out["verdict"] = {"ok": False, "text": f"Талон другой АЗС ({out['station_name']}) — не обслуживать здесь"}
    if can:
        if e.status == "waiting":
            out["verdict"] = {"ok": True, "text": "Найден в списке станции. Сверьте гос-номер с машиной."}
        elif e.status == "arrived":
            out["verdict"] = {"ok": True, "text": "В списке, уже отмечен «подъехал». Можно заправлять."}
        elif e.status == "expired":
            out["verdict"] = {"ok": False, "text": f"Талон СГОРЕЛ: не подъехал к назначенному времени {fuel_station.hhmm(e.slot_at)}"}
        elif e.status == "served":
            out["verdict"] = {"ok": False, "text": "Талон уже использован — повторный показ (скриншот?)"}
        else:
            out["verdict"] = {"ok": False, "text": "Талон отменён"}
    return out


@router.get("/{code}/qr.svg")
async def queue_qr(code: str):
    import segno
    url = f"{_PUBLIC_BASE}/q/{code.upper()}"
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", scale=6, border=2, dark="#1c2230", light=None)
    return Response(content=buf.getvalue(), media_type="image/svg+xml")


@router.post("/{code}/arrive")
async def queue_arrive(code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Оператор: клиент подъехал (QR сверен со списком)."""
    e = await _entry(db, code)
    await _require_operator(db, user, e.agent_id)
    if e.status != "waiting":
        raise HTTPException(409, f"Нельзя отметить «подъехал»: талон в статусе «{_STATUS_RU.get(e.status, e.status)}»")
    e.status = "arrived"
    e.arrived_at = datetime.now(timezone.utc)
    await db.commit()
    return _row(e)


@router.post("/{code}/serve")
async def queue_serve(code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Оператор: заправлен (талон закрыт, повторно не принимается)."""
    e = await _entry(db, code)
    await _require_operator(db, user, e.agent_id)
    if e.status not in ("waiting", "arrived"):
        raise HTTPException(409, f"Талон уже «{_STATUS_RU.get(e.status, e.status)}»")
    if not e.arrived_at:
        e.arrived_at = datetime.now(timezone.utc)
    e.status = "served"
    e.served_at = datetime.now(timezone.utc)
    await db.commit()
    await fuel_station.day_status(db, [e.code], "done")
    return _row(e)


@router.post("/{code}/cancel")
async def queue_cancel(code: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Отменить талон: оператор станции или сам водитель."""
    e = await _entry(db, code)
    if not (await _can_operate(db, user, e.agent_id) or (e.user_id and e.user_id == user.id)):
        raise HTTPException(403, "Нет доступа")
    if e.status in ("served", "cancelled"):
        raise HTTPException(409, "Талон уже закрыт")
    e.status = "cancelled"
    await db.commit()
    await fuel_station.day_status(db, [e.code], "cancelled")
    return _row(e)
