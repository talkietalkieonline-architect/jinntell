"""API чата — история сообщений"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.message import Message
from app.models.user import User
from app.schemas.message import MessageOut, SendMessageRequest

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/history", response_model=list[MessageOut])
async def get_history(
    room: str = Query("general"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Получить историю сообщений в комнате"""
    result = await db.execute(
        select(Message)
        .where(Message.room == room)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    # Возвращаем в хронологическом порядке
    return [MessageOut.model_validate(m) for m in reversed(messages)]


@router.post("/send", response_model=MessageOut)
async def send_message(
    body: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Отправить сообщение (HTTP fallback, основной путь — WebSocket)"""
    msg = Message(
        room=body.room,
        sender_type="user",
        sender_user_id=user.id,
        sender_name=user.display_name,
        text=body.text,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return MessageOut.model_validate(msg)
