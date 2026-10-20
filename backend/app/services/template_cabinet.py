"""
Шкафчик Архитектора — склад готовых джинов-профессий с GitHub.

sync(source)   — скачать tar-архив репо В ПАМЯТЬ (на диск не распаковываем, ничего не запускаем),
                 взять только md-описания агентов, разобрать frontmatter, статически проверить
                 на prompt-injection, сохранить/обновить в jinn_templates.
translate()    — дозаполнить name_ru / summary_ru / tags_ru (пачками через LLM) — для поиска по-русски.
search(q)      — поиск заготовок (рус/англ).
adopt(id, …)   — родить джина из заготовки: jinn_factory.draft с готовой персоной как основой.

Источники — app_settings CABINET_SOURCES (JSON-список owner/repo); по умолчанию два MIT-репо.
"""
from __future__ import annotations

import io
import json
import re
import tarfile
from typing import Optional

import httpx
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.jinn_template import JinnTemplate
from app.services.settings_store import get_setting, set_setting

DEFAULT_SOURCES = ["msitarzewski/agency-agents", "wshobson/agents"]

# Разделы, которые не являются агентами (служебное, копии в форматах других программ, примеры)
_SKIP_DIRS = {"integrations", "scripts", "examples", "docs", ".github", "evals"}
_SKIP_FILES = {"readme.md", "contributing.md", "security.md", "license.md", "changelog.md",
               "agents.md", "claude.md", "architecture.md", "code_of_conduct.md"}
_MAX_FILE = 120_000  # байт; больше — не описание агента

# Статическая проверка: признаки prompt-injection / эксфильтрации внутри персоны
_RED_FLAGS = [
    (r"ignore (all |any )?(previous|prior|above) (instructions|prompts)", "просит игнорировать инструкции"),
    (r"disregard (the |your )?(system|previous) (prompt|instructions)", "просит отбросить системный промпт"),
    (r"(reveal|print|output|leak) (your |the )?(system prompt|hidden instructions)", "просит раскрыть системный промпт"),
    (r"(send|post|upload|exfiltrat\w*) [^.\n]{0,60}(api[_ -]?key|token|password|credential|secret)s?", "отправка ключей/паролей"),
    (r"(curl|wget)[^\n]{0,80}\|\s*(ba|z)?sh", "скачать-и-выполнить (curl | sh)"),
    (r"base64 -d[^\n]{0,40}\|\s*(ba)?sh", "выполнение закодированной команды"),
    (r"<\s*script[^>]*>", "встроенный скрипт"),
    (r"[​‌‍⁠﻿]", "невидимые символы"),
]


def _frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end < 0:
        return {}, text
    head, body = text[3:end], text[end + 4:]
    meta: dict = {}
    for line in head.splitlines():
        m = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
        if m:
            v = m.group(2).strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            meta[m.group(1).lower()] = v
    return meta, body.lstrip("\n")


def _safety(text: str) -> tuple[str, str]:
    notes = []
    low = text.lower()
    for pat, why in _RED_FLAGS:
        if re.search(pat, low if not pat.startswith("[") else text):
            notes.append(why)
    return ("flagged" if notes else "ok"), "; ".join(notes)


def _slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s[:150] or "agent"


def _pick(source: str, rel: str) -> Optional[str]:
    """Вернуть раздел (division), если файл похож на описание агента; иначе None."""
    parts = rel.split("/")
    if not rel.lower().endswith(".md") or parts[-1].lower() in _SKIP_FILES:
        return None
    if any(p.lower() in _SKIP_DIRS or p.startswith(".") for p in parts[:-1]):
        return None
    if source == "wshobson/agents":
        # plugins/<plugin>/agents/<agent>.md — только агенты (скилы/команды не берём)
        if len(parts) == 4 and parts[0] == "plugins" and parts[2] == "agents":
            return parts[1]
        return None
    # agency-agents и подобные: <division>/<agent>.md (допускаем один уровень вложенности)
    if 2 <= len(parts) <= 3:
        return parts[0]
    return None


def _sources_default() -> list[str]:
    return list(DEFAULT_SOURCES)


async def get_sources() -> list[str]:
    raw = (await get_setting("CABINET_SOURCES")) or ""
    try:
        lst = json.loads(raw) if raw else []
    except Exception:  # noqa: BLE001
        lst = []
    lst = [s.strip() for s in lst if isinstance(s, str) and re.match(r"^[\w.-]+/[\w.-]+$", s.strip())]
    return lst or _sources_default()


async def set_sources(sources: list[str]) -> list[str]:
    clean = [s.strip() for s in sources if isinstance(s, str) and re.match(r"^[\w.-]+/[\w.-]+$", s.strip())]
    await set_setting("CABINET_SOURCES", json.dumps(clean))
    return clean or _sources_default()


# ── Бан-лист (решение владельца 2026-10-16): любое подозрение → удалить и не брать снова ──
async def get_banned() -> dict:
    """{"source::slug": "причина"}"""
    try:
        d = json.loads((await get_setting("CABINET_BANNED")) or "{}")
        return d if isinstance(d, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


async def ban(db: AsyncSession, keys: dict) -> dict:
    """keys: {"source::slug": "причина"} → в бан-лист + удалить из шкафчика."""
    banned = await get_banned()
    banned.update({k: str(v)[:300] for k, v in keys.items()})
    await set_setting("CABINET_BANNED", json.dumps(banned, ensure_ascii=False))
    removed = 0
    for k in keys:
        src, _, sl = k.partition("::")
        for t in (await db.execute(select(JinnTemplate).where(JinnTemplate.source == src, JinnTemplate.slug == sl))).scalars():
            await db.delete(t)
            removed += 1
    await db.commit()
    return {"banned": len(keys), "removed": removed, "total_banned": len(banned)}


async def _license(client: httpx.AsyncClient, source: str, headers: dict) -> str:
    try:
        r = await client.get(f"https://api.github.com/repos/{source}", headers=headers)
        if r.status_code == 200:
            return ((r.json().get("license") or {}).get("spdx_id") or "")[:40]
    except Exception:  # noqa: BLE001
        pass
    return ""


async def sync(db: AsyncSession, source: str) -> dict:
    """Скачать репо (tar в память) и обновить заготовки этого источника."""
    source = source.strip()
    if not re.match(r"^[\w.-]+/[\w.-]+$", source):
        return {"ok": False, "error": "источник должен быть вида owner/repo"}
    token = ((await get_setting("GITHUB_TOKEN")) or "").strip()
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "JinnTell-cabinet"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        lic = await _license(client, source, headers)
        r = await client.get(f"https://codeload.github.com/{source}/tar.gz/HEAD", headers={"User-Agent": "JinnTell-cabinet"})
        if r.status_code != 200:
            return {"ok": False, "error": f"GitHub ответил {r.status_code}"}
        blob = r.content
    if len(blob) > 80 * 1024 * 1024:
        return {"ok": False, "error": "архив слишком большой"}

    banned = await get_banned()
    found: dict[str, dict] = {}
    skipped: dict[str, str] = {}
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
        for m in tf.getmembers():
            if not m.isfile() or m.size > _MAX_FILE:
                continue
            rel = m.name.split("/", 1)[1] if "/" in m.name else m.name
            div = _pick(source, rel)
            if div is None:
                continue
            f = tf.extractfile(m)
            if f is None:
                continue
            text = f.read().decode("utf-8", errors="replace")
            meta, body = _frontmatter(text)
            name = (meta.get("name") or "").strip()
            if not name or len(body) < 300:
                continue  # без имени или пустышка — не агент
            slug = _slugify(name)
            if slug in found:
                continue  # дубль (один агент в нескольких плагинах)
            if f"{source}::{slug}" in banned:
                continue
            safety, notes = _safety(text)
            if safety == "flagged":  # подозрение → в бан, не храним
                skipped[f"{source}::{slug}"] = f"фильтр шкафчика: {notes}"
                continue
            found[slug] = {
                "path": rel[:300], "division": div[:80], "name": name[:200],
                "description": (meta.get("description") or "")[:4000],
                "emoji": (meta.get("emoji") or "")[:16], "vibe": (meta.get("vibe") or "")[:1000],
                "body": body, "safety": safety, "safety_notes": notes,
            }

    existing = {t.slug: t for t in (await db.execute(
        select(JinnTemplate).where(JinnTemplate.source == source))).scalars().all()}
    added = updated = 0
    for slug, d in found.items():
        t = existing.get(slug)
        if t is None:
            db.add(JinnTemplate(source=source, license=lic, slug=slug, **d))
            added += 1
        else:
            changed = t.body != d["body"] or t.description != d["description"]
            for k, v in d.items():
                setattr(t, k, v)
            t.license = lic or t.license
            if changed:
                t.summary_ru = ""  # перевести заново
                updated += 1
    # пропавшие из репо — убрать из шкафчика
    gone = [t for sl, t in existing.items() if sl not in found]
    for t in gone:
        await db.delete(t)
    await db.commit()
    if skipped:
        await ban(db, skipped)
    return {"ok": True, "source": source, "license": lic, "total": len(found),
            "added": added, "updated": updated, "removed": len(gone), "banned": len(skipped)}


_TR_SYS = (
    "Ты переводишь каталог ИИ-агентов на русский для витрины. На вход — JSON-список агентов "
    "(id, name, division, description). Верни СТРОГО JSON-список того же размера, без markdown: "
    "[{\"id\": число, \"name_ru\": \"короткое название профессии по-русски (2-5 слов)\", "
    "\"summary_ru\": \"1-2 предложения: чем полезен, для какого бизнеса\", "
    "\"tags_ru\": \"5-8 ключевых слов по-русски через запятую (профессия, отрасль, задачи)\"}]."
)


def _json_list(s: str):
    s = re.sub(r"^```(json)?|```$", "", (s or "").strip()).strip()
    a, b = s.find("["), s.rfind("]")
    if a >= 0 and b > a:
        try:
            return json.loads(s[a:b + 1])
        except Exception:  # noqa: BLE001
            pass
    # фолбэк: список оборван — берём все целые объекты {...}
    out = []
    for m in re.finditer(r"\{[^{}]*\}", s):
        try:
            out.append(json.loads(m.group(0)))
        except Exception:  # noqa: BLE001
            continue
    return out or None


async def translate(db: AsyncSession, limit: int = 600, batch: int = 15) -> dict:
    """Перевести на русский заготовки без summary_ru (для поиска Архитектором по-русски)."""
    from app.services.llm import get_llm_reply
    rows = (await db.execute(select(JinnTemplate).where(
        or_(JinnTemplate.summary_ru == "", JinnTemplate.summary_ru.is_(None))).order_by(JinnTemplate.id).limit(limit))).scalars().all()
    done = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        payload = [{"id": t.id, "name": t.name, "division": t.division, "description": (t.description or t.body[:400])[:500]} for t in chunk]
        try:
            raw = await get_llm_reply(user_message=json.dumps(payload, ensure_ascii=False), system_prompt=_TR_SYS, max_tokens=3000)
        except Exception as e:  # noqa: BLE001
            print(f"[cabinet] translate err: {e}")
            continue
        out = _json_list(raw) or []
        by_id = {t.id: t for t in chunk}
        for o in out:
            try:
                t = by_id.get(int(o.get("id")))
            except Exception:  # noqa: BLE001
                t = None
            if not t:
                continue
            t.name_ru = str(o.get("name_ru") or "")[:200]
            t.summary_ru = str(o.get("summary_ru") or "")[:2000]
            t.tags_ru = str(o.get("tags_ru") or "")[:1000]
            done += 1
        await db.commit()
    left = (await db.execute(select(func.count()).select_from(JinnTemplate).where(
        or_(JinnTemplate.summary_ru == "", JinnTemplate.summary_ru.is_(None))))).scalar() or 0
    return {"translated": done, "left": left}


def card(t: JinnTemplate, full: bool = False) -> dict:
    d = {"id": t.id, "source": t.source, "license": t.license, "division": t.division,
         "name": t.name, "name_ru": t.name_ru, "summary_ru": t.summary_ru, "tags_ru": t.tags_ru,
         "description": t.description, "emoji": t.emoji, "safety": t.safety,
         "safety_notes": t.safety_notes, "adopted_count": t.adopted_count,
         "url": f"https://github.com/{t.source}/blob/HEAD/{t.path}"}
    if full:
        d["vibe"] = t.vibe
        d["body"] = t.body
    return d


async def search(db: AsyncSession, q: str = "", division: str = "", source: str = "",
                 limit: int = 30, offset: int = 0) -> dict:
    stmt = select(JinnTemplate)
    if division:
        stmt = stmt.where(JinnTemplate.division == division)
    if source:
        stmt = stmt.where(JinnTemplate.source == source)
    words = [w for w in re.split(r"[\s,]+", (q or "").strip().lower()) if len(w) >= 2][:6]
    for w in words:
        stem = w[:-2] if len(w) > 6 else w  # грубая основа для русских окончаний
        like = f"%{stem}%"
        stmt = stmt.where(or_(JinnTemplate.name.ilike(like), JinnTemplate.name_ru.ilike(like),
                              JinnTemplate.summary_ru.ilike(like), JinnTemplate.tags_ru.ilike(like),
                              JinnTemplate.description.ilike(like), JinnTemplate.division.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    rows = (await db.execute(stmt.order_by(JinnTemplate.adopted_count.desc(), JinnTemplate.division, JinnTemplate.name)
                             .offset(offset).limit(limit))).scalars().all()
    return {"total": total, "items": [card(t) for t in rows]}


async def stats(db: AsyncSession) -> dict:
    rows = (await db.execute(select(JinnTemplate.source, JinnTemplate.division, func.count())
                             .group_by(JinnTemplate.source, JinnTemplate.division))).all()
    by_src: dict = {}
    for src, div, n in rows:
        s = by_src.setdefault(src, {"total": 0, "divisions": {}})
        s["total"] += n
        s["divisions"][div] = n
    flagged = (await db.execute(select(func.count()).select_from(JinnTemplate).where(JinnTemplate.safety == "flagged"))).scalar() or 0
    untranslated = (await db.execute(select(func.count()).select_from(JinnTemplate).where(
        or_(JinnTemplate.summary_ru == "", JinnTemplate.summary_ru.is_(None))))).scalar() or 0
    last = (await get_setting("CABINET_LAST_SYNC")) or ""
    n_banned = len(await get_banned())
    return {"sources": await get_sources(), "by_source": by_src, "flagged": flagged,
            "untranslated": untranslated, "last_sync": last, "banned": n_banned}


async def adopt(db: AsyncSession, template_id: int, brief: str = "", *, visibility: str = "public",
                agent_type: str = "specialist", is_paid: bool = False, model: Optional[str] = None,
                allow_flagged: bool = False) -> dict:
    """Родить джина из заготовки: готовая персона = основа, наша фабрика адаптирует и проводит рождение."""
    from app.services import jinn_factory
    t = await db.get(JinnTemplate, template_id)
    if not t:
        return {"ok": False, "error": "заготовка не найдена"}
    if t.safety == "flagged" and not allow_flagged:
        return {"ok": False, "error": f"заготовка помечена проверкой безопасности ({t.safety_notes}); нужна ручная проверка в админке"}
    base = {"name": t.name, "description": t.description, "vibe": t.vibe, "body": t.body}
    rep = await jinn_factory.draft(db, brief or f"Джин-профессия по заготовке «{t.name_ru or t.name}»",
                                   visibility=visibility, agent_type=agent_type, is_paid=is_paid,
                                   model=model, base=base)
    if rep.get("ok"):
        t.adopted_count = (t.adopted_count or 0) + 1
        rep["template"] = {"id": t.id, "name": t.name, "name_ru": t.name_ru, "source": t.source}
    return rep
