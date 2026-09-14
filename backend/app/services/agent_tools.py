"""Инструменты (функции) джиннов + права. Профессия = пресет способностей.

Разговорный режим: джинн вызывает разрешённые инструменты во время ответа (function-calling),
как помощник. ГЕЙТ ПРАВ = agent.tools_json (список включённых имён). Ядро вызова — llm.deepseek_tools.
Фаза 1: read-only инструменты (search_knowledge / lookup / web_search). См. vision_profession_factory.
"""
import ast
import json
import operator as _op
from typing import Optional

# --- Безопасный калькулятор (только арифметика, без имён/вызовов) ---
_CALC_OPS = {ast.Add: _op.add, ast.Sub: _op.sub, ast.Mult: _op.mul, ast.Div: _op.truediv,
             ast.Pow: _op.pow, ast.Mod: _op.mod, ast.FloorDiv: _op.floordiv,
             ast.USub: _op.neg, ast.UAdd: _op.pos}


def _calc_node(n):
    if isinstance(n, ast.Constant):
        if isinstance(n.value, bool) or not isinstance(n.value, (int, float)):
            raise ValueError("bad const")
        return n.value
    if isinstance(n, ast.BinOp) and type(n.op) in _CALC_OPS:
        return _CALC_OPS[type(n.op)](_calc_node(n.left), _calc_node(n.right))
    if isinstance(n, ast.UnaryOp) and type(n.op) in _CALC_OPS:
        return _CALC_OPS[type(n.op)](_calc_node(n.operand))
    raise ValueError("bad expr")


def _safe_calc(expr: str):
    try:
        val = _calc_node(ast.parse((expr or "").strip(), mode="eval").body)
        if isinstance(val, float):
            if val.is_integer():
                val = int(val)
            else:
                val = round(val, 2)
        return val
    except Exception:
        return None


async def _load_client_notes(agent_id, user_id, limit: int = 6) -> list:
    """Заметки джина об этом клиенте (activity_log action=client_note, agent+user), расшифрованные."""
    if not agent_id or not user_id:
        return []
    try:
        from sqlalchemy import select
        from app.core.database import async_session
        from app.models.activity import ActivityLog
        from app.core.crypto import decrypt_text
        async with async_session() as db:
            rows = (await db.execute(
                select(ActivityLog).where(
                    ActivityLog.actor_agent_id == agent_id,
                    ActivityLog.user_id == user_id,
                    ActivityLog.action == "client_note",
                ).order_by(ActivityLog.created_at.desc()).limit(limit)
            )).scalars().all()
        out = []
        for r in rows:
            try:
                t = decrypt_text(r.detail) if r.detail else ""
            except Exception:
                t = ""
            if t:
                out.append(t)
        return out
    except Exception as e:
        print(f"[agent_tools] client notes skip: {e}")
        return []

# --- Реестр инструментов (суперсет: джинн-прототип «умеет всё», бизнес включает нужное) ---
# category: read | write ; risk: low | med
TOOL_REGISTRY = {
    "search_knowledge": {
        "category": "read", "risk": "low", "label": "Поиск по базе знаний",
        "schema": {"type": "function", "function": {
            "name": "search_knowledge",
            "description": "Найти точную информацию в базе знаний компании (услуги, условия, факты, FAQ). "
                           "Вызывай ПЕРЕД ответом на вопрос по делу компании — не выдумывай.",
            "parameters": {"type": "object", "properties": {
                "query": {"type": "string", "description": "Что ищем"}}, "required": ["query"]}}},
    },
    "lookup": {
        "category": "read", "risk": "low", "label": "Поиск в каталоге / прайсе",
        "schema": {"type": "function", "function": {
            "name": "lookup",
            "description": "Найти конкретный товар/услугу и цену в каталоге компании — по названию, свойству или бюджету.",
            "parameters": {"type": "object", "properties": {
                "query": {"type": "string", "description": "Название / свойство / бюджет"}}, "required": ["query"]}}},
    },
    "web_search": {
        "category": "read", "risk": "low", "label": "Поиск в интернете",
        "schema": {"type": "function", "function": {
            "name": "web_search",
            "description": "Поиск актуальной информации в интернете, когда её нет в базе компании.",
            "parameters": {"type": "object", "properties": {
                "query": {"type": "string"}}, "required": ["query"]}}},
    },
    "calc": {
        "category": "read", "risk": "low", "label": "Посчитать (смета/кредит)",
        "schema": {"type": "function", "function": {
            "name": "calc",
            "description": "Точно посчитать число: сумму сметы, итог заказа, ежемесячный платёж по рассрочке/кредиту, скидку. "
                           "Передавай ГОТОВОЕ арифметическое выражение (числа и + - * / % ( )). Всегда считай через этот инструмент, не в уме.",
            "parameters": {"type": "object", "properties": {
                "expression": {"type": "string", "description": "Напр. 18700*0.9 или 18700/4"}}, "required": ["expression"]}}},
    },
    "remember_client": {
        "category": "write", "risk": "low", "label": "Запомнить о клиенте",
        "schema": {"type": "function", "function": {
            "name": "remember_client",
            "description": "Запомнить факт об ЭТОМ клиенте (что ищет, бюджет, предпочтения, имя, ребёнку сколько лет и т.п.), "
                           "чтобы помнить его в следующий раз и не переспрашивать. Один факт за вызов.",
            "parameters": {"type": "object", "properties": {
                "fact": {"type": "string", "description": "Факт о клиенте"}}, "required": ["fact"]}}},
    },
    "create_lead": {
        "category": "write", "risk": "low", "label": "Оформить заявку (лид)",
        "schema": {"type": "function", "function": {
            "name": "create_lead",
            "description": "Записать заявку клиента для компании (имя, контакт, что нужно). "
                           "Используй, когда клиент готов оставить контакт или заказать.",
            "parameters": {"type": "object", "properties": {
                "name": {"type": "string"}, "contact": {"type": "string"},
                "note": {"type": "string", "description": "Что нужно клиенту"}},
                "required": ["contact", "note"]}}},
    },
    "save_to_portfolio": {
        "category": "write", "risk": "low", "label": "Сохранить результат в Портфель",
        "schema": {"type": "function", "function": {
            "name": "save_to_portfolio",
            "description": "Сохранить пользователю в «Портфель» ГОТОВЫЙ РЕЗУЛЬТАТ своей работы любого типа, чтобы не потерялся в чате. Для текста — kind=doc и text; для картинки/видео/файла — kind=image|video|file и url (прямая ссылка); для ссылки на ресурс — kind=link и url.",
            "parameters": {"type": "object", "properties": {
                "title": {"type": "string", "description": "Название результата (как подпишется в Портфеле)"},
                "kind": {"type": "string", "enum": ["doc", "image", "video", "file", "link"], "description": "Тип результата"},
                "url": {"type": "string", "description": "Прямая ссылка на медиа/файл/ресурс (для image/video/file/link)"},
                "text": {"type": "string", "description": "Текст (для kind=doc или как описание к медиа)"}},
                "required": ["title", "kind"]}}},
    },
    "make_document": {
        "category": "write", "risk": "low", "label": "Составить документ",
        "schema": {"type": "function", "function": {
            "name": "make_document",
            "description": "Составить документ для клиента (счёт, коммерческое предложение (КП), договор-шаблон, справка) и сохранить ему в «Портфель». Текст пишешь ТЫ по данным разговора и каталога; реальные позиции и суммы (посчитанные через calc).",
            "parameters": {"type": "object", "properties": {
                "kind": {"type": "string", "description": "счёт / КП / договор / справка"},
                "title": {"type": "string"},
                "content": {"type": "string", "description": "Полный текст документа"}},
                "required": ["title", "content"]}}},
    },
    "escalate": {
        "category": "write", "risk": "low", "label": "Позвать человека",
        "schema": {"type": "function", "function": {
            "name": "escalate",
            "description": "Передать разговор ЖИВОМУ специалисту компании — когда вопрос вне компетенции, клиент недоволен или прямо просит человека. Кратко опиши суть для человека.",
            "parameters": {"type": "object", "properties": {
                "reason": {"type": "string", "description": "Суть обращения для человека"}},
                "required": ["reason"]}}},
    },
    "book_slot": {
        "category": "write", "risk": "med", "label": "Записать на время",
        "schema": {"type": "function", "function": {
            "name": "book_slot",
            "description": "Записать клиента на приём/время.",
            "parameters": {"type": "object", "properties": {
                "when": {"type": "string"}, "contact": {"type": "string"}}, "required": ["when", "contact"]}}},
    },
}

# --- Профессия = пресет способностей ---
PROFESSION_PRESETS = {
    "consultant": {"label": "Консультант", "tools": ["search_knowledge", "web_search", "lookup", "calc", "escalate", "save_to_portfolio"]},
    "seller":     {"label": "Продавец",    "tools": ["search_knowledge", "lookup", "web_search", "calc", "create_lead", "remember_client", "make_document", "escalate", "save_to_portfolio"]},
    "manager":    {"label": "Менеджер",    "tools": ["search_knowledge", "lookup", "calc", "create_lead", "remember_client", "make_document", "escalate", "book_slot", "save_to_portfolio"]},
    "support":    {"label": "Поддержка",   "tools": ["search_knowledge", "lookup", "create_lead", "remember_client", "escalate", "save_to_portfolio"]},
}

# Реально исполняемые. book_slot пока заглушка.
_IMPLEMENTED = {"search_knowledge", "lookup", "web_search", "calc", "remember_client", "create_lead", "make_document", "escalate", "save_to_portfolio"}


def build_tools(enabled: list) -> list:
    """OpenAI-схемы только для включённых инструментов."""
    out = []
    for name in (enabled or []):
        t = TOOL_REGISTRY.get(name)
        if t:
            out.append(t["schema"])
    return out


def _search_text(source: Optional[str], query: str, limit: int = 8) -> str:
    """Поиск по строкам базы/каталога (без эмбеддингов — надёжно для Фазы 1)."""
    source = source or ""
    if not source.strip():
        return "База знаний пуста."
    terms = [w for w in (query or "").lower().split() if len(w) > 2]
    lines = [ln.strip() for ln in source.replace("\r", "").split("\n") if ln.strip()]
    if not terms:
        picked = lines[:limit]
    else:
        scored = []
        for ln in lines:
            low = ln.lower()
            s = sum(1 for t in terms if t in low)
            if s:
                scored.append((s, ln))
        scored.sort(key=lambda x: -x[0])
        picked = [ln for _, ln in scored[:limit]] or lines[:limit]
    return ("\n".join(picked))[:1500] if picked else "Ничего не найдено."


async def _kb_search(agent, query: str) -> str:
    """Знания агента: СНАЧАЛА семантика (rag.search по чанкам агента), потом фолбэк keyword по knowledge_text."""
    aid = getattr(agent, "id", None)
    if aid:
        try:
            from app.services import rag
            chunks = await rag.search(aid, query, top_k=5)
            parts = []
            for c in (chunks or []):
                txt = getattr(c, "text", None) or getattr(c, "content", None)
                if not txt and isinstance(c, dict):
                    txt = c.get("text") or c.get("content")
                if txt:
                    parts.append(str(txt).strip())
            if parts:
                return ("\n---\n".join(parts))[:1800]
        except Exception as e:
            print(f"[agent_tools] rag.search skip: {e}")
    return _search_text(getattr(agent, "knowledge_text", "") or "", query)


async def _exec(db, agent, user_id: int, name: str, args: dict) -> str:
    """Исполнение инструмента. db может быть None (read-only инструментам не нужна)."""
    try:
        if name in ("search_knowledge", "lookup"):
            return await _kb_search(agent, args.get("query", ""))
        if name == "web_search":
            from app.services.assistant_agent import _web_search
            return await _web_search(args.get("query", "")) or "По вебу ничего не найдено."
        if name == "calc":
            r = _safe_calc(args.get("expression", ""))
            return f"Результат: {r}" if r is not None else "Не смог посчитать — передай выражение из чисел и + - * / % ( )."
        if name == "remember_client":
            fact = (args.get("fact") or "").strip()
            if not fact:
                return "Что запомнить о клиенте?"
            try:
                from app.services import activity
                await activity.log("client_note", actor="agent", actor_agent_id=getattr(agent, "id", None),
                                   user_id=user_id or None, target_type="client_note", detail=fact)
            except Exception as e:
                print(f"[agent_tools] client_note err: {e}")
            return "Запомнил о клиенте."
        if name == "create_lead":
            nm = (args.get("name") or "").strip()
            contact = (args.get("contact") or "").strip()
            note = (args.get("note") or "").strip()
            if not contact:
                return "Уточните контакт клиента (телефон или email), чтобы оформить заявку."
            try:
                from app.services import activity
                await activity.log("lead", actor="agent", actor_agent_id=getattr(agent, "id", None),
                                   user_id=user_id or None, target_type="lead",
                                   target_name=(contact or nm), result="new",
                                   detail=f"Имя: {nm or '—'}\nКонтакт: {contact}\nЗапрос: {note or '—'}")
            except Exception as e:
                print(f"[agent_tools] lead log err: {e}")
            return "Заявка записана — компания свяжется с клиентом."
        if name == "save_to_portfolio":
            if not user_id:
                return "Не могу сохранить — нет пользователя в контексте."
            title = (args.get("title") or "").strip()
            kind = (args.get("kind") or "doc").strip().lower()
            url = (args.get("url") or "").strip() or None
            text = (args.get("text") or "").strip()
            if kind != "doc" and not url:
                return "Для картинки/видео/файла нужна прямая ссылка (url)."
            try:
                from app.services import digest as _dg
                _r = await _dg.save_deliverable(user_id, title, kind=kind, media_url=url, text=text,
                                                source_agent_id=getattr(agent, "id", None),
                                                source_agent_name=getattr(agent, "name", "Джинн"))
                if _r.get("ok"):
                    try:
                        from app.websocket.manager import manager
                        await manager.broadcast(f"user-{user_id}", {"type": "feed_ping"})
                    except Exception:
                        pass
                    return f"Готово — «{title[:60]}» сохранено пользователю в «Портфель»."
                return "Не удалось сохранить в Портфель."
            except Exception as e:
                print(f"[agent_tools] save_to_portfolio err: {e}")
                return "Не удалось сохранить в Портфель."
        if name == "make_document":
            title = (args.get("title") or "").strip()
            content = (args.get("content") or "").strip()
            kind = (args.get("kind") or "").strip()
            if not content:
                return "Пустой документ — нечего сохранять."
            full_title = (f"{kind}: {title}".strip(": ")) if kind else (title or "Документ")
            if not user_id:
                return "Не могу сохранить документ — нет клиента в контексте."
            try:
                from app.services import digest as _dg
                _cr = await _dg.create_document(user_id, full_title, content, author_name=getattr(agent, "name", "Джинн"))
                if _cr.get("ok"):
                    try:
                        from app.websocket.manager import manager
                        await manager.broadcast(f"user-{user_id}", {"type": "feed_ping"})
                    except Exception:
                        pass
                    return f"Готово — документ «{full_title[:60]}» сохранён клиенту в «Портфель»."
            except Exception as e:
                print(f"[agent_tools] make_document err: {e}")
            return "Не удалось сохранить документ."
        if name == "escalate":
            reason = (args.get("reason") or "").strip()
            try:
                from app.services import activity
                await activity.log("escalation", actor="agent", actor_agent_id=getattr(agent, "id", None),
                                   user_id=user_id or None, target_type="escalation", result="new", detail=reason)
            except Exception as e:
                print(f"[agent_tools] escalate err: {e}")
            return "Передал живому специалисту компании — с клиентом свяжется человек."
        if name == "book_slot":
            return "Запись на время скоро будет доступна — пока оставьте заявку с контактом."
        return "Инструмент в разработке."
    except Exception as e:
        print(f"[agent_tools] exec {name} err: {e}")
        return "Не удалось выполнить инструмент."


_PROMPT_KEYS = ("agent_name", "agent_profession", "agent_description", "system_prompt",
                "manner_style", "manner_temperament", "manner_humor", "manner_emoji_use",
                "knowledge_text", "skills_text", "exclusions_text", "active_mode",
                "mode_rules", "mode_context", "rag_context")

_TOOL_GUIDE = ("\n\n=== ИНСТРУМЕНТЫ ===\n"
               "У тебя есть инструменты. На любой вопрос ПО ДЕЛУ компании (товары, цены, услуги, условия, факты) "
               "СНАЧАЛА вызывай инструмент (search_knowledge / lookup / web_search) — не выдумывай факты и цифры. "
               "Получив данные, ответь клиенту СВОИМИ словами, в своём стиле, коротко и по делу. "
               "Если данных нигде нет — честно скажи об этом. Не описывай сам факт вызова инструмента.")


async def reply_with_tools(db, agent, agent_kwargs: dict, enabled: list, max_iters: int = 4) -> str:
    """Ответ джина через tool-loop. Гейт прав: исполняются только инструменты из enabled."""
    from app.services.llm import _build_agent_prompt, deepseek_tools

    pk = {k: agent_kwargs.get(k) for k in _PROMPT_KEYS if k in agent_kwargs}
    system = _build_agent_prompt(**pk) + _TOOL_GUIDE
    _notes = await _load_client_notes(getattr(agent, "id", None), agent_kwargs.get("user_id") or 0)
    if _notes:
        system += ("\n\nЧТО ТЫ УЖЕ ЗНАЕШЬ ОБ ЭТОМ КЛИЕНТЕ (используй, не переспрашивай зря):\n- "
                   + "\n- ".join(_notes[:6]))
    tools = build_tools(enabled)
    if not tools:
        # инструментов на деле нет — пусть обычный путь отработает
        raise ValueError("no valid tools")

    history = agent_kwargs.get("conversation_history") or []
    user_message = (agent_kwargs.get("user_message") or "")[:2000]
    model = agent_kwargs.get("llm_model")
    user_id = agent_kwargs.get("user_id") or 0

    messages = [{"role": "system", "content": system}]
    for h in history[-10:]:
        if isinstance(h, dict):
            r, c = h.get("role"), h.get("content")
            if r in ("user", "assistant") and c:
                messages.append({"role": r, "content": c})
    messages.append({"role": "user", "content": user_message})

    final = ""
    for _ in range(max_iters):
        res = await deepseek_tools(messages, tools, model=model, temperature=0.5, max_tokens=900)
        calls = res.get("tool_calls") or []
        if not calls:
            final = (res.get("content") or "").strip()
            break
        messages.append({"role": "assistant", "content": res.get("content") or "", "tool_calls": calls})
        for tc in calls:
            fn = tc.get("function", {})
            nm = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except Exception:
                args = {}
            # ГЕЙТ ПРАВ: исполняем только разрешённое
            if nm not in (enabled or []):
                result = "Нет прав на этот инструмент."
            else:
                result = await _exec(db, agent, user_id, nm, args)
            messages.append({"role": "tool", "tool_call_id": tc.get("id") or nm, "content": str(result)[:2000]})

    if not final:
        try:
            res = await deepseek_tools(
                messages + [{"role": "system", "content": "Сформулируй финальный ответ клиенту БЕЗ вызова инструментов."}],
                [], model=model, temperature=0.5, max_tokens=700)
            final = (res.get("content") or "").strip()
        except Exception:
            final = ""
    return final or "Готов помочь — уточните, пожалуйста, вопрос."
