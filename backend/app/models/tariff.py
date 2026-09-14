from datetime import datetime
from sqlalchemy import String, Integer, Boolean, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Tariff(Base):
    """Тарифный план: регулирует работу пользователя как конфиг ИИ —
    модель + лимиты + гейты фич. Пустой users.tariff_code = «полный» (без ограничений)."""
    __tablename__ = "tariffs"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)   # demo|free|pro|business...
    name: Mapped[str] = mapped_column(String(100), default="")
    description: Mapped[str] = mapped_column(String(300), default="")

    llm_model: Mapped[str] = mapped_column(String(60), default="deepseek-chat")
    msgs_per_day: Mapped[int] = mapped_column(Integer, default=0)            # 0 = безлимит
    jinn_calls_per_day: Mapped[int] = mapped_column(Integer, default=0)      # 0 = безлимит
    context_limit: Mapped[int] = mapped_column(Integer, default=0)           # 0 = дефолт движка

    # JSON-гейты: {"vision":false,"paid_voices":false,"spending_jinns":false,
    #              "image_quota_mb":20,"rag_quota_mb":10,"business_jinns_unlimited":true}
    gates: Mapped[str] = mapped_column(Text, default="{}")

    is_default: Mapped[bool] = mapped_column(Boolean, default=False)         # тариф для новых юзеров
    sort: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
