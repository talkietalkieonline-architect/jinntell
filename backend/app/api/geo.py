"""Геотриггер — проверка «пользователь рядом» и доставка «стука» бизнес-джинна.
Учитывает настройки действий пользователя (геолокация/обращения/акции), кулдаун,
и списывает показ с баланса контрагента (block-at-zero). См. модель GeoTrigger."""
import math
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

    from app.models.geo_trigger import GeoTrigger, GeoTriggerHit
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
            # Акции/купоны выключены у пользователя — не показываем промо
            if not acts.get("allow_promo", True):
                continue
            # Кулдаун на пользователя
            hit = (await db.execute(select(GeoTriggerHit).where(
                GeoTriggerHit.trigger_id == gt.id, GeoTriggerHit.user_id == user.id))).scalar_one_or_none()
            if hit and hit.last_fired_at and (now - hit.last_fired_at).total_seconds() < gt.cooldown_hours * 3600:
                continue
            agent = await db.get(Agent, gt.agent_id)
            if not agent or not agent.is_active:
                continue
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
            if gt.message:
                text = (text + "\n" + gt.message).strip() if text else gt.message.strip()
            if not text:
                text = "У нас есть предложение для вас рядом!"
            msg = Message(
                room=room, sender_type="agent", sender_agent_id=agent.id,
                sender_name=agent.name, text=text,
                media_url=(gt.media_url if gt.media_url and len(gt.media_url) <= 500 else None),
                media_type=("image" if gt.media_url else None),
            )
            db.add(msg)
            deliveries.append({
                "agent_id": agent.id, "agent_name": agent.name, "color": agent.color,
                "title": gt.title or "", "message": gt.message or "",
                "media_url": gt.media_url, "room": room,
                "quiet": acts.get("approaches") == "assistant",
            })
        except Exception as e:
            print(f"[geo] trigger {gt.id} error: {e}")

    await db.commit()
    return {"deliveries": deliveries}
