"""Агент-луп помощника на tool-calling с ЛИЧНОСТЬЮ, ПАМЯТЬЮ и ЗНАНИЯМИ.
Модель сама решает, какие инструменты вызвать. Backend-инструменты исполняются здесь;
клиентские (навигация) возвращаются директивами фронту."""
import json

from sqlalchemy import select

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

_BASE = (
    "Ты — {name}, персональный помощник пользователя в JinnTell (город AI-джиннов). "
    "Общайся тепло, живо и естественно, как хороший внимательный собеседник, а не бот. Коротко, по делу, с эмпатией. "
    "У тебя есть инструменты — вызывай их, когда нужно ДЕЙСТВИЕ (найти, открыть/закрыть чат, отправить, избранное, поиск в сети). "
    "Если человека/джинна нет или он не в сети — честно скажи и предложи вариант (например, оставить сообщение). "
    "Не выдумывай людей и факты. Отвечай по-русски."
)


async def _build_context(user_id: int, text: str) -> str:
    """Персона помощника + память о пользователе + знания о платформе."""
    name = "Джим"
    parts = []
    async with async_session() as db:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if u:
        name = u.assistant_name or "Джим"
        gmap = {"male": "Ты мужчина, говори о себе в мужском роде (рад, готов).",
                "female": "Ты женщина, говори о себе в женском роде (рада, готова).",
                "neutral": "Избегай гендерных форм о себе.",
                "animal": "Ты необычный персонаж."}
        parts.append(gmap.get(u.assistant_gender or "male", ""))
        if getattr(u, "assistant_age", None):
            parts.append(f"Твой образ — возраст около {u.assistant_age}.")
        try:
            tr = json.loads(u.assistant_traits or "{}")
        except Exception:
            tr = {}
        style = []
        tone = {"friendly": "тон дружелюбный и тёплый", "neutral": "тон нейтральный", "business": "тон деловой, по существу"}
        if tr.get("tone") in tone:
            style.append(tone[tr["tone"]])
        ln = {"short": "отвечай коротко (1-2 предложения)", "medium": "средней длины", "long": "можно подробно"}
        if tr.get("length") in ln:
            style.append(ln[tr["length"]])
        if tr.get("humor"):
            style.append("допускай лёгкий уместный юмор")
        if tr.get("emoji") is False:
            style.append("без эмодзи")
        elif tr.get("emoji"):
            style.append("умеренно используй эмодзи")
        if style:
            parts.append("Стиль общения: " + ", ".join(style) + ".")
    # память о пользователе
    try:
        from app.services.memory import recall
        facts = await recall(user_id, text, k=5)
        if facts:
            parts.append("Что ты помнишь о пользователе: " + "; ".join(facts) + ". Используй это естественно.")
    except Exception:
        pass
    # знания о платформе (RAG core-агента «Джим»)
    try:
        from app.services import rag as _rag
        async with async_session() as db:
            jim = (await db.execute(select(Agent).where(Agent.jinntell_link == "jim"))).scalar_one_or_none()
        if jim:
            kn = await _rag.search(agent_id=jim.id, query=text, top_k=3)
            if kn:
                parts.append("Справка о платформе (отвечай по ней, не выдумывай функции): " + " | ".join(c.text for c in kn))
    except Exception:
        pass
    sys = _BASE.format(name=name)
    if parts:
        sys += "\n\n" + "\n".join(p for p in parts if p)
    return sys


async def _find_person(user_id: int, name: str) -> str:
    n = (name or "").strip()
    if not n:
        return "Имя не указано."
    pat = f"%{n}%"
    parts = []
    async with async_session() as db:
        rows = (await db.execute(
            select(User).join(Contact, Contact.contact_user_id == User.id)
            .where(Contact.owner_user_id == user_id, User.display_name.ilike(pat)).limit(5)
        )).scalars().all()
        for u in rows:
            parts.append(f"Контакт: {u.display_name} — {'в сети' if u.is_online else 'не в сети'}")
        favs = (await db.execute(
            select(Agent).join(UserFavorite, UserFavorite.agent_id == Agent.id)
            .where(UserFavorite.user_id == user_id, Agent.name.ilike(pat), Agent.is_active == True).limit(5)
        )).scalars().all()
        for a in favs:
            parts.append(f"Джинн (в избранном): {a.name} — {a.profession}")
        city = (await db.execute(
            select(Agent).where(Agent.name.ilike(pat), Agent.is_active == True, Agent.visibility == "public").limit(5)
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
    system = await _build_context(user_id, text or "")
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": (text or "")[:1000]},
    ]
    directives = []
    steps = []
    final = ""
    for _ in range(max_iters):
        res = await deepseek_tools(messages, TOOLS, temperature=0.6, frequency_penalty=0.3)
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
