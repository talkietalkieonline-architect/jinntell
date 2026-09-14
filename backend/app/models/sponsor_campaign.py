from datetime import datetime
from sqlalchemy import String, Integer, BigInteger, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class SponsorCampaign(Base):
    """Спонсорская промо-кампания третьей стороны (напр. Coca-Cola спонсирует Джина-дизайнера).
    Помощник при подборе джина объявляет бонус; при первом использовании юзеру выдаётся грант,
    списывающий бюджет кампании (деньги бренда у нас предоплачены). Реклама/CAC = наш доход."""
    __tablename__ = "sponsor_campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    sponsor_name: Mapped[str] = mapped_column(String(120), default="")     # «Coca-Cola»
    agent_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)  # какой джин спонсируется
    bonus_tokens: Mapped[int] = mapped_column(Integer, default=0)          # витрина: сколько токенов дарим на юзера
    bonus_kopecks: Mapped[int] = mapped_column(BigInteger, default=0)      # реальная стоимость гранта (генерация)
    budget_kopecks: Mapped[int] = mapped_column(BigInteger, default=0)     # предоплаченный бюджет бренда
    spent_kopecks: Mapped[int] = mapped_column(BigInteger, default=0)      # израсходовано
    message: Mapped[str] = mapped_column(String(300), default="")         # текст промо для помощника/юзера
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
