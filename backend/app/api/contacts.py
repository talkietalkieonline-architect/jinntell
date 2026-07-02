"""API контактов (адресная книга людей) и личных диалогов человек↔человек."""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.contact import Contact
from app.models.user import User

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


class ContactOut(BaseModel):
    id: int
    display_name: str
    phone: str
    jinntell_link: Optional[str] = None
    avatar_color: Optional[str] = None
    is_online: bool = False

    class Config:
        from_attributes = True


class AddContactIn(BaseModel):
    identifier: str  # телефон или jinntell-ссылка


def _norm_phone(s: str) -> str:
    """Приводим телефон к формату +7XXXXXXXXXX (8..., 7..., 10 цифр)."""
    d = re.sub(r"\D", "", s or "")
    if len(d) == 11 and d[0] == "8":
        d = "7" + d[1:]
    if len(d) == 11 and d[0] == "7":
        return "+" + d
    if len(d) == 10:
        return "+7" + d
    return s


def dm_room(a: int, b: int) -> str:
    lo, hi = sorted((a, b))
    return f"dm-{lo}-{hi}"


@router.get("", response_model=list[ContactOut])
async def list_contacts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(User).join(Contact, Contact.contact_user_id == User.id).where(Contact.owner_user_id == user.id)
    )
    return [ContactOut.model_validate(u) for u in res.scalars().all()]


@router.post("", response_model=ContactOut)
async def add_contact(body: AddContactIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ident = (body.identifier or "").strip()
    if not ident:
        raise HTTPException(400, "Укажите телефон или ссылку")
    norm = _norm_phone(ident)
    res = await db.execute(
        select(User).where(or_(User.phone == norm, User.phone == ident, User.jinntell_link == ident))
    )
    other = res.scalar_one_or_none()
    if not other:
        raise HTTPException(404, "Пользователь не найден по телефону/ссылке")
    if other.id == user.id:
        raise HTTPException(400, "Нельзя добавить самого себя")
    exists = await db.execute(
        select(Contact).where(Contact.owner_user_id == user.id, Contact.contact_user_id == other.id)
    )
    if not exists.scalar_one_or_none():
        db.add(Contact(owner_user_id=user.id, contact_user_id=other.id))
        await db.commit()
    return ContactOut.model_validate(other)


@router.delete("/{contact_user_id}")
async def remove_contact(contact_user_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Contact).where(Contact.owner_user_id == user.id, Contact.contact_user_id == contact_user_id)
    )
    c = res.scalar_one_or_none()
    if c:
        await db.delete(c)
        await db.commit()
    return {"ok": True}
