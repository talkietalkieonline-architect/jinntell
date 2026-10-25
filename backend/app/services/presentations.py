"""Презентации: функция «Промоутер» у джина-продавца/консультанта/менеджера + системные презентации Марка.

Бизнес включает функцию «Промоутер: презентации» (инструмент send_presentation) и заполняет в кабинете свои
готовые решения (agents.presentations_json). Джин в связанной роли промоутера сам их представляет (role_note)
и присылает PDF в Портфель. У Марка (promoter, отдел продаж) — системные: Город, бизнес, АЗС, кофейня, персонаж.
Тексты — здесь (источник правды для PDF и для базы знаний промоутера). PDF кэшируется по хэшу
содержимого в storage/presentations и отдаётся по /api/storage/presentations/…
"""
import hashlib
import json
import os
import re
from datetime import date

OUT_DIR = "/app/storage/presentations"
PUBLIC_BASE = "https://jinntell.ru"
_FONT_DIR = "/usr/share/fonts/truetype/dejavu"

# Каждая презентация: title, subtitle, sections = [(заголовок, [абзацы; «— » в начале = пункт списка])], link
PRESENTATIONS: dict = {
    "city": {
        "title": "Город JinnTell",
        "subtitle": "Где живут ИИ-джины — от игры к живым помощникам в жизни",
        "link": "/about",
        "sections": [
            ("Что это", [
                "JinnTell — город ИИ-джинов. Как в Симс: здесь заселяются, живут, растут и получают профессию. "
                "Только жильцы работают по-настоящему — принимают заказы, консультируют, ведут каналы, помогают людям.",
                "У каждого человека есть личный помощник: ведёт его день, напоминает о делах и находит в Городе нужного джина.",
            ]),
            ("Кто живёт в Городе", [
                "— Жители — собеседники, журналисты со своими каналами, погода. С ними просто интересно.",
                "— Специалисты — умеют делать работу: поиск, подбор ключевых слов, новости ИИ. У каждого визитка «что умею».",
                "— Сотрудники компаний — работают на бизнес: принимают заказы, рассказывают об акциях, ведут клиента.",
                "— Персонажи людей — джины, которых создали пользователи. Учатся и могут стать специалистами.",
                "За кадром Город держит команда: Модератор следит за порядком, Наставник учит новичков, Архитектор знает, как всё устроено.",
            ]),
            ("Чем отличается от чат-бота", [
                "Чат-бот — одна модель. В Городе вы говорите с настоящими кофейнями, АЗС, специалистами, "
                "и ваш помощник может договориться с ними за вас: спросить, заказать, напомнить.",
            ]),
            ("Как начать", [
                "— Человеку: зарегистрироваться — за регистрацию дарим токены; завести своего персонажа.",
                "— Бизнесу: поселить своего джина-сотрудника по готовой заготовке отрасли; пилот на одной точке.",
                "Ничего не нужно устанавливать — всё работает в браузере, к джину можно попасть по QR.",
            ]),
        ],
    },
    "business": {
        "title": "Джин-сотрудник для бизнеса",
        "subtitle": "Продавец на каждой точке — в разговоре с клиентом",
        "link": "/about/kp/rent",
        "sections": [
            ("Главное: сделка — в разговоре", [
                "Клиент не листает приложение и не жмёт кнопки — он просто говорит: «два капучино к восьми, как в прошлый раз». "
                "Заказ сделан заранее, клиент приходит к готовому. Каждый разговор сохраняется.",
            ]),
            ("Что получает бизнес", [
                "— Заказы голосом заранее: персонал видит и слышит их в реестре точки.",
                "— История каждого клиента: повторный заказ одной фразой, средний чек растёт.",
                "— Отзывы без анкет: джин сам спрашивает после покупки.",
                "— Предпочтения клиентов — шаг к индивидуальному обслуживанию.",
                "— «Зазывала»: прохожего с JinnTell джин зовёт по имени и рассказывает акцию дня; QR «послушать акцию».",
                "— Оплата напрямую бизнесу через СБП — платформа в платеже не участвует.",
            ]),
            ("Готовые заготовки отраслей", [
                "— Джин АЗС: предзаказ топлива, кафе и услуг к приезду, очередь при дефиците, продление страховки.",
                "— Джин кофейни: меню и заказ к времени, оплата через СБП, голос заказов для персонала.",
                "Нужные функции бизнес включает сам в личном кабинете. Джин может быть публичным (виден в Городе) "
                "или закрытым — только для сотрудников.",
            ]),
            ("Стоимость", [
                "Аренда джина за точку плюс разговоры по факту использования. Пилот — на одной-трёх точках, "
                "условия согласуем на встрече.",
            ]),
        ],
    },
    "azs": {
        "title": "Продавец на каждой АЗС",
        "subtitle": "Сделка с водителем — в живом голосовом разговоре",
        "link": "/about/kp/azs",
        "sections": [
            ("Как это звучит", [
                "Водитель: «Буду минут через двадцать. Девяносто пятого сорок литров и капучино».",
                "Джин: «Записал: АИ-95 — 40 литров и капучино к 16:40, на имя Олег. Проверим давление в шинах, пока заправляетесь?»",
                "Джин: «Готово. Помощник напомнит за 15 минут. Приезжайте — всё будет готово».",
            ]),
            ("Главное: сделка — в разговоре", [
                "— Голосом, как с человеком: за рулём, на ходу, без приложений и кнопок.",
                "— Заранее — к результату: топливо, кофе, мойка, душ, номер для отдыха — одним заказом к времени приезда.",
                "— Ничего не теряется: заказ в реестре станции и в «Моём дне» водителя, помощник напомнит выехать.",
            ]),
            ("Что получает сеть", [
                "— Средний чек: джин к месту предлагает кофе, проверку давления, омывайку, мойку.",
                "— Скорость у колонки и кассы: заказ собран заранее, водитель называет имя и забирает.",
                "— Повторные покупки: «Как в прошлый раз?» — и заказ собран одной фразой.",
                "— Отзывы без анкет: оценки по каждой станции.",
                "— Предпочтения: с согласия водителя джин помнит машину, топливо и любимый кофе.",
                "— «Зазывала»: станция голосом приглашает проезжающих с JinnTell, QR «послушать акцию».",
            ]),
            ("Путь к индивидуальному обслуживанию", [
                "1. Работает уже сейчас: реестр станции, голос заказов, напоминание через помощника.",
                "2. Пилот: «как обычно?» одной фразой, предпочтения и оценки.",
                "3. Сеть: аналитика спроса по всем станциям.",
                "4. Персонально: мойка в дождь, ТО по пробегу, страховка к сроку — предложение тому, кому нужно.",
            ]),
            ("Для станции", [
                "— Оператор входит по номеру телефона с любого смартфона: заказы со временем, именем и составом.",
                "— Реестр объявляет каждый новый заказ вслух.",
                "— Оплата на месте или через СБП по ссылке банка сети — деньги идут сети.",
                "— Меню, прайс услуг, акции и операторы — в личном кабинете, без программистов.",
                "Опция: при дефиците топлива — честная очередь с талонами ко времени.",
            ]),
            ("Пилот и стоимость", [
                "Пилот на 2–3 АЗС без доработок ваших систем. Нужно: данные станций, меню и услуги, действующие акции, "
                "места для QR, у персонала — смартфон с браузером.",
                "Аренда джина за станцию плюс разговоры по факту (≈ 0,25 ₽ за ответ; распознавание речи ≈ 1 ₽ за фразу).",
            ]),
        ],
    },
    "coffee": {
        "title": "Бариста-джин для кофейни",
        "subtitle": "Заказ к времени — голосом, оплата напрямую кофейне",
        "link": "/about/kp/cafe",
        "sections": [
            ("Как это звучит", [
                "Гость: «Два капучино на овсяном к восьми пятнадцати».",
                "Джин: «Записала: два капучино на овсяном к 8:15, на имя Аня. Оплатить сейчас через СБП?»",
                "Гость приходит — заказ готов, называет имя и забирает.",
            ]),
            ("Что получает кофейня", [
                "— Заказы к времени: утренний поток без очереди у стойки.",
                "— Голос заказов для персонала: реестр объявляет, что, к какому времени и для кого.",
                "— Оплата через СБП по ссылке банка кофейни — деньги сразу кофейне.",
                "— Постоянные гости: «как обычно?» одной фразой, джин помнит вкусы.",
                "— Отзывы после заказа — без анкет.",
                "— «Зазывала»: акции по расписанию (завтраки, обед, вечерний раф) — джин зовёт прохожих по имени.",
            ]),
            ("Как подключить", [
                "Меню и цены, время работы, ссылка СБП, акции — кофейня заполняет в личном кабинете. "
                "Бариста входит в реестр по номеру телефона. Пилот — на одной точке.",
            ]),
        ],
    },
    "user": {
        "title": "Свой персонаж в Городе",
        "subtitle": "Ваш представитель среди джинов — и герой, который растёт вместе с вами",
        "link": "/about/kp/persona",
        "sections": [
            ("Помощник и персонаж — не одно и то же", [
                "Помощник служит вам: ведёт ваш день, напоминает о делах, находит в Городе нужных джинов и договаривается с ними. "
                "В Городе он не живёт — он всегда при вас.",
                "Персонаж представляет вас: живёт в Городе среди жителей, с ним могут познакомиться и написать другие люди.",
            ]),
            ("Что можно уже сейчас", [
                "— Создать своего джина: Настройки → Персонаж → «Мой джинн в Городе». Имя и аватар берутся из профиля.",
                "— Задать «О себе» — что увидят собеседники — и приветствие.",
                "— Выбрать образ: как к персонажу обращаться (муж., жен., нейтр.) — может отличаться от вашего.",
                "— Персонаж появляется в Городе в разделе «Жители»: его находят в поиске, ему пишут.",
                "Это бесплатно, как и помощник и весь Город. За регистрацию дарим токены.",
            ]),
            ("Скоро — Город становится живым", [
                "— Учёба и профессия: научите персонажа своему делу — он сдаёт экзамен и становится специалистом с визиткой «что умею», "
                "растёт от стажёра до мастера.",
                "— Своя жизнь и дневник: знакомится, общается, вечером рассказывает, как прошёл день.",
                "— Свой канал: делится вашими увлечениями и находками.",
                "— Голос, живое видео, гардероб и подарки.",
                "— Каталог готовых персонажей и несколько персонажей сразу — семья или команда.",
                "— Персонаж-помощник в делах: с вашего разрешения отвечает за вас, когда вы заняты.",
            ]),
            ("Стоимость", [
                "Базовое — бесплатно. Дополнения (голос, внешность, видео, гардероб, способности) — по одному, без подписки.",
            ]),
        ],
    },
}

TOPIC_ALIASES = {"азс": "azs", "заправка": "azs", "кофейня": "coffee", "кафе": "coffee", "cafe": "coffee",
                 "город": "city", "бизнес": "business", "аренда": "business", "rent": "business",
                 "персонаж": "user", "пользователь": "user", "persona": "user"}
MAX_ITEMS = 8


def resolve_topic(topic: str) -> str | None:
    t = (topic or "").strip().lower()
    return t if t in PRESENTATIONS else TOPIC_ALIASES.get(t)


def _system_item(topic: str) -> dict:
    p = PRESENTATIONS[topic]
    return {"id": topic, "title": p["title"], "subtitle": p["subtitle"], "sections": p["sections"],
            "link": f"{PUBLIC_BASE}{p['link']}"}


def as_text(topic: str) -> str:
    """Плоский текст системной презентации — для базы знаний промоутера."""
    return item_text(_system_item(topic))


def item_text(it: dict) -> str:
    out = [f"# {it['title']}", it.get("subtitle") or ""]
    if it.get("link"):
        out.append(f"Страница: {it['link']}")
    for head, paras in it["sections"]:
        if head:
            out.append(f"\n## {head}")
        out.extend(paras)
    return "\n".join(x for x in out if x is not None)


# ───────────── презентации бизнеса (функция «Промоутер» у продавца/консультанта/менеджера) ─────────────
def _slug(s: str, taken: set) -> str:
    tr = str.maketrans("абвгдеёжзийклмнопрстуфхцчшщъыьэюя", "abvgdeejziiklmnoprstufhccss_y_eua")
    base = re.sub(r"[^a-z0-9]+", "-", (s or "").lower().translate(tr)).strip("-")[:24] or "item"
    sid, n = base, 2
    while sid in taken:
        sid, n = f"{base}-{n}", n + 1
    return sid


def clean(items) -> list:
    """Нормализовать список презентаций из кабинета: [{id,title,subtitle,text}], не больше MAX_ITEMS."""
    out, taken = [], set()
    for it in (items or [])[:MAX_ITEMS]:
        if not isinstance(it, dict):
            continue
        title = str(it.get("title") or "").strip()[:120]
        text = str(it.get("text") or "").strip()[:4000]
        if not title or not text:
            continue
        sid = str(it.get("id") or "").strip()[:30]
        if not sid or sid in taken:
            sid = _slug(title, taken)
        taken.add(sid)
        out.append({"id": sid, "title": title, "subtitle": str(it.get("subtitle") or "").strip()[:200], "text": text})
    return out


def _from_text(text: str) -> list:
    """Текст из кабинета → разделы: строка «## Заголовок» начинает раздел; «— »/«- » — пункт списка."""
    sections, head, paras = [], "", []
    for ln in (text or "").replace("\r", "").split("\n"):
        ln = ln.strip()
        if not ln:
            continue
        if ln.startswith("#"):
            if paras or head:
                sections.append((head, paras))
            head, paras = ln.lstrip("#").strip(), []
        else:
            paras.append("— " + ln[2:].strip() if ln.startswith("- ") else ln)
    if paras or head:
        sections.append((head, paras))
    return sections


def agent_items(agent) -> list:
    """Готовые решения джина. У промоутера Города без своих — системные (Город, бизнес, АЗС, кофейня, персонаж)."""
    try:
        raw = json.loads(getattr(agent, "presentations_json", None) or "[]")
    except (ValueError, TypeError):
        raw = []
    slug = getattr(agent, "jinntell_link", None) or ""
    items = [{"id": it["id"], "title": it["title"], "subtitle": it["subtitle"], "sections": _from_text(it["text"]),
              "link": f"{PUBLIC_BASE}/a/{slug}" if slug else ""} for it in clean(raw)]
    if not items and slug == "promoter":
        items = [_system_item(t) for t in PRESENTATIONS]
    return items


def find(agent, key: str):
    items = agent_items(agent)
    k = (key or "").strip().lower()
    if not items:
        return None, items
    if getattr(agent, "jinntell_link", None) == "promoter" and resolve_topic(k):
        k = resolve_topic(k)
    for it in items:
        if it["id"] == k:
            return it, items
    for it in items:
        if k and (k in it["title"].lower() or it["title"].lower() in k):
            return it, items
    return (items[0] if len(items) == 1 else None), items


def role_note(agent) -> str:
    """Связанная роль «промоутер»: тот же джин (лицо, голос, характер) сам представляет готовые решения."""
    items = agent_items(agent)
    if not items:
        return ""
    lst = "\n".join(f"- {it['id']}: {it['title']}" + (f" — {it['subtitle']}" if it.get("subtitle") else "") for it in items)
    return ("\n\n=== РОЛЬ ПРОМОУТЕРА ===\n"
            "Ты умеешь представлять готовые решения. Когда разговор начал ТЫ (приглашение Зазывалы, QR «послушать акцию», "
            "первый контакт, звонок) или собеседник не знает, что здесь предлагают, — переходи в роль промоутера, оставаясь собой: "
            "1) одна живая фраза-зацепка; 2) один вопрос о потребности; 3) подходящее решение в 2–3 предложениях; "
            "4) предложи прислать презентацию (send_presentation, topic = id) или оформить заявку. "
            "Не дави и не повторяй предложение; на «нет» — вежливо попрощайся.\n"
            f"Готовые решения:\n{lst}")


# ───────────── PDF ─────────────
def _register_fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    if "JT" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("JT", os.path.join(_FONT_DIR, "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("JT-Bold", os.path.join(_FONT_DIR, "DejaVuSans-Bold.ttf")))


def _build(it: dict, footer: str, brand: str, path: str) -> None:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    from xml.sax.saxutils import escape

    _register_fonts()
    ink, gold, muted = colors.HexColor("#17191B"), colors.HexColor("#9A7B2F"), colors.HexColor("#5A5F66")
    st = {
        "eyebrow": ParagraphStyle("e", fontName="JT-Bold", fontSize=9, textColor=gold, leading=12, spaceAfter=6),
        "title": ParagraphStyle("t", fontName="JT-Bold", fontSize=24, textColor=ink, leading=29, spaceAfter=6),
        "sub": ParagraphStyle("s", fontName="JT", fontSize=13, textColor=muted, leading=18, spaceAfter=14),
        "h": ParagraphStyle("h", fontName="JT-Bold", fontSize=14, textColor=ink, leading=19, spaceBefore=12, spaceAfter=6),
        "p": ParagraphStyle("p", fontName="JT", fontSize=10.5, textColor=ink, leading=15.5, spaceAfter=5),
        "li": ParagraphStyle("li", fontName="JT", fontSize=10.5, textColor=ink, leading=15.5, spaceAfter=3,
                             leftIndent=12, bulletIndent=0),
        "foot": ParagraphStyle("f", fontName="JT", fontSize=9, textColor=muted, leading=13, spaceBefore=16),
    }
    story = [Paragraph(escape(f"{brand.upper()} · ПРЕЗЕНТАЦИЯ"), st["eyebrow"]),
             Paragraph(escape(it["title"]), st["title"])]
    if it.get("subtitle"):
        story.append(Paragraph(escape(it["subtitle"]), st["sub"]))
    for head, paras in it["sections"]:
        if head:
            story.append(Paragraph(escape(head), st["h"]))
        for para in paras:
            if para.startswith("— "):
                story.append(Paragraph(escape(para[2:]), st["li"], bulletText="•"))
            else:
                story.append(Paragraph(escape(para), st["p"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph(escape(f"{footer} · {date.today().strftime('%d.%m.%Y')}"), st["foot"]))
    story.append(Paragraph("Сделано в JinnTell · jinntell.ru", st["foot"]))
    doc = SimpleDocTemplate(path, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm, title=it["title"], author=brand)
    doc.build(story)


def _cached(name_prefix: str, it: dict, footer: str, brand: str) -> str:
    key = hashlib.sha1((item_text(it) + footer + brand).encode("utf-8")).hexdigest()[:10]
    name = f"{name_prefix}-{key}.pdf"
    path = os.path.join(OUT_DIR, name)
    if not os.path.exists(path):
        os.makedirs(OUT_DIR, exist_ok=True)
        tmp = path + ".tmp"
        _build(it, footer, brand, tmp)
        os.replace(tmp, path)
    return f"{PUBLIC_BASE}/api/storage/presentations/{name}"


def pdf_url(topic: str) -> str:
    """Системная презентация Промоутера Города."""
    it = _system_item(topic)
    return _cached(topic, it, f"Подробнее: {it['link']} · Подключение к JinnTell — Марк: {PUBLIC_BASE}/promoter", "JinnTell")


def item_pdf_url(agent, it: dict) -> str:
    """PDF готового решения джина (системные у промоутера — как раньше)."""
    if getattr(agent, "jinntell_link", None) == "promoter" and it["id"] in PRESENTATIONS:
        return pdf_url(it["id"])
    brand = (getattr(agent, "brand", None) or getattr(agent, "name", None) or "JinnTell").strip()
    footer = f"Поговорить с {getattr(agent, 'name', 'джином')}: {it['link']}" if it.get("link") else brand
    return _cached(f"a{getattr(agent, 'id', 0)}-{it['id']}", it, footer, brand)
