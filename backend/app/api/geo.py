"""Геотриггер — проверка «пользователь рядом» и доставка «стука» бизнес-джинна.
Учитывает настройки действий пользователя (геолокация/обращения/акции), кулдаун,
и списывает показ с баланса контрагента (block-at-zero). См. модель GeoTrigger."""
import math
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/geo", tags=["geo"])


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@router.post("/check")
async def geo_check(
    body: dict = Body(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Фронт шлёт текущие координаты (когда приложение открыто и геолокация разрешена).
    Возвращает список доставленных «стуков» бизнес-джиннов рядом."""
    lat, lng = body.get("lat"), body.get("lng")
    if lat is None or lng is None:
        return {"deliveries": []}

    from app.api.users import _read_action_settings
    acts = _read_action_settings(user)
    # Согласие пользователя: геолокация + обращения включены
    if not acts.get("allow_location") or acts.get("approaches") == "off":
        return {"deliveries": []}

    from app.models.geo_trigger import GeoTrigger, GeoTriggerHit, GeoContact
    from app.models.agent import Agent
    from app.models.contractor import Contractor
    from app.models.message import Message

    triggers = (await db.execute(select(GeoTrigger).where(GeoTrigger.is_active == True))).scalars().all()
    now = datetime.now(timezone.utc)
    deliveries = []

    for gt in triggers:
        try:
            if _haversine_m(float(lat), float(lng), gt.lat, gt.lng) > gt.radius_m:
                continue
            # Акции/купоны или «приглашения на улице» выключены у пользователя — не стучимся
            if not acts.get("allow_promo", True) or not acts.get("street_invites", True):
                continue
            # Кулдаун на пользователя
            hit = (await db.execute(select(GeoTriggerHit).where(
                GeoTriggerHit.trigger_id == gt.id, GeoTriggerHit.user_id == user.id))).scalar_one_or_none()
            if hit and hit.last_fired_at and (now - hit.last_fired_at).total_seconds() < gt.cooldown_hours * 3600:
                continue
            agent = await db.get(Agent, gt.agent_id)
            if not agent or not agent.is_active:
                continue
            from app.services import promos as _pr
            if not _pr.zazyvala_on(agent):
                continue  # функция «Зазывала» выключена в «Функциях» джина
            promo = _pr.current(gt)
            if not promo:
                continue  # сейчас ни одна акция не действует — зазывала молчит (и показ не списывается)
            # Списание показа с контрагента (пустой баланс — не рекламируем)
            cid = getattr(agent, "contractor_id", None) or getattr(agent, "owner_id", None)
            contractor = await db.get(Contractor, cid) if cid else None
            if contractor is not None:
                if (contractor.balance_kopecks or 0) <= 0:
                    continue
                contractor.balance_kopecks = (contractor.balance_kopecks or 0) - (gt.price_kopecks or 0)
            # Кулдаун-запись
            if hit:
                hit.last_fired_at = now
            else:
                db.add(GeoTriggerHit(trigger_id=gt.id, user_id=user.id, last_fired_at=now))
            # Доставка «стука» в чат с джинном
            room = f"agent-{agent.id}-u{user.id}"
            text = (gt.title or "").strip()
            # Тело стука: своё сообщение триггера, иначе — единый промо-дайджест джина (тот же, что по QR)
            body = (gt.message or "").strip() or (getattr(agent, "promo_digest", None) or "").strip()
            if body:
                text = (text + "\n" + body).strip() if text else body
            if not text:
                text = "У нас есть предложение для вас рядом!"
            if gt.promo_code:
                text = f"{text}\nПромокод: {gt.promo_code} (назовите на месте)"
            # Стук = только уведомление; сама презентация звучит, когда человек откроет её в Потоке (/present)
            # Журнал контактов гео-промо (атрибуция трафика)
            db.add(GeoContact(trigger_id=gt.id, agent_id=agent.id, user_id=user.id,
                              promo_code=gt.promo_code, result="shown",
                              promo_title=(promo["title"] or "")[:100] or None, promo_text=promo["text"] or None,
                              attach_json=json.dumps(promo["attach"], ensure_ascii=False) if promo.get("attach") else None))
            deliveries.append({
                "agent_id": agent.id, "agent_name": agent.name, "color": agent.color,
                "title": promo["title"] or gt.title or "", "message": promo["text"] or gt.message or "",
                "media_url": gt.media_url, "room": room,
                "quiet": acts.get("approaches") == "assistant",
                "voice": (getattr(agent, "tts_voice_id", None) or getattr(agent, "voice_id", None) or None),
                "promo_code": gt.promo_code or None,
                "attach": promo.get("attach"),
            })
        except Exception as e:
            print(f"[geo] trigger {gt.id} error: {e}")

    await db.commit()
    return {"deliveries": deliveries}


@router.get("/my-invites")
async def my_invites(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Мои приглашения (гео-промо, что мне показывали) — по одному свежему на джинна."""
    from app.models.geo_trigger import GeoContact, GeoTrigger
    from app.models.agent import Agent
    rows = (await db.execute(
        select(GeoContact).where(GeoContact.user_id == user.id).order_by(GeoContact.id.desc()).limit(60)
    )).scalars().all()
    items = []
    seen = set()
    for c in rows:
        if c.agent_id in seen:
            continue
        seen.add(c.agent_id)
        a = await db.get(Agent, c.agent_id)
        if not a or not a.is_active:
            continue
        gt = (await db.execute(select(GeoTrigger).where(GeoTrigger.agent_id == c.agent_id))).scalar_one_or_none()
        try:
            att = json.loads(c.attach_json) if c.attach_json else None
        except ValueError:
            att = None
        items.append({
            "agent_id": a.id, "agent_name": a.name, "color": a.color,
            "title": c.promo_title or (gt.title if gt else "") or "",
            "message": c.promo_text or (gt.message if gt else "") or "",
            "attach": att,
            "media_url": (gt.media_url if gt else None),
            "promo_code": c.promo_code or (gt.promo_code if gt else None),
            "at": c.created_at.isoformat(), "room": f"agent-{a.id}-u{user.id}",
        })
        if len(items) >= 20:
            break
    return {"items": items}



@router.post("/present")
async def geo_present(body: dict = Body(...), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Человек открыл «стук» зазывалы → джинн в Потоке проговаривает презентацию с обращением по имени.
    Текст — из кабинета бизнеса (заголовок + текст-призыв + промокод). Сообщение уходит в комнату джинна (WS)."""
    from datetime import datetime, timedelta, timezone
    from app.models.geo_trigger import GeoContact, GeoTrigger
    from fastapi import HTTPException
    from app.models.agent import Agent
    from app.models.message import Message
    from app.websocket.manager import manager
    try:
        agent_id = int(body.get("agent_id") or 0)
    except (TypeError, ValueError):
        agent_id = 0
    from app.services import promos as _pr
    since = datetime.now(timezone.utc) - timedelta(hours=3)
    c = (await db.execute(select(GeoContact).where(GeoContact.user_id == user.id, GeoContact.agent_id == agent_id)
                          .order_by(GeoContact.id.desc()).limit(1))).scalar_one_or_none()
    agent = await db.get(Agent, agent_id)
    if agent and not _pr.zazyvala_on(agent):
        raise HTTPException(404, "Зазывала у заведения выключена")
    if (not c or (c.created_at and c.created_at < since)) and (body.get("source") == "qr") and agent:
        # QR «Послушать акцию» у входа/на витрине: контакт без гео — так же попадает в «Приглашения» и память помощника
        gt0 = (await db.execute(select(GeoTrigger).where(GeoTrigger.agent_id == agent_id))).scalar_one_or_none()
        if not gt0:
            raise HTTPException(404, "У заведения нет акций")
        c = GeoContact(trigger_id=gt0.id, agent_id=agent_id, user_id=user.id, promo_code=gt0.promo_code, result="qr")
        db.add(c)
        await db.flush()
    if not c or (c.created_at and c.created_at < since and c.result != "qr"):
        raise HTTPException(404, "Приглашение не найдено или устарело")
    gt = await db.get(GeoTrigger, c.trigger_id)
    if not gt or not agent:
        raise HTTPException(404, "Приглашение не найдено")
    promo = _pr.current(gt) or {"title": c.promo_title or gt.title or "", "text": c.promo_text or gt.message or "",
                                "attach": json.loads(c.attach_json) if c.attach_json else None}
    if not c.promo_title and not c.promo_text:  # QR-контакт: запомнить, что человек услышал
        c.promo_title = (promo["title"] or "")[:100] or None
        c.promo_text = promo["text"] or None
        c.attach_json = json.dumps(promo["attach"], ensure_ascii=False) if promo.get("attach") else None
    nm = (user.first_name or user.display_name or "").strip()
    if nm in ("Пользователь", "Гость"):
        nm = ""
    head = f"Привет, {nm}!" if nm else "Привет!"
    title = (promo["title"] or "").strip().rstrip("!.")
    body_txt = (promo["text"] or "").strip() or (getattr(agent, "promo_digest", None) or "").strip()
    text = " ".join(x for x in [head, (title + "!") if title else "", body_txt] if x).strip()
    if gt.promo_code:
        text += f"\nПромокод: {gt.promo_code} — назовите на месте."
    if promo.get("attach"):
        text += "\n" + _pr.attach_line(promo["attach"]) + " — лежит в «Приглашениях»."
    room = f"agent-{agent.id}-u{user.id}"
    msg = Message(room=room, sender_type="agent", sender_agent_id=agent.id, sender_name=agent.name, text=text,
                  media_url=(gt.media_url if gt.media_url and len(gt.media_url) <= 500 else None),
                  media_type=("image" if gt.media_url else None))
    db.add(msg)
    if c.result != "qr":
        c.result = "opened"
    await db.commit()
    await db.refresh(msg)
    await manager.broadcast(room, {"type": "message", "id": msg.id, "room": room, "sender_type": "agent",
                                   "sender_agent_id": agent.id, "sender_name": agent.name, "text": text,
                                   "media_url": msg.media_url, "media_type": msg.media_type,
                                   "created_at": msg.created_at.isoformat(), "agent_color": agent.color})
    return {"ok": True, "room": room}
