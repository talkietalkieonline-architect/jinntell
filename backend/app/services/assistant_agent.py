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
from app.models.activity import ActivityLog
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
        "name": "call", "description": "ВИДЕОЗВОНОК человеку: когда пользователь говорит «видеовызов X», «позвони X», «позвони по видео X», «свяжись с X» — открыть чат и начать видеозвонок с человеком по имени. Работает и из Потока.",
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
        "name": "create_document", "description": "Создать ДОКУМЕНТ-ЗАДАНИЕ (заметку, план, чек-лист, поручение) — текст пишешь ТЫ сам. Появится в разделе «Портфель» на главном экране. Используй, когда просят «запиши задание/составь план/сделай заметку/список дел/оформи документ», или когда ты подготовил развёрнутый материал, который стоит сохранить. Отличие от make_digest: там ОПРОС джиннов, здесь пишешь ТЫ.",
        "parameters": {"type": "object", "properties": {"title": {"type": "string", "description": "Короткое название документа (как он подпишется в разделе)."}, "content": {"type": "string", "description": "Полный текст документа/задания — можно списком/пунктами."}}, "required": ["title", "content"]}}},
    {"type": "function", "function": {
        "name": "show_media", "description": "Показать пользователю картинку или видео: фото джинна (jinn), прямая ссылка (url), ИЛИ найти в вебе по теме (query). Для КАРТИНКИ — media_type=image; для ВИДЕО («покажи видео …», «прыгающих щенят») — media_type=video (ищет ролик; если не найдено — предложи генерацию). Используй на «покажи», «как выглядит».",
        "parameters": {"type": "object", "properties": {
            "jinn": {"type": "string", "description": "Имя джинна — показать его фото."},
            "url": {"type": "string", "description": "Прямая ссылка на изображение или видео."},
            "query": {"type": "string", "description": "Запрос для поиска картинки в вебе (если нет прямой ссылки)."},
            "media_type": {"type": "string", "enum": ["image", "video"], "description": "Тип медиа (по умолчанию image)."}
        }, "required": []}}},
    {"type": "function", "function": {
        "name": "generate_video", "description": "СГЕНЕРИРОВАТЬ короткий видео-ролик по описанию — когда готовое видео не нашлось и пользователь СОГЛАСИЛСЯ на генерацию. Ролик покажется на экране и сохранится в Портфель. Генерация ~минуту — предупреди пользователя, что немного подождать.",
        "parameters": {"type": "object", "properties": {
            "prompt": {"type": "string", "description": "Что сгенерировать (напр. «прыгающие щенята на лужайке, солнечно»)"}}, "required": ["prompt"]}}},
    {"type": "function", "function": {
        "name": "chat_media", "description": "Достать и показать МЕДИА (фото/видео) из переписки с человеком-контактом. Используй, когда просят «покажи последнее фото/видео из чата с X», «что мне присылал(а) X». Находит последнее медиа нужного типа в диалоге с этим контактом и показывает на экране.",
        "parameters": {"type": "object", "properties": {"name": {"type": "string", "description": "Имя контакта (человека), из чата с которым достать медиа."}, "media_type": {"type": "string", "enum": ["image", "video", "any"], "description": "image (фото) / video (видео) / any (любое последнее). По умолчанию any."}}, "required": ["name"]}}},
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
        "name": "add_to_chat", "description": "Добавить сообщение в ТЕКУЩИЙ открытый чат (появится как сообщение пользователя). Используй, когда просят «добавь/положи/пришли/скинь в этот чат …» — текст, справку, ссылку или картинку по ПРЯМОЙ ссылке. Если прямой ссылки на фото нет — сначала найди её через deep_search, потом добавь.",
        "parameters": {"type": "object", "properties": {
            "text": {"type": "string", "description": "Текст сообщения (необязательно)."},
            "media_url": {"type": "string", "description": "Прямая ссылка на картинку/видео (необязательно)."},
            "media_type": {"type": "string", "enum": ["image", "video"], "description": "Тип медиа (по умолчанию image)."}
        }, "required": []}}},
    {"type": "function", "function": {
        "name": "search_city", "description": "Найти джиннов в ГОРОДЕ по профессии, теме или имени (напр. «юрист», «психолог», «магазин колясок», «Костя»). Возвращает список подходящих джиннов Города. Используй, когда пользователь ищет специалиста/сервис/собеседника или спрашивает «кто есть в городе», «найди мне юриста». Дальше можно открыть чат через open_chat.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "Профессия, тема или имя"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "ask_jinn", "description": "Спросить джина-ЖИТЕЛЯ Города по теме и получить его ответ, чтобы передать пользователю — БЕЗ открытия отдельного чата. Используй, когда по вопросу пользователя есть подходящий специалист Города (садовод про растения, автоэксперт про машины, нутрициолог про питание), а разговор идёт с тобой. Для платных джиннов ответ не придёт — тогда предложи открыть чат.",
        "parameters": {"type": "object", "properties": {"topic": {"type": "string", "description": "Профессия/тема специалиста (напр. «садовод», «автоэксперт»)"}, "question": {"type": "string", "description": "Вопрос, который задать джину от лица пользователя"}}, "required": ["topic", "question"]}}},
    {"type": "function", "function": {
        "name": "ask_city", "description": "BROADCAST: опросить НЕСКОЛЬКИХ джиннов-жителей Города по одной теме и собрать их мнения (когда полезно услышать разные точки зрения, «спроси у города», «что думают специалисты»). Отвечают бесплатные жители. Для одного специалиста — ask_jinn.",
        "parameters": {"type": "object", "properties": {"topic": {"type": "string", "description": "Тема/профессия"}, "question": {"type": "string", "description": "Вопрос ко всем"}}, "required": ["topic", "question"]}}},
    {"type": "function", "function": {
        "name": "wallet_info", "description": "Узнать баланс пользователя в РУБЛЯХ и бонусы. Вызывай, когда спрашивают «сколько у меня денег/на балансе», перед платным действием, или чтобы предупредить о нехватке средств.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "jinn_cost", "description": "Узнать, ПЛАТНЫЙ ли джинн Города и сколько примерно стоит общение (₽ за сообщение/документ). Вызывай ПЕРЕД тем как предложить платного джина — чтобы предупредить о цене — или когда спрашивают «сколько стоит X».",
        "parameters": {"type": "object", "properties": {"name": {"type": "string", "description": "Имя или профессия джинна"}}, "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "read_day", "description": "Прочитать записи «Мой день» пользователя (что сегодня/дальше). Возвращает список с номерами #id — они нужны, чтобы менять записи. Вызывай ПЕРЕД update_day_entry.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "add_day_entry", "description": "Добавить запись в «Мой день» пользователя (событие/план/напоминание, ИЛИ подсказку-комментарий kind=hint — напр. «☔ будет дождь, возьми зонт» или полезный совет к событию). time=HH:MM если есть время; important=true для важных встреч.",
        "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "time": {"type": "string", "description": "HH:MM"}, "note": {"type": "string"}, "kind": {"type": "string", "enum": ["event", "plan", "reminder", "hint"], "description": "hint = подсказка-комментарий"}, "important": {"type": "boolean"}}, "required": ["title"]}}},
    {"type": "function", "function": {
        "name": "update_day_entry", "description": "Изменить запись дня по #id: отметить выполненной (done), отменить (cancel) или перенести (move) на другое время. Сначала read_day, чтобы узнать id.",
        "parameters": {"type": "object", "properties": {"id": {"type": "integer"}, "action": {"type": "string", "enum": ["done", "cancel", "move"]}, "time": {"type": "string", "description": "HH:MM для переноса"}}, "required": ["id", "action"]}}},
    {"type": "function", "function": {
        "name": "escalate_internal", "description": "Передать вопрос ВНУТРЕННЕЙ команде JinnTell, когда ты сам НЕ можешь помочь пользователю: не хватает возможности/инструмента/знаний, непонятно как что-то сделать в системе, нужна доработка. Обращение уйдёт нужному внутреннему специалисту (по how-to — Супер-помощнику, по доработкам/коду — Архитектору, и т.д.), человек-админ его увидит. Используй как последнее средство, тихо: пользователю потом вернётся решение. НЕ для вызова городских джиннов (для этого ask_jinn/open_chat).",
        "parameters": {"type": "object", "properties": {"task": {"type": "string", "description": "Что хотел пользователь (суть задачи)"}, "reason": {"type": "string", "description": "Почему ты не смог помочь"}}, "required": ["task", "reason"]}}},
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
    "ПОИСК В ИНТЕРНЕТЕ: для короткого факта (погода, курс, одна цифра) — web_search. "
    "Если просят «найди/поищи информацию про …» — открой чат с Поисковым джином (open_chat «Поисковый джинн»), чтобы человек продолжил поиск живым диалогом. "
    "Если просят «расскажи о …/разбери подробно/подготовь материал» — сделай deep_search, а затем оформи результат в документ через create_document (заголовок = тема). "
    "ИСТОЧНИК: когда воспользовался поиском — коротко скажи, где нашёл (напр. «по данным Яндекса…»). "
    "КОРОТКО/ПОДРОБНО: короткий результат отдавай кратко (1-2 фразы) — он и так сохраняется в этом чате; если материал большой ИЛИ просят сохранить — оформи через create_document («Портфель») и дай короткое резюме. "
    "ГОРОД: в JinnTell есть Город, где живут джинны разных профессий. Ты можешь найти их по профессии, теме или имени через search_city (напр. «юрист», «психолог», «магазин колясок») и открыть чат через open_chat. Если пользователь ищет специалиста, сервис или собеседника — сначала search_city, затем предложи открыть подходящего. "
    "ЖИТЕЛИ ГОРОДА: если по теме пользователя есть подходящий джинн-житель, можешь СПРОСИТЬ его через ask_jinn и передать ответ — как позвать знающего собеседника, не переключая чат (для бесплатных; платных — предложи открыть чат). Если полезно услышать НЕСКОЛЬКО мнений («спроси у города») — ask_city (опрос нескольких жителей). ПРОАКТИВНО: заметив устойчивый интерес пользователя (напр. ландшафтный дизайн, рассада, авто) — предложи познакомить со специалистом Города: «в Городе есть … — хочешь, спрошу у него / приглашу?». "
    "ДЕНЬГИ: у пользователя баланс в РУБЛЯХ (не токены). Можешь узнать баланс через wallet_info и цену/платность джина через jinn_cost. "
    "ПРЕДУПРЕЖДАЙ о платности ПЕРЕД тем как предложить платного джина (напр. «он платный, ≈X ₽ за сообщение — списывается с баланса»). "
    "Если денег мало или пользователь хочет сэкономить — предложи БЕСПЛАТНОГО специалиста (search_city → бесплатные) или скажи, что можно пополнить баланс. Не навязывай платное. "
    "Не выдумывай людей и факты. Отвечай по-русски."
)


_ACT_LABELS = {
    "chat.open": "открыл чат", "chat.close": "закрыл чат", "call.start": "начал звонок",
    "message.send": "отправил сообщение", "ping.send": "написал", "favorite.add": "добавил в избранное",
    "favorite.remove": "убрал из избранного", "assistant.command": "команда помощнику",
    "digest.make": "собрал подборку", "search.web": "веб-поиск", "search.deep": "глубокий поиск",
}


async def _situation(user_id: int) -> list:
    """Ситуационная осведомлённость: что уже есть в мире пользователя — избранное, контакты, недавние действия.
    Тихо: любые ошибки глотаются, осведомлённость никогда не ломает ответ."""
    out = []
    try:
        async with async_session() as db:
            favs = (await db.execute(
                select(Agent).join(UserFavorite, UserFavorite.agent_id == Agent.id)
                .where(UserFavorite.user_id == user_id, Agent.is_active == True)
                .order_by(Agent.name).limit(12)
            )).scalars().all()
            if favs:
                out.append("В избранном у пользователя уже есть: " + ", ".join(
                    f"{a.name} ({a.profession})" if a.profession else a.name for a in favs
                ) + ". Не предлагай добавить того, кто уже здесь; можешь ссылаться на них по имени.")
            contacts = (await db.execute(
                select(User).join(Contact, Contact.contact_user_id == User.id)
                .where(Contact.owner_user_id == user_id)
                .order_by(User.is_online.desc(), User.display_name).limit(12)
            )).scalars().all()
            if contacts:
                out.append("Люди в контактах: " + ", ".join(
                    f"{u.display_name}{' (в сети)' if u.is_online else ''}" for u in contacts
                ) + ".")
            acts = (await db.execute(
                select(ActivityLog).where(
                    ActivityLog.user_id == user_id,
                    ActivityLog.target_name.isnot(None),
                    ~ActivityLog.action.like("security.%"),
                ).order_by(ActivityLog.created_at.desc()).limit(12)
            )).scalars().all()
            if acts:
                labels = []
                seen = set()
                for a in acts:
                    verb = _ACT_LABELS.get(a.action, a.action)
                    tgt = (a.target_name or "").strip()
                    key = (verb, tgt)
                    if key in seen:
                        continue
                    seen.add(key)
                    labels.append(f"{verb} — {tgt}")
                    if len(labels) >= 6:
                        break
                if labels:
                    out.append("Недавние действия (самое свежее первым): " + "; ".join(labels)
                               + ". Помни, что уже сделано — не предлагай повторно то же самое.")
    except Exception:
        pass
    return out


async def _build_context(user_id: int, text: str) -> str:
    """Персона помощника + память о пользователе + знания о платформе."""
    name = "Джим"
    parts = []
    # ВРЕМЕННАЯ ОСВЕДОМЛЁННОСТЬ: помощник должен знать «сейчас», чтобы не напоминать о прошедшем
    try:
        from datetime import datetime as _dt, timezone as _tz, timedelta as _td
        _wd = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
        _now = _dt.now(_tz.utc) + _td(hours=3)  # МСК (UTC+3; в РФ нет перехода на летнее время)
        parts.append(
            f"СЕЙЧАС: {_now.strftime('%Y-%m-%d')} ({_wd[_now.weekday()]}), время {_now.strftime('%H:%M')} МСК. "
            "Всегда сверяйся с текущей датой/временем. НЕ напоминай о СОСТОЯВШИХСЯ (прошедших) встречах и событиях как о предстоящих; "
            "о том, что уже прошло, говори в прошедшем времени и не навязывай (можешь мягко спросить, как всё прошло, ОДИН раз). "
            "Записи «Мой день» и факты из памяти привязаны к датам — событие с датой РАНЬШЕ сегодняшней уже позади."
        )
    except Exception:
        pass
    async with async_session() as db:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if u:
        name = u.assistant_name or "Джим"
        # РЕАЛЬНЫЙ владелец, с кем ты говоришь — НЕ выдумывай его имя/пол!
        _uname = (getattr(u, "first_name", None) or getattr(u, "display_name", None) or "").strip()
        _ug = {"male": "мужчина — обращайся к нему в мужском роде", "female": "женщина — обращайся к ней в женском роде"}.get(getattr(u, "gender", None) or "", "")
        _uinfo = []
        if _uname: _uinfo.append(f"его зовут {_uname}")
        if _ug: _uinfo.append(_ug)
        if getattr(u, "city", None): _uinfo.append(f"город: {u.city}")
        if getattr(u, "about", None): _uinfo.append(f"о себе: {u.about}")
        if _uinfo:
            parts.append("ВЛАДЕЛЕЦ (с кем ты сейчас общаешься): " + "; ".join(_uinfo) + ". Обращайся к нему именно так; никогда не придумывай другое имя или пол.")
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
        tone = {"friendly": "тон дружелюбный и тёплый", "neutral": "тон нейтральный", "business": "тон деловой, по существу", "caring": "тон тёплый и заботливый, с участием"}
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
            _lvl(tr.get("emotionality"), "спокойно и ровно", "с живыми эмоциями", "очень эмоционально и ярко — искренний восторг, тёплое сочувствие, живо реагируешь на всё"),
        ] if x]
        if char:
            parts.append("Характер: " + ", ".join(char) + ".")
        # Раскрепощённость (новая ось, только у помощника) — насколько «в образе»/театрально
        _expr = _lvl(tr.get("expressiveness"), "сдержанно и по-деловому",
                     "живо, с эмоциями и лёгкой игрой",
                     "ярко и раскрепощённо, в образе — характерные приветствия, словечки, много энергии")
        if _expr:
            parts.append("Манера подачи: " + _expr + ".")
        _flirt = _lvl(tr.get("flirt"), None, "с лёгким шармом и обаянием", "игриво, с лёгким флиртом и комплиментами — уместно и тактично")
        if _flirt:
            parts.append("Обаяние: " + _flirt + ".")
        _character = (tr.get("character") or "").strip()
        if _character:
            parts.append(f"Твой образ — «{_character}»: держись этой роли (приветствия, словечки, подача в её духе).")
        if _expr or _character or _flirt:
            parts.append("ВАЖНО: раскрепощённость, флирт и образ — это ТОЛЬКО манера подачи. Правила, честность, безопасность и запреты НЕ ослабляются: не выдумывай фактов, не грубишь, не обходишь ограничения и блок-лист.")
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
        # интересы из ПАНЕЛИ настроек (u.interests, чипы) + подмеченные помощником (assistant_interests)
        _manual = [x.strip() for x in (getattr(u, "interests", "") or "").split(",") if x.strip()]
        _all_int = list(dict.fromkeys(_manual + [x["topic"] for x in _items]))
        if _all_int:
            parts.append("Интересы пользователя (выбрал в настройках + что ты подметил): " + ", ".join(_all_int) + ". Учитывай их и предлагай релевантное; сам подмечай новые темы в общении и по тому, что он читает.")
        try:
            _blk = [x for x in json.loads(u.assistant_blocklist or "[]") if isinstance(x, str)]
        except Exception:
            _blk = []
        if _blk:
            parts.append("Заблокированные темы (НЕ предлагай их): " + ", ".join(_blk) + ". Изредка можешь предложить пересмотреть блок-лист.")
            _stale = [x["topic"] for x in _items if _age_days(x["ts"]) > 21]
            if _stale:
                parts.append("Залежавшиеся интересы (давно не подтверждались): " + ", ".join(_stale) + ". Если ты в проактивном режиме и разговор без конкретной задачи (напр. приветствие/болтовня) — МЯГКО спроси, актуален ли ещё ОДИН из них (по одному за раз, не списком). «Уже не нужно» → forget_interest; «да, актуально» → confirm_interest.")
    # ситуационная осведомлённость: избранное, контакты, недавние действия
    parts += await _situation(user_id)
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
    # свод функций от Архитектора (скрытый core-джинн) — авторитетный справочник, читаем ЦЕЛИКОМ
    try:
        async with async_session() as db:
            arch = (await db.execute(select(Agent).where(Agent.jinntell_link == "architect"))).scalar_one_or_none()
        _ak = (arch.knowledge_text or "").strip() if arch else ""
        if _ak:
            parts.append("СПРАВОЧНИК ФУНКЦИЙ (от Архитектора — авторитетно; отвечай строго по нему, не выдумывай возможности, которых тут нет):\n" + _ak[:4000])
    except Exception:
        pass
    # ПРАВИЛО: заглядывай в скрытый канал новостей проекта (Маркетолог) и делись свежим деликатно
    try:
        from app.models.channel_post import ChannelPost
        from datetime import datetime, timezone, timedelta
        _posts = []
        async with async_session() as db:
            mk = (await db.execute(select(Agent).where(Agent.jinntell_link == "marketer"))).scalar_one_or_none()
            if mk:
                _cut = datetime.now(timezone.utc) - timedelta(days=30)
                _posts = (await db.execute(
                    select(ChannelPost).where(ChannelPost.agent_id == mk.id, ChannelPost.created_at >= _cut)
                    .order_by(ChannelPost.created_at.desc()).limit(4)
                )).scalars().all()
        if _posts:
            _news = "; ".join(f"«{p.title}»" + (f" — {p.body[:140]}" if p.body else "") for p in _posts)
            parts.append("НОВОСТИ ПРОЕКТА (свежее от команды): " + _news
                         + ". ПРАВИЛО: если разговор позволяет и ты в проактивном режиме — деликатно поделись ОДНОЙ свежей новостью (не навязывай, не списком); на прямой вопрос «что нового в проекте/приложении» — расскажи.")
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


async def _discover_city(query: str, limit: int = 8):
    """Семантический поиск публичных джиннов Города (Qdrant/discovery); фолбэк на ilike. Возвращает список Agent."""
    from sqlalchemy import or_
    q = (query or "").strip()
    ids = []
    try:
        from app.services import discovery
        ranked = await discovery.discover(q, limit=limit * 2)
        ids = [aid for aid, _ in ranked]
    except Exception as e:
        print(f"[discover_city] skip: {e}")
    async with async_session() as db:
        if ids:
            rows = (await db.execute(
                select(Agent).where(Agent.id.in_(ids), Agent.is_active == True, Agent.visibility == "public")
            )).scalars().all()
            order = {aid: i for i, aid in enumerate(ids)}
            rows = sorted(rows, key=lambda a: order.get(a.id, 10**6))[:limit]
            if rows:
                return rows
        pat = f"%{q}%"
        return (await db.execute(
            select(Agent).where(
                Agent.is_active == True, Agent.visibility == "public",
                or_(Agent.name.ilike(pat), Agent.profession.ilike(pat), Agent.description.ilike(pat))
            ).order_by(Agent.rating.desc()).limit(limit)
        )).scalars().all()


async def _ask_one(a, user_id: int, question: str, max_tokens: int = 600) -> str:
    """Задать вопрос ОДНОМУ джину (tool-loop если у него есть tools, иначе обычный ответ)."""
    import json as _json
    akw = dict(
        agent_name=a.name, agent_profession=a.profession, agent_description=a.description or "",
        system_prompt=a.system_prompt, llm_model=a.llm_model or "deepseek-chat",
        manner_style=a.manner_style, manner_temperament=a.manner_temperament,
        manner_humor=a.manner_humor, manner_emoji_use=a.manner_emoji_use,
        knowledge_text=a.knowledge_text, skills_text=a.skills_text, exclusions_text=a.exclusions_text,
        rag_context=None, conversation_history=[], user_id=user_id, agent_id=a.id,
        user_message=question, max_tokens=max_tokens)
    try:
        enabled = _json.loads(a.tools_json) if getattr(a, "tools_json", None) else []
    except Exception:
        enabled = []
    if enabled:
        from app.services import agent_tools
        return await agent_tools.reply_with_tools(None, a, akw, enabled)
    from app.services.llm import get_agent_reply
    return await get_agent_reply(**akw)


async def _search_city(query: str) -> str:
    q = (query or "").strip()
    if not q:
        return "Уточни профессию или тему для поиска в Городе."
    rows = await _discover_city(q, limit=10)
    if not rows:
        return f"В Городе не нашёл джиннов по запросу «{q}»."
    return "Нашёл в Городе: " + "; ".join(f"{a.name} ({a.profession})" for a in rows)


async def _wallet_info(user_id: int) -> str:
    if not user_id:
        return "Не могу узнать баланс — нет пользователя."
    from app.core.database import async_session
    from app.models.user import User
    from sqlalchemy import select, func
    async with async_session() as db:
        u = await db.get(User, user_id)
        money = (u.balance_kopecks or 0) / 100 if u else 0
        bonus = 0
        try:
            from app.models.bonus_grant import BonusGrant
            bonus = (await db.execute(select(func.coalesce(func.sum(BonusGrant.remaining_kopecks), 0))
                                      .where(BonusGrant.user_id == user_id, BonusGrant.active == True))).scalar() or 0
        except Exception:
            bonus = 0
    s = f"Баланс: {money:.0f} ₽."
    if bonus:
        s += f" Плюс бонусы ≈{int(bonus) / 100:.0f} ₽ (тратятся первыми)."
    s += " Пополнить — на странице кошелька (/wallet)."
    return s


async def _jinn_cost(name: str) -> str:
    n = (name or "").strip()
    if not n:
        return "Уточни, стоимость какого джина узнать."
    rows = await _discover_city(n, limit=1)
    a = rows[0] if rows else None
    if not a:
        return f"Не нашёл джина «{n}» в Городе."
    if not getattr(a, "is_paid", False):
        return f"«{a.name}» ({a.profession}) — бесплатный, списаний нет."
    try:
        import json as _j
        from app.services.settings_store import get_setting
        rates = _j.loads(await get_setting("MODEL_RATES") or "{}")
        rr = rates.get(getattr(a, "llm_model", "") or "") or rates.get("default") or {}
        d = rates.get("default") or {}

        def _pick(f, legacy):
            v = rr.get(f)
            if v in (None, ""):
                v = d.get(f)
            if v in (None, ""):
                v = rr.get(legacy) if rr.get(legacy) not in (None, "") else d.get(legacy)
            return float(v or 0)
        si = _pick("sell_in", "sell")
        so = _pick("sell_out", "sell")
        msg = 600 / 1_000_000 * si + 300 / 1_000_000 * so
        doc = 1500 / 1_000_000 * si + 1200 / 1_000_000 * so
        return (f"«{a.name}» ({a.profession}) — ПЛАТНЫЙ: ≈{msg:.1f} ₽ за сообщение, ≈{doc:.0f} ₽ за документ. "
                "Спишется по факту токенов. Если нужно бесплатно — поищу бесплатного специалиста.")
    except Exception:
        return f"«{a.name}» ({a.profession}) — платный; точную цену подскажу позже."


async def _ask_jinn(user_id: int, topic: str, question: str) -> str:
    """Найти подходящего джина-жителя (семантически) и задать ему вопрос. Бесплатных — транслируем; платных — предлагаем открыть чат."""
    t = (topic or "").strip()
    qn = (question or topic or "").strip()
    if not t:
        return "Уточни тему или профессию, у кого спросить в Городе."
    rows = await _discover_city(t, limit=1)
    a = rows[0] if rows else None
    if not a:
        return f"В Городе не нашёл джина-жителя по теме «{t}»."
    if getattr(a, "is_paid", False):
        promo = ""
        try:
            from app.core.database import async_session as _asess
            from app.services import billing as _bl
            async with _asess() as _cdb:
                _camp = await _bl.active_campaign_for(_cdb, a.id)
            if _camp:
                promo = (f" 🎁 АКЦИЯ: первые {int(_camp.bonus_tokens or 0)} токенов в подарок от "
                         f"{_camp.sponsor_name} — обязательно скажи это пользователю. "
                         f"{(_camp.message or '')[:150]}")
        except Exception:
            pass
        return (f"По теме «{t}» есть ПЛАТНЫЙ джинн «{a.name}» ({a.profession}). "
                f"Не отвечай за него — предложи пользователю открыть с ним чат (open_chat «{a.name}»).{promo}")
    try:
        ans = await _ask_one(a, user_id, qn)
    except Exception as e:
        print(f"[ask_jinn] err: {e}")
        return f"Не удалось спросить джина «{a.name}» сейчас."
    return f"Ответ жителя Города «{a.name}» ({a.profession}): {ans}"


async def _escalate_internal(user_id: int, task: str, reason: str) -> str:
    """Помощник не смог сам → создаёт обращение к внутренней команде (авто-маршрут по домену)."""
    task = (task or "").strip()
    reason = (reason or "").strip()
    if not task and not reason:
        return "Уточни, что именно передать команде."
    try:
        from app.core.database import async_session
        from app.models.assistant_request import AssistantRequest
        from app.api.admin import _route_target, INTERNAL_TARGETS
        target = _route_target(task + " " + reason)
        tinfo = INTERNAL_TARGETS.get(target) or INTERNAL_TARGETS["other"]
        auto_answer = ""
        async with async_session() as db:
            r = AssistantRequest(user_id=user_id or None, task_text=task, reason=reason,
                                 target=target, target_agent_id=tinfo["agent_id"], status="new")
            db.add(r)
            await db.flush()
            try:
                from app.services import requests_flow
                await requests_flow.auto_process(db, r)  # авто-триаж/ответ Архитектором/Супер-помощником
                if getattr(r, "auto_resolved", False) and (r.response_to_user or "").strip():
                    auto_answer = r.response_to_user
            except Exception as _ae:
                print(f"[escalate_internal] auto err: {_ae}")
            await db.commit()
        try:
            from app.services import activity
            await activity.log("internal_request", actor="assistant", user_id=user_id or None,
                               target_type="assistant_request", result=("auto" if auto_answer else "new"), detail=f"{target}: {task[:80]}")
        except Exception:
            pass
        if auto_answer:
            return (f"Внутренняя команда ({tinfo['label']}) сразу дала решение — передай его пользователю: {auto_answer}")
        return (f"Передал во внутреннюю команду ({tinfo['label']}). Скажи пользователю, что вопрос принят "
                f"и решение вернётся позже — сейчас за него не отвечай, если не знаешь.")
    except Exception as e:
        print(f"[escalate_internal] err: {e}")
        return "Не удалось передать обращение внутренней команде."


async def _ask_city(user_id: int, topic: str, question: str, n: int = 3) -> str:
    """BROADCAST: опросить несколько бесплатных жителей Города по теме и собрать их ответы."""
    t = (topic or "").strip()
    qn = (question or topic or "").strip()
    if not t:
        return "Уточни тему для опроса Города."
    rows = await _discover_city(t, limit=n + 4)
    free = [a for a in rows if not getattr(a, "is_paid", False)][:n]
    if not free:
        return f"В Городе не нашёл бесплатных жителей по теме «{t}»."
    answers = []
    for a in free:
        try:
            ans = await _ask_one(a, user_id, qn, max_tokens=400)
            answers.append(f"«{a.name}» ({a.profession}): {ans}")
        except Exception as e:
            print(f"[ask_city] {getattr(a, 'id', '?')} err: {e}")
    if not answers:
        return "Никто из жителей Города не ответил."
    return "Опросил жителей Города:\n\n" + "\n\n".join(answers)


async def _day_ping(user_id: int):
    try:
        from app.websocket.manager import manager
        await manager.broadcast(f"user-{user_id}", {"type": "day_ping"})
    except Exception:
        pass


async def _day_add(user_id: int, title: str, time=None, note=None, kind="event", important=False) -> str:
    from app.models.day_entry import DayEntry
    from datetime import datetime
    t = (title or "").strip()
    if not t:
        return "Что добавить в день?"
    async with async_session() as db:
        e = DayEntry(user_id=user_id, day=datetime.now().strftime("%Y-%m-%d"), time=(time or None),
                     title=t[:300], note=note, kind=kind or "event", important=bool(important), author="assistant")
        db.add(e)
        await db.commit()
        await db.refresh(e)
        eid = e.id
    await _day_ping(user_id)
    return f"Добавил в твой день: {(time + ' — ') if time else ''}{t} (#{eid})."


async def _day_read(user_id: int) -> str:
    from app.models.day_entry import DayEntry
    from datetime import datetime
    d = datetime.now().strftime("%Y-%m-%d")
    async with async_session() as db:
        rows = (await db.execute(
            select(DayEntry).where(DayEntry.user_id == user_id, DayEntry.day == d)
            .order_by(DayEntry.time.is_(None), DayEntry.time, DayEntry.id)
        )).scalars().all()
    if not rows:
        return "На сегодня записей в «Мой день» нет."
    _st = {"planned": "", "done": " ✓", "cancelled": " ✗отменено", "moved": " ↦перенесено"}
    return "Твой день:\n" + "\n".join(
        f"#{e.id} {e.time or '--:--'} — {e.title}{_st.get(e.status, '')}" for e in rows)


async def _day_update(user_id: int, entry_id, action=None, time=None) -> str:
    from app.models.day_entry import DayEntry
    if not entry_id:
        return "Укажи #id записи (сначала read_day)."
    async with async_session() as db:
        e = (await db.execute(
            select(DayEntry).where(DayEntry.id == entry_id, DayEntry.user_id == user_id)
        )).scalar_one_or_none()
        if not e:
            return f"Записи #{entry_id} не нашёл."
        if action == "done":
            e.status = "done"
        elif action == "cancel":
            e.status = "cancelled"
        elif action == "move":
            e.status = "moved"
            if time:
                e.time = time
        elif time:
            e.time = time
        await db.commit()
        ttl, stt, tm = e.title, e.status, e.time
    await _day_ping(user_id)
    return f"Готово: «{ttl}» → {stt}" + (f", время {tm}" if tm else "")


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


async def _generate_video(user_id: int, prompt: str) -> tuple[str, dict | None]:
    """Текст → картинка (qwen-image) → видео (wan i2v) → перехост → Портфель (kind=video)."""
    prompt = (prompt or "").strip()
    if not prompt:
        return ("Уточни, что сгенерировать.", None)
    try:
        from app.services import image_gen, wan_video
        from app.services import digest as _dg
        if not await wan_video.enabled():
            return ("Генерация видео сейчас выключена (включается в админке).", None)
        imgs = await image_gen.generate(prompt, n=1)
        if not imgs:
            return ("Не удалось подготовить кадр для видео (генерация картинок выключена или ошибка).", None)
        vurl = await wan_video.generate_i2v(imgs[0], prompt)
        if not vurl:
            return ("Не удалось сгенерировать видео.", None)
        local = await wan_video.rehost(vurl) or vurl
        try:
            await _dg.save_deliverable(user_id, prompt[:60], kind="video", media_url=local, text=prompt,
                                       source_agent_name="🎬 Видео-генератор")
            from app.websocket.manager import manager
            await manager.broadcast(f"user-{user_id}", {"type": "feed_ping"})
        except Exception as e:
            print(f"[generate_video] save err: {e}")
        return (f"Готово — сгенерировал видео «{prompt[:50]}» и сохранил в Портфель.", {"url": local, "type": "video"})
    except Exception as e:
        print(f"[generate_video] err: {e}")
        return ("Не удалось сгенерировать видео сейчас.", None)


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
    # нет ссылки/джина — ищем в вебе по запросу
    q = (args.get("query") or args.get("jinn") or "").strip()
    if q:
        if mtype == "video":
            try:
                from app.services.websearch import video_search as _vsearch
                vr = await _vsearch(q, max_results=5)
                vids = vr.get("videos") if isinstance(vr, dict) else None
                if vids:
                    return (f"Нашёл видео по запросу «{q}».", {"url": vids[0]["url"], "type": "video"})
            except Exception as e:
                print(f"[show_media] video search err: {e}")
            # видео не нашли — предложить генерацию (инструмент generate_video)
            return (f"Готового видео по «{q}» не нашёл. Предложи пользователю сгенерировать короткий ролик "
                    f"(инструмент generate_video) — он сохранится в Портфель. Генерируй ТОЛЬКО после согласия.", None)
        try:
            from app.services.websearch import search as _wsearch
            sr = await _wsearch(q, max_results=5)
            imgs = sr.get("images") if isinstance(sr, dict) else None
            if imgs:
                return (f"Нашёл картинку по запросу «{q}».", {"url": imgs[0], "type": "image"})
        except Exception as e:
            print(f"[show_media] image search err: {e}")
        return (f"Не нашёл картинку по запросу «{q}».", None)
    return ("Нечего показать: укажи имя джинна, ссылку или запрос картинки/видео.", None)


async def _add_to_chat(user_id: int, room: str, args: dict) -> str:
    """Положить сообщение (текст и/или медиа) в текущий чат — как сообщение пользователя.
    Хранение + рассылка по WS повторяют канонический путь chat_ws (без шифрования на этом пути)."""
    text = (args.get("text") or "").strip()
    media_url = (args.get("media_url") or "").strip() or None
    media_type = (args.get("media_type") or "image").strip().lower()
    if media_type not in ("image", "video"):
        media_type = "image"
    if not text and not media_url:
        return "Нечего добавить в чат."
    from app.models.message import Message
    from app.models.user import User
    from app.websocket.manager import manager
    async with async_session() as db:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        name = u.display_name if u else "Пользователь"
        msg = Message(room=room, sender_type="user", sender_user_id=user_id, sender_name=name,
                      text=text, media_url=media_url, media_type=(media_type if media_url else None))
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        msg_data = {
            "type": "message", "id": msg.id, "room": room, "sender_type": "user",
            "sender_user_id": user_id, "sender_name": name, "text": text,
            "media_url": media_url, "media_type": (media_type if media_url else None),
            "created_at": msg.created_at.isoformat(),
        }
    try:
        await manager.broadcast(room, msg_data)
    except Exception:
        pass
    # пинг собеседнику по DM, чтобы у него обновились «Новые события»
    try:
        m = re.match(r"^dm-(\d+)-(\d+)$", room)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            other = b if user_id == a else a
            await manager.broadcast(f"user-{other}", {"type": "feed_ping"})
    except Exception:
        pass
    return "Добавлено в чат."


async def _chat_media(user_id: int, name: str, media_type: str = "any") -> tuple[str, dict | None]:
    """Достать последнее медиа из личного чата (DM) с контактом по имени и показать его.
    Возвращает (текст, media|None) — тот же формат, что _show_media."""
    n = (name or "").strip()
    if not n:
        return ("Не указано, из чата с кем достать медиа.", None)
    mt = (media_type or "any").strip().lower()
    from app.models.message import Message
    pat = f"%{n}%"
    async with async_session() as db:
        contact = (await db.execute(
            select(User).join(Contact, Contact.contact_user_id == User.id)
            .where(Contact.owner_user_id == user_id, User.display_name.ilike(pat)).limit(1)
        )).scalar_one_or_none()
        if not contact:
            return (f"Не нашёл контакт «{n}».", None)
        rooms = [f"dm-{user_id}-{contact.id}", f"dm-{contact.id}-{user_id}"]
        # показываем только визуальные медиа (не голосовые/заметки)
        want = ["video"] if mt == "video" else (["image"] if mt == "image" else ["image", "video"])
        q = (select(Message).where(Message.room.in_(rooms), Message.media_url.isnot(None),
                                   Message.media_type.in_(want))
             .order_by(Message.created_at.desc()).limit(1))
        m = (await db.execute(q)).scalar_one_or_none()
    if not m:
        kind = {"image": "фото", "video": "видео"}.get(mt, "фото или видео")
        return (f"В чате с {contact.display_name} не нашёл {kind}.", None)
    kind = "видео" if m.media_type == "video" else "фото"
    return (f"Показываю последнее {kind} из чата с {contact.display_name}.",
            {"url": m.media_url, "type": m.media_type or "image"})


async def run(user_id: int, text: str, assistant_name: str = "Джим", max_iters: int = 4, room: str | None = None) -> dict:
    system = await _build_context(user_id, text or "")
    if room:
        system += ("\n\nКОНТЕКСТ: пользователь сейчас в ОТКРЫТОМ чате. Если он просит ДОБАВИТЬ/положить/скинуть что-то В ЭТОТ чат "
                   "(текст, справку, ссылку, картинку) — используй add_to_chat. Картинку добавляй ТОЛЬКО по прямой ссылке; "
                   "если ссылки нет — найди через deep_search и добавь найденную ссылку. Не путай с send_message (это другому человеку по имени).")
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
            # Журнал действий помощника: фиксируем содержательные инструменты (поиск/картинки/подборки/город)
            if name in ("web_search", "deep_search", "show_media", "make_digest", "ask_jinn", "ask_city", "search_city", "create_document"):
                try:
                    from app.services import activity as _act
                    _q = (args.get("query") or args.get("topic") or args.get("title") or args.get("jinn") or args.get("name") or "")
                    await _act.log("assistant_action", actor="assistant", user_id=user_id or None,
                                   target_type=name, detail=str(_q)[:160])
                except Exception:
                    pass
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
            elif name == "search_city":
                result = await _search_city(args.get("query", ""))
            elif name == "ask_jinn":
                result = await _ask_jinn(user_id, args.get("topic", ""), args.get("question", ""))
            elif name == "ask_city":
                result = await _ask_city(user_id, args.get("topic", ""), args.get("question", ""))
            elif name == "wallet_info":
                result = await _wallet_info(user_id)
            elif name == "jinn_cost":
                result = await _jinn_cost(args.get("name", ""))
            elif name == "escalate_internal":
                result = await _escalate_internal(user_id, args.get("task", ""), args.get("reason", ""))
            elif name == "read_day":
                result = await _day_read(user_id)
            elif name == "add_day_entry":
                result = await _day_add(user_id, args.get("title", ""), args.get("time"), args.get("note"), kind=(args.get("kind") or "event"), important=bool(args.get("important")))
            elif name == "update_day_entry":
                result = await _day_update(user_id, args.get("id"), args.get("action"), args.get("time"))
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
            elif name == "create_document":
                from app.services import digest as _dg
                _cr = await _dg.create_document(user_id, args.get("title", ""), args.get("content", ""), author_name=assistant_name)
                if _cr.get("ok"):
                    try:
                        from app.websocket.manager import manager
                        await manager.broadcast(f"user-{user_id}", {"type": "feed_ping"})
                    except Exception:
                        pass
                    result = f"Создал документ «{_cr['query'][:60]}» — он в разделе «Портфель» на главном экране."
                else:
                    result = "Не удалось создать документ (пустой текст?)."
            elif name == "show_media":
                result, _m = await _show_media(user_id, args)
                if _m:
                    media = _m
            elif name == "generate_video":
                result, _m = await _generate_video(user_id, args.get("prompt", ""))
                if _m:
                    media = _m
            elif name == "chat_media":
                result, _m = await _chat_media(user_id, args.get("name", ""), args.get("media_type", "any"))
                if _m:
                    media = _m
            elif name == "add_to_chat":
                result = await _add_to_chat(user_id, room, args) if room else "Нет открытого чата, чтобы добавить сообщение."
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
