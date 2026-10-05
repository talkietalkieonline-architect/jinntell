"""API очереди на заправку (функция queue_register джина АЗС).
Пользователь получает код+QR-пропуск; оператор станции сканирует QR и отмечает «заправлен»."""
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.user import User
from app.models.fuel_queue import FuelQueueEntry

router = APIRouter(prefix="/api/queue", tags=["queue"])

_PUBLIC_BASE = "https://jinntell.ru"


@router.get("/{code}")
async def queue_lookup(code: str, db: AsyncSession = Depends(get_db)):
    e = (await db.execute(select(FuelQueueEntry).where(FuelQueueEntry.code == code.upper()))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Запись не найдена")
    return {"code": e.code, "number": e.number, "car_plate": e.car_plate, "fuel_type": e.fuel_type,
            "liters": e.liters, "status": e.status, "agent_id": e.agent_id,
            "created_at": e.created_at.isoformat() if e.created_at else None}


@router.get("/{code}/qr.svg")
async def queue_qr(code: str):
    import segno
    url = f"{_PUBLIC_BASE}/q/{code.upper()}"
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", scale=6, border=2, dark="#1c2230", light=None)
    return Response(content=buf.getvalue(), media_type="image/svg+xml")


@router.post("/{code}/serve")
async def queue_serve(code: str, db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin_user)):
    e = (await db.execute(select(FuelQueueEntry).where(FuelQueueEntry.code == code.upper()))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Запись не найдена")
    e.status = "served"
    e.served_at = datetime.now(timezone.utc)
    await db.flush()
    return {"ok": True, "code": e.code, "status": e.status}


@router.get("/station/{agent_id}")
async def queue_station(agent_id: int, db: AsyncSession = Depends(get_db), admin: User = Depends(get_admin_user)):
    rows = (await db.execute(select(FuelQueueEntry).where(
        FuelQueueEntry.agent_id == agent_id, FuelQueueEntry.status == "waiting"
    ).order_by(FuelQueueEntry.number))).scalars().all()
    return [{"code": e.code, "number": e.number, "car_plate": e.car_plate, "fuel_type": e.fuel_type,
             "liters": e.liters, "created_at": e.created_at.isoformat() if e.created_at else None} for e in rows]
