"""Схемы сообщений"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class MessageOut(BaseModel):
    id: int
    room: str
    sender_type: str
    sender_name: str
    text: str
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    created_at: datetime
    context: bool = False

    class Config:
        from_attributes = True


class SendMessageRequest(BaseModel):
    room: str = "general"
    text: str
