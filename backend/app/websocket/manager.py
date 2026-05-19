"""WebSocket Connection Manager — реалтайм чат"""
from typing import Dict, List, Optional

from fastapi import WebSocket


class ConnectionManager:
    """Управление WebSocket-соединениями по комнатам"""

    def __init__(self):
        # {room: {user_id: websocket}}
        self.rooms: Dict[str, Dict[int, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room: str, user_id: int):
        await websocket.accept()
        if room not in self.rooms:
            self.rooms[room] = {}
        self.rooms[room][user_id] = websocket

    def disconnect(self, room: str, user_id: int):
        if room in self.rooms:
            self.rooms[room].pop(user_id, None)
            if not self.rooms[room]:
                del self.rooms[room]

    async def broadcast(self, room: str, message: dict, exclude_user: Optional[int] = None):
        """Отправить сообщение всем в комнате"""
        if room not in self.rooms:
            return
        dead = []
        for uid, ws in self.rooms[room].items():
            if uid == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.rooms[room].pop(uid, None)

    def get_online_users(self, room: str) -> List[int]:
        return list(self.rooms.get(room, {}).keys())


manager = ConnectionManager()
