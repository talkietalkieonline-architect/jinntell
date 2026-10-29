"""CRM внутреннего отдела продаж JinnTell («Штаб продаж», этап 1).

Кто работает: владелец (is_admin) и сотрудники с users.crm_role — owner | rop | marketer | manager.
Порядок работы: нашли компанию → занесли (название + почта) → Кирилл (#63) пишет КП → отправили письмом →
звонок → переговоры → клиент / отказ. Заявки Марка и компании, найденные Тимуром, падают сюда сами (agent_tools).
«Мой день» — личное пространство пользователя: CRM туда НИЧЕГО не пишет; следующие шаги — в самой CRM («Шаги на сегодня»).
"""
import json
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.crm import CrmCompany, CrmEvent
from app.models.user import User

router = APIRouter(prefix="/api/crm", tags=["crm"])

STAGES = [("new", "Новая"), ("kp", "КП отправлено"), ("call", "Звонок"), ("talks", "Переговоры"),
          ("won", "Клиент"), ("lost", "Отказ")]
STAGE_LABEL = dict(STAGES)
ROLES = {"owner": "Владелец", "rop": "РОП", "marketer": "Маркетолог", "manager": "Менеджер по продажам"}
KP_WRITER_ID = 63  # Кирилл — КП и скрипты продаж
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _role(u: User) -> Optional[str]:
    r = getattr(u, "crm_role", None)
    return r if r in ROLES else ("owner" if u.is_admin else None)


async def crm_user(user: User = Depends(get_current_user)) -> User:
    if not _role(user):
        raise HTTPException(403, "Нет доступа к CRM")
    return user


def _who(u: User) -> str:
    return (u.display_name or u.first_name or u.email or u.phone or f"#{u.id}").strip()


def _dt(v) -> Optional[datetime]:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, "Неверная дата")


def _out(c: CrmCompany, names: dict) -> dict:
    return {
        "id": c.id, "name": c.name, "email": c.email, "phone": c.phone, "contact_name": c.contact_name,
        "city": c.city, "industry": c.industry, "website": c.website, "notes": c.notes,
        "stage": c.stage, "stage_label": STAGE_LABEL.get(c.stage, c.stage), "source": c.source,
        "responsible_user_id": c.responsible_user_id, "responsible_name": names.get(c.responsible_user_id),
        "next_action_at": c.next_action_at.isoformat() if c.next_action_at else None,
        "next_action_note": c.next_action_note, "lost_reason": c.lost_reason, "is_new": c.is_new,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


async def _names(db: AsyncSession, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()
    return {u.id: _who(u) for u in rows}


async def _event(db, company_id: int, kind: str, text: str, user: Optional[User] = None, author: str = ""):
    db.add(CrmEvent(company_id=company_id, kind=kind, text=text,
                    author_user_id=user.id if user else None, author_name=(_who(user) if user else author)[:120]))


async def _get(db, cid: int) -> CrmCompany:
    c = await db.get(CrmCompany, cid)
    if not c:
        raise HTTPException(404, "Компания не найдена")
    return c


# ───────────── кто я / воронка ─────────────
@router.get("/me")
async def me(user: User = Depends(crm_user)):
    r = _role(user)
    return {"id": user.id, "name": _who(user), "role": r, "role_label": ROLES[r],
            "can_manage_team": user.is_admin or r in ("owner", "rop"),
            "stages": [{"id": k, "label": v} for k, v in STAGES]}


@router.get("/companies")
async def list_companies(stage: Optional[str] = None, q: Optional[str] = None,
                         user: User = Depends(crm_user), db: AsyncSession = Depends(get_db)):
    st = select(CrmCompany)
    if stage:
        st = st.where(CrmCompany.stage == stage)
    if q:
        like = f"%{q.strip()}%"
        st = st.where(or_(CrmCompany.name.ilike(like), CrmCompany.email.ilike(like), CrmCompany.city.ilike(like),
                          CrmCompany.contact_name.ilike(like), CrmCompany.phone.ilike(like)))
    rows = (await db.execute(st.order_by(CrmCompany.is_new.desc(), CrmCompany.updated_at.desc()).limit(500))).scalars().all()
    names = await _names(db, [c.responsible_user_id for c in rows])
    counts = dict((await db.execute(select(CrmCompany.stage, func.count()).group_by(CrmCompany.stage))).all())
    new_count = (await db.execute(select(func.count()).where(CrmCompany.is_new == True))).scalar() or 0  # noqa: E712
    return {"items": [_out(c, names) for c in rows], "counts": counts, "new": new_count}


_FIELDS = ("name", "email", "phone", "contact_name", "city", "industry", "website", "notes")


@router.post("/companies")
async def create_company(body: dict = Body(...), user: User = Depends(crm_user), db: AsyncSession = Depends(get_db)):
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    if not name or not _EMAIL.match(email):
        raise HTTPException(400, "Нужны название компании и почта")
    dup = (await db.execute(select(CrmCompany).where(func.lower(CrmCompany.email) == email))).scalar_one_or_none()
    if dup:
        raise HTTPException(409, f"Компания с этой почтой уже есть: {dup.name}")
    c = CrmCompany(stage="new", source=(body.get("source") or "Вручную")[:120], responsible_user_id=user.id,
                   created_by=user.id, is_new=False)
    for f in _FIELDS:
        v = body.get(f)
        if isinstance(v, str) and v.strip():
            setattr(c, f, v.strip()[:2000] if f == "notes" else v.strip()[:300])
    c.email = email
    db.add(c)
    await db.flush()
    await _event(db, c.id, "created", f"Компания занесена в CRM ({c.source})", user)
    await db.commit()
    await db.refresh(c)
    return _out(c, await _names(db, [c.responsible_user_id]))


@router.get("/companies/{cid}")
async def get_company(cid: int, user: User = Depends(crm_user), db: AsyncSession = Depends(get_db)):
    c = await _get(db, cid)
    if c.is_new:
        c.is_new = False
        await db.commit()
        await db.refresh(c)
    ev = (await db.execute(select(CrmEvent).where(CrmEvent.company_id == cid).order_by(CrmEvent.id.desc()))).scalars().all()
    return {**_out(c, await _names(db, [c.responsible_user_id])),
            "events": [{"id": e.id, "kind": e.kind, "text": e.text, "author": e.author_name,
                        "created_at": e.created_at.isoformat() if e.created_at else None} for e in ev]}


@router.patch("/companies/{cid}")
async def update_company(cid: int, body: dict = Body(...), user: User = Depends(crm_user), db: AsyncSession = Depends(get_db)):
    c = await _get(db, cid)
    for f in _FIELDS:
        if f in body:
            v = (body.get(f) or "").strip()
            if f == "name" and not v:
                raise HTTPException(400, "Название не может быть пустым")
            if f == "email" and v and not _EMAIL.match(v):
                raise HTTPException(400, "Неверная почта")
            setattr(c, f, v or None)
    if "responsible_user_id" in body:
        c.responsible_user_id = int(body["responsible_user_id"]) if body["responsible_user_id"] else None
    if "next_action_at" in body or "next_action_note" in body:
        c.next_action_at = _dt(body.get("next_action_at"))
        c.next_action_note = (body.get("next_action_note") or "").strip()[:300] or None
    st = body.get("stage")
    if st and st != c.stage:
        if st not in STAGE_LABEL:
            raise HTTPException(400, "Неизвестный этап")
        if st == "lost":
            c.lost_reason = (body.get("lost_reason") or "").strip()[:300] or None
        await _event(db, c.id, "stage", f"{STAGE_LABEL.get(c.stage, c.stage)} → {STAGE_LABEL[st]}"
                     + (f". Причина: {c.lost_reason}" if st == "lost" and c.lost_reason else ""), user)
        c.stage = st
    await db.commit()
    await db.refresh(c)
    return _out(c, await _names(db, [c.responsible_user_id]))


@router.post("/companies/{cid}/events")
async def add_event(cid: int, body: dict = Body(...), user: User = Depends(crm_user), db: AsyncSession = Depends(get_db)):
    """Заметка / звонок / встреча. Звонок на этапе «КП отправлено» переводит сделку в «Звонок»."""
    c = await _get(db, cid)
    kind = body.get("kind") if body.get("kind") in ("note", "call", "meeting") else "note"
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Опишите, что было")
    await _event(db, c.id, kind, text, user)
    if kind == "call" and c.stage in ("new", "kp"):
        await _event(db, c.id, "stage", f"{STAGE_LABEL[c.stage]} → {STAGE_LABEL['call']}", user)
        c.stage = "call"
    if kind == "meeting" and c.stage in ("new", "kp", "call"):
        await _event(db, c.id, "stage", f"{STAGE_LABEL[c.stage]} → {STAGE_LABEL['talks']}", user)
        c.stage = "talks"
    if body.get("next_action_at"):
        c.next_action_at = _dt(body["next_action_at"])
        c.next_action_note = (body.get("next_action_note") or "").strip()[:300] or None
    c.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


# ───────────── КП: черновик от Кирилла → правка → письмо ─────────────
_KP_PAGES = {"азс": "/about/kp/azs", "заправ": "/about/kp/azs", "кофе": "/about/kp/cafe", "кафе": "/about/kp/cafe",
             "ресторан": "/about/kp/cafe", "пекар": "/about/kp/cafe"}


def _kp_page(industry: str) -> str:
    low = (industry or "").lower()
    return next((p for k, p in _KP_PAGES.items() if k in low), "/about/kp/rent")


@router.post("/companies/{cid}/kp/draft")
async def kp_draft(cid: int, body: dict = Body(default={}), user: User = Depends(crm_user), db: AsyncSession = Depends(get_db)):
    from app.models.agent import Agent
    from app.services import assistant_agent as aa
    c = await _get(db, cid)
    writer = await db.get(Agent, KP_WRITER_ID)
    if not writer:
        raise HTTPException(503, "Кирилл недоступен")
    page = f"https://jinntell.ru{_kp_page(c.industry)}"
    ask = (f"Напиши персональное коммерческое предложение ПИСЬМОМ для компании.\n"
           f"Компания: {c.name}. Отрасль: {c.industry or 'не указана'}. Город: {c.city or 'не указан'}. "
           f"Сайт: {c.website or '—'}. Контакт: {c.contact_name or '—'}. Что знаем: {c.notes or '—'}.\n"
           f"Пожелание отдела: {(body.get('focus') or '').strip() or '—'}.\n"
           f"Подпись: {_who(user)}, JinnTell. Ссылка на подробное КП: {page}. "
           f"Задать вопрос нашему джину-менеджеру Марку: https://jinntell.ru/promoter/spb?src=crm-kp.\n"
           "Формат строго: первая строка «Тема: …», затем пустая строка и текст письма (150–220 слов, обычный текст без markdown, "
           "обращение по имени, если оно известно; 2–3 выгоды именно для этой отрасли; одно предложение — 15-минутная встреча/демо). "
           "Цены — только из базы знаний, иначе не называй. Не вызывай make_document — просто верни текст.")
    raw = (await aa._ask_one(writer, 0, ask, max_tokens=1200) or "").strip()
    m = re.match(r"^\s*Тема:\s*(.+?)\n+(.*)$", raw, re.S)
    subject, text = (m.group(1).strip(), m.group(2).strip()) if m else (f"JinnTell для {c.name}", raw)
    return {"subject": subject[:200], "text": text, "page": page}


@router.post("/companies/{cid}/kp/send")
async def kp_send(cid: int, body: dict = Body(...), user: User = Depends(crm_user), db: AsyncSession = Depends(get_db)):
    from app.services.email_service import send_email
    c = await _get(db, cid)
    to = (body.get("to") or c.email or "").strip()
    subject = (body.get("subject") or "").strip()
    text = (body.get("text") or "").strip()
    if not _EMAIL.match(to) or not subject or not text:
        raise HTTPException(400, "Нужны почта, тема и текст письма")
    ok = await send_email(to, subject, text, reply_to=(user.email or None))
    if not ok:
        raise HTTPException(502, "Письмо не ушло — почтовый сервер не ответил. Попробуйте позже.")
    await _event(db, c.id, "kp_sent", f"КП отправлено на {to}\nТема: {subject}\n\n{text}", user)
    if c.stage == "new":
        await _event(db, c.id, "stage", f"{STAGE_LABEL['new']} → {STAGE_LABEL['kp']}", user)
        c.stage = "kp"
    c.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


# ───────────── команда ─────────────
@router.get("/team")
async def team(user: User = Depends(crm_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(User).where(or_(User.crm_role.isnot(None), User.is_admin == True)))).scalars().all()  # noqa: E712
    return [{"id": u.id, "name": _who(u), "email": u.email, "phone": u.phone, "role": _role(u),
             "role_label": ROLES.get(_role(u) or "", "")} for u in rows if _role(u)]


@router.post("/team")
async def team_add(body: dict = Body(...), user: User = Depends(crm_user), db: AsyncSession = Depends(get_db)):
    if not (user.is_admin or _role(user) in ("owner", "rop")):
        raise HTTPException(403, "Команду меняют владелец и РОП")
    login = (body.get("login") or "").strip().lower()
    role = body.get("role")
    if role not in ROLES or not login:
        raise HTTPException(400, "Укажите почту или телефон и роль")
    if role == "owner" and not user.is_admin:
        raise HTTPException(403, "Роль «Владелец» назначает только владелец")
    u = (await db.execute(select(User).where(or_(func.lower(User.email) == login, User.phone == login)))).scalar_one_or_none()
    if not u:
        raise HTTPException(404, "Такого пользователя нет — пусть сначала зарегистрируется в JinnTell")
    u.crm_role = role
    await db.commit()
    return {"ok": True, "name": _who(u), "role_label": ROLES[role]}


@router.delete("/team/{uid}")
async def team_remove(uid: int, user: User = Depends(crm_user), db: AsyncSession = Depends(get_db)):
    if not (user.is_admin or _role(user) in ("owner", "rop")):
        raise HTTPException(403, "Команду меняют владелец и РОП")
    u = await db.get(User, uid)
    if u:
        u.crm_role = None
        await db.commit()
    return {"ok": True}
