"""Схемы сообщений"""
from datetime import datetime

from pydantic import BaseModel


class MessageOut(BaseModel):
    id: int
    room: str
    sender_type: str
    sender_name: str
    text: str
    created_at: datetime

    class Config:
        from_attributes = True


class SendMessageRequest(BaseModel):
    room: str = "general"
    text: str
