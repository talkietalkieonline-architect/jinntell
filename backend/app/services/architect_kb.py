"""База знаний Архитектора (#47) — «живая карта системы» (north-star: Архитектор = RAG).

Три источника, пересобираются целиком (rebuild):
  1. Карта кода — генерируется из исходников бэкенда при КАЖДОЙ пересборке: модули с описаниями,
     эндпоинты (метод + путь + функция), модели БД (таблицы + колонки), функции сервисов.
  2. Штат и Город — из БД: внутренние джины по департаментам, джины Города, контрагенты, автоканалы,
     названия настроек (только названия, без значений).
  3. Проектные знания — md-файлы в storage/architect_kb: решения, устройство подсистем, история багов.
     Вычищены от паролей/адресов/ключей при выгрузке. Источник правды — код и БД; заметки дают «почему».

Архитектор ищет по базе инструментом search_knowledge (agent_tools) и отвечает по найденному.
Состояние последней пересборки — app_settings ARCH_KB_LAST.
"""
import ast
import asyncio
import glob
import json
import os
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.database import async_session
from app.models.agent import Agent

ARCHITECT_ID = 47
KB_DIR = "/app/storage/architect_kb"
APP_DIR = "/app/app"
_CHUNK = 1200
_OVERLAP = 150


# ───────────────────────── нарезка ─────────────────────────
def _chunks(title: str, text: str) -> list:
    """Нарезать текст на куски ~1200 знаков по абзацам; каждый кусок помечен названием документа."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text or "") if p.strip()]
    out, cur = [], ""
    for p in paras:
        while len(p) > _CHUNK:  # слишком длинный абзац — режем по предложениям/границе
            cut = p.rfind(". ", 0, _CHUNK)
            cut = cut + 1 if cut > _CHUNK // 2 else _CHUNK
            if cur:
                out.append(cur)
                cur = ""
            out.append(p[:cut].strip())
            p = p[cut:].strip()
        if len(cur) + len(p) + 2 > _CHUNK and cur:
            out.append(cur)
            cur = cur[-_OVERLAP:] + "\n\n" + p  # небольшое перекрытие — контекст не рвётся
        else:
            cur = f"{cur}\n\n{p}" if cur else p
    if cur:
        out.append(cur)
    return [f"[{title}]\n{c}" for c in out if c.strip()]


# ───────────────────────── 1. карта кода ─────────────────────────
def _first_line(s: str) -> str:
    return (s or "").strip().split("\n")[0][:200]


def _route_of(dec):
    """@router.get("/path") → ("GET", "/path")"""
    if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute) and dec.func.attr in (
            "get", "post", "put", "patch", "delete", "websocket"):
        path = dec.args[0].value if dec.args and isinstance(dec.args[0], ast.Constant) else ""
        return dec.func.attr.upper(), path
    return None


def _code_map() -> list:
    docs = []
    for sub in ("api", "services", "websocket", "models"):
        for path in sorted(glob.glob(f"{APP_DIR}/{sub}/*.py")):
            name = os.path.basename(path)
            if name == "__init__.py":
                continue
            try:
                src = open(path, encoding="utf-8").read()
                tree = ast.parse(src)
            except Exception as e:  # noqa: BLE001
                docs.append((f"Код: {sub}/{name}", f"Не удалось разобрать: {e}"))
                continue
            lines = [f"Файл backend/app/{sub}/{name}."]
            mdoc = ast.get_docstring(tree)
            if mdoc:
                lines.append(mdoc.strip()[:900])
            if sub in ("api", "websocket"):
                m = re.search(r'APIRouter\(\s*prefix\s*=\s*"([^"]*)"', src)
                prefix = m.group(1) if m else ""
                for node in tree.body:
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        for dec in node.decorator_list:
                            r = _route_of(dec)
                            if r:
                                lines.append(f"- {r[0]} {prefix}{r[1]} → {node.name}(): {_first_line(ast.get_docstring(node))}")
            elif sub == "models":
                for node in tree.body:
                    if isinstance(node, ast.ClassDef):
                        table, cols = "", []
                        for st in node.body:
                            if isinstance(st, ast.Assign) and any(getattr(t, "id", "") == "__tablename__" for t in st.targets):
                                table = getattr(st.value, "value", "")
                            if isinstance(st, ast.AnnAssign) and isinstance(st.target, ast.Name):
                                cols.append(st.target.id)
                        lines.append(f"- Модель {node.name} (таблица {table or '?'}): {', '.join(cols)}")
            else:
                for node in tree.body:
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        lines.append(f"- {node.name}(): {_first_line(ast.get_docstring(node))}")
                    elif isinstance(node, ast.ClassDef):
                        lines.append(f"- класс {node.name}: {_first_line(ast.get_docstring(node))}")
            docs.append((f"Код: {sub}/{name}", "\n".join(lines)))
    return docs


# ───────────────────────── 2. штат и Город ─────────────────────────
async def _roster() -> list:
    from app.models.contractor import Contractor
    async with async_session() as db:
        agents = (await db.execute(select(Agent).where(Agent.is_active == True).order_by(Agent.id))).scalars().all()  # noqa: E712
        contractors = (await db.execute(select(Contractor))).scalars().all()
        keys = []
        try:
            from app.models.app_setting import AppSetting
            keys = sorted((await db.execute(select(AppSetting.key))).scalars().all())
        except Exception:  # noqa: BLE001
            pass
    core = [a for a in agents if a.agent_type == "core"]
    deps = {}
    for a in core:
        deps.setdefault(a.department or "без департамента", []).append(a)
    staff = ["Внутренний штат (agent_type=core, вне Города), по департаментам:"]
    for d, lst in sorted(deps.items()):
        staff.append(f"- {d}: " + "; ".join(f"#{a.id} {a.name} ({a.profession}, модель {a.llm_model})" for a in lst))
    city = [a for a in agents if a.agent_type != "core"]
    by_type = {}
    for a in city:
        by_type.setdefault(f"{a.agent_type}/{a.visibility}", []).append(a)
    town = [f"Джинны Города и прочие (всего {len(city)}), по типу/видимости:"]
    for k, lst in sorted(by_type.items()):
        town.append(f"- {k} ({len(lst)}): " + "; ".join(
            f"#{a.id} {a.name}" + (f" [контрагент #{a.contractor_id}]" if a.contractor_id else "")
            + (f" [/a/{a.jinntell_link}]" if a.jinntell_link else "") for a in lst))
    chans = [a for a in agents if getattr(a, "channel_config", None)]
    town.append("Автоканалы (движок channel_engine): " + "; ".join(f"#{a.id} {a.name}" for a in chans))
    contr = ["Контрагенты (бизнесы): " + "; ".join(
        f"#{c.id} {getattr(c, 'company_name', '') or getattr(c, 'name', '')}" for c in contractors)]
    sett = ["Настройки системы (app_settings) — только НАЗВАНИЯ ключей, значения не раскрываются: " + ", ".join(keys)]
    return [("Штат: внутренние джины", "\n".join(staff)),
            ("Город: джинны", "\n".join(town)),
            ("Контрагенты", "\n".join(contr)),
            ("Настройки: названия ключей", "\n".join(sett))]


# ───────────────────────── 3. проектные знания ─────────────────────────
def _curated() -> list:
    docs = []
    for path in sorted(glob.glob(os.path.join(KB_DIR, "*.md"))):
        try:
            text = open(path, encoding="utf-8").read()
        except Exception:  # noqa: BLE001
            continue
        name = os.path.basename(path)[:-3]
        docs.append((f"Заметка: {name}", text))
    return docs


# ───────────────────────── пересборка ─────────────────────────
async def rebuild() -> dict:
    from app.services import rag
    from app.services.settings_store import set_setting
    t0 = datetime.now(timezone.utc)
    code = _code_map()
    roster = await _roster()
    notes = _curated()
    chunks = []
    for layer, docs in (("code", code), ("roster", roster), ("notes", notes)):
        for title, text in docs:
            for c in _chunks(title, text):
                chunks.append({"text": c, "article_number": "", "layer": layer, "source_title": title,
                               "metadata": {"date": t0.strftime("%Y-%m-%d"), "kb": layer}})
    await rag.delete_all_chunks(ARCHITECT_ID)
    ids = await rag.index_chunks(ARCHITECT_ID, chunks)
    stats = {"at": t0.isoformat(), "code_docs": len(code), "roster_docs": len(roster), "note_docs": len(notes),
             "chunks": len(chunks), "indexed": len(ids),
             "seconds": round((datetime.now(timezone.utc) - t0).total_seconds(), 1)}
    await set_setting("ARCH_KB_LAST", json.dumps(stats, ensure_ascii=False))
    print(f"[architect_kb] rebuilt: {stats}")
    return stats


async def architect_kb_scheduler():
    """Фон: раз в сутки пересобираем карту (код и БД меняются — карта не должна устаревать)."""
    from app.services.settings_store import get_setting
    await asyncio.sleep(300)
    while True:
        try:
            last = json.loads((await get_setting("ARCH_KB_LAST")) or "{}").get("at")
            due = not last or datetime.now(timezone.utc) - datetime.fromisoformat(last) > timedelta(hours=23)
            if due:
                await rebuild()
        except Exception as e:  # noqa: BLE001
            print(f"[architect_kb] scheduler error: {e}")
        await asyncio.sleep(3600)
