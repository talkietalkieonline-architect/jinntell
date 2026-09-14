"""Лист ожидания (предрегистрация): публичная заявка + админ-управление."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.user import User
from app.models.waitlist import WaitlistEntry

router = APIRouter(prefix="/api", tags=["waitlist"])


class WaitlistIn(BaseModel):
    name: str = ""
    contact: str = ""


@router.post("/waitlist")
async def join_waitlist(body: WaitlistIn, db: AsyncSession = Depends(get_db)):
    """Публичная заявка в лист ожидания."""
    contact = (body.contact or "").strip()[:200]
    name = (body.name or "").strip()[:120]
    if not contact or len(contact) < 5:
        raise HTTPException(400, "Укажите email или телефон")
    ex = (await db.execute(select(WaitlistEntry).where(WaitlistEntry.contact == contact))).scalar_one_or_none()
    if ex:
        pos = (await db.execute(select(func.count(WaitlistEntry.id)).where(WaitlistEntry.id <= ex.id))).scalar() or 0
        return {"ok": True, "already": True, "position": int(pos)}
    e = WaitlistEntry(name=name, contact=contact, status="waitlisted")
    db.add(e)
    await db.commit()
    total = (await db.execute(select(func.count(WaitlistEntry.id)))).scalar() or 0
    return {"ok": True, "already": False, "position": int(total)}


@router.get("/admin/waitlist")
async def admin_waitlist(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(WaitlistEntry).order_by(WaitlistEntry.id.desc()))).scalars().all()
    waiting = sum(1 for r in rows if r.status == "waitlisted")
    return {
        "total": len(rows), "waiting": waiting,
        "entries": [{"id": r.id, "name": r.name, "contact": r.contact, "status": r.status,
                     "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows[:500]],
    }


@router.post("/admin/waitlist/{entry_id}/status")
async def admin_waitlist_status(entry_id: int, status: str, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    if status not in ("waitlisted", "invited", "active"):
        raise HTTPException(400, "bad status")
    e = (await db.execute(select(WaitlistEntry).where(WaitlistEntry.id == entry_id))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "not found")
    e.status = status
    await db.commit()
    return {"ok": True, "id": entry_id, "status": status}


@router.get("/admin/waitlist-users")
async def admin_waitlist_users(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    """Ожидающие активации пользователи (is_active=False, не удалённые) + счётчик активных + настройки."""
    from app.services.settings_store import get_setting
    active = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar() or 0
    rows = (await db.execute(
        select(User).where(User.is_active == False, ~User.phone.like("del\\_%"), User.is_admin == False)
        .order_by(User.id.desc()).limit(500)
    )).scalars().all()
    mode = ((await get_setting("WAITLIST_MODE")) or "off").strip().lower()
    try:
        limit = int((await get_setting("WAITLIST_LIMIT")) or "1000")
    except Exception:
        limit = 1000
    return {
        "active_count": int(active), "limit": limit, "mode": mode, "pending_count": len(rows),
        "pending": [{"id": u.id, "name": u.display_name, "phone": u.phone, "email": u.email,
                     "created_at": (u.created_at.isoformat() if getattr(u, "created_at", None) else None)} for u in rows],
    }


@router.post("/admin/waitlist-users/{user_id}/activate")
async def admin_activate_user(user_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "not found")
    u.is_active = True
    await db.commit()
    return {"ok": True, "id": user_id}


@router.post("/admin/waitlist-settings")
async def admin_waitlist_settings(mode: str = "", limit: int = 0, admin: User = Depends(get_admin_user)):
    from app.services.settings_store import set_setting
    if mode:
        if mode not in ("off", "on", "auto"):
            raise HTTPException(400, "bad mode")
        await set_setting("WAITLIST_MODE", mode)
    if limit and int(limit) > 0:
        await set_setting("WAITLIST_LIMIT", str(int(limit)))
    return {"ok": True}
