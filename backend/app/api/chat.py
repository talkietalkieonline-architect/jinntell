"""API чата — история сообщений"""
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
import re

from typing import Optional

from pydantic import BaseModel

from app.models.agent import Agent
from app.api.users import _STORAGE_ROOT
from app.models.message import Message
from app.models.room import Room, RoomMember
from app.models.user import User
from app.schemas.message import MessageOut, SendMessageRequest
from app.websocket.manager import manager
from app.services.llm import get_llm_reply

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/history", response_model=list[MessageOut])
async def get_history(
    room: str = Query("general"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """История сообщений. Для чата джинна (agent-{id}) агрегируем 1:1 + комнаты с этим джинном."""
    _dm = re.match(r"^dm-(\d+)-(\d+)$", room)
    if _dm and user.id not in (int(_dm.group(1)), int(_dm.group(2))):
        raise HTTPException(403, "Нет доступа")
    m = re.match(r"^agent-(\d+)(?:-u\d+)?$", room)
    rooms = [room]
    agent_id = None
    if m:
        agent_id = int(m.group(1))
        rids = (await db.execute(
            select(Room.id)
            .join(RoomMember, RoomMember.room_id == Room.id)
            .where(Room.owner_user_id == user.id, RoomMember.agent_id == agent_id)
        )).scalars().all()
        rooms += [f"room-{rid}" for rid in rids]
    result = await db.execute(
        select(Message)
        .where(Message.room.in_(rooms))
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = list(reversed(result.scalars().all()))
    out = []
    for msg in messages:
        mo = MessageOut.model_validate(msg)
        if agent_id is not None and msg.sender_type == "agent" \
                and msg.sender_agent_id is not None and msg.sender_agent_id != agent_id:
            mo.context = True
        out.append(mo)
    return out


class MyChatOut(BaseModel):
    room: str
    kind: str  # dm | room
    name: str
    color: str = "#6c7bff"
    photo: Optional[str] = None
    online: bool = False
    count: int = 0


@router.get("/my-chats", response_model=list[MyChatOut])
async def my_chats(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Серверный список чатов пользователя (DM + мои комнаты) — чтобы входящие появлялись в ленте."""
    out: list[MyChatOut] = []

    # DM-комнаты, где я участник
    res = await db.execute(
        select(Message.room).where(
            or_(Message.room.like(f"dm-{user.id}-%"), Message.room.like(f"dm-%-{user.id}"))
        ).distinct()
    )
    for room in res.scalars().all():
        m = re.match(r"^dm-(\d+)-(\d+)$", room)
        if not m:
            continue
        a, b = int(m.group(1)), int(m.group(2))
        other_id = b if a == user.id else a
        ures = await db.execute(select(User).where(User.id == other_id))
        ou = ures.scalar_one_or_none()
        if ou:
            out.append(MyChatOut(room=room, kind="dm", name=ou.display_name, color=ou.avatar_color or "#6c7bff", photo=ou.avatar_url, online=ou.is_online))

    # Мои комнаты (владелец)
    rres = await db.execute(select(Room).where(Room.owner_user_id == user.id))
    for r in rres.scalars().all():
        mres = await db.execute(
            select(Agent.name, Agent.color).join(RoomMember, RoomMember.agent_id == Agent.id).where(RoomMember.room_id == r.id)
        )
        members = mres.all()
        name = " + ".join(mm[0] for mm in members) if members else (r.title or "Комната")
        color = members[0][1] if members else "#6c7bff"
        out.append(MyChatOut(room=f"room-{r.id}", kind="room", name=name, color=color, count=len(members)))

    return out


_CHAT_MEDIA = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
               "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
               "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a",
               "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a"}


@router.post("/media")
async def upload_chat_media(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Загрузка медиа для чата (фото/видео/кружок) — возвращает URL для отправки в сообщении."""
    ct = (file.content_type or "").split(";")[0].strip().lower()
    ext = _CHAT_MEDIA.get(ct)
    if not ext:
        if ct.startswith("video/"):
            ext = "webm"
        elif ct.startswith("image/"):
            ext = "jpg"
        elif ct.startswith("audio/"):
            ext = "webm"
        else:
            raise HTTPException(400, "Только изображения, видео и аудио")
    data = await file.read()
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(400, "Файл больше 50 МБ")
    d = os.path.join(_STORAGE_ROOT, "chat", str(user.id))
    os.makedirs(d, exist_ok=True)
    fname = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(d, fname), "wb") as f:
        f.write(data)
    mtype = "voice" if ct.startswith("audio/") else "video" if ct.startswith("video/") else "image"
    return {"url": f"/api/storage/chat/{user.id}/{fname}", "type": mtype}


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


_INTENT_PROMPT = """Ты — классификатор намерений помощника JinnTell. По сообщению пользователя верни СТРОГО один JSON-объект, без markdown и пояснений, вида:
{"action": "...", "target": "", "text": "", "query": ""}
action — одно из:
- open_chat: открыть чат / позвать (target = имя человека или джинна)
- close_chat: закрыть/убрать чат (target = имя; пусто = текущий)
- send_message: отправить сообщение (target = кому, text = что отправить)
- summon_jinn: позвать джинна из Города (target = имя или описание нужного специалиста)
- call: видеозвонок (target = кому)
- clear_history: очистить историю текущего чата
- favorite: добавить джинна в избранное (target = имя/описание)
- web_search: найти в интернете (query = поисковый запрос)
- send_media: отправить фото/медиа в другой чат (target = кому)
- clarify: непонятно — нужно переспросить (text = короткий уточняющий вопрос)
- chat: обычный разговор, не команда
Если это не явная команда/просьба к действию — action=chat. Верни только JSON."""


class IntentRequest(BaseModel):
    text: str


@router.post("/intent")
async def assistant_intent(body: IntentRequest, user: User = Depends(get_current_user)):
    """Классификация намерения (для умного помощника)."""
    _aname = (user.assistant_name or "Джим").strip()
    _prompt = _INTENT_PROMPT + f"\n\nВАЖНО: тебя-помощника зовут «{_aname}». Обращение к тебе по этому имени (например «{_aname}, привет», «эй {_aname}», «{_aname}?») — это НЕ команда, а action=chat с пустым target. Имя «{_aname}» НИКОГДА не является target."
    raw = await get_llm_reply(user_message=(body.text or "")[:500], system_prompt=_prompt,
                              max_tokens=120, user_id=user.id, payer_type="free")
    import json as _j, re as _re
    data = {}
    m = _re.search(r"\{.*\}", raw or "", _re.S)
    if m:
        try:
            data = _j.loads(m.group(0))
        except Exception:
            data = {}
    valid = {"open_chat", "close_chat", "send_message", "summon_jinn", "call",
             "clear_history", "favorite", "web_search", "send_media", "clarify", "chat"}
    action = data.get("action") if data.get("action") in valid else "chat"
    if action != "chat":
        from app.services.activity import log as _log
        await _log("assistant.command", user_id=user.id, actor="assistant",
                   target_name=(data.get("target") or "").strip() or None,
                   result=action, detail=(body.text or "")[:500])
    return {
        "action": action,
        "target": (data.get("target") or "").strip(),
        "text": (data.get("text") or "").strip(),
        "query": (data.get("query") or "").strip(),
    }


@router.post("/web-search")
async def assistant_web_search(body: IntentRequest, user: User = Depends(get_current_user)):
    """Веб-поиск помощника. Провайдер/ключ — из админки. Возвращает готовый ответ + источники."""
    from app.services import websearch
    q = (body.text or "").strip()
    if not q:
        return {"ok": False, "text": "Что искать?"}
    res = await websearch.search(q, max_results=5)
    if not res.get("ok"):
        reason = res.get("reason", "")
        if reason == "off":
            return {"ok": False, "text": "Веб-поиск не подключён. Включите провайдера в админке → Интеграции."}
        if reason == "no_key":
            return {"ok": False, "text": f"Веб-поиск ({res.get('provider')}) без ключа — добавьте ключ в админке."}
        return {"ok": False, "text": "Не удалось выполнить поиск сейчас."}
    results = res.get("results") or []
    answer = res.get("answer") or ""
    if not answer and not results:
        return {"ok": True, "text": "По запросу ничего не нашлось.", "sources": []}
    if not answer and results:
        ctx = "\n".join(f"- {r['title']}: {r['snippet']} ({r['url']})" for r in results[:5])
        answer = await get_llm_reply(
            user_message=f"Вопрос: {q}\n\nРезультаты веба:\n{ctx}\n\nКоротко ответь по существу на русском, опираясь на результаты.",
            system_prompt="Ты помощник, кратко отвечаешь по веб-результатам, без выдумок.",
            max_tokens=300, user_id=user.id, payer_type="free",
        )
    sources = [{"title": r["title"], "url": r["url"]} for r in results[:5]]
    return {"ok": True, "text": answer, "sources": sources}


@router.post("/assistant-act")
async def assistant_act(body: IntentRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Помощник на tool-calling: модель сама выбирает инструменты. Возвращает {reply, directives, steps}.
    Директивы (open_chat/close_chat/call/send_message) выполняет фронт. Экспериментальный путь рядом с классификатором."""
    from app.services.assistant_agent import run
    result = await run(user_id=user.id, text=(body.text or ""), assistant_name=(user.assistant_name or "Джим"))
    # след в истории помощника (jim-{uid}) — чинит «помощник пропал»
    try:
        room = f"jim-{user.id}"
        if body.text:
            db.add(Message(room=room, sender_type="user", sender_user_id=user.id, sender_name=user.display_name, text=body.text))
        if result.get("reply"):
            db.add(Message(room=room, sender_type="assistant", sender_name=(user.assistant_name or "Джим"),
                           text=result["reply"], media_url=result.get("media_url"), media_type=result.get("media_type")))
        await db.commit()
    except Exception:
        pass
    try:
        from app.services.activity import log as _log
        await _log("assistant.act", user_id=user.id, actor="assistant",
                   detail=(body.text or "")[:500],
                   result=("+".join(s.get("tool", "") for s in result.get("steps", [])) or "reply"))
    except Exception:
        pass
    return result


# ── Подборки: помощник опрашивает джиннов Города по запросу → документ с атрибуцией ──
@router.post("/digest")
async def make_digest(body: IntentRequest, user: User = Depends(get_current_user)):
    """Собрать подборку по запросу (опрос релевантных джиннов Города, атрибуция)."""
    from app.services import digest as _dg
    return await _dg.build_digest(user.id, (body.text or ""))


@router.get("/digests")
async def list_digests(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.digest import Digest
    rows = (await db.execute(
        select(Digest).where(Digest.user_id == user.id).order_by(Digest.id.desc()).limit(30)
    )).scalars().all()
    return {"items": [{"id": d.id, "query": d.query, "created_at": d.created_at.isoformat()} for d in rows]}


@router.get("/digests/{digest_id}")
async def get_digest(digest_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    import json as _json
    from app.models.digest import Digest
    d = await db.get(Digest, digest_id)
    if not d or d.user_id != user.id:
        raise HTTPException(404, "Подборка не найдена")
    return {"id": d.id, "query": d.query, "sections": _json.loads(d.sections or "[]"), "created_at": d.created_at.isoformat()}


@router.delete("/digests/{digest_id}")
async def delete_digest(digest_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.digest import Digest
    d = await db.get(Digest, digest_id)
    if d and d.user_id == user.id:
        await db.delete(d)
        await db.commit()
    return {"ok": True}


class ForwardRequest(BaseModel):
    room: str
    text: str = ""
    media_url: Optional[str] = None
    media_type: Optional[str] = None


@router.post("/forward")
async def forward_message(
    body: ForwardRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Переслать сообщение (текст/медиа) в другой чат/комнату/джину. Realtime."""
    room = body.room
    if not (body.text or body.media_url):
        raise HTTPException(400, "Нечего пересылать")
    dm = re.match(r"^dm-(\d+)-(\d+)$", room)
    ag = re.match(r"^agent-\d+-u(\d+)$", room)
    jm = re.match(r"^jim-(\d+)$", room)
    if dm and user.id not in (int(dm.group(1)), int(dm.group(2))):
        raise HTTPException(403, "Нет доступа к чату")
    if ag and int(ag.group(1)) != user.id:
        raise HTTPException(403, "Нет доступа к чату")
    if jm and int(jm.group(1)) != user.id:
        raise HTTPException(403, "Нет доступа к чату")
    msg = Message(room=room, sender_type="user", sender_user_id=user.id, sender_name=user.display_name,
                  text=body.text or "", media_url=body.media_url, media_type=body.media_type)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    await manager.broadcast(room, {
        "type": "message", "id": msg.id, "room": room,
        "sender_type": "user", "sender_user_id": user.id, "sender_name": user.display_name,
        "text": body.text or "", "media_url": body.media_url, "media_type": body.media_type,
        "created_at": msg.created_at.isoformat(),
    })
    if dm:
        for uid in (int(dm.group(1)), int(dm.group(2))):
            await manager.broadcast(f"user-{uid}", {"type": "chat_ping", "room": room})
    return {"ok": True, "room": room}


@router.post("/memory/clear")
async def clear_memory(user: User = Depends(get_current_user)):
    """Очистить динамическую память помощника о пользователе."""
    from app.services.memory import clear as _clear
    await _clear(user.id)
    return {"ok": True}


@router.delete("/history")
async def clear_history(
    room: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Очистить историю: в приватном чате (помощник/джинн) — все сообщения; в DM/комнате — только свои."""
    own_private = room == f"jim-{user.id}" or re.match(rf"^agent-\d+-u{user.id}$", room) is not None
    q = select(Message).where(Message.room == room)
    if not own_private:
        q = q.where(Message.sender_user_id == user.id)
    res = await db.execute(q)
    msgs = list(res.scalars().all())
    for m in msgs:
        await db.delete(m)
    await db.commit()
    await manager.broadcast(room, {"type": "clear", "room": room})
    return {"ok": True, "cleared": len(msgs)}


class DMSendRequest(BaseModel):
    to_user_id: int
    text: str


@router.post("/dm-send")
async def dm_send(
    body: DMSendRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Отправить сообщение в личный диалог указанному пользователю (для команд помощника). Рассылает в реалтайме."""
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Пустое сообщение")
    a, b = sorted([user.id, body.to_user_id])
    room = f"dm-{a}-{b}"
    msg = Message(room=room, sender_type="user", sender_user_id=user.id, sender_name=user.display_name, text=text)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    await manager.broadcast(room, {
        "type": "message", "id": msg.id, "room": room,
        "sender_type": "user", "sender_user_id": user.id, "sender_name": user.display_name,
        "text": text, "media_url": None, "media_type": None,
        "created_at": msg.created_at.isoformat(),
    })
    for uid in (a, b):
        await manager.broadcast(f"user-{uid}", {"type": "chat_ping", "room": room})
    return {"ok": True, "room": room}


@router.delete("/message/{message_id}")
async def delete_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Удалить сообщение: только своё или в своём приватном чате. Realtime-удаление у всех участников."""
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    room = msg.room
    own_private = room == f"jim-{user.id}" or re.match(rf"^agent-\d+-u{user.id}$", room) is not None
    is_mine = msg.sender_user_id == user.id
    if not (is_mine or own_private):
        raise HTTPException(status_code=403, detail="Можно удалять только свои сообщения")
    await db.delete(msg)
    await db.commit()
    await manager.broadcast(room, {"type": "delete", "id": message_id, "room": room})
    return {"ok": True}
