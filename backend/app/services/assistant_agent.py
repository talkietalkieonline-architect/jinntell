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
        "name": "web_search", "description": "Быстрый веб-поиск для ПРОСТОГО факта (погода, курс, одна цифра, короткая справка). Для сложного/исследовательского запроса используй deep_search.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "deep_search", "description": "Делегировать ТЯЖЁЛЫЙ/исследовательский запрос Поисковому джинну (мультиисточник + выжимка со ссылками). Для сложных вопросов, сравнений, «разберись подробно» — не для простого факта.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "make_digest", "description": "Собрать ПОДБОРКУ: опросить несколько джиннов Города по теме и составить документ с их мнениями (с указанием, кто что сказал). Для запросов «составь рейтинг/подборку/сравни варианты X». Результат сохраняется как подборка на главном экране (раздел Информация).",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "show_media", "description": "Показать пользователю картинку или видео на экране (напр. фото джинна, или изображение по прямой ссылке). Используй, когда просят «покажи», «как выглядит», или чтобы проиллюстрировать ответ.",
        "parameters": {"type": "object", "properties": {
            "jinn": {"type": "string", "description": "Имя джинна — показать его фото."},
            "url": {"type": "string", "description": "Прямая ссылка на изображение или видео."},
            "media_type": {"type": "string", "enum": ["image", "video"], "description": "Тип медиа (по умолчанию image)."}
        }, "required": []}}},
    {"type": "function", "function": {
        "name": "remember_interest", "description": "Запомнить интерес/тему пользователя — когда он называет интерес или просит обращать внимание на тему (напр. «детские коляски»).",
        "parameters": {"type": "object", "properties": {"topic": {"type": "string"}}, "required": ["topic"]}}},
    {"type": "function", "function": {
        "name": "forget_interest", "description": "Убрать интерес пользователя, если тема больше не актуальна.",
        "parameters": {"type": "object", "properties": {"topic": {"type": "string"}}, "required": ["topic"]}}},
    {"type": "function", "function": {
        "name": "confirm_interest", "description": "Пользователь подтвердил, что интерес всё ещё актуален — обновить его свежесть.",
        "parameters": {"type": "object", "properties": {"topic": {"type": "string"}}, "required": ["topic"]}}},
    {"type": "function", "function": {
        "name": "block_topic", "description": "Заблокировать тему — пользователь не хочет её видеть/получать предложения (напр. «не показывай корм для животных»).",
        "parameters": {"type": "object", "properties": {"topic": {"type": "string"}}, "required": ["topic"]}}},
    {"type": "function", "function": {
        "name": "unblock_topic", "description": "Разблокировать ранее заблокированную тему.",
        "parameters": {"type": "object", "properties": {"topic": {"type": "string"}}, "required": ["topic"]}}},
    {"type": "function", "function": {
        "name": "list_blocked", "description": "Показать заблокированные темы (блок-лист).",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "list_interests", "description": "Показать известные интересы пользователя.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "check_feed", "description": "Проверить, есть ли по интересам пользователя свежие посты/новости от джиннов Города (лента). Вызывай, когда пользователь спрашивает «что нового/интересного», или чтобы предложить релевантное.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
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
    "Когда пользователь называет свой интерес или просит обращать внимание на тему — запомни через remember_interest. "
    "Если пользователь просит не показывать/не беспокоить какой-то темой — block_topic. "
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

        def _lvl(v, lo, mid, hi):
            try:
                v = float(v)
            except (TypeError, ValueError):
                return None
            return lo if v <= 33 else (mid if v <= 66 else hi)
        char = [x for x in [
            _lvl(tr.get("humor_level"), "почти без шуток", "с лёгким юмором", "с хорошим, уместным чувством юмора"),
            _lvl(tr.get("warmth"), "сдержанно", "дружелюбно", "очень тепло и заботливо"),
            _lvl(tr.get("directness"), "мягко и тактично", "прямо, но деликатно", "прямо и по существу, без воды"),
            _lvl(tr.get("formality"), "непринуждённо, на «ты»", "нейтрально", "вежливо и формально"),
        ] if x]
        if char:
            parts.append("Характер: " + ", ".join(char) + ".")
        # Раскрепощённость (новая ось, только у помощника) — насколько «в образе»/театрально
        _expr = _lvl(tr.get("expressiveness"), "сдержанно и по-деловому",
                     "живо, с эмоциями и лёгкой игрой",
                     "ярко и раскрепощённо, в образе — характерные приветствия, словечки, много энергии")
        if _expr:
            parts.append("Манера подачи: " + _expr + ".")
        _character = (tr.get("character") or "").strip()
        if _character:
            parts.append(f"Твой образ — «{_character}»: держись этой роли (приветствия, словечки, подача в её духе).")
        if _expr or _character:
            parts.append("ВАЖНО: раскрепощённость и образ — это ТОЛЬКО манера подачи. Правила, честность, безопасность и запреты НЕ ослабляются: не выдумывай фактов, не грубишь, не обходишь ограничения и блок-лист.")
        _init = (getattr(u, "assistant_initiative", None) or "reactive")
        _imap = {
            "proactive": "Можешь сам начинать разговор и проявлять инициативу — иногда первым интересуйся делами и интересами пользователя.",
            "reactive": "Инициативу проявляй по ходу беседы, но не навязывайся.",
            "command": "Не начинай разговор сам — отвечай, только когда пользователь обратился.",
        }
        parts.append(_imap.get(_init, _imap["reactive"]))
        try:
            _items = _norm_interests(json.loads(u.assistant_interests or "[]"))
        except Exception:
            _items = []
        if _items:
            parts.append("Известные интересы пользователя: " + ", ".join(x["topic"] for x in _items) + ". Учитывай их и предлагай релевантное.")
        try:
            _blk = [x for x in json.loads(u.assistant_blocklist or "[]") if isinstance(x, str)]
        except Exception:
            _blk = []
        if _blk:
            parts.append("Заблокированные темы (НЕ предлагай их): " + ", ".join(_blk) + ". Изредка можешь предложить пересмотреть блок-лист.")
            _stale = [x["topic"] for x in _items if _age_days(x["ts"]) > 21]
            if _stale:
                parts.append("Залежавшиеся интересы (давно не подтверждались): " + ", ".join(_stale) + ". Если ты в проактивном режиме и разговор без конкретной задачи (напр. приветствие/болтовня) — МЯГКО спроси, актуален ли ещё ОДИН из них (по одному за раз, не списком). «Уже не нужно» → forget_interest; «да, актуально» → confirm_interest.")
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
    try:
        from app.services.moderation import get_global_blocklist
        _gb = await get_global_blocklist()
        if _gb:
            parts.append("Запрещённые темы проекта (НЕ обсуждай и НЕ предлагай, вежливо уходи): " + ", ".join(_gb) + ".")
    except Exception:
        pass
    sys = _BASE.format(name=name)
    if parts:
        sys += "\n\n" + "\n".join(p for p in parts if p)
    return sys


def _age_days(ts) -> int:
    from datetime import datetime, timezone
    try:
        d = datetime.fromisoformat(str(ts))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - d).days
    except Exception:
        return 999


def _norm_interests(raw) -> list:
    """Нормализовать хранилище в список {topic, ts}. Совместимо со старым форматом (строки)."""
    out = []
    for x in raw or []:
        if isinstance(x, str) and x.strip():
            out.append({"topic": x.strip(), "ts": "2000-01-01"})
        elif isinstance(x, dict) and x.get("topic"):
            out.append({"topic": x["topic"], "ts": x.get("ts", "2000-01-01")})
    return out


async def _load_interests(user_id: int) -> list:
    async with async_session() as db:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u or not getattr(u, "assistant_interests", None):
        return []
    try:
        return _norm_interests(json.loads(u.assistant_interests))
    except Exception:
        return []


async def _get_interests(user_id: int) -> list:
    """Только темы (строки) — для таргетинга и контекста."""
    return [i["topic"] for i in await _load_interests(user_id)]


async def _stale_interests(user_id: int, days: int = 21) -> list:
    return [i["topic"] for i in await _load_interests(user_id) if _age_days(i["ts"]) > days]


async def _save_interests(items: list, user_id: int) -> None:
    async with async_session() as db:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if u:
            u.assistant_interests = json.dumps(items, ensure_ascii=False)
            await db.commit()


async def _add_interest(user_id: int, topic: str) -> str:
    from datetime import datetime, timezone
    t = (topic or "").strip()
    if not t:
        return "Тема не указана."
    items = await _load_interests(user_id)
    now = datetime.now(timezone.utc).isoformat()
    for it in items:
        if it["topic"].lower() == t.lower():
            it["ts"] = now
            await _save_interests(items, user_id)
            return f"Обновил интерес: {t}."
    items.append({"topic": t, "ts": now})
    await _save_interests(items, user_id)
    return f"Запомнил интерес: {t}."


async def _confirm_interest(user_id: int, topic: str) -> str:
    """Пользователь подтвердил актуальность интереса — обновить дату."""
    return await _add_interest(user_id, topic)


async def _remove_interest(user_id: int, topic: str) -> str:
    t = (topic or "").strip().lower()
    if not t:
        return "Тема не указана."
    items = await _load_interests(user_id)
    new = [it for it in items if t not in it["topic"].lower()]
    await _save_interests(new, user_id)
    return "Убрал." if len(new) < len(items) else "Такого интереса не нашёл."


async def _load_block(user_id: int) -> list:
    async with async_session() as db:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u or not getattr(u, "assistant_blocklist", None):
        return []
    try:
        return [x for x in json.loads(u.assistant_blocklist) if isinstance(x, str)]
    except Exception:
        return []


async def _save_block(items: list, user_id: int) -> None:
    async with async_session() as db:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if u:
            u.assistant_blocklist = json.dumps(items, ensure_ascii=False)
            await db.commit()


async def _block_topic(user_id: int, topic: str) -> str:
    t = (topic or "").strip()
    if not t:
        return "Тема не указана."
    items = await _load_block(user_id)
    if t.lower() not in [x.lower() for x in items]:
        items.append(t)
        await _save_block(items, user_id)
    return f"Заблокировал тему: {t}. Больше не буду это предлагать."


async def _unblock_topic(user_id: int, topic: str) -> str:
    t = (topic or "").strip().lower()
    items = await _load_block(user_id)
    new = [x for x in items if t not in x.lower()]
    await _save_block(new, user_id)
    return "Разблокировал." if len(new) < len(items) else "Такой темы в блок-листе не нашёл."


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


async def _check_feed(user_id: int) -> str:
    from app.services import targeting
    r = await targeting.match_for_user(user_id, top_k=5)
    if not r.get("ok"):
        reason = r.get("reason")
        if reason == "no_interests":
            return "У пользователя пока не записаны интересы — предложи назвать пару тем, чтобы приносить релевантное."
        if reason == "approaches_off":
            return "Пользователь отключил предложения (настройки действий)."
        return "Сейчас по интересам ничего подходящего нет."
    posts = r.get("posts") or []
    if not posts:
        return "По интересам пользователя свежих постов пока нет."
    return "Свежее по интересам пользователя: " + " | ".join(f"«{p['title']}» ({p['agent_name']})" for p in posts)


async def _deep_search(user_id: int, query: str) -> str:
    """Делегирование Поисковому джинну: веб-поиск → выжимка его персоной → сохранить в его комнату (память)."""
    q = (query or "").strip()
    if not q:
        return "Запрос не указан."
    from app.services import websearch
    from app.services.llm import get_llm_reply
    from app.models.message import Message
    r = await websearch.search(q, max_results=6)
    if not r.get("ok"):
        if r.get("reason") in ("off", "no_key"):
            return "Веб-поиск не подключён — задай провайдер и ключ в админке."
        return f"Поиск не удался ({r.get('reason')})."
    results = r.get("results") or []
    answer = r.get("answer") or ""
    async with async_session() as db:
        sj = (await db.execute(select(Agent).where(Agent.name == "Поисковый джинн").limit(1))).scalar_one_or_none()
    src_block = "\n".join(f"- {x.get('title','')} — {x.get('url','')}: {(x.get('snippet','') or '')[:200]}" for x in results)
    sys = sj.system_prompt if sj else "Сделай краткую выжимку на русском с источниками."
    prompt = f"Запрос: {q}\n\nКраткий ответ движка: {answer}\n\nРезультаты поиска:\n{src_block}"
    summary = await get_llm_reply(user_message=prompt, system_prompt=sys,
                                  model=(sj.llm_model if sj else None), max_tokens=500,
                                  payer_type="free", agent_id=(sj.id if sj else None), user_id=user_id)
    if sj:
        try:
            async with async_session() as db:
                room = f"agent-{sj.id}-u{user_id}"
                db.add(Message(room=room, sender_type="user", sender_user_id=user_id, sender_name="", text=q))
                db.add(Message(room=room, sender_type="agent", sender_name=sj.name, text=summary))
                await db.commit()
        except Exception:
            pass
    return summary


async def _show_media(user_id: int, args: dict) -> tuple[str, dict | None]:
    """Возвращает (текст-результат, media|None). media = {'url':..., 'type':...}."""
    url = (args.get("url") or "").strip()
    mtype = (args.get("media_type") or "image").strip().lower()
    if mtype not in ("image", "video"):
        mtype = "image"
    jinn = (args.get("jinn") or "").strip()
    if jinn:
        pat = f"%{jinn}%"
        async with async_session() as db:
            a = (await db.execute(
                select(Agent).where(Agent.name.ilike(pat), Agent.is_active == True).limit(1)
            )).scalar_one_or_none()
        if a and a.photo_url:
            return (f"Показываю фото джинна {a.name}.", {"url": a.photo_url, "type": "image"})
        if a:
            return (f"У джинна {a.name} нет фото.", None)
        return (f"Джинн «{jinn}» не найден.", None)
    if url and (url.startswith("http://") or url.startswith("https://")):
        return ("Показываю медиа.", {"url": url, "type": mtype})
    return ("Нечего показать: укажи имя джинна или ссылку на изображение.", None)


async def run(user_id: int, text: str, assistant_name: str = "Джим", max_iters: int = 4) -> dict:
    system = await _build_context(user_id, text or "")
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": (text or "")[:1000]},
    ]
    directives = []
    steps = []
    final = ""
    media = None
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
            elif name == "deep_search":
                result = await _deep_search(user_id, args.get("query", ""))
            elif name == "make_digest":
                from app.services import digest as _dg
                _dr = await _dg.build_digest(user_id, args.get("query", ""))
                if _dr.get("ok"):
                    result = f"Собрал подборку «{(args.get('query') or '')[:60]}» — {len(_dr['sections'])} мнений джиннов. Открой её на главном экране (раздел Информация)."
                elif _dr.get("reason") == "no_agents":
                    result = "Не нашёл в Городе джиннов по этой теме для подборки."
                else:
                    result = "Не удалось собрать подборку."
            elif name == "show_media":
                result, _m = await _show_media(user_id, args)
                if _m:
                    media = _m
            elif name == "remember_interest":
                result = await _add_interest(user_id, args.get("topic", ""))
            elif name == "forget_interest":
                result = await _remove_interest(user_id, args.get("topic", ""))
            elif name == "confirm_interest":
                result = await _confirm_interest(user_id, args.get("topic", ""))
            elif name == "block_topic":
                result = await _block_topic(user_id, args.get("topic", ""))
            elif name == "unblock_topic":
                result = await _unblock_topic(user_id, args.get("topic", ""))
            elif name == "list_blocked":
                _bl = await _load_block(user_id)
                result = ("Заблокировано: " + ", ".join(_bl)) if _bl else "Блок-лист пуст."
            elif name == "list_interests":
                _ii = await _get_interests(user_id)
                result = ("Интересы пользователя: " + ", ".join(_ii)) if _ii else "Интересов пока не записано."
            elif name == "check_feed":
                _fr = await _check_feed(user_id)
                result = _fr
            else:
                result = "неизвестный инструмент"
            messages.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": str(result)[:1500]})
        if final:
            break
    if not final:
        final = "Показываю." if media else "Готово."
    return {"reply": final, "directives": directives, "steps": steps,
            "media_url": (media or {}).get("url"), "media_type": (media or {}).get("type")}
