"""WebSocket эндпоинт для чата с LLM-ответами"""
import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.database import async_session
from app.core.security import decode_access_token
from app.models.agent import Agent
from app.models.message import Message
from app.models.user import User
from app.services.llm import get_llm_reply, get_agent_reply
from app.services import rag as rag_service
from app.websocket.manager import manager

_sec_log = logging.getLogger("jinntell.security")
router = APIRouter()

# Regex для определения комнаты агента: agent-{id}
_AGENT_ROOM_RE = re.compile(r"^agent-(\d+)(?:-u\d+)?$")
_ROOM_RE = re.compile(r"^room-(\d+)$")
# Запоминаем, к какому джинну последний раз обращались в комнате (для маршрутизации без явного имени)
_room_last_agent: dict = {}

# Имя помощника по умолчанию (пользователь может менять)
DEFAULT_ASSISTANT_NAME = "Джим"


def _parse_agent_room(room: str) -> Optional[int]:
    """Если комната agent-{id} — вернуть id агента, иначе None"""
    m = _AGENT_ROOM_RE.match(room)
    return int(m.group(1)) if m else None


async def _load_agent(agent_id: int) -> Optional[Agent]:
    """Загрузить агента из БД"""
    async with async_session() as db:
        result = await db.execute(
            select(Agent).where(Agent.id == agent_id, Agent.is_active == True)
        )
        return result.scalar_one_or_none()


async def _can_access_agent(agent: Agent, user_id: int) -> bool:
    """Доступ к агенту: скрытые — только владелец и список доступа."""
    if agent.visibility != "hidden":
        return True
    if user_id and agent.owner_id == user_id:
        return True
    from app.models.agent_access import AgentAccess
    async with async_session() as db:
        res = await db.execute(
            select(AgentAccess.id).where(AgentAccess.agent_id == agent.id, AgentAccess.user_id == user_id)
        )
        return res.scalar_one_or_none() is not None


_SUGGEST_STOP = {"нужен", "нужна", "нужно", "надо", "хочу", "можно", "есть", "для", "про", "как", "что", "мне", "его", "или", "помоги", "подскажи", "найди", "позови"}


async def _find_relevant_agents(user_message: str, user_id: int, limit: int = 5) -> list:
    """Доступные пользователю джинны по словам из запроса (для рекомендаций помощника)."""
    words = [w for w in re.findall(r"[\w\u0430-\u044f\u0451]{4,}", (user_message or "").lower()) if w not in _SUGGEST_STOP]
    if not words:
        return []
    from app.models.agent_access import AgentAccess
    async with async_session() as db:
        cond = None
        for w in words[:6]:
            p = f"%{w}%"
            c = (Agent.name.ilike(p) | Agent.profession.ilike(p) | Agent.description.ilike(p) | Agent.skills_text.ilike(p))
            cond = c if cond is None else (cond | c)
        q = select(Agent).where(Agent.is_active == True, Agent.visibility != "core", cond)
        accessible = select(AgentAccess.agent_id).where(AgentAccess.user_id == user_id)
        q = q.where((Agent.visibility != "hidden") | Agent.id.in_(accessible) | (Agent.owner_id == user_id))
        q = q.order_by(Agent.rating.desc()).limit(limit)
        res = await db.execute(q)
        return list(res.scalars().all())


async def _load_room_members(room_id: int) -> list:
    """Агенты-участники комнаты room-{id}"""
    from app.models.room import RoomMember
    async with async_session() as db:
        result = await db.execute(
            select(Agent)
            .join(RoomMember, RoomMember.agent_id == Agent.id)
            .where(RoomMember.room_id == room_id, Agent.is_active == True)
        )
        return list(result.scalars().all())


def _pick_addressed_agent(room: str, text: str, members: list) -> Agent:
    """Кому адресован вопрос в комнате: по имени/профессии в тексте; иначе — последний адресат; иначе — первый."""
    low = (text or "").lower()
    for a in members:
        name = (a.name or "").lower()
        prof = (a.profession or "").lower()
        if (name and name in low) or (prof and prof in low):
            _room_last_agent[room] = a.id
            return a
    last_id = _room_last_agent.get(room)
    if last_id:
        for a in members:
            if a.id == last_id:
                return a
    _room_last_agent[room] = members[0].id
    return members[0]


async def _notify_participants(room: str) -> None:
    """Пинг персональных каналов user-{id} участников — реалтайм-обновление чат-листа."""
    m = re.match(r"^dm-(\d+)-(\d+)$", room)
    if m:
        for uid in (int(m.group(1)), int(m.group(2))):
            await manager.broadcast(f"user-{uid}", {"type": "chat_ping", "room": room})
        return
    rm = re.match(r"^room-(\d+)$", room)
    if rm:
        from app.models.room import Room
        async with async_session() as db:
            res = await db.execute(select(Room.owner_user_id).where(Room.id == int(rm.group(1))))
            owner = res.scalar_one_or_none()
        if owner:
            await manager.broadcast(f"user-{owner}", {"type": "chat_ping", "room": room})


async def _broadcast_presence(user_id: int, online: bool) -> None:
    """Реалтайм presence: уведомить контакты (кто добавил пользователя) о смене онлайн-статуса."""
    from app.models.contact import Contact
    try:
        async with async_session() as db:
            res = await db.execute(select(Contact.owner_user_id).where(Contact.contact_user_id == user_id))
            watchers = set(res.scalars().all())
    except Exception:
        return
    for w in watchers:
        await manager.broadcast(f"user-{w}", {"type": "presence", "user_id": user_id, "online": online})


async def _get_room_memory_digest(user_id: int) -> str:
    """«Память» помощника: дайджест последних сообщений из всех комнат пользователя.
    Помощник «слышал» эти разговоры и может пересказать без повторного вызова джиннов."""
    from app.models.room import Room, RoomMember
    async with async_session() as db:
        rooms_res = await db.execute(
            select(Room).where(Room.owner_user_id == user_id).order_by(Room.id.desc()).limit(10)
        )
        rooms = list(rooms_res.scalars().all())
        if not rooms:
            return ""
        parts = []
        for r in rooms:
            mem_res = await db.execute(
                select(Agent.name).join(RoomMember, RoomMember.agent_id == Agent.id).where(RoomMember.room_id == r.id)
            )
            names = [n for n in mem_res.scalars().all()]
            msg_res = await db.execute(
                select(Message).where(Message.room == f"room-{r.id}").order_by(Message.created_at.desc()).limit(15)
            )
            msgs = list(reversed(msg_res.scalars().all()))
            if not msgs:
                continue
            lines = "\n".join(f"  {m.sender_name}: {m.text}" for m in msgs)
            parts.append(f"Комната с {', '.join(names) or 'джиннами'}:\n{lines}")
        if not parts:
            return ""
        digest = "\n\n".join(parts)[:4000]
        return (
            "\n\n=== ПАМЯТЬ О КОМНАТАХ (ты слышал эти разговоры пользователя с джиннами) ===\n"
            + digest
            + "\n=== КОНЕЦ ПАМЯТИ ===\n"
            "Если пользователь спрашивает, что обсуждали в комнате или с конкретным джинном, "
            "отвечай ИЗ ЭТОЙ ПАМЯТИ своими словами, НЕ вызывая джиннов заново."
        )


async def _get_assistant_agent() -> Optional[Agent]:
    """Core-агент «Помощник Джим» — единый источник настроек помощника (мозг/промпт)"""
    async with async_session() as db:
        result = await db.execute(
            select(Agent).where(Agent.jinntell_link == "jim")
        )
        return result.scalar_one_or_none()


async def _get_conversation_history(room: str, limit: int = 10, exclude_text: Optional[str] = None) -> list:
    """Получить последние сообщения для контекста LLM.

    exclude_text — текст текущего сообщения пользователя; оно передаётся в LLM
    отдельным аргументом user_message, поэтому его нужно убрать из истории, иначе
    вопрос уйдёт в модель дважды (задвоение / «агент слышит сам себя»).
    """
    async with async_session() as db:
        rooms = [room]
        primary_agent_id = None
        am = re.match(r"^agent-(\d+)-u(\d+)$", room)
        if am:
            primary_agent_id = int(am.group(1))
            uid = int(am.group(2))
            from app.models.room import Room, RoomMember
            rids = (await db.execute(
                select(Room.id)
                .join(RoomMember, RoomMember.room_id == Room.id)
                .where(Room.owner_user_id == uid, RoomMember.agent_id == primary_agent_id)
            )).scalars().all()
            rooms += [f"room-{rid}" for rid in rids]
        result = await db.execute(
            select(Message)
            .where(Message.room.in_(rooms))
            .order_by(Message.created_at.desc())
            .limit(limit + 1)
        )
        messages = list(reversed(result.scalars().all()))
        # Убираем текущий вопрос пользователя — он передаётся как user_message
        if exclude_text is not None and messages and messages[-1].sender_type == "user" \
                and messages[-1].text == exclude_text:
            messages = messages[:-1]
        messages = messages[-limit:]
        history = []
        for m in messages:
            role = "user" if m.sender_type == "user" else "assistant"
            content = m.text
            # В мультиспикерном контексте помечаем «чужого» джинна его именем
            if m.sender_type == "agent" and m.sender_agent_id is not None and m.sender_agent_id != primary_agent_id:
                content = f"[{m.sender_name}]: {m.text}"
            history.append({"role": role, "content": content})
        return history


async def _get_user_assistant_settings(user_id: int) -> dict:
    """Получить настройки помощника пользователя из БД"""
    defaults = {
        "name": DEFAULT_ASSISTANT_NAME,
        "gender": "male",
        "voice": "male_low",
        "manner": None,  # None = использовать дефолт из промпта
        "traits": {},
    }
    try:
        async with async_session() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user:
                import json as _json
                _traits = {}
                try:
                    if user.assistant_traits:
                        _traits = _json.loads(user.assistant_traits) or {}
                except Exception:
                    _traits = {}
                return {
                    "name": user.assistant_name or DEFAULT_ASSISTANT_NAME,
                    "gender": user.assistant_gender or "male",
                    "voice": user.assistant_voice or "male_low",
                    "manner": None,
                    "traits": _traits,
                }
    except Exception:
        pass
    return defaults


def _build_user_persona_injection(settings: dict) -> str:
    """Строим дополнение к промпту на основе пользовательских настроек"""
    name = settings.get("name", DEFAULT_ASSISTANT_NAME)
    gender = settings.get("gender", "male")

    gender_labels = {
        "male": "мужчина",
        "female": "женщина",
        "neutral": "нейтральный персонаж",
    }
    gender_text = gender_labels.get(gender, "мужчина")
    gender_speech = {
        "male": "Говори о себе в мужском роде (рад, готов, сделал).",
        "female": "Говори о себе в женском роде (рада, готова, сделала).",
        "neutral": "Избегай гендерных форм о себе.",
    }.get(gender, "Говори о себе в мужском роде.")

    traits = settings.get("traits") or {}
    _tone = {"friendly": "Тон дружелюбный, тёплый.", "neutral": "Тон нейтральный.", "business": "Тон деловой, по существу."}.get(traits.get("tone"), "")
    _len = {"short": "Отвечай коротко, 1-2 предложения.", "medium": "Отвечай средней длины.", "long": "Отвечай подробно, разворачивай мысль."}.get(traits.get("length"), "")
    _humor = "Допускай лёгкий уместный юмор." if traits.get("humor") else ""
    _emoji = "Используй эмодзи умеренно." if traits.get("emoji") else ("Не используй эмодзи." if traits.get("emoji") is False else "")
    _style = " ".join(x for x in [_tone, _len, _humor, _emoji] if x)
    traits_text = ("\n\n=== СТИЛЬ ОБЩЕНИЯ ===\n" + _style + "\n=== КОНЕЦ СТИЛЯ ===") if _style else ""

    return f"""

=== ТВОЯ ЛИЧНОСТЬ (ВЫСШИЙ ПРИОРИТЕТ, ВАЖНЕЕ ИСТОРИИ ПЕРЕПИСКИ) ===
Твоё имя — {name}. Ты {gender_text}. {gender_speech}
ВАЖНО: в истории переписки ты мог РАНЬШЕ называть себя другим именем (например «Джим») — это УСТАРЕЛО, полностью ИГНОРИРУЙ это.
Всегда представляйся ТОЛЬКО как «{name}». Никогда не называй себя «Джим» или любым другим именем.
На вопрос «как тебя зовут?» отвечай: «{name}».
=== КОНЕЦ ==={traits_text}"""


async def _assistant_reply(room: str, user_message: str, assistant_name: str = DEFAULT_ASSISTANT_NAME, user_id: int = 0):
    """Помощник отвечает через LLM с инъекцией пользовательских настроек"""
    # Отправляем индикатор «печатает...»
    await manager.broadcast(room, {
        "type": "typing",
        "sender_name": assistant_name,
        "sender_type": "assistant",
    })

    # Получаем историю для контекста
    history = await _get_conversation_history(room, exclude_text=user_message)

    # Получаем пользовательские настройки и строим дополнение к промпту
    user_persona = ""
    if user_id:
        settings = await _get_user_assistant_settings(user_id)
        user_persona = _build_user_persona_injection(settings)
        try:
            user_persona += await _get_room_memory_digest(user_id)
        except Exception as e:
            print(f"[ws] room memory digest error: {e}")
        try:
            from app.services.memory import recall as _recall
            _facts = await _recall(user_id, user_message, k=5)
            if _facts:
                user_persona += (
                    "\n\n=== ЧТО ТЫ ПОМНИШЬ О ПОЛЬЗОВАТЕЛЕ (память) ===\n- "
                    + "\n- ".join(_facts)
                    + "\n=== КОНЕЦ ПАМЯТИ ===\nИспользуй эти факты естественно, не перечисляй списком без нужды."
                )
        except Exception as e:
            print(f"[ws] memory recall error: {e}")
        try:
            _agents = await _find_relevant_agents(user_message, user_id)
            if _agents:
                _lst = "; ".join(f"{a.name} — {a.profession}" for a in _agents)
                user_persona += (
                    "\n\n=== ДОСТУПНЫЕ ДЖИННЫ ПО ТЕМЕ ЗАПРОСА ===\n"
                    f"{_lst}\n"
                    "Если пользователь ищет специалиста — предложи ПОДХОДЯЩЕГО из этого списка "
                    "(не выдумывай несуществующих) и подскажи открыть его через Избранное → Город джиннов."
                )
        except Exception as e:
            print(f"[ws] agent suggest error: {e}")

    # LLM-ответ (базовый промпт из Redis/настроек + пользовательская персонализация)
    # Мозг и промпт берём из карточки core-агента «Помощник Джим» (единый источник)
    asst = await _get_assistant_agent()
    _asst_knowledge = ""
    # База знаний помощника (справка о платформе) — тот же порог score, [] если коллекции нет
    if asst:
        try:
            from app.services import rag as _rag
            _kn = await _rag.search(agent_id=asst.id, query=user_message, top_k=3)
            if _kn:
                _asst_knowledge = "\n".join(f"- {c.text}" for c in _kn)
                user_persona += (
                    "\n\n=== СПРАВОЧНЫЕ ЗНАНИЯ О ПЛАТФОРМЕ ===\n"
                    + _asst_knowledge
                    + "\n=== КОНЕЦ СПРАВКИ ===\nОтвечай по этим фактам, не выдумывай функции, которых тут нет."
                )
        except Exception as e:
            print(f"[ws] assistant knowledge error: {e}")
    _asst_sys = (asst.system_prompt if asst and asst.system_prompt else None)
    try:
        from app.services import guardian as _guard_in2
        if not _guard_in2.check_input(user_message)["ok"]:
            _asst_sys = (_asst_sys or "") + _guard_in2.INPUT_GUARD_SUFFIX
            _sec_log.warning("guardian: инъекция/джейлбрейк в запросе к помощнику room=%s", room)
    except Exception:
        pass
    reply_text = await get_llm_reply(
        user_message=user_message,
        system_prompt=_asst_sys,
        model=(asst.llm_model if asst else None),
        max_tokens=(asst.llm_max_tokens if asst else 1000),
        conversation_history=history,
        user_persona_suffix=user_persona,
        user_id=user_id,
        payer_type="free",
    )

    # Guardian: сверка ответа помощника со справкой о платформе (анти-галлюцинации)
    if _asst_knowledge:
        try:
            from app.services import guardian
            if await guardian.enabled():
                _gv = await guardian.verify(user_message, _asst_knowledge, reply_text)
                if not _gv.get("ok"):
                    print(f"[guardian] assistant flagged: {_gv.get('issue')}")
                    reply_text = await get_llm_reply(
                        user_message=user_message,
                        system_prompt=((asst.system_prompt if asst and asst.system_prompt else "") + guardian.STRICT_SUFFIX),
                        model=(asst.llm_model if asst else None),
                        max_tokens=(asst.llm_max_tokens if asst else 1000),
                        conversation_history=history,
                        user_persona_suffix=user_persona,
                        user_id=user_id,
                        payer_type="free",
                    )
        except Exception as e:
            print(f"[guardian] assistant error: {e}")

    # Сохраняем ответ помощника в БД
    async with async_session() as db:
        assistant_msg = Message(
            room=room,
            sender_type="assistant",
            sender_name=assistant_name,
            text=reply_text,
        )
        db.add(assistant_msg)
        await db.commit()
        await db.refresh(assistant_msg)

        msg_data = {
            "type": "message",
            "id": assistant_msg.id,
            "room": room,
            "sender_type": "assistant",
            "sender_name": assistant_name,
            "text": reply_text,
            "created_at": assistant_msg.created_at.isoformat(),
        }

    await manager.broadcast(room, {
        "type": "typing_stop",
        "sender_name": assistant_name,
    })

    await manager.broadcast(room, msg_data)


# Legacy aliases
_mel_reply = _assistant_reply
_butler_reply = _assistant_reply


async def _agent_reply(room: str, agent: Agent, user_message: str):
    """Агент отвечает через LLM с учётом персонажа (манеры, знания, промпт)"""
    await manager.broadcast(room, {
        "type": "typing",
        "sender_name": agent.name,
        "sender_type": "agent",
    })

    history = await _get_conversation_history(room, exclude_text=user_message)

    # RAG-поиск у всех джиннов с базой знаний (search сам вернёт [] если коллекции нет).
    # Порог score отсекает нерелевантные чанки — исключаем только внутренних core-агентов.
    rag_context = None
    if agent.agent_type != "core":
        try:
            rag_results = await rag_service.search(
                agent_id=agent.id,
                query=user_message,
                top_k=5,
            )
            if rag_results:
                rag_parts = []
                for i, r in enumerate(rag_results, 1):
                    art = f" (ст. {r.article_number})" if r.article_number else ""
                    rag_parts.append(f"[{i}]{art}: {r.text}")
                rag_context = "\n\n".join(rag_parts)
        except Exception as e:
            print(f"[ws] RAG search error for agent {agent.id}: {e}")

    _uu = re.search(r"-u(\d+)$", room)
    _uid = int(_uu.group(1)) if _uu else 0
    from app.services.billing import resolve_payer, payer_balance
    _ptype, _pid = resolve_payer(agent, _uid)
    _blocked = bool(_ptype in ("contractor", "user") and _pid and await payer_balance(_ptype, _pid) <= 0)
    _agent_kwargs = dict(
        agent_name=agent.name,
        agent_profession=agent.profession,
        agent_description=agent.description or "",
        system_prompt=agent.system_prompt,
        llm_model=agent.llm_model or "gpt-4o-mini",
        user_message=user_message,
        conversation_history=history,
        manner_style=agent.manner_style or "friendly",
        manner_temperament=agent.manner_temperament or "balanced",
        manner_humor=agent.manner_humor if agent.manner_humor is not None else True,
        manner_emoji_use=agent.manner_emoji_use if agent.manner_emoji_use is not None else True,
        knowledge_text=agent.knowledge_text,
        skills_text=agent.skills_text,
        exclusions_text=agent.exclusions_text,
        rag_context=rag_context,
        user_id=_uid,
        agent_id=agent.id,
        payer_type=_ptype,
        payer_id=_pid,
    )
    try:
        from app.services import guardian as _guard_in
        if not _guard_in.check_input(user_message)["ok"]:
            _agent_kwargs["system_prompt"] = (agent.system_prompt or "") + _guard_in.INPUT_GUARD_SUFFIX
            _sec_log.warning("guardian: инъекция/джейлбрейк в запросе к джинну id=%s room=%s", agent.id, room)
    except Exception:
        pass
    try:
        from app.services.moderation import get_global_blocklist
        _gb = await get_global_blocklist()
        if _gb:
            _agent_kwargs["system_prompt"] = (_agent_kwargs.get("system_prompt") or agent.system_prompt or "") + f"\n\nЗапрещённые темы проекта (НЕ обсуждай, вежливо уходи от них): {', '.join(_gb)}."
    except Exception:
        pass
    if _blocked:
        if _ptype == "user" and getattr(agent, "is_paid", False):
            reply_text = "🔒 Это платный джинн, а на балансе недостаточно средств. Пополните баланс, чтобы продолжить общение."
        else:
            reply_text = agent.unavailable_message or "Извините, сейчас я не на связи — загляните чуть позже 🙂"
    else:
        reply_text = await get_agent_reply(**_agent_kwargs)
        # Guardian: анти-галлюцинации для ответов с базой знаний (сверка + строгая перегенерация)
        if rag_context:
            try:
                from app.services import guardian
                if await guardian.enabled():
                    _v = await guardian.verify(user_message, rag_context, reply_text)
                    if not _v.get("ok"):
                        print(f"[guardian] flagged agent {agent.id}: {_v.get('issue')}")
                        _strict = dict(_agent_kwargs)
                        _strict["system_prompt"] = (agent.system_prompt or "") + guardian.STRICT_SUFFIX
                        reply_text = await get_agent_reply(**_strict)
            except Exception as e:
                print(f"[guardian] error: {e}")

    async with async_session() as db:
        agent_msg = Message(
            room=room,
            sender_type="agent",
            sender_agent_id=agent.id,
            sender_name=agent.name,
            text=reply_text,
        )
        db.add(agent_msg)
        await db.commit()
        await db.refresh(agent_msg)

        msg_data = {
            "type": "message",
            "id": agent_msg.id,
            "room": room,
            "sender_type": "agent",
            "sender_agent_id": agent.id,
            "sender_name": agent.name,
            "text": reply_text,
            "created_at": agent_msg.created_at.isoformat(),
            "agent_color": agent.color,
        }

    await manager.broadcast(room, {
        "type": "typing_stop",
        "sender_name": agent.name,
    })

    await manager.broadcast(room, msg_data)


async def _set_user_offline(user_id: int) -> None:
    """Сбросить online-статус пользователя при отключении WebSocket."""
    try:
        async with async_session() as db:
            u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
            if u:
                u.is_online = False
                u.last_seen = datetime.now(timezone.utc)
                await db.commit()
    except Exception:
        pass


@router.websocket("/ws/chat/{room}")
async def chat_websocket(websocket: WebSocket, room: str):
    """
    WebSocket для реалтайм чата с LLM-ответами.
    Комнаты:
    - "general" -> Помощник отвечает
    - "agent-{id}" -> конкретный агент отвечает через get_agent_reply()
    """
    token = websocket.query_params.get("token", "")
    user_id = decode_access_token(token)

    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            await websocket.close(code=4001, reason="User not found")
            return
        user_name = user.display_name
        assistant_name = user.assistant_name or DEFAULT_ASSISTANT_NAME
        user.is_online = True
        await db.commit()

    # Если комната агента — загружаем агента
    agent_id = _parse_agent_room(room)
    agent: Optional[Agent] = None
    if agent_id:
        agent = await _load_agent(agent_id)
        if not agent:
            await websocket.close(code=4004, reason="Agent not found")
            return
        if not await _can_access_agent(agent, user_id):
            await websocket.close(code=4003, reason="Доступ запрещён")
            return

    # Комната с несколькими джиннами — room-{id}
    room_members: list = []
    _rm = _ROOM_RE.match(room)
    if _rm:
        room_members = await _load_room_members(int(_rm.group(1)))

    # Личный диалог dm-{a}-{b} — только участники
    _dm = re.match(r"^dm-(\d+)-(\d+)$", room)
    if _dm and user_id not in (int(_dm.group(1)), int(_dm.group(2))):
        await websocket.close(code=4003, reason="Нет доступа")
        return

    _um = re.match(r"^user-(\d+)$", room)
    if _um and user_id != int(_um.group(1)):
        await websocket.close(code=4003, reason="Нет доступа")
        return

    await manager.connect(websocket, room, user_id)
    if manager.user_conns.get(user_id, 0) == 1:
        await _broadcast_presence(user_id, True)

    join_data = {
        "type": "user_joined",
        "user_id": user_id,
        "user_name": user_name,
        "online_users": manager.get_online_users(room),
    }
    if agent:
        join_data["agent_info"] = {
            "id": agent.id,
            "name": agent.name,
            "profession": agent.profession,
            "brand": agent.brand,
            "color": agent.color,
            "photo_url": agent.photo_url,
            "greeting": agent.greeting,
            "tts_voice_id": agent.tts_voice_id,
            "tts_emotion": agent.tts_emotion,
        }
    if room_members:
        join_data["room_members"] = [
            {"id": a.id, "name": a.name, "profession": a.profession, "brand": a.brand,
             "color": a.color, "photo_url": a.photo_url} for a in room_members
        ]
    await manager.broadcast(room, join_data)

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=45)
            except asyncio.TimeoutError:
                raise WebSocketDisconnect()  # нет heartbeat -> соединение мёртвое
            payload = json.loads(data)
            if payload.get("type") == "ping":
                continue

            # WebRTC-сигналинг: релей offer/answer/ice/end/reject целевому пользователю
            signal = payload.get("signal")
            if signal:
                to = payload.get("to")
                if to:
                    await manager.broadcast(f"user-{to}", {
                        "type": f"call_{signal}",
                        "from": user_id,
                        "from_name": user_name,
                        "sdp": payload.get("sdp"),
                        "candidate": payload.get("candidate"),
                    })
                continue

            text = payload.get("text", "").strip()
            media_url = payload.get("media_url")
            media_type = payload.get("media_type")

            if not text and not media_url:
                continue

            async with async_session() as db:
                msg = Message(
                    room=room,
                    sender_type="user",
                    sender_user_id=user_id,
                    sender_name=user_name,
                    text=text,
                    media_url=media_url,
                    media_type=media_type,
                )
                db.add(msg)
                await db.commit()
                await db.refresh(msg)

                msg_data = {
                    "type": "message",
                    "id": msg.id,
                    "room": room,
                    "sender_type": "user",
                    "sender_user_id": user_id,
                    "sender_name": user_name,
                    "text": text,
                    "media_url": media_url,
                    "media_type": media_type,
                    "created_at": msg.created_at.isoformat(),
                }

            await manager.broadcast(room, msg_data)
            await _notify_participants(room)

            # Событие Ленты для собеседника при входящем DM (если он сейчас не в этом чате)
            if _dm:
                _a, _b = int(_dm.group(1)), int(_dm.group(2))
                _other = _b if user_id == _a else _a
                if _other not in manager.get_online_users(room):
                    try:
                        from app.api.feed import create_feed_event
                        from app.models.feed import FeedEvent
                        _bd = (text[:80] if text else "📎 медиа")
                        async with async_session() as _fdb:
                            _ex = (await _fdb.execute(select(FeedEvent).where(
                                FeedEvent.user_id == _other, FeedEvent.link_room == room, FeedEvent.is_read == False
                            ))).scalar_one_or_none()
                            if _ex:
                                _ex.title = f"Сообщение от {user_name}"
                                _ex.body = _bd
                                _ex.created_at = datetime.now(timezone.utc)
                                await _fdb.commit()
                            else:
                                await create_feed_event(_fdb, _other, f"Сообщение от {user_name}",
                                                        kind="message", icon="💬", body=_bd, link_room=room)
                        await manager.broadcast(f"user-{_other}", {"type": "feed_ping"})
                    except Exception as _e:
                        print(f"[feed] dm event failed: {_e}")

            if text and agent:
                asyncio.create_task(_agent_reply(room, agent, text))
            elif text and room_members:
                target = _pick_addressed_agent(room, text, room_members)
                asyncio.create_task(_agent_reply(room, target, text))
            elif text and (room == "general" or room.startswith("jim-")):
                asyncio.create_task(_assistant_reply(room, text, assistant_name, user_id))

    except WebSocketDisconnect:
        manager.disconnect(room, user_id)
        if not manager.is_user_online(user_id):
            await _set_user_offline(user_id)
            await _broadcast_presence(user_id, False)
        await manager.broadcast(room, {
            "type": "user_left",
            "user_id": user_id,
            "user_name": user_name,
            "online_users": manager.get_online_users(room),
        })
    except Exception as e:
        print(f"[ws] Error: {e}")
        manager.disconnect(room, user_id)
        if not manager.is_user_online(user_id):
            await _set_user_offline(user_id)
            await _broadcast_presence(user_id, False)
