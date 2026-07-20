"""Журнал действий: приём UI-событий с клиента и чтение журнала админом."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_text
from app.core.database import get_db
from app.core.deps import get_admin_user, get_current_user
from app.models.activity import ActivityLog
from app.models.user import User
from app.services.activity import CLIENT_ACTIONS, log as write_log

router = APIRouter(prefix="/api/activity", tags=["activity"])


class ClientEvent(BaseModel):
    action: str
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    target_name: Optional[str] = None
    room: Optional[str] = None
    result: Optional[str] = None
    detail: Optional[str] = None


@router.post("")
async def report_event(body: ClientEvent, user: User = Depends(get_current_user)):
    """UI-события с клиента (открыл/закрыл чат, звонок, Поток).

    Backend их не видит — это состояние фронта. Принимаем только из белого списка,
    чтобы журнал нельзя было засорить произвольными действиями.
    """
    if body.action not in CLIENT_ACTIONS:
        return {"ok": False, "reason": "unknown_action"}
    await write_log(
        body.action, user_id=user.id, actor="user",
        target_type=body.target_type, target_id=body.target_id,
        target_name=body.target_name, room=body.room,
        result=body.result, detail=body.detail,
    )
    return {"ok": True}


@router.get("/admin")
async def read_log(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    actor: Optional[str] = None,
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(200, ge=1, le=1000),
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Чтение журнала (только админ). Фильтры: пользователь, действие, актор, глубина в часах."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    q = select(ActivityLog).where(ActivityLog.created_at >= since)
    if user_id:
        q = q.where(ActivityLog.user_id == user_id)
    if action:
        q = q.where(ActivityLog.action == action)
    if actor:
        q = q.where(ActivityLog.actor == actor)
    res = await db.execute(q.order_by(ActivityLog.id.desc()).limit(limit))
    rows = res.scalars().all()
    return {"total": len(rows), "items": [{
        "id": r.id,
        "user_id": r.user_id,
        "actor": r.actor,
        "action": r.action,
        "target_type": r.target_type,
        "target_id": r.target_id,
        "target_name": r.target_name,
        "room": r.room,
        "result": r.result,
        "detail": decrypt_text(r.detail) if r.detail else None,
        "created_at": r.created_at.isoformat(),
    } for r in rows]}
