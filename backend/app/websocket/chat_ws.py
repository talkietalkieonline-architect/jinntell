"""WebSocket эндпоинт для чата с LLM-ответами"""
import asyncio
import json
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

router = APIRouter()

# Regex для определения комнаты агента: agent-{id}
_AGENT_ROOM_RE = re.compile(r"^agent-(\d+)$")

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
        result = await db.execute(
            select(Message)
            .where(Message.room == room)
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
            history.append({"role": role, "content": m.text})
        return history


async def _get_user_assistant_settings(user_id: int) -> dict:
    """Получить настройки помощника пользователя из БД"""
    defaults = {
        "name": DEFAULT_ASSISTANT_NAME,
        "gender": "male",
        "voice": "male_low",
        "manner": None,  # None = использовать дефолт из промпта
    }
    try:
        async with async_session() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user:
                return {
                    "name": user.assistant_name or DEFAULT_ASSISTANT_NAME,
                    "gender": user.assistant_gender or "male",
                    "voice": user.assistant_voice or "male_low",
                    "manner": None,
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
        "neutral": "нейтральный пол",
    }
    gender_text = gender_labels.get(gender, "мужчина")

    return f"""

=== ПЕРСОНАЛИЗАЦИЯ ===
Тебя зовут {name}. Ты {gender_text}.
Когда представляешься — говори: «Я {name}».
Пользователь выбрал тебе это имя — используй его.
=== КОНЕЦ ПЕРСОНАЛИЗАЦИИ ==="""


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

    # LLM-ответ (базовый промпт из Redis/настроек + пользовательская персонализация)
    # Мозг и промпт берём из карточки core-агента «Помощник Джим» (единый источник)
    asst = await _get_assistant_agent()
    reply_text = await get_llm_reply(
        user_message=user_message,
        system_prompt=(asst.system_prompt if asst and asst.system_prompt else None),
        model=(asst.llm_model if asst else None),
        max_tokens=(asst.llm_max_tokens if asst else 1000),
        conversation_history=history,
        user_persona_suffix=user_persona,
    )

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

    # Для агентов-специалистов — RAG-поиск
    rag_context = None
    if agent.agent_type == "specialist":
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

    reply_text = await get_agent_reply(
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
    )

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

    # Если комната агента — загружаем агента
    agent_id = _parse_agent_room(room)
    agent: Optional[Agent] = None
    if agent_id:
        agent = await _load_agent(agent_id)
        if not agent:
            await websocket.close(code=4004, reason="Agent not found")
            return

    await manager.connect(websocket, room, user_id)

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
            "greeting": agent.greeting,
        }
    await manager.broadcast(room, join_data)

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            text = payload.get("text", "").strip()

            if not text:
                continue

            async with async_session() as db:
                msg = Message(
                    room=room,
                    sender_type="user",
                    sender_user_id=user_id,
                    sender_name=user_name,
                    text=text,
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
                    "created_at": msg.created_at.isoformat(),
                }

            await manager.broadcast(room, msg_data)

            if agent:
                asyncio.create_task(_agent_reply(room, agent, text))
            elif room == "general":
                asyncio.create_task(_assistant_reply(room, text, assistant_name, user_id))

    except WebSocketDisconnect:
        manager.disconnect(room, user_id)
        await manager.broadcast(room, {
            "type": "user_left",
            "user_id": user_id,
            "user_name": user_name,
            "online_users": manager.get_online_users(room),
        })
    except Exception as e:
        print(f"[ws] Error: {e}")
        manager.disconnect(room, user_id)
