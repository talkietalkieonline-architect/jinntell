from datetime import datetime
from sqlalchemy import String, Integer, BigInteger, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class BonusGrant(Base):
    """Бонусный (неденежный) грант пользователю. Тратится ПЕРВЫМ, до рублей.
    НЕ выводится в деньги (налогобезопасно). Показывается брендированно («1000 токенов от Coca-Cola»).
    Внутри учёт в копейках стоимости генерации; display_tokens — косметика для юзера."""
    __tablename__ = "bonus_grants"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    agent_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)  # null = на любого джина
    label: Mapped[str] = mapped_column(String(120), default="")            # «Coca-Cola», «Приветственный», …
    remaining_kopecks: Mapped[int] = mapped_column(BigInteger, default=0)   # остаток стоимости генерации
    initial_kopecks: Mapped[int] = mapped_column(BigInteger, default=0)
    display_tokens: Mapped[int] = mapped_column(Integer, default=0)         # «1000 токенов» — витрина
    source: Mapped[str] = mapped_column(String(20), default="platform")     # platform | sponsor | owner
    campaign_id: Mapped[int | None] = mapped_column(Integer, nullable=True) # если из спонсорской кампании
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
