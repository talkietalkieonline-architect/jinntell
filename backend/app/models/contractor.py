"""
Contractor — модель контрагента (бизнес-клиент).
Отдельная авторизация (логин/пароль), баланс, юр. данные.
"""
from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, Float, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base


class Contractor(Base):
    __tablename__ = "contractors"

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(20), unique=True, index=True, nullable=True)

    # Юр. данные
    company_name = Column(String(200), nullable=False)
    inn = Column(String(20))
    legal_address = Column(String(500))
    actual_address = Column(String(500))
    bank_details = Column(String(500))

    # Контакты
    director_name = Column(String(100))
    contact_name = Column(String(100))
    contact_phone = Column(String(20))
    contact_email = Column(String(200))

    # Авторизация
    login = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)

    # Биллинг
    balance_kopecks = Column(BigInteger, default=0)
    discount_percent = Column(Float, default=0)  # корп. скидка (видит только админ)

    # Статус
    is_active = Column(Boolean, default=True)
    # Привязка к пользователю (одна личность — роли user/business)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Мета
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
