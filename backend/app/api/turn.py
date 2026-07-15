"""Эфемерные TURN-креды для WebRTC-звонков (coturn use-auth-secret)."""
import base64
import hashlib
import hmac
import time

from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/turn", tags=["turn"])

_STUN = {"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}


@router.get("")
async def get_turn(user: User = Depends(get_current_user)):
    """iceServers для RTCPeerConnection. Логин=exp:uid, пароль=base64(HMAC-SHA1(secret, login))."""
    if not settings.TURN_SECRET:
        return {"iceServers": [_STUN], "ttl": 0}

    ttl = 86400
    username = f"{int(time.time()) + ttl}:{user.id}"
    digest = hmac.new(settings.TURN_SECRET.encode(), username.encode(), hashlib.sha1).digest()
    credential = base64.b64encode(digest).decode()

    ip = settings.TURN_PUBLIC_IP
    host = settings.TURN_HOST
    return {
        "iceServers": [
            _STUN,
            {
                "urls": [f"turn:{ip}:3478?transport=udp", f"turn:{ip}:3478?transport=tcp"],
                "username": username,
                "credential": credential,
            },
            {
                "urls": [f"turns:{host}:5349?transport=tcp"],
                "username": username,
                "credential": credential,
            },
        ],
        "ttl": ttl,
    }
