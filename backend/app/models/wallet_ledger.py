from datetime import datetime
from sqlalchemy import String, Integer, BigInteger, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class WalletLedger(Base):
    """История движения средств пользователя (и контрагента) — прозрачность для юзера.
    Юзер видит рубли: пополнил / списано за джина / возврат / бонус. Суммы в копейках (signed)."""
    __tablename__ = "wallet_ledger"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    contractor_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    # topup | spend | refund | bonus_grant | bonus_spend | sponsor_spend | adjust
    kind: Mapped[str] = mapped_column(String(20), index=True, default="spend")
    amount_kopecks: Mapped[int] = mapped_column(BigInteger, default=0)     # + приход, − списание
    balance_after: Mapped[int] = mapped_column(BigInteger, default=0)       # денежный баланс после (для money-строк)
    agent_id: Mapped[int | None] = mapped_column(Integer, nullable=True)    # за какого джина
    description: Mapped[str] = mapped_column(String(300), default="")
    ref: Mapped[str] = mapped_column(String(120), default="")              # payment_id ЮKassa / campaign / grant id
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
