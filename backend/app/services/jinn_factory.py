"""
Архитектор-фабрика: по краткому ТЗ генерирует персону джина, создаёт его в БД
и проводит через ПРОЦЕДУРУ РОЖДЕНИЯ (jinn_birth.birth verify=True — найден в Городе + реально отвечает).

draft(db, brief, ...) -> отчёт. Используется админ-эндпоинтом; позже — инструментом самого Архитектора.
"""
from __future__ import annotations

import json
import re
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.services.llm import get_llm_reply
from app.services import jinn_birth

_SYS = (
    "Ты — Архитектор JinnTell. По краткому ТЗ создай персону нового джина-специалиста для Города. "
    "Ответь СТРОГО одним JSON-объектом, без пояснений и без markdown. Поля: "
    "name (имя + кратко кто он, по-русски), profession (короткая профессия), "
    "description (1-2 предложения о нём), "
    "system_prompt (инструкция джину: кто он, как общается, о чём помогает, чего НЕ делает; 2-4 предложения), "
    "greeting (короткое приветствие от первого лица, одно предложение), "
    "topic_scope (темы через запятую, по которым он отвечает), "
    "color (hex-цвет), "
    "manner_style (одно из: friendly, formal, playful, strict), "
    "manner_temperament (одно из: calm, balanced, energetic, reserved)."
)

# Адаптация ГОТОВОЙ заготовки из шкафчика Архитектора (agency-agents и т.п.): переносим экспертизу, не выдумываем
_SYS_BASE = (
    "Ты — Архитектор JinnTell. Тебе дана ГОТОВАЯ проверенная заготовка ИИ-агента (на английском) и ТЗ. "
    "Сделай из неё джина для Города JinnTell: русская персона, та же экспертиза и методы. "
    "Убери всё, что не подходит нам: упоминания конкретных зарубежных сервисов/программ, которыми джин не владеет, "
    "работу с кодом/файлами/терминалом, обещания действий, которых у джина нет. Джин честно говорит «не знаю» и передаёт человеку. "
    "ТЗ важнее заготовки. Ответь СТРОГО одним JSON-объектом, без пояснений и без markdown. Поля: "
    "name (имя + кратко кто он, по-русски), profession (короткая профессия), "
    "description (1-2 предложения о нём), "
    "system_prompt (инструкция джину по-русски: кто он, как общается, о чём помогает, правила и границы; 6-10 предложений), "
    "skills_text (по-русски: ключевые методики, чек-листы и рабочие приёмы из заготовки списком, до 2500 знаков), "
    "greeting (короткое приветствие от первого лица, одно предложение), "
    "topic_scope (темы через запятую), "
    "color (hex-цвет), "
    "manner_style (одно из: friendly, formal, playful, strict), "
    "manner_temperament (одно из: calm, balanced, energetic, reserved)."
)

_STYLES = ("friendly", "formal", "playful", "strict")
_TEMPERS = ("calm", "balanced", "energetic", "reserved")


def _extract_json(s: str):
    """Вырезать первый СБАЛАНСИРОВАННЫЙ по скобкам JSON-объект (устойчиво к обрезке/мусору вокруг)."""
    start = s.find("{")
    if start < 0:
        return None
    depth = 0
    instr = False
    esc = False
    for i in range(start, len(s)):
        c = s[i]
        if esc:
            esc = False
            continue
        if c == "\\":
            esc = True
            continue
        if c == '"':
            instr = not instr
            continue
        if instr:
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return s[start:i + 1]
    return None  # не закрылось — вероятно, обрезано по лимиту токенов


def _text(v) -> str:
    """Поле персоны → текст (модель иногда отдаёт список вместо строки)."""
    if isinstance(v, list):
        return "\n".join(f"- {x}" for x in v if x)
    return str(v or "").strip()


def _parse(raw: str) -> dict:
    s = (raw or "").strip()
    s = re.sub(r"^```(json)?", "", s).strip()
    s = re.sub(r"```$", "", s).strip()
    # 1) строгий путь — сбалансированный JSON-объект
    obj = _extract_json(s)
    if obj is not None:
        try:
            return json.loads(obj)
        except Exception:  # noqa: BLE001
            pass
    # 2) фолбэк — модель иногда отдаёт пары без обрамляющих скобок или обрывает хвост:
    #    вытаскиваем ВСЕ завершённые строковые поля "key": "value" регуляркой (устойчиво к обрыву).
    pairs = re.findall(r'"(\w+)"\s*:\s*"((?:\\.|[^"\\])*)"', s)
    if pairs:
        out: dict = {}
        for k, v in pairs:
            out[k] = v.replace('\\"', '"').replace("\\n", "\n").replace("\\/", "/")
        if out.get("name") or out.get("profession"):
            return out
    raise ValueError("не удалось извлечь поля персоны из ответа модели")


async def draft(db: AsyncSession, brief: str, *, owner_id: Optional[int] = None,
                contractor_id: Optional[int] = None, is_paid: bool = False,
                visibility: str = "public", model: Optional[str] = None,
                agent_type: str = "specialist", base: Optional[dict] = None) -> dict:
    brief = (brief or "").strip()
    if not brief:
        return {"ok": False, "error": "пустое ТЗ"}

    if base:
        msg = (f"ТЗ: {brief}\n\nЗАГОТОВКА «{base.get('name', '')}»: {base.get('description', '')}\n"
               f"{base.get('vibe', '')}\n\n{(base.get('body') or '')[:14000]}")
        raw = await get_llm_reply(user_message=msg, system_prompt=_SYS_BASE, model=model, max_tokens=6000)
    else:
        raw = await get_llm_reply(user_message=f"ТЗ: {brief}", system_prompt=_SYS, model=model, max_tokens=4000)
    try:
        p = _parse(raw)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"не удалось разобрать персону: {e}", "raw": (raw or "")[:400]}

    name = (str(p.get("name") or "Джин")).strip()[:100] or "Джин"
    ms = p.get("manner_style") if p.get("manner_style") in _STYLES else "friendly"
    mt = p.get("manner_temperament") if p.get("manner_temperament") in _TEMPERS else "balanced"
    color = str(p.get("color") or "#6d8bff").strip()
    if not color.startswith("#"):
        color = "#" + color
    if not re.match(r"^#[0-9a-fA-F]{6}$", color):
        color = "#6d8bff"

    agent = Agent(
        name=name,
        profession=(str(p.get("profession") or "Специалист")).strip()[:100],
        brand="",
        description=(str(p.get("description") or "")).strip(),
        system_prompt=(str(p.get("system_prompt") or "")).strip(),
        greeting=(str(p.get("greeting") or "")).strip() or None,
        topic_scope=(str(p.get("topic_scope") or "")).strip() or None,
        skills_text=_text(p.get("skills_text"))[:4000] or None,
        color=color[:20],
        agent_type=agent_type,
        visibility=visibility,
        is_paid=bool(is_paid),
        llm_model=model or "deepseek-chat",
        owner_id=owner_id,
        contractor_id=contractor_id,
        manner_style=ms,
        manner_temperament=mt,
    )
    db.add(agent)
    await db.flush()
    if not agent.jinntell_link:
        agent.jinntell_link = f"jinn-{agent.id}"
    await db.flush()

    report = await jinn_birth.birth(db, agent, verify=True)
    return {
        "ok": True,
        "agent_id": agent.id,
        "slug": agent.jinntell_link,
        "name": agent.name,
        "profession": agent.profession,
        "birth": report,
    }
