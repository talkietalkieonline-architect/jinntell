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
    "issue_invoice": {
        "category": "write", "risk": "low", "label": "Выставить счёт (QR владельца)",
        "schema": {"type": "function", "function": {
            "name": "issue_invoice",
            "description": "Выставить клиенту СЧЁТ на оплату УСЛУГИ — показать прямые реквизиты/QR ВЛАДЕЛЬЦА (оплата идёт напрямую владельцу, мимо платформы). Вызывай, когда договорились об оплате услуги/работы. amount — сумма в рублях (для динамической оплаты; при фикс-режиме берётся заданная владельцем).",
            "parameters": {"type": "object", "properties": {
                "amount": {"type": "number", "description": "Сумма к оплате в рублях (если не фикс)"},
                "note": {"type": "string", "description": "За что оплата (короткое описание)"}},
                "required": []}}},
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
    "send_presentation": {
        "category": "write", "risk": "low", "label": "Промоутер: презентации",
        "schema": {"type": "function", "function": {
            "name": "send_presentation",
            "description": "Отправить клиенту PDF-презентацию готового решения: кладёт файл в его «Портфель» и даёт ссылку. "
                           "Вызывай, когда клиент просит презентацию/КП/«пришлите почитать», или при продаже — чтобы у клиента "
                           "остался материал. topic — id решения из списка «Готовые решения» (роль промоутера).",
            "parameters": {"type": "object", "properties": {
                "topic": {"type": "string", "description": "id готового решения"}},
                "required": ["topic"]}}},
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
    "queue_register": {
        "schema": {"type": "function", "function": {
            "name": "queue_register",
            "description": "Записать авто в очередь на заправку на этой АЗС и выдать уникальный талон с QR в чат. "
                           "Нужны имя водителя, гос-номер, вид топлива и литры. Вызывай, когда пользователь согласился записаться.",
            "parameters": {"type": "object", "properties": {
                "client_name": {"type": "string", "description": "имя водителя"},
                "preferred_time": {"type": "string", "description": "желаемое время ЧЧ:ММ, если клиент назвал (необязательно)"},
                "car_plate": {"type": "string"}, "fuel_type": {"type": "string"}, "liters": {"type": "number"}},
                "required": ["client_name", "car_plate", "fuel_type", "liters"]}}},
    },
    # Станция АЗС: живые остатки и расчёт брони (services/fuel_station.py)
    "fuel_status": {
        "category": "read", "risk": "low", "label": "АЗС: остатки и свободный объём под запись",
        "schema": {"type": "function", "function": {
            "name": "fuel_status",
            "description": "Свежие данные станции по каждому виду топлива: можно ли записаться и на сколько литров "
                           "(с учётом уже записанных и запаса под живую очередь). Оператору — полные цифры остатков.",
            "parameters": {"type": "object", "properties": {}}}},
    },
    "station_order": {
        "category": "write", "risk": "low", "label": "АЗС: предзаказ к приезду (топливо + еда + услуги)",
        "schema": {"type": "function", "function": {
            "name": "station_order",
            "description": "ЗАКАЗ К ВРЕМЕНИ / ПРЕДЗАКАЗ К ПРИЕЗДУ одним заказом из меню и прайса (на АЗС — ещё топливо): "
                           "персонал подготовится заранее. Нужны имя и время; на АЗС — ещё гос-номер.",
            "parameters": {"type": "object", "properties": {
                "client_name": {"type": "string"},
                "car_plate": {"type": "string"},
                "arrive_time": {"type": "string", "description": "время приезда ЧЧ:ММ"},
                "fuel_type": {"type": "string", "description": "топливо, если нужно заправиться (АИ-92/95/98, ДТ, Газ)"},
                "liters": {"type": "number"},
                "items": {"type": "array", "description": "позиции из меню и прайса услуг", "items": {"type": "object", "properties": {
                    "name": {"type": "string"}, "qty": {"type": "integer"}}, "required": ["name"]}}},
                "required": ["client_name"]}}},
    },
    "update_fuel_stock": {
        "category": "write", "risk": "med", "label": "АЗС: обновить остаток (только оператор)",
        "schema": {"type": "function", "function": {
            "name": "update_fuel_stock",
            "description": "Сохранить остаток топлива, который назвал ОПЕРАТОР станции (по одному вызову на каждый вид). "
                           "Работает только для оператора этой АЗС.",
            "parameters": {"type": "object", "properties": {
                "fuel_type": {"type": "string", "description": "АИ-92 / АИ-95 / АИ-98 / ДТ / Газ"},
                "liters": {"type": "number", "description": "остаток в литрах"}},
                "required": ["fuel_type", "liters"]}}},
    },
    # Инструмент Архитектора-фабрики: создать нового джина по ТЗ (генерация персоны + рождение).
    # Гейт прав: включается ТОЛЬКО тем, кому можно рождать джинов (Архитектор #47). Риск — med.
    "draft_jinn": {
        "category": "write", "risk": "med", "label": "Создать нового джина (фабрика)",
        "schema": {"type": "function", "function": {
            "name": "draft_jinn",
            "description": "СОЗДАТЬ нового джина-специалиста по краткому ТЗ: ты придумываешь его персону, "
                           "система создаёт его и проводит через рождение (прописка в Городе + самотест, что он "
                           "находится и реально отвечает). Вызывай, когда тебя просят создать / сделать / нанять джина. "
                           "В brief опиши кто нужен: роль, тематика, город, стиль, особенности. "
                           "visibility: public — виден жителям Города; hidden — внутренний (команда), не виден в Городе.",
            "parameters": {"type": "object", "properties": {
                "brief": {"type": "string", "description": "ТЗ: роль, темы, город, стиль, особенности нужного джина"},
                "visibility": {"type": "string", "enum": ["public", "hidden"], "description": "public (в Городе) | hidden (внутренний)"},
                "is_paid": {"type": "boolean", "description": "Платный ли джин (по умолчанию нет)"},
                "agent_type": {"type": "string", "description": "specialist (по умолчанию) | business | core"}},
                "required": ["brief"]}}},
    },
    # Шкафчик Архитектора: склад готовых джинов-профессий с GitHub (template_cabinet.py)
    "list_templates": {
        "category": "read", "risk": "low", "label": "Шкафчик: найти готовую заготовку",
        "schema": {"type": "function", "function": {
            "name": "list_templates",
            "description": "Найти в ШКАФЧИКЕ готовые заготовки джинов-профессий (проверенные агенты с GitHub: продажи, маркетинг, "
                           "HR, юристы, финансы, поддержка, разработка и т.д.). Вызывай ПЕРЕД созданием джина под профессию — "
                           "лучше взять готовую заготовку, чем придумывать с нуля. query — профессия/задача по-русски или по-английски.",
            "parameters": {"type": "object", "properties": {
                "query": {"type": "string", "description": "профессия или задача, напр. «юрист договоры», «HR адаптация», «sales»"},
                "limit": {"type": "integer", "description": "сколько показать (до 10)"}},
                "required": ["query"]}}},
    },
    "adopt_template": {
        "category": "write", "risk": "med", "label": "Шкафчик: создать джина из заготовки",
        "schema": {"type": "function", "function": {
            "name": "adopt_template",
            "description": "СОЗДАТЬ джина из заготовки шкафчика (id из list_templates): готовая экспертиза переводится в нашу "
                           "русскую персону, джин проходит рождение (прописка в Городе + самотест). В brief — уточнения под задачу: "
                           "для кого, город, стиль, имя, отрасль клиента.",
            "parameters": {"type": "object", "properties": {
                "template_id": {"type": "integer"},
                "brief": {"type": "string", "description": "уточнения: для кого, отрасль, имя, стиль"},
                "visibility": {"type": "string", "enum": ["public", "hidden"], "description": "public (в Городе) | hidden (внутренний)"},
                "is_paid": {"type": "boolean"},
                "agent_type": {"type": "string", "description": "specialist (по умолчанию) | business | core"}},
                "required": ["template_id"]}}},
    },
}

# --- Профессия = пресет способностей ---
PROFESSION_PRESETS = {
    "consultant": {"label": "Консультант", "tools": ["search_knowledge", "web_search", "lookup", "calc", "escalate", "save_to_portfolio", "send_presentation"]},
    "seller":     {"label": "Продавец",    "tools": ["search_knowledge", "lookup", "web_search", "calc", "create_lead", "remember_client", "make_document", "escalate", "save_to_portfolio", "issue_invoice", "send_presentation"]},
    "manager":    {"label": "Менеджер",    "tools": ["search_knowledge", "lookup", "calc", "create_lead", "remember_client", "make_document", "escalate", "book_slot", "save_to_portfolio", "issue_invoice", "send_presentation"]},
    "support":    {"label": "Поддержка",   "tools": ["search_knowledge", "lookup", "create_lead", "remember_client", "escalate", "save_to_portfolio"]},
}

# Реально исполняемые. book_slot пока заглушка.
_IMPLEMENTED = {"search_knowledge", "lookup", "web_search", "calc", "remember_client", "create_lead", "make_document", "escalate", "save_to_portfolio", "issue_invoice", "queue_register", "fuel_status", "update_fuel_stock", "station_order", "draft_jinn", "list_templates", "adopt_template", "send_presentation"}


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
            if getattr(agent, "department", None) == "sales" and not getattr(agent, "contractor_id", None):
                try:  # джин отдела продаж JinnTell (Марк) → новая заявка в CRM
                    from app.core.database import async_session as _as
                    from app.models.crm import CrmCompany, CrmEvent
                    from app.models.user import User as _User
                    async with _as() as _s:
                        _u = await _s.get(_User, user_id) if user_id else None
                        is_mail = "@" in contact
                        co = CrmCompany(name=(nm or contact)[:200], email=contact.lower() if is_mail else None,
                                        phone=None if is_mail else contact[:40], contact_name=nm or None,
                                        city=getattr(_u, "city", None), notes=note or None, stage="new",
                                        source=(f"Джин {agent.name}" + (f" · {_u.src}" if _u is not None and getattr(_u, "src", None) else ""))[:120], is_new=True)
                        _s.add(co)
                        await _s.flush()
                        _s.add(CrmEvent(company_id=co.id, kind="lead", author_name=agent.name[:120],
                                        text=f"Заявка из разговора с джином. Имя: {nm or '—'}. Контакт: {contact}. Запрос: {note or '—'}"))
                        await _s.commit()
                except Exception as e:
                    print(f"[agent_tools] crm lead err: {e}")
            return "Заявка записана — компания свяжется с клиентом."
        if name == "queue_register":
            return await _queue_register_exec(agent, user_id, args.get("car_plate"), args.get("fuel_type"), args.get("liters"),
                                              args.get("client_name"), args.get("preferred_time"))
        if name == "station_order":
            return await _station_order_exec(agent, user_id, args)
        if name == "fuel_status":
            return await _fuel_status_exec(agent, user_id)
        if name == "update_fuel_stock":
            return await _update_fuel_stock_exec(agent, user_id, args.get("fuel_type"), args.get("liters"))
        if name == "draft_jinn":
            return await _draft_jinn_exec(agent, args)
        if name == "list_templates":
            return await _list_templates_exec(args)
        if name == "adopt_template":
            return await _draft_jinn_exec(agent, args, template_id=args.get("template_id"))
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
        if name == "issue_invoice":
            if not getattr(agent, "pay_enabled", False):
                return "У этого джина не настроена прямая оплата — уточни у владельца."
            mode = getattr(agent, "pay_mode", "dynamic") or "dynamic"
            if mode == "fixed":
                amt = int(getattr(agent, "pay_amount", 0) or 0)
            else:
                try:
                    amt = int(float(args.get("amount") or 0))
                except Exception:
                    amt = 0
            req = (getattr(agent, "pay_requisites", "") or "").strip()
            qr = (getattr(agent, "pay_qr_url", "") or "").strip()
            note = (args.get("note") or "").strip()
            parts = ["💳 Счёт на оплату" + (f" ({note})" if note else "") + ":"]
            if amt > 0:
                parts.append(f"Сумма: {amt} ₽.")
            elif mode == "dynamic":
                return "Уточни сумму к оплате (amount), чтобы выставить счёт."
            if req:
                parts.append(f"Реквизиты: {req}.")
            if qr:
                parts.append(f"QR для оплаты: {qr}")
            parts.append("Оплата идёт напрямую владельцу; после оплаты сообщи.")
            return " ".join(parts)
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
        if name == "send_presentation":
            from app.services import presentations as _pr
            it, items = _pr.find(agent, args.get("topic", ""))
            if not it:
                if not items:
                    return "Готовых решений для презентации пока нет — расскажи своими словами и предложи заявку."
                return "Такой презентации нет. Есть: " + ", ".join(f"{x['id']} ({x['title']})" for x in items)
            import asyncio as _aio
            url = await _aio.to_thread(_pr.item_pdf_url, agent, it)
            title = it["title"]
            if user_id:
                try:
                    from app.services import digest as _dg
                    await _dg.save_deliverable(user_id, f"Презентация: {title}", kind="file", media_url=url,
                                               text=it.get("subtitle") or "",
                                               source_agent_id=getattr(agent, "id", None),
                                               source_agent_name=getattr(agent, "name", "") or "")
                    from app.websocket.manager import manager
                    await manager.broadcast(f"user-{user_id}", {"type": "feed_ping"})
                except Exception as e:
                    print(f"[agent_tools] presentation save err: {e}")
                return f"PDF «{title}» сохранён клиенту в «Портфель». Ссылка: {url}"
            return f"PDF «{title}»: {url}"
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
    try:  # отраслевая заготовка: подключённые доп. операции (кофе, услуги, страховка)
        from app.services import industry_presets as _ip
        system += _ip.context_note(agent)
    except Exception as _e:  # noqa: BLE001
        print(f"[industry] context err: {_e}")
    if getattr(agent, "queue_enabled", False):
        try:  # джин АЗС: кто собеседник (оператор/клиент) + живые остатки
            from app.core.database import async_session as _as
            from app.services import fuel_station as _fs
            async with _as() as _s:
                system += await _fs.context_note(_s, agent, agent_kwargs.get("user_id") or 0)
        except Exception as _e:  # noqa: BLE001
            print(f"[fuel_station] context err: {_e}")
    _notes = await _load_client_notes(getattr(agent, "id", None), agent_kwargs.get("user_id") or 0)
    if _notes:
        system += ("\n\nЧТО ТЫ УЖЕ ЗНАЕШЬ ОБ ЭТОМ КЛИЕНТЕ (используй, не переспрашивай зря):\n- "
                   + "\n- ".join(_notes[:6]))
    if "send_presentation" in (enabled or []):
        try:  # связанная роль «промоутер»: тот же джин сам представляет готовые решения
            from app.services import presentations as _pr
            system += _pr.role_note(agent)
        except Exception as _e:  # noqa: BLE001
            print(f"[agent_tools] promoter role skip: {_e}")
    try:  # город собеседника — джин говорит про местные точки и пилоты
        _uid = agent_kwargs.get("user_id") or 0
        if _uid:
            from app.core.database import async_session as _as
            from app.models.user import User as _User
            async with _as() as _s:
                _u = await _s.get(_User, _uid)
            if _u and getattr(_u, "city", None):
                system += f"\n\nСобеседник из города: {_u.city}."
    except Exception as _e:  # noqa: BLE001
        print(f"[agent_tools] user city skip: {_e}")
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


# --- Очередь на заправку (инструмент queue_register) ---
async def _fuel_status_exec(agent, user_id) -> str:
    from app.core.database import async_session as _as
    from app.services import fuel_station as _fs
    async with _as() as s:
        op = await _fs.is_operator(s, agent.id, user_id)
        av = await _fs.availability(s, agent)
    return _fs.format_for_jinn(av, op)


async def _guest_tip(user_id) -> str:
    """Гостю: мотивация зарегистрироваться — запись и напоминания помощника останутся за ним."""
    if not user_id:
        return ""
    try:
        from app.core.database import async_session as _as
        from app.models.user import User as _U
        async with _as() as s:
            u = await s.get(_U, user_id)
        if u and getattr(u, "is_guest", False):
            return (" Совет: зарегистрируйтесь в JinnTell — запись сохранится за вами, появится в «Моём дне», "
                    "а ваш личный помощник сам скажет, когда пора выезжать (держите JinnTell открытым).")
    except Exception:  # noqa: BLE001
        pass
    return ""


async def _station_order_exec(agent, user_id, args: dict) -> str:
    """Заказ к приезду из меню/прайса станции; если есть активный талон очереди — к его времени."""
    import re as _re
    import secrets as _secrets
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    from sqlalchemy import select as _select
    from app.core.database import async_session as _as
    from app.models.fuel_queue import StationOrder as _SO, FuelQueueEntry as _FQ
    from app.services import industry_presets as _ip, fuel_station as _fs
    mods = _ip.get_modules(agent)
    cat = _ip.get_catalog(agent)
    menu = (cat.get("cafe") or [] if "cafe" in mods else []) + (cat.get("services") or [] if "services" in mods else [])
    name = (args.get("client_name") or "").strip()[:80]
    if not name:
        return "Как вас зовут? Имя будет в заказе."
    is_azs = getattr(agent, "industry", None) == "azs"
    plate = _re.sub(r"[^A-ZА-Я0-9]", "", (args.get("car_plate") or "").upper())
    if is_azs and len(plate) < 4:
        return "Назовите гос-номер машины — команда станции узнает вас по нему."
    fuel, lit = "", 0
    if args.get("fuel_type") and "queue" not in mods:
        fuel = _fs.norm_fuel(args.get("fuel_type"))
        try:
            lit = max(0, min(int(float(args.get("liters") or 0)), 1000))
        except (TypeError, ValueError):
            lit = 0
    picked, missing = [], []
    for it in (args.get("items") or [])[:10]:
        q = (it.get("name") or "").strip().lower()
        qty = max(1, min(int(it.get("qty") or 1), 10))
        hit = next((m for m in menu if q and (q in m["name"].lower() or m["name"].lower() in q)), None)
        if not hit:
            words = [w for w in _re.split(r"\W+", q) if len(w) >= 4]
            hit = next((m for m in menu if any(w[:5] in m["name"].lower() for w in words)), None)
        (picked.append({"name": hit["name"], "qty": qty, "price": int(hit.get("price") or 0)}) if hit else missing.append(it.get("name")))
    if not picked and not fuel:
        return ("Что подготовить к приезду? " + ("Есть: " + ", ".join(m["name"] for m in menu) + "." if menu else "Назовите топливо и литры."))
    total = sum(p["qty"] * p["price"] for p in picked)
    async with _as() as s:
        ready, qcode = None, None
        if user_id:  # есть талон очереди → к его времени
            t = (await s.execute(_select(_FQ).where(_FQ.agent_id == agent.id, _FQ.user_id == user_id,
                                                      _FQ.status.in_(("waiting", "arrived"))).order_by(_FQ.id.desc()))).scalars().first()
            if t:
                ready, qcode = t.slot_at, t.code
                plate = plate or t.car_plate
        if not ready:
            ready = _fs.parse_time(args.get("arrive_time") or args.get("ready_time") or "") or (_dt.now(_tz.utc) + _td(minutes=15))
        code = "Z-" + _secrets.token_hex(5).upper()
        o = _SO(agent_id=agent.id, user_id=user_id or None, kind="visit", fuel_type=fuel, liters=lit, items_json=__import__("json").dumps(picked, ensure_ascii=False),
                total=total, client_name=name, car_plate=plate, code=code, ready_at=ready, queue_code=qcode)
        s.add(o); await s.commit()
    what = ", ".join(([f"{fuel} {lit} л" if lit else fuel] if fuel else [])
                     + [f"{p['name']}" + (f" ×{p['qty']}" if p["qty"] > 1 else "") for p in picked])
    t = _fs.hhmm(ready)
    pay = cat.get("pay") or {}
    sbp = (pay.get("sbp_link") or "") if ((not is_azs) and "pay_qr" in mods and total > 0) else ""
    num = code[-4:]  # короткий номер талона — его называют бариста
    if is_azs:
        cap = (f"Предзаказ принят · {name} · {plate} · к {t}: {what}. "
               f"{('Еда и услуги — ' + str(total) + ' ₽, ') if total else ''}оплата на кассе. Станция ждёт вас — просто назовите имя или номер машины.")
    else:
        cap = (f"🎫 Заказ № {num}\n{what}\nК {t} · на имя {name} · итого {total} ₽\n"
               + ("Приходите и назовите номер или имя — заказ будет готов."
                  + (f"\nОплатить {total} ₽ через СБП → {sbp}" if sbp else "\nОплата на месте.")))
    try:
        if user_id:
            from app.models.message import Message as _Msg
            from app.websocket.manager import manager as _mgr
            room = f"agent-{agent.id}-u{user_id}"
            qr = None  # гость платит с того же телефона — QR не нужен; кнопка СБП в тексте талона
            async with _as() as s2:
                m = _Msg(room=room, sender_type="agent", sender_agent_id=agent.id, sender_name=getattr(agent, "name", "Джинн"),
                         text=cap, media_url=qr, media_type=("image" if qr else None))
                s2.add(m); await s2.commit(); await s2.refresh(m)
            await _mgr.broadcast(room, {"type": "message", "id": m.id, "room": room, "sender_type": "agent",
                                        "sender_agent_id": agent.id, "sender_name": getattr(agent, "name", "Джинн"), "text": cap,
                                        "media_url": qr, "media_type": ("image" if qr else None),
                                        "created_at": m.created_at.isoformat(),
                                        "agent_color": getattr(agent, "color", None)})
    except Exception as _ex:  # noqa: BLE001
        print(f"[station_order] media err: {_ex}")
    miss = (" Не нашёл в меню/прайсе: " + ", ".join(map(str, missing)) + ".") if missing else ""
    await _fs.day_add(user_id, ready, f"☕ {'Предзаказ' if is_azs else 'Заказ'}: {getattr(agent, 'name', 'АЗС')} — {what}"[:300],
                      f"Заказ № {num} (код {code}){(', ' + plate) if plate else ''}. К {t}" + (", оплата через СБП." if sbp else ", оплата на месте."))
    if not qcode:
        miss += (" Ваш помощник напомнит за 15 минут, что пора выезжать." if is_azs else " Ваш помощник напомнит за 15 минут.") + (await _guest_tip(user_id))
    return f"Готово: {cap}{' Будет готово к вашему времени в очереди.' if qcode else ''}{miss}"


async def _update_fuel_stock_exec(agent, user_id, fuel, liters) -> str:
    from app.core.database import async_session as _as
    from app.models.agent import Agent as _Agent
    from app.services import fuel_station as _fs
    try:
        lit = float(liters)
    except Exception:  # noqa: BLE001
        return "Назовите остаток в литрах."
    async with _as() as s:
        if not await _fs.is_operator(s, agent.id, user_id):
            return "Нет прав: остатки может сообщать только оператор этой АЗС."
        a = await s.get(_Agent, agent.id)
        _fs.set_stock(a, fuel or "", lit, user_id)
        await s.commit()
        av = await _fs.availability(s, a)
    k = _fs.norm_fuel(fuel or "")
    f = av["fuels"].get(k) or {}
    return (f"Сохранено: {k} — {int(lit)} л. Сейчас забронировано {f.get('reserved', 0)} л, "
            f"запас под живую очередь {f.get('buffer')} л, можно ещё забронировать {f.get('bookable')} л.")


async def _queue_register_exec(agent, user_id, plate, fuel, liters, client_name=None, preferred_time=None) -> str:
    import re as _re
    import secrets as _secrets
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    from sqlalchemy import select as _select, func as _safunc
    from app.core.database import async_session as _async_session
    from app.models.fuel_queue import FuelQueueEntry as _FQ

    plate_raw = (plate or "").strip().upper()
    plate_norm = _re.sub(r"[^A-ZА-Я0-9]", "", plate_raw)
    if len(plate_norm) < 4:
        return "Назовите, пожалуйста, гос-номер автомобиля (например, А123ВС177)."
    name = (client_name or "").strip()[:80]
    if not name:
        return "Как вас зовут? Имя будет в талоне."
    fuel = (fuel or "").strip()
    if not fuel:
        return "Какое топливо вам нужно? (например, АИ-95)"
    from app.services import fuel_station as _fs
    fuel = _fs.norm_fuel(fuel)
    try:
        lit = float(liters)
    except Exception:
        lit = 0
    if lit <= 0:
        return "Сколько литров заправить?"
    limit = int(getattr(agent, "queue_limit_liters", 30) or 30)
    if lit > limit:
        return f"На этой АЗС лимит {limit} л за раз. Укажите объём до {limit} л."
    try:
        async with _async_session() as s:
            # бронь против живого остатка (оператор) с запасом под живую очередь
            av = await _fs.availability(s, agent)
            f = av["fuels"].get(fuel)
            if f and f.get("bookable") is not None and lit > f["bookable"]:
                if f["bookable"] <= 0:
                    return (f"Сейчас записаться на {fuel} нельзя: свободный объём под запись закончился, "
                            "топливо уходит живой очереди у колонок. Можно встать в обычную очередь или выбрать другое топливо.")
                return f"Под запись по {fuel} сейчас доступно до {int(f['bookable'])} л. Записать вас на {int(f['bookable'])} л?"
            since = _dt.now(_tz.utc) - _td(hours=2)
            dup = (await s.execute(_select(_FQ).where(
                _FQ.car_plate == plate_norm,
                _FQ.created_at >= since,
                _FQ.status.in_(("waiting", "arrived"))))).scalars().first()
            if dup:
                return f"Номер {plate_raw} уже в очереди (код {dup.code}). Повторная запись — не раньше чем через 2 часа."
            waiting = (await s.execute(_select(_safunc.count(_FQ.id)).where(
                _FQ.agent_id == agent.id, _FQ.status.in_(("waiting", "arrived"))))).scalar() or 0
            number = int(waiting) + 1
            slot = await _fs.next_slot(s, agent, _fs.parse_time(preferred_time or ""))
            code = "Q-" + _secrets.token_hex(5).upper()  # 10 знаков — не подобрать; подтверждение всё равно = список станции
            e = _FQ(agent_id=agent.id, user_id=user_id or None, car_plate=plate_norm, client_name=name, slot_at=slot,
                    fuel_type=fuel, liters=lit, number=number, code=code, status="waiting")
            s.add(e)
            await s.commit()
    except Exception as ex:
        print(f"[queue_register] err: {ex}")
        return "Не удалось записать в очередь, попробуйте ещё раз."
    qr_url = f"https://jinntell.ru/api/queue/{code}/qr.svg"
    t = _fs.hhmm(slot)
    cap = (f"Талон в очередь №{number} · {name} · {plate_norm} · {fuel} {lit:g} л · заправка в {t} · код {code}. "
           f"Подъезжайте к {t} и покажите QR оператору — при опоздании талон сгорает.")
    try:
        if user_id:
            from app.models.message import Message as _Msg
            from app.websocket.manager import manager as _mgr
            room = f"agent-{agent.id}-u{user_id}"
            async with _async_session() as s2:
                m = _Msg(room=room, sender_type="agent", sender_agent_id=agent.id,
                         sender_name=getattr(agent, "name", "Джинн"), text=cap,
                         media_url=qr_url, media_type="image")
                s2.add(m); await s2.commit(); await s2.refresh(m)
                _mid = m.id; _created = m.created_at.isoformat()
            await _mgr.broadcast(room, {"type": "message", "id": _mid, "room": room,
                "sender_type": "agent", "sender_agent_id": agent.id,
                "sender_name": getattr(agent, "name", "Джинн"), "text": cap,
                "media_url": qr_url, "media_type": "image",
                "created_at": _created, "agent_color": getattr(agent, "color", None)})
    except Exception as _ex:
        print(f"[queue_register] media send err: {_ex}")
    await _fs.day_add(user_id, slot, f"⛽ Заправка: {getattr(agent, 'name', 'АЗС')} — {fuel} {lit:g} л",
                      f"Талон {code}, №{number}, {plate_norm}. Подъехать к {t} — при опоздании талон сгорает.")
    guest_tip = await _guest_tip(user_id)
    return (f"Записал в очередь! {name}, номер {number}, {plate_norm}, {fuel} {lit:g} л. Время заправки — {t}. "
            f"Талон с QR (код {code}) — в чате; к {t} нужно подъехать и показать его оператору, иначе талон сгорает. "
            f"Талон также открывается по ссылке jinntell.ru/q/{code}. Ваш помощник напомнит за 30, 10 и 5 минут.{guest_tip}")


# --- Архитектор-фабрика (инструмент draft_jinn): создать нового джина по ТЗ ---
async def _list_templates_exec(args: dict) -> str:
    q = (args.get("query") or "").strip()
    try:
        lim = max(1, min(int(args.get("limit") or 6), 10))
    except Exception:  # noqa: BLE001
        lim = 6
    try:
        from app.core.database import async_session as _async_session
        from app.services import template_cabinet as _cab
        async with _async_session() as s:
            res = await _cab.search(s, q, limit=lim)
            if not res["items"] and " " in q:  # широкий запрос — пробуем по первому слову
                res = await _cab.search(s, q.split()[0], limit=lim)
    except Exception as e:  # noqa: BLE001
        print(f"[agent_tools] list_templates err: {e}")
        return "Шкафчик сейчас недоступен."
    if not res["items"]:
        return f"В шкафчике нет заготовок по запросу «{q}». Можно создать джина с нуля (draft_jinn)."
    lines = [f"Шкафчик: найдено {res['total']}, показываю {len(res['items'])}:"]
    for it in res["items"]:
        warn = " ⚠ требует ручной проверки" if it["safety"] == "flagged" else ""
        lines.append(f"- id {it['id']}: {it['name_ru'] or it['name']} ({it['name']}, раздел {it['division']}) — "
                     f"{(it['summary_ru'] or it['description'])[:220]}{warn}")
    return "\n".join(lines)


async def _draft_jinn_exec(agent, args: dict, template_id=None) -> str:
    brief = (args.get("brief") or "").strip()
    if not brief and not template_id:
        return "Опиши в brief, какого джина создать: роль, темы, город, стиль."
    vis = (args.get("visibility") or "public").strip().lower()
    if vis not in ("public", "hidden"):
        vis = "public"
    atype = (args.get("agent_type") or "specialist").strip().lower()
    if atype not in ("specialist", "business", "core", "citizen", "personal"):
        atype = "specialist"
    try:
        from app.core.database import async_session as _async_session
        from app.services import jinn_factory as _factory
        async with _async_session() as s:
            if template_id:
                from app.services import template_cabinet as _cab
                rep = await _cab.adopt(s, int(template_id), brief, is_paid=bool(args.get("is_paid")),
                                       visibility=vis, agent_type=atype)
            else:
                rep = await _factory.draft(s, brief, is_paid=bool(args.get("is_paid")),
                                           visibility=vis, agent_type=atype)
            await s.commit()
    except Exception as e:  # noqa: BLE001
        print(f"[agent_tools] draft_jinn err: {e}")
        return "Не удалось создать джина — попробуй переформулировать ТЗ."
    if not rep.get("ok"):
        return f"Не получилось создать джина: {rep.get('error') or 'ошибка генерации персоны'}."
    b = rep.get("birth") or {}
    v = (b.get("steps") or {}).get("verify") or {}
    checks = []
    if v.get("discoverable") is True:
        checks.append("найден в Городе")
    if v.get("responds") is True:
        checks.append("отвечает")
    tail = (" Самотест: " + ", ".join(checks) + ".") if checks else ""
    vis_ru = "в Городе" if vis == "public" else "внутренний (скрыт)"
    return (f"Готово — создан джин #{rep.get('agent_id')}: {rep.get('name')} "
            f"({rep.get('profession')}). Ссылка: /a/{rep.get('slug')}. Видимость: {vis_ru}.{tail}"
            + (f" Основа — заготовка шкафчика «{(rep['template'].get('name_ru') or rep['template'].get('name'))}»." if rep.get("template") else ""))
