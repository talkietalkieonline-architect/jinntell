"""Агент-луп помощника на tool-calling. Модель сама решает, какие инструменты вызвать.
Backend-инструменты исполняются здесь; клиентские (навигация) возвращаются директивами фронту.
Живой классификатор (page.tsx) не трогается — это параллельный путь."""
import json

from sqlalchemy import select, or_

from app.core.database import async_session
from app.models.agent import Agent
from app.models.contact import Contact
from app.models.user import User
from app.models.user_favorite import UserFavorite
from app.services.llm import deepseek_tools

TOOLS = [
    {"type": "function", "function": {
        "name": "find_person", "description": "Найти человека (контакт) или джинна по имени — узнать, есть ли он и в сети ли.",
        "parameters": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "open_chat", "description": "Открыть чат с человеком или джинном по имени.",
        "parameters": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "close_chat", "description": "Закрыть чат по имени собеседника.",
        "parameters": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "call", "description": "Открыть чат и предложить видеозвонок человеку.",
        "parameters": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "send_message", "description": "Отправить текстовое сообщение человеку по имени.",
        "parameters": {"type": "object", "properties": {"to": {"type": "string"}, "text": {"type": "string"}}, "required": ["to", "text"]}}},
    {"type": "function", "function": {
        "name": "add_favorite", "description": "Добавить джинна в избранное пользователя.",
        "parameters": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "web_search", "description": "Найти актуальную информацию в интернете.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "reply", "description": "Ответить пользователю обычным текстом (когда действие не нужно или чтобы подтвердить/уточнить).",
        "parameters": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}}},
]

CLIENT_TOOLS = {"open_chat", "close_chat", "call", "send_message"}

_SYS = (
    "Ты — {name}, персональный помощник пользователя в приложении JinnTell (город AI-джиннов). "
    "Помогаешь общаться с людьми и джиннами. У тебя есть инструменты — вызывай подходящие. "
    "Если человека/джинна нет или он не в сети — честно скажи об этом через reply и предложи, что делать "
    "(например, оставить сообщение). Не выдумывай людей. Когда действие выполнено — коротко подтверди через reply. "
    "Отвечай по-русски, дружелюбно и кратко."
)


async def _find_person(user_id: int, name: str) -> str:
    n = (name or "").strip()
    if not n:
        return "Имя не указано."
    pat = f"%{n}%"
    parts = []
    async with async_session() as db:
        # контакты пользователя (люди)
        rows = (await db.execute(
            select(User).join(Contact, Contact.contact_user_id == User.id)
            .where(Contact.owner_user_id == user_id, User.display_name.ilike(pat)).limit(5)
        )).scalars().all()
        for u in rows:
            parts.append(f"Контакт: {u.display_name} — {'в сети' if u.is_online else 'не в сети'}")
        # избранные джинны
        favs = (await db.execute(
            select(Agent).join(UserFavorite, UserFavorite.agent_id == Agent.id)
            .where(UserFavorite.user_id == user_id, Agent.name.ilike(pat), Agent.is_active == True).limit(5)
        )).scalars().all()
        for a in favs:
            parts.append(f"Джинн (в избранном): {a.name} — {a.profession}")
        # джинны Города
        city = (await db.execute(
            select(Agent).where(Agent.name.ilike(pat), Agent.is_active == True,
                                Agent.visibility == "public").limit(5)
        )).scalars().all()
        seen = {a.name for a in favs}
        for a in city:
            if a.name not in seen:
                parts.append(f"Джинн (в Городе): {a.name} — {a.profession}")
    return "; ".join(parts) if parts else f"Никого с именем «{n}» не нашёл."


async def _add_favorite(user_id: int, name: str) -> str:
    pat = f"%{(name or '').strip()}%"
    async with async_session() as db:
        a = (await db.execute(
            select(Agent).where(Agent.name.ilike(pat), Agent.is_active == True, Agent.visibility == "public").limit(1)
        )).scalar_one_or_none()
        if not a:
            return f"Не нашёл джинна «{name}» в Городе."
        ex = (await db.execute(
            select(UserFavorite).where(UserFavorite.user_id == user_id, UserFavorite.agent_id == a.id)
        )).scalar_one_or_none()
        if not ex:
            db.add(UserFavorite(user_id=user_id, agent_id=a.id))
            await db.commit()
        return f"Добавил «{a.name}» в избранное."


async def _web_search(query: str) -> str:
    from app.services import websearch
    res = await websearch.search(query or "", max_results=4)
    if not res.get("ok"):
        return "Веб-поиск не подключён (нет ключа в админке)." if res.get("reason") in ("off", "no_key") else "Поиск не удался."
    if res.get("answer"):
        return res["answer"]
    rs = res.get("results") or []
    if not rs:
        return "Ничего не нашлось."
    return "\n".join(f"- {r['title']}: {r['snippet']} ({r['url']})" for r in rs[:4])


async def run(user_id: int, text: str, assistant_name: str = "Джим", max_iters: int = 4) -> dict:
    messages = [
        {"role": "system", "content": _SYS.format(name=assistant_name)},
        {"role": "user", "content": (text or "")[:1000]},
    ]
    directives = []
    steps = []
    final = ""
    for _ in range(max_iters):
        res = await deepseek_tools(messages, TOOLS)
        calls = res.get("tool_calls") or []
        if not calls:
            final = (res.get("content") or "").strip()
            break
        messages.append({"role": "assistant", "content": res.get("content") or "", "tool_calls": calls})
        for tc in calls:
            fn = tc.get("function", {})
            name = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except Exception:
                args = {}
            steps.append({"tool": name, "args": args})
            if name == "reply":
                final = (args.get("text") or "").strip()
                result = "ok"
            elif name in CLIENT_TOOLS:
                directives.append({"action": name, **args})
                result = f"Директива «{name}» передана клиенту (выполнит навигацию)."
            elif name == "find_person":
                result = await _find_person(user_id, args.get("name", ""))
            elif name == "add_favorite":
                result = await _add_favorite(user_id, args.get("name", ""))
            elif name == "web_search":
                result = await _web_search(args.get("query", ""))
            else:
                result = "неизвестный инструмент"
            messages.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": str(result)[:1500]})
        if final:
            break
    if not final:
        final = "Готово."
    return {"reply": final, "directives": directives, "steps": steps}
