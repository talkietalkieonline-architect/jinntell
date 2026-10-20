"""
Отраслевые заготовки джинов (аренда) + МОДУЛИ (доп. операции).

Заготовка = базовый набор инструментов + промпт-правила; её назначает АДМИН при оформлении аренды.
Модуль = набор инструментов + флаги + настройки + подсказка джину; модули своей заготовки ВКЛЮЧАЕТ САМ БИЗНЕС
в ЛК (там же меню/прайс, лимиты очереди и операторы). Через «Функции» ЛК модульные инструменты не меняются
(см. merge_contractor_tools) — только через модули.

Первая заготовка — «Джин АЗС»: очередь на заправку, кофе к приезду, услуги на АЗС, продление страховки.
"""
from __future__ import annotations

import json
from typing import Optional

# Инструменты, которые бизнес включает сам в ЛК «Функции» (всё прочее — только админ: модули, фабрика и т.п.)
SELF_SERVICE_TOOLS = {"search_knowledge", "lookup", "web_search", "calc", "create_lead", "remember_client",
                      "make_document", "escalate", "book_slot", "save_to_portfolio", "issue_invoice"}

INDUSTRIES: dict = {
    "azs": {
        "label": "Джин АЗС",
        "desc": "Консультант заправки: приветствие, адрес и часы, топливо и цены, акции, ответы по базе станции "
                "и ПРЕДЗАКАЗ К ПРИЕЗДУ на всё сразу — топливо, еда, услуги: команда АЗС готовится к клиенту заранее.",
        "base_tools": ["search_knowledge", "station_order"],
        "modules": {
            "queue": {
                "label": "Очередь при дефиците топлива",
                "desc": "Режим для стран/периодов с нехваткой топлива. Запись голосом с назначенным временем, уникальный QR-талон в чат (без регистрации), сгорание "
                        "при опоздании, оператор по телефону (скан QR, сверка со списком, «Подъехал»/«Заправлен»), "
                        "остатки от оператора и бронь с запасом под живую очередь.",
                "tools": ["queue_register", "fuel_status", "update_fuel_stock"],
                "flags": {"queue_enabled": True},
                "operator": True,
                "default": False,   # нужна не всем станциям — бизнес включает сам
            },
            "cafe": {
                "label": "Кафе: еда и напитки в предзаказ",
                "desc": "Меню станции (кофе, выпечка, горячее) — джинн добавляет в предзаказ к приезду. Оплата на кассе.",
                "tools": [],
                "catalog": "cafe",
                "operator": True,
                "default": True,
            },
            "services": {
                "label": "Услуги АЗС в предзаказ",
                "desc": "Всё, что есть на станции: проверка давления, мойка стёкол и фар, омывайка, душ, массажное кресло, "
                        "комната отдыха и др. — по прайсу станции, готовят к приезду.",
                "tools": [],
                "catalog": "services",
                "operator": True,
                "default": True,
            },
            "insurance": {
                "label": "Продление страховки",
                "desc": "ОСАГО/КАСКО: джинн собирает имя, телефон, авто и срок полиса → заявка во вкладке «Заявки» "
                        "(оформляет партнёр сети).",
                "tools": ["create_lead"],
                "default": True,
            },
        },
        "default_catalog": {
            "cafe": [{"name": "Американо 0,3", "price": 150}, {"name": "Капучино 0,3", "price": 190},
                     {"name": "Латте 0,4", "price": 220}, {"name": "Круассан", "price": 120},
                     {"name": "Хот-дог", "price": 210}],
            "services": [{"name": "Проверка давления в шинах", "price": 0}, {"name": "Подкачка шин", "price": 100},
                         {"name": "Мойка стёкол и фар", "price": 150}, {"name": "Долив омывайки (5 л)", "price": 350},
                         {"name": "Душ", "price": 300}, {"name": "Массажное кресло (15 мин)", "price": 200},
                         {"name": "Комната отдыха (номер)", "price": 1500}],
        },
    },
}


def _jl(raw, default):
    try:
        v = json.loads(raw) if raw else default
        return v if isinstance(v, type(default)) else default
    except Exception:  # noqa: BLE001
        return default


def get_modules(agent) -> list:
    return _jl(getattr(agent, "modules_json", None), [])


def get_catalog(agent) -> dict:
    return _jl(getattr(agent, "station_catalog_json", None), {})


def module_tools(industry: Optional[str], modules: list) -> set:
    ind = INDUSTRIES.get(industry or "")
    if not ind:
        return set()
    out: set = set()
    for m in modules:
        out |= set((ind["modules"].get(m) or {}).get("tools", []))
    return out


def all_module_tools() -> set:
    out: set = set()
    for ind in INDUSTRIES.values():
        for m in ind["modules"].values():
            out |= set(m.get("tools", []))
    return out


def apply(agent, industry: Optional[str], modules: list, catalog: Optional[dict] = None) -> dict:
    """Назначить джину заготовку и модули (админ). Инструменты: свои (self-service) + база + модули."""
    ind = INDUSTRIES.get(industry or "")
    current = set(_jl(getattr(agent, "tools_json", None), []))
    keep = {t for t in current if t in SELF_SERVICE_TOOLS} - all_module_tools()
    if not ind:
        agent.industry = None
        agent.modules_json = "[]"
        agent.queue_enabled = False
        agent.tools_json = json.dumps(sorted(keep))
        return {"industry": None, "modules": [], "tools": sorted(keep)}
    modules = [m for m in modules if m in ind["modules"]]
    tools = keep | set(ind["base_tools"]) | module_tools(industry, modules)
    agent.industry = industry
    agent.modules_json = json.dumps(modules)
    agent.tools_json = json.dumps(sorted(tools))
    # флаги модулей: включены только если модуль подключён
    flags_all = {k for m in ind["modules"].values() for k in (m.get("flags") or {})}
    for k in flags_all:
        setattr(agent, k, any((ind["modules"][m].get("flags") or {}).get(k) for m in modules))
    cat = get_catalog(agent)
    if catalog is not None:
        cat = catalog
    for m in modules:  # каталог по умолчанию для нового модуля
        key = ind["modules"][m].get("catalog")
        if key and not cat.get(key):
            cat[key] = list(ind.get("default_catalog", {}).get(key, []))
    agent.station_catalog_json = json.dumps(cat, ensure_ascii=False)
    return {"industry": industry, "modules": modules, "tools": sorted(tools), "catalog": cat}


def merge_contractor_tools(agent, requested: list) -> list:
    """Бизнес меняет «Функции» в ЛК: принимаем только self-service инструменты, модульные — сохраняем как есть."""
    req = {t for t in (requested or []) if isinstance(t, str) and t in SELF_SERVICE_TOOLS}
    current = set(_jl(getattr(agent, "tools_json", None), []))
    locked = {t for t in current if t not in SELF_SERVICE_TOOLS}  # спец-инструменты от админа
    ind = getattr(agent, "industry", None)
    if ind in INDUSTRIES:  # база заготовки и включённые модули — закреплены
        locked |= set(INDUSTRIES[ind]["base_tools"]) | module_tools(ind, get_modules(agent))
    return sorted(req | locked)


def _fmt_items(items: list) -> str:
    return "; ".join(f"{i.get('name')} — {('бесплатно' if not i.get('price') else str(i.get('price')) + ' ₽')}" for i in items)


def context_note(agent) -> str:
    """Подсказка джину: какие доп. операции подключены (кроме очереди — её даёт fuel_station.context_note)."""
    ind = INDUSTRIES.get(getattr(agent, "industry", None) or "")
    mods = get_modules(agent)
    if not ind or not mods:
        return ""
    cat = get_catalog(agent)
    queue_on = "queue" in mods
    parts = ["ПРЕДЗАКАЗ К ПРИЕЗДУ — твоя главная операция: собери ОДИН заказ на всё, что клиенту нужно к приезду — "
             + ("" if queue_on else "топливо (вид и литры), ")
             + ("еду и напитки, " if "cafe" in mods else "") + ("услуги, " if "services" in mods else "")
             + "имя, гос-номер и время приезда → station_order. QR не нужен: станция ждёт клиента по имени и номеру машины "
             "и готовится заранее — заправит, накормит, помоет, подготовит душ или номер. Предлагай дополнить к месту "
             "(«кофе к приезду?», «проверим давление?», «подготовить номер для отдыха?»), без навязывания. Оплата на кассе."
             + (" Топливо в режиме дефицита — только через запись в очередь (queue_register), заказ привяжется к талону." if queue_on else "")]
    if "cafe" in mods and cat.get("cafe"):
        parts.append("МЕНЮ КАФЕ: " + _fmt_items(cat["cafe"]))
    if "services" in mods and cat.get("services"):
        parts.append("ПРАЙС УСЛУГ: " + _fmt_items(cat["services"]))
    if "insurance" in mods:
        parts.append("ПРОДЛЕНИЕ СТРАХОВКИ (ОСАГО/КАСКО): собери имя, телефон, марку и номер авто, когда истекает полис "
                     "→ create_lead с пометкой «Страховка». Полис оформляет партнёр сети; цену не обещай.")
    if not parts:
        return ""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    now = datetime.now(ZoneInfo("Europe/Moscow")).strftime("%H:%M")
    return (f"\n\nСЕЙЧАС НА СТАНЦИИ {now}. Время приезда можно передать как «ЧЧ:ММ» или «через 40 минут» — не переспрашивай, "
            "если клиент уже сказал, когда будет."
            "\nОПЕРАЦИИ СТАНЦИИ:\n- " + "\n- ".join(parts))


# ── Состояние/сохранение модулей (общие для ЛК бизнеса и админки) ──
SETTINGS = {  # настройка → (мин, макс) ; показываются, если подключён модуль queue
    "queue_limit_liters": (5, 200), "queue_buffer_pct": (0, 90), "queue_slot_min": (3, 60),
}


async def operators(db, agent_id: int) -> list:
    from sqlalchemy import select
    from app.models.fuel_queue import StationOperator
    from app.models.user import User
    rows = (await db.execute(select(User).join(StationOperator, StationOperator.user_id == User.id)
                             .where(StationOperator.agent_id == agent_id).order_by(User.id))).scalars().all()
    return [{"user_id": u.id, "phone": u.phone, "name": u.display_name} for u in rows]


async def state(db, agent) -> dict:
    ind = INDUSTRIES.get(getattr(agent, "industry", None) or "")
    mods = get_modules(agent)
    return {
        "industry": getattr(agent, "industry", None),
        "industry_label": ind["label"] if ind else None,
        "industries": [{"id": k, "label": v["label"], "desc": v["desc"]} for k, v in INDUSTRIES.items()],
        "modules": [{"id": k, "label": m["label"], "desc": m["desc"], "on": k in mods, "catalog": m.get("catalog"),
                     "operator": bool(m.get("operator"))} for k, m in (ind["modules"].items() if ind else [])],
        "catalog": get_catalog(agent),
        "settings": {k: getattr(agent, k, None) for k in SETTINGS},
        "operators": await operators(db, agent.id),
        "operator_url": f"https://jinntell.ru/operator/{agent.id}",
    }


def _clean_catalog(cat) -> dict:
    out: dict = {}
    if not isinstance(cat, dict):
        return out
    for key in ("cafe", "services"):
        items = []
        for it in (cat.get(key) or [])[:60]:
            if not isinstance(it, dict):
                continue
            nm = str(it.get("name") or "").strip()[:80]
            if not nm:
                continue
            try:
                price = max(0, min(int(float(it.get("price") or 0)), 1_000_000))
            except (TypeError, ValueError):
                price = 0
            items.append({"name": nm, "price": price})
        out[key] = items
    return out


async def update(db, agent, payload: dict, *, admin: bool = False) -> dict:
    """Сохранить модули/каталог/настройки. Заготовку (industry) меняет только админ."""
    industry = getattr(agent, "industry", None)
    if admin and "industry" in payload:
        industry = payload.get("industry") or None
        if industry and industry not in INDUSTRIES:
            raise ValueError("неизвестная заготовка")
    if not industry and not admin:
        raise ValueError("джину не назначена отраслевая заготовка — обратитесь к нам")
    mods = payload.get("modules")
    if mods is None:
        mods = get_modules(agent)
        if industry and industry != getattr(agent, "industry", None):
            # заготовка назначена впервые: весь её функционал включён, кроме опций «по необходимости» (очередь)
            mods = [k for k, m in INDUSTRIES[industry]["modules"].items() if m.get("default")]
    catalog = _clean_catalog(payload["catalog"]) if "catalog" in payload else None
    apply(agent, industry, list(mods), catalog)
    for k, (lo, hi) in SETTINGS.items():
        v = (payload.get("settings") or {}).get(k)
        if v is not None:
            try:
                setattr(agent, k, max(lo, min(int(v), hi)))
            except (TypeError, ValueError):
                pass
    await db.commit()
    return await state(db, agent)


async def add_operator(db, agent, phone: str, password: str = "", name: str = "") -> dict:
    """Привязать оператора к станции по телефону. Нет такого пользователя — создаём (нужен пароль ≥ 6)."""
    from sqlalchemy import select
    from app.api.auth import _normalize_phone
    from app.core.security import hash_password
    from app.models.fuel_queue import StationOperator
    from app.models.user import User
    ph = _normalize_phone(phone or "")
    if not ph or len(ph) < 8:
        raise ValueError("укажите телефон оператора")
    u = (await db.execute(select(User).where(User.phone == ph))).scalar_one_or_none()
    if not u:
        if len(password or "") < 6:
            raise ValueError("новому оператору нужен пароль (минимум 6 символов)")
        u = User(phone=ph, password_hash=hash_password(password), display_name=(name or "Оператор АЗС")[:100], first_name=(name or "Оператор")[:100])
        db.add(u)
        await db.flush()
    # уже есть аккаунт с этим телефоном — просто привязываем, пароль не трогаем
    exists = (await db.execute(select(StationOperator).where(StationOperator.agent_id == agent.id, StationOperator.user_id == u.id))).scalar_one_or_none()
    if not exists:
        db.add(StationOperator(agent_id=agent.id, user_id=u.id))
    await db.commit()
    return {"operators": await operators(db, agent.id)}


async def remove_operator(db, agent, user_id: int) -> dict:
    from sqlalchemy import delete
    from app.models.fuel_queue import StationOperator
    await db.execute(delete(StationOperator).where(StationOperator.agent_id == agent.id, StationOperator.user_id == user_id))
    await db.commit()
    return {"operators": await operators(db, agent.id)}
