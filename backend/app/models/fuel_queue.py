"""
FuelQueueEntry — запись пользователя в очередь на заправку (функция джина АЗС).
MVP: номер в очереди + код (для QR-пропуска). Слоты по времени — позже.
Rate-limit по гос-номеру (один номер не чаще раза в 2 часа) — на уровне инструмента.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base


class FuelQueueEntry(Base):
    __tablename__ = "fuel_queue"

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey("agents.id"), index=True, nullable=False)  # джин-станция
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)      # кто записался (в т.ч. гость)

    car_plate = Column(String(20), index=True, nullable=False)  # нормализованный гос-номер
    fuel_type = Column(String(40), nullable=False)
    liters = Column(Float, default=0)

    number = Column(Integer, default=0)   # номер в очереди (за день/станцию)
    code = Column(String(24), unique=True, index=True, nullable=False)  # код пропуска (для QR)
    status = Column(String(16), default="waiting", index=True)  # waiting | served | cancelled

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    served_at = Column(DateTime(timezone=True), nullable=True)
