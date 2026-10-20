"""
FuelQueueEntry — запись пользователя в очередь на заправку (функция джина АЗС).
MVP: номер в очереди + код (для QR-пропуска). Слоты по времени — позже.
Rate-limit по гос-номеру (один номер не чаще раза в 2 часа) — на уровне инструмента.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class FuelQueueEntry(Base):
    __tablename__ = "fuel_queue"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), index=True, nullable=False)  # джин-станция
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)      # кто записался (в т.ч. гость)

    client_name = Column(String(80), default="")               # имя водителя (как назвался)
    car_plate = Column(String(20), index=True, nullable=False)  # нормализованный гос-номер
    fuel_type = Column(String(40), nullable=False)
    liters = Column(Float, default=0)

    number = Column(Integer, default=0)   # номер в очереди (за день/станцию)
    code = Column(String(24), unique=True, index=True, nullable=False)  # код пропуска (для QR)
    status = Column(String(16), default="waiting", index=True)  # waiting | arrived | served | cancelled | expired
    slot_at = Column(DateTime(timezone=True), nullable=True)     # назначенное время заправки; не подъехал к нему → талон сгорает
    reminded = Column(String(40), default="")                    # отправленные напоминания помощника: "30,10,5"

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    arrived_at = Column(DateTime(timezone=True), nullable=True)  # оператор отсканировал QR: «подъехал»
    served_at = Column(DateTime(timezone=True), nullable=True)


class StationOrder(Base):
    """ПРЕДЗАКАЗ-ВИЗИТ к приезду (обычный режим джина АЗС): топливо + еда + услуги одним заказом —
    команда станции готовится к клиенту заранее. Оплата на кассе. kind: visit (старые: cafe|services)."""
    __tablename__ = "station_orders"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    kind = Column(String(16), default="visit", index=True)
    fuel_type = Column(String(40), default="")             # топливо в предзаказе (если без режима очереди)
    liters = Column(Integer, default=0)
    items_json = Column(String(2000), default="[]")       # [{"name","qty","price"}]
    total = Column(Integer, default=0)                     # ₽
    client_name = Column(String(80), default="")
    car_plate = Column(String(20), default="")
    code = Column(String(24), unique=True, index=True, nullable=False)  # Z-xxxxxxxxxx
    ready_at = Column(DateTime(timezone=True), nullable=True)
    queue_code = Column(String(24), nullable=True)         # связанный талон очереди (если был)
    reminded = Column(String(40), default="")              # отправленные напоминания помощника
    status = Column(String(16), default="new", index=True)  # new | ready | done | cancelled
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    done_at = Column(DateTime(timezone=True), nullable=True)


class StationOperator(Base):
    """Оператор АЗС: пользователь (вход по телефону), привязанный к станции-джину.
    Видит реестр очереди своей станции, отмечает «подъехал»/«заправлен», сообщает джину остатки топлива."""
    __tablename__ = "station_operators"
    __table_args__ = (UniqueConstraint("agent_id", "user_id", name="uq_station_operator"),)

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
