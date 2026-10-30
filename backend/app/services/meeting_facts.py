"""Доклад джина на планёрке — по фактам системы, не из головы.

Доклад не обязателен: джины докладывают, только когда руководитель попросил («доложите», «отчёт», «итоги»).
Тогда каждому подкладывается выписка его цифр за период; без цифр джин сказал бы что-нибудь правдоподобное.
"""
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.database import async_session
from app.models.activity import ActivityLog
from app.models.fuel_queue import FuelQueueEntry, StationOrder
from app.models.geo_trigger import GeoContact
from app.models.message import Message

REPORT_RE = re.compile(r"(доклад|доложи|отч[её]т|итог[иа]? (за|по|недел|дн|месяц)|как (у вас |идут )?дела|сводк|что (нового|сделали)|результат)", re.I)

_QUEUE_RU = {"waiting": "ждут", "arrived": "подъехали", "served": "заправлены", "cancelled": "отменены", "expired": "сгорели"}
_GEO_RU = {"shown": "услышали", "opened": "открыли", "refused": "отказались", "converted": "пришли"}


def period_days(text: str) -> int:
    low = (text or "").lower()
    if "сегодня" in low or "за день" in low:
        return 1
    if "месяц" in low:
        return 30
    return 7


async def agent_facts(agent, days: int = 7) -> str:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    aid = agent.id
    lines: list[str] = []
    async with async_session() as db:
        own = Message.room.like(f"agent-{aid}-u%")
        clients = (await db.execute(select(func.count(func.distinct(Message.sender_user_id)))
                                    .where(own, Message.sender_type == "user", Message.created_at >= since))).scalar() or 0
        asks = (await db.execute(select(func.count(Message.id))
                                 .where(own, Message.sender_type == "user", Message.created_at >= since))).scalar() or 0
        lines.append(f"разговоров с клиентами: {clients} (их сообщений: {asks})")

        leads = (await db.execute(select(func.count(ActivityLog.id)).where(
            ActivityLog.actor_agent_id == aid, ActivityLog.action == "lead", ActivityLog.created_at >= since))).scalar() or 0
        lines.append(f"заявок собрано: {leads}")

        geo = (await db.execute(select(GeoContact.result, func.count(GeoContact.id))
                                .where(GeoContact.agent_id == aid, GeoContact.created_at >= since)
                                .group_by(GeoContact.result))).all()
        if geo:
            lines.append("Зазывала (прохожие): " + ", ".join(f"{_GEO_RU.get(r, r)} {n}" for r, n in geo))

        q = (await db.execute(select(FuelQueueEntry.status, func.count(FuelQueueEntry.id))
                              .where(FuelQueueEntry.agent_id == aid, FuelQueueEntry.created_at >= since)
                              .group_by(FuelQueueEntry.status))).all()
        if q:
            lines.append("очередь на заправку: " + ", ".join(f"{_QUEUE_RU.get(s, s)} {n}" for s, n in q))

        orders = (await db.execute(select(func.count(StationOrder.id), func.coalesce(func.sum(StationOrder.total), 0))
                                   .where(StationOrder.agent_id == aid, StationOrder.created_at >= since,
                                          StationOrder.status != "cancelled"))).one()
        if orders[0]:
            lines.append(f"предзаказов: {orders[0]} на {orders[1]} ₽")

    when = "сегодня" if days == 1 else f"последние {days} дн."
    return (f"\n\nТЕБЯ ПРОСЯТ ДОЛОЖИТЬ. Твои факты из системы за {when}:\n- " + "\n- ".join(lines)
            + "\nДокладывай ТОЛЬКО по этим цифрам, коротко (2–3 предложения), своими словами, плюс один вывод "
              "или предложение по своей работе. Если цифры нулевые — так и скажи, не выдумывай активность.")
