"""Движок каналов джиннов — ОДИН для всех (заменил news.py «Новости СПб» и ai_scout.py «Гит»).

Канал = способность любого джинна. Настройка живёт в agents.channel_config (JSON):
  enabled        — включён ли автоканал
  sources        — [{type, url?, query?, label?, limit?}], type:
                   rss         — RSS/Atom-лента сайта (url)
                   github      — поиск новых репозиториев (query, напр. topic:llm; созданы за 7 дней)
                   gh_trending — GitHub Trending за день (query — язык, необязательно)
                   gh_releases — свежие релизы проектов (query: owner/repo через запятую)
                   gh_org_new  — новые репозитории команд (query: организации через запятую)
                   gh_popular  — «классика»: давно популярные и ЖИВЫЕ проекты по теме (query, напр. topic:ai-agents;
                                 ★ > 1000, коммиты за 90 дней); по одной проверенной за выпуск
                   hn | hf | arxiv — Hacker News / HuggingFace trending / arXiv
  interval_min   — как часто выпуск (мин)
  mode           — raw   : каждая находка — отдельный пост «как есть» (как Новости СПб)
                   voice : джинн выбирает лучшее и пересказывает своим голосом (как Гит)
  posts_per_run  — сколько постов за выпуск в режиме voice
  max_raw        — потолок постов за выпуск в режиме raw
  topic_filter   — ключевые слова через запятую (по началу слова); пусто — без фильтра

Выпуск: сбор → тема-фильтр → отсев виденного → GitHub-находки: СКОРОСТЬ роста звёзд + ПРОВЕРКА перед постом
(метаданные + README; отсев заброшенных/пустых) → свежее в RAG джинна → посты в канал.
Избранникам: voice — по посту, raw — ОДНО пачечное уведомление за выпуск.
GitHub API: токен из админки (Интеграции → GITHUB_TOKEN); без токена — урезанный бюджет запросов (лимит GitHub 60/ч).
Состояние: app_settings CHANNEL_LAST_{id}, CHANNEL_SEEN_{id}, GH_STAR_SNAP (снимки звёзд для скорости роста).
"""
import asyncio
import html as _html
import json
import re
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree as ET

import httpx
from sqlalchemy import select

from app.core.database import async_session
from app.models.agent import Agent

SOURCE_TYPES = ("rss", "github", "gh_trending", "gh_releases", "gh_org_new", "gh_popular", "arxiv", "hn", "hf")
_QUERY_REQUIRED = ("github", "gh_releases", "gh_org_new", "gh_popular")
MODES = ("raw", "voice")
DEFAULTS = {"enabled": False, "sources": [], "interval_min": 360, "mode": "voice",
            "posts_per_run": 3, "max_raw": 30, "topic_filter": ""}
_SEEN_MAX = 3000
_SNAP_MAX = 5000
_UA = {"User-Agent": "Mozilla/5.0 (jinntell-channels)"}
_GH_KINDS = ("repo", "agents", "trending")  # GitHub-находки, которые проверяем перед постом (релизы — нет)


# ───────────────────────── конфиг ─────────────────────────
def load_config(agent) -> dict:
    cfg = dict(DEFAULTS)
    try:
        cfg.update(json.loads(getattr(agent, "channel_config", None) or "{}") or {})
    except Exception:  # noqa: BLE001
        pass
    return cfg


def clean_config(raw: dict) -> dict:
    """Проверка и нормализация конфига из админки."""
    cfg = dict(DEFAULTS)
    cfg["enabled"] = bool(raw.get("enabled"))
    mode = (raw.get("mode") or "voice").strip()
    cfg["mode"] = mode if mode in MODES else "voice"
    cfg["interval_min"] = max(15, min(int(raw.get("interval_min") or 360), 7 * 24 * 60))
    cfg["posts_per_run"] = max(1, min(int(raw.get("posts_per_run") or 3), 10))
    cfg["max_raw"] = max(1, min(int(raw.get("max_raw") or 30), 50))
    cfg["topic_filter"] = (raw.get("topic_filter") or "").strip()[:500]
    srcs = []
    for s in (raw.get("sources") or [])[:25]:
        t = (s.get("type") or "").strip()
        if t not in SOURCE_TYPES:
            continue
        item = {"type": t, "label": (s.get("label") or "").strip()[:60]}
        if t == "rss":
            url = (s.get("url") or "").strip()
            if not url.startswith(("http://", "https://")):
                continue
            item["url"] = url[:500]
        if t in ("github", "hn", "gh_trending", "gh_releases", "gh_org_new", "gh_popular"):
            q = (s.get("query") or "").strip()[:1000]
            if t in _QUERY_REQUIRED and not q:
                continue
            item["query"] = q
        if s.get("limit"):
            item["limit"] = max(1, min(int(s["limit"]), 30))
        srcs.append(item)
    cfg["sources"] = srcs
    return cfg


# ───────────────────────── GitHub-клиент ─────────────────────────
class GH:
    """GitHub API с токеном из админки и бюджетом запросов на выпуск (чтобы не упереться в лимит)."""

    def __init__(self, token: str, budget: int):
        self.token = token
        self.budget = budget
        self.used = 0

    def _h(self, raw: bool = False) -> dict:
        h = {**_UA, "Accept": "application/vnd.github.raw" if raw else "application/vnd.github+json",
             "X-GitHub-Api-Version": "2022-11-28"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    async def get(self, c, path: str, raw: bool = False, **params):
        if self.used >= self.budget:
            return None
        self.used += 1
        r = await c.get(f"https://api.github.com{path}", headers=self._h(raw), params=params or None)
        if r.status_code == 404:
            return None
        if r.status_code in (403, 429):
            print(f"[channel] GitHub лимит/доступ {r.status_code} на {path} — останавливаю GitHub-запросы этого выпуска")
            self.used = self.budget
            return None
        r.raise_for_status()
        return r.text if raw else r.json()


async def gh_client(budget_token: int = 200, budget_anon: int = 30) -> GH:
    from app.services.settings_store import get_setting
    token = ((await get_setting("GITHUB_TOKEN")) or "").strip()
    return GH(token, budget_token if token else budget_anon)


def _gh_meta(full: str, stars, created=None, pushed=None, today=None) -> dict:
    return {"full": full, "stars": int(stars or 0), "created": created, "pushed": pushed, "today": today}


# ───────────────────────── источники ─────────────────────────
async def _rss(c, src: dict, gh: GH) -> list:
    r = await c.get(src["url"], headers=_UA)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    atom = "{http://www.w3.org/2005/Atom}"
    nodes = list(root.iter("item")) or list(root.iter(atom + "entry"))
    label = src.get("label") or ""
    out = []
    for it in nodes[: src.get("limit", 30)]:
        title = (it.findtext("title") or it.findtext(atom + "title") or "").strip()
        link = (it.findtext("link") or "").strip()
        if not link:
            le = it.find(atom + "link")
            link = (le.get("href") if le is not None else "") or ""
        desc = it.findtext("description") or it.findtext(atom + "summary") or it.findtext(atom + "content") or ""
        desc = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", desc)).strip()[:300]
        if title and link:
            out.append({"kind": "news", "title": title[:500], "url": link[:1000], "body": desc, "source": label})
    return out


async def _github(c, src: dict, gh: GH) -> list:
    since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    data = await gh.get(c, "/search/repositories", q=f"{src['query']} created:>{since}",
                        sort="stars", order="desc", per_page=src.get("limit", 8))
    kind = "agents" if "agent" in src["query"] else "repo"
    out = []
    for i in (data or {}).get("items") or []:
        out.append({"kind": kind, "title": i.get("full_name", ""), "url": i.get("html_url", ""),
                    "body": f"★{i.get('stargazers_count', 0)} · {(i.get('description') or '')[:240]}",
                    "source": src.get("label") or "GitHub",
                    "gh": _gh_meta(i.get("full_name", ""), i.get("stargazers_count"), i.get("created_at"), i.get("pushed_at"))})
    return out


def _num(s: str) -> int:
    try:
        return int((s or "0").replace(",", "").strip())
    except ValueError:
        return 0


async def _gh_trending(c, src: dict, gh: GH) -> list:
    """GitHub Trending за день (HTML-страница: у неё нет официального API)."""
    lang = (src.get("query") or "").strip().lower().replace(" ", "-")
    url = f"https://github.com/trending/{lang}?since=daily" if lang else "https://github.com/trending?since=daily"
    r = await c.get(url, headers=_UA)
    r.raise_for_status()
    out = []
    for a in r.text.split('<article class="Box-row">')[1: 1 + src.get("limit", 15)]:
        h = re.search(r'<h2[^>]*>.*?href="/([^"/]+/[^"/]+)"', a, re.S)
        if not h:
            continue
        full = h.group(1)
        d = re.search(r'<p class="col-9[^"]*">(.*?)</p>', a, re.S)
        desc = _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", d.group(1)))).strip() if d else ""
        today = re.search(r"([\d,]+) stars? today", a)
        total = re.search(r'/stargazers"[^>]*>.*?</svg>\s*([\d,]+)\s*</a>', a, re.S)
        lng = re.search(r'itemprop="programmingLanguage">([^<]+)<', a)
        t_n, s_n = _num(today.group(1)) if today else 0, _num(total.group(1)) if total else 0
        out.append({"kind": "trending", "title": full, "url": f"https://github.com/{full}",
                    "body": f"Trending: +{t_n}★ за день, всего ★{s_n}" + (f" · {lng.group(1).strip()}" if lng else "")
                            + (f" · {desc[:220]}" if desc else ""),
                    "source": src.get("label") or "GitHub Trending",
                    "gh": _gh_meta(full, s_n, today=t_n)})
    return out


def _split_list(q: str) -> list:
    return [x.strip().strip("/") for x in re.split(r"[,\s]+", q or "") if x.strip()]


async def _gh_releases(c, src: dict, gh: GH) -> list:
    """Свежие релизы проектов из списка (owner/repo) — за 3 дня."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=3)
    out = []
    for full in _split_list(src.get("query", ""))[:40]:
        if "/" not in full:
            continue
        rels = await gh.get(c, f"/repos/{full}/releases", per_page=2)
        for rel in rels or []:
            if rel.get("draft") or not rel.get("published_at"):
                continue
            if datetime.fromisoformat(rel["published_at"].replace("Z", "+00:00")) < cutoff:
                continue
            notes = re.sub(r"\s+", " ", re.sub(r"[#*`>\[\]]", " ", rel.get("body") or "")).strip()[:300]
            name = rel.get("name") or rel.get("tag_name") or ""
            out.append({"kind": "release", "title": f"{full} — релиз {name}".strip(), "url": rel.get("html_url", ""),
                        "body": ("пре-релиз · " if rel.get("prerelease") else "") + (notes or "без описания"),
                        "source": src.get("label") or "Релизы"})
    return out


async def _gh_org_new(c, src: dict, gh: GH) -> list:
    """Новые репозитории ключевых команд (организаций) — за 14 дней, без форков."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    out = []
    for org in _split_list(src.get("query", ""))[:30]:
        repos = await gh.get(c, f"/orgs/{org}/repos", sort="created", direction="desc", per_page=5)
        if repos is None:  # не организация — пробуем как пользователя
            repos = await gh.get(c, f"/users/{org}/repos", sort="created", direction="desc", per_page=5)
        for i in repos or []:
            if i.get("fork") or not i.get("created_at"):
                continue
            if datetime.fromisoformat(i["created_at"].replace("Z", "+00:00")) < cutoff:
                continue
            out.append({"kind": "repo", "title": i.get("full_name", ""), "url": i.get("html_url", ""),
                        "body": f"новый репозиторий команды {org} · ★{i.get('stargazers_count', 0)} · {(i.get('description') or '')[:220]}",
                        "source": src.get("label") or f"GitHub · {org}",
                        "gh": _gh_meta(i.get("full_name", ""), i.get("stargazers_count"), i.get("created_at"), i.get("pushed_at"))})
    return out


async def _gh_popular(c, src: dict, gh: GH) -> list:
    """«Классика»: давно популярные и живые проекты по теме (★>1000, коммиты за 90 дней), по убыванию звёзд."""
    active = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%d")
    data = await gh.get(c, "/search/repositories", q=f"{src['query']} stars:>1000 pushed:>{active}",
                        sort="stars", order="desc", per_page=src.get("limit", 15))
    out = []
    for i in (data or {}).get("items") or []:
        out.append({"kind": "classic", "title": i.get("full_name", ""), "url": i.get("html_url", ""),
                    "body": f"классика: ★{i.get('stargazers_count', 0)} · {(i.get('description') or '')[:240]}",
                    "source": src.get("label") or "GitHub · классика",
                    "gh": _gh_meta(i.get("full_name", ""), i.get("stargazers_count"), i.get("created_at"), i.get("pushed_at"))})
    return out


async def _arxiv(c, src: dict, gh: GH) -> list:
    n = src.get("limit", 6)
    url = ("https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL"
           f"&sortBy=submittedDate&sortOrder=descending&max_results={n}")
    r = await c.get(url, headers=_UA)
    r.raise_for_status()
    ns = {"a": "http://www.w3.org/2005/Atom"}
    out = []
    for e in ET.fromstring(r.content).findall("a:entry", ns):
        title = re.sub(r"\s+", " ", e.findtext("a:title", "", ns) or "").strip()
        link = (e.findtext("a:id", "", ns) or "").strip()
        summ = re.sub(r"\s+", " ", e.findtext("a:summary", "", ns) or "").strip()[:260]
        if title and link:
            out.append({"kind": "paper", "title": title, "url": link, "body": summ, "source": "arXiv"})
    return out


async def _hn(c, src: dict, gh: GH) -> list:
    ts = int((datetime.now(timezone.utc) - timedelta(days=1)).timestamp())
    q = src.get("query") or "AI OR LLM OR agent"
    r = await c.get("https://hn.algolia.com/api/v1/search", headers=_UA, params={
        "query": q, "tags": "story", "numericFilters": f"created_at_i>{ts},points>40",
        "hitsPerPage": src.get("limit", 10)})
    r.raise_for_status()
    out = []
    for h in r.json().get("hits") or []:
        u = h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}"
        out.append({"kind": "hn", "title": h.get("title", ""), "url": u,
                    "body": f"Hacker News · {h.get('points', 0)} pts", "source": "Hacker News"})
    return out


async def _hf(c, src: dict, gh: GH) -> list:
    r = await c.get(f"https://huggingface.co/api/models?sort=trendingScore&limit={src.get('limit', 8)}", headers=_UA)
    r.raise_for_status()
    out = []
    for m in r.json() or []:
        mid = m.get("id") or m.get("modelId") or ""
        if mid:
            out.append({"kind": "model", "title": mid, "url": f"https://huggingface.co/{mid}",
                        "body": f"{m.get('pipeline_tag') or ''} · ♥{m.get('likes', 0)} · ↓{m.get('downloads', 0)}",
                        "source": "HuggingFace"})
    return out


_FETCH = {"rss": _rss, "github": _github, "gh_trending": _gh_trending, "gh_releases": _gh_releases,
          "gh_org_new": _gh_org_new, "gh_popular": _gh_popular, "arxiv": _arxiv, "hn": _hn, "hf": _hf}


async def fetch_source(src: dict, gh: GH | None = None) -> list:
    gh = gh or await gh_client(budget_token=60, budget_anon=15)
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as c:
        items = await _FETCH[src["type"]](c, src, gh)
    return [i for i in items if i.get("title") and i.get("url")]


async def collect(sources: list, gh: GH) -> list:
    items = []
    for src in sources:
        try:
            items += await fetch_source(src, gh)
        except Exception as e:  # noqa: BLE001
            print(f"[channel] source {src.get('type')} {src.get('url') or src.get('query') or ''} failed: {e}")
    return items


def _topic_match(items: list, topic_filter: str) -> list:
    kws = [k.strip().lower() for k in (topic_filter or "").split(",") if k.strip()]
    if not kws:
        return items
    pats = [re.compile(r"(?<!\w)" + re.escape(k), re.I) for k in kws]
    return [i for i in items if any(p.search(f"{i['title']} {i.get('body', '')}") for p in pats)]


# ───────────────────────── скорость роста звёзд ─────────────────────────
def _parse_dt(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")) if s else None
    except ValueError:
        return None


async def _star_velocity(items: list) -> None:
    """Оценка «звёзд в день» для GitHub-находок: по своему прошлому снимку (если есть), иначе по Trending
    («за сегодня»), иначе звёзды / возраст. Снимки обновляем ~раз в сутки — это база для следующих замеров."""
    from app.services.settings_store import get_setting, set_setting
    try:
        snaps = json.loads((await get_setting("GH_STAR_SNAP")) or "{}")
    except Exception:  # noqa: BLE001
        snaps = {}
    now = datetime.now(timezone.utc).timestamp()
    for it in items:
        g = it.get("gh")
        if not g or not g.get("full"):
            continue
        full, stars = g["full"], g.get("stars", 0)
        prev = snaps.get(full)
        if prev and now - prev[0] >= 3 * 3600:
            vel = (stars - prev[1]) / ((now - prev[0]) / 86400)
        elif g.get("today"):
            vel = float(g["today"])
        else:
            cr = _parse_dt(g.get("created"))
            age = max(((datetime.now(timezone.utc) - cr).total_seconds() / 86400) if cr else 30.0, 1.0)
            vel = stars / age
        it["vel"] = max(vel, 0.0)
        if not prev or now - prev[0] >= 20 * 3600:
            snaps[full] = [now, stars]
    if len(snaps) > _SNAP_MAX:
        snaps = dict(sorted(snaps.items(), key=lambda kv: kv[1][0])[-_SNAP_MAX:])
    await set_setting("GH_STAR_SNAP", json.dumps(snaps))


# ───────────────────────── проверка перед постом ─────────────────────────
def _readme_text(md: str) -> str:
    t = re.sub(r"```.*?```", " ", md or "", flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)          # картинки/бейджи
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)       # ссылки → текст
    t = re.sub(r"[#*_>|`]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


async def _vet(items: list, gh: GH, k: int) -> None:
    """Как блогер: открыть проект перед рассказом. Берём K самых быстрорастущих GitHub-находок,
    читаем метаданные и README; отсеиваем архивные, заброшенные (>90 дн без коммитов) и пустые.
    vet: ok | rejected | later (не дошла очередь/бюджет — вернёмся в следующий выпуск)."""
    cands = sorted([i for i in items if i.get("gh") and i["kind"] in _GH_KINDS],
                   key=lambda i: i.get("vel", 0), reverse=True)
    # «классика» — своя очередь: за выпуск проверяем одну (самую звёздную), остальные ждут следующих выпусков
    classics = sorted([i for i in items if i["kind"] == "classic"], key=lambda i: i["gh"].get("stars", 0), reverse=True)
    for it in classics[1:]:
        it["vet"] = "later"
    queue = classics[:1] + cands
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as c:
        for n, it in enumerate(queue):
            if n >= k + len(classics[:1]):
                it["vet"] = "later"
                continue
            full = it["gh"]["full"]
            try:
                meta = await gh.get(c, f"/repos/{full}")
                if meta is None:
                    it["vet"] = "later" if gh.used >= gh.budget else "rejected"
                    continue
                pushed = _parse_dt(meta.get("pushed_at"))
                stale = (datetime.now(timezone.utc) - pushed).days if pushed else 999
                if meta.get("archived") or meta.get("disabled") or stale > 90:
                    it["vet"] = "rejected"
                    continue
                readme = await gh.get(c, f"/repos/{full}/readme", raw=True)
                text = _readme_text(readme or "")
                if len(text) < 300:
                    it["vet"] = "rejected"
                    continue
                lic = ((meta.get("license") or {}).get("spdx_id") or "нет").replace("NOASSERTION", "своя")
                topics = ", ".join((meta.get("topics") or [])[:6])
                it["detail"] = (
                    f"ПРОВЕРЕНО: ★{meta.get('stargazers_count', 0)} (≈+{it.get('vel', 0):.0f}★/день), "
                    f"форков {meta.get('forks_count', 0)}, последний коммит {stale} дн. назад, лицензия {lic}, "
                    f"язык {meta.get('language') or '—'}" + (f", темы: {topics}" if topics else "")
                    + f". Описание: {(meta.get('description') or '')[:200]}. README: {text[:700]}")
                it["vet"] = "ok"
            except Exception as e:  # noqa: BLE001
                print(f"[channel] vet {full} failed: {e}")
                it["vet"] = "later"


# ───────────────────────── состояние ─────────────────────────
async def _get_seen(agent_id: int) -> list:
    from app.services.settings_store import get_setting
    try:
        return json.loads((await get_setting(f"CHANNEL_SEEN_{agent_id}")) or "[]")
    except Exception:  # noqa: BLE001
        return []


async def _save_seen(agent_id: int, seen: list) -> None:
    from app.services.settings_store import set_setting
    await set_setting(f"CHANNEL_SEEN_{agent_id}", json.dumps(seen[-_SEEN_MAX:], ensure_ascii=False))


async def last_run(agent_id: int):
    from app.services.settings_store import get_setting
    v = await get_setting(f"CHANNEL_LAST_{agent_id}")
    try:
        return datetime.fromisoformat(v) if v else None
    except Exception:  # noqa: BLE001
        return None


# ───────────────────────── публикация ─────────────────────────
async def _publish_raw(agent, items: list) -> list:
    """Режим «как есть»: пост на каждую находку + ОДНО пачечное уведомление избранникам за выпуск."""
    from app.models.channel_post import ChannelPost
    from app.models.feed import FeedEvent
    from app.models.user_favorite import UserFavorite
    from app.services.targeting import index_post
    internal = getattr(agent, "visibility", "") == "core"
    async with async_session() as db:
        posts = [ChannelPost(agent_id=agent.id, title=i["title"][:500], body=i.get("body") or None,
                             url=i["url"][:1000], guid=i["url"][:500]) for i in items]
        db.add_all(posts)
        await db.commit()
        for p in posts:
            await db.refresh(p)
        if not internal and posts:
            n = len(posts)
            title = posts[0].title[:200] if n == 1 else f"{agent.name}: {n} новых постов"
            favs = (await db.execute(select(UserFavorite.user_id).where(UserFavorite.agent_id == agent.id))).scalars().all()
            for uid in favs[:500]:
                db.add(FeedEvent(user_id=uid, title=title, kind="channel", icon="\U0001F4E2",
                                 body=(posts[0].title if n > 1 else (posts[0].body or ""))[:160] or None,
                                 agent_id=agent.id, link_room=f"agent-{agent.id}-u{uid}"))
            if favs:
                await db.commit()
        ids = [(p.id, f"{p.title}. {p.body or ''}") for p in posts]
    if not internal:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for pid, txt in ids:
            try:
                await index_post(pid, agent.id, txt, today)
            except Exception as e:  # noqa: BLE001
                print(f"[channel] targeting index failed: {e}")
    return [pid for pid, _ in ids]


_VOICE_SYS = (
    "Ты — {name}, {profession}, житель Города JinnTell. {description}\n"
    "Ты ведёшь свой канал для жителей Города{topic}. Тебе дают список свежих материалов. "
    "Выбери {n} САМЫХ интересных для жителей (разных, ярких, полезных) и для каждого напиши пост на русском своим "
    "живым голосом: что это простыми словами, кому и чем пригодится, почему это интересно сейчас. "
    "У проектов GitHub с пометкой ПРОВЕРЕНО опирайся на README и факты проверки (рост звёзд, свежесть, лицензия); "
    "быстрый рост звёзд — повод упомянуть, что проект «выстрелил». Релизы — что нового в версии. "
    "Если в списке есть [classic] с пометкой ПРОВЕРЕНО — ОДИН из постов посвяти ей в рубрике «Классика» "
    "(давно известное и проверенное решение: что умеет и кому пригодится). "
    "Только факты из списка, ничего не выдумывай. Ссылку бери ТОЧНО из списка.\n"
    "Формат строго так, для каждого поста:\n"
    "===\nЗАГОЛОВОК: короткий цепляющий заголовок (можно с эмодзи)\nТЕКСТ: 2–4 предложения\nССЫЛКА: url из списка\n"
)


def _parse_posts(raw: str, urls: set) -> list:
    """Разобрать ответ модели на посты; пропускаются только ссылки ИЗ списка находок (анти-выдумка)."""
    posts = []
    for block in re.split(r"^\s*===\s*$", raw or "", flags=re.M):
        t = re.search(r"ЗАГОЛОВОК:\s*(.+)", block)
        b = re.search(r"ТЕКСТ:\s*(.+?)(?=\n\s*ССЫЛКА:|\Z)", block, re.S)
        u = re.search(r"ССЫЛКА:\s*(\S+)", block)
        if not (t and b and u):
            continue
        url = u.group(1).strip().strip("<>").rstrip(").,")
        if url not in urls:
            continue
        posts.append({"title": t.group(1).strip()[:200], "body": b.group(1).strip(), "url": url})
    return posts


async def _publish_voice(agent, items: list, n: int, topic_filter: str) -> list:
    from app.services.llm import get_llm_reply
    from app.services.targeting import publish_post
    # сначала проверенные GitHub-проекты и релизы (самое ценное), потом остальное
    items = sorted(items, key=lambda i: (0 if i.get("vet") == "ok" or i["kind"] == "release" else 1, -i.get("vel", 0)))
    items = [i for i in items if i["kind"] != "classic" or i.get("vet") == "ok"]  # непроверенную классику не предлагаем
    lines = []
    for i in items[:60]:
        info = i.get("detail") or i.get("body", "")
        lines.append(f"- [{i['kind']}] {i['title']}" + (f" ({i['source']})" if i.get("source") else "")
                     + f" — {info[:900]} ({i['url']})")
    sysp = _VOICE_SYS.format(name=agent.name, profession=agent.profession or "житель",
                             description=(agent.description or "").strip(), n=n,
                             topic=(f" (тема: {topic_filter})" if topic_filter else ""))
    raw = await get_llm_reply(user_message="Свежие материалы:\n" + "\n".join(lines), system_prompt=sysp,
                              model=agent.llm_model or "deepseek-chat", max_tokens=3000)
    ids = []
    for p in _parse_posts(raw, {i["url"] for i in items})[:n]:
        try:
            ids.append(await publish_post(agent.id, p["title"], p["body"], p["url"]))
        except Exception as e:  # noqa: BLE001
            print(f"[channel] publish failed: {e}")
    return ids


# ───────────────────────── выпуск ─────────────────────────
async def run_agent(agent_id: int, force: bool = False) -> dict:
    from app.services.settings_store import set_setting
    async with async_session() as db:
        agent = await db.get(Agent, agent_id)
    if not agent or not agent.is_active:
        return {"ok": False, "error": "джинн не найден"}
    cfg = load_config(agent)
    if not cfg["sources"]:
        return {"ok": False, "error": "у канала нет источников"}
    if not force:
        if not cfg["enabled"]:
            return {"ok": True, "skipped": "выключен"}
        lr = await last_run(agent_id)
        if lr and datetime.now(timezone.utc) - lr < timedelta(minutes=cfg["interval_min"]):
            return {"ok": True, "skipped": "рано"}

    await set_setting(f"CHANNEL_LAST_{agent_id}", datetime.now(timezone.utc).isoformat())
    gh = await gh_client()
    items = _topic_match(await collect(cfg["sources"], gh), cfg["topic_filter"])
    seen = await _get_seen(agent_id)
    seen_set = set(seen)
    fresh, batch_urls = [], set()
    for i in items:
        if i["url"] in seen_set or i["url"] in batch_urls:
            continue
        batch_urls.add(i["url"])
        fresh.append(i)
    if not fresh:
        return {"ok": True, "fresh": 0, "post_ids": [], "gh_calls": gh.used, "gh_token": bool(gh.token)}

    # GitHub: скорость роста звёзд + проверка перед постом (только в режиме voice — там джинн выбирает и рассказывает)
    if cfg["mode"] == "voice" and any(i.get("gh") for i in fresh):
        await _star_velocity(fresh)
        await _vet(fresh, gh, k=15 if gh.token else 6)
    usable = [i for i in fresh if i.get("vet") not in ("rejected", "later")]
    done = [i for i in fresh if i.get("vet") != "later"]  # «later» — вернёмся в следующий выпуск

    # память джинна: всё рассмотренное — в его RAG с датой
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        from app.services import rag as _rag
        await _rag.index_chunks(agent.id, [{
            "text": f"[{today}] {i['title']}. {(i.get('detail') or i.get('body', ''))[:900]} {i['url']}".strip(),
            "article_number": "", "layer": "news", "source_title": i.get("source") or agent.name,
            "metadata": {"url": i["url"], "kind": i["kind"], "date": today},
        } for i in done])
    except Exception as e:  # noqa: BLE001
        print(f"[channel] RAG index failed for {agent_id}: {e}")

    if cfg["mode"] == "raw":
        ids = await _publish_raw(agent, usable[: cfg["max_raw"]])
    else:
        ids = await _publish_voice(agent, usable, cfg["posts_per_run"], cfg["topic_filter"])

    await _save_seen(agent_id, seen + [i["url"] for i in done])
    vet_ok = sum(1 for i in fresh if i.get("vet") == "ok")
    vet_rej = sum(1 for i in fresh if i.get("vet") == "rejected")
    print(f"[channel] #{agent_id} {cfg['mode']} fresh={len(fresh)} vetted={vet_ok} rejected={vet_rej} "
          f"posts={len(ids)} gh_calls={gh.used} token={bool(gh.token)}")
    return {"ok": True, "fresh": len(fresh), "vetted": vet_ok, "rejected": vet_rej, "post_ids": ids,
            "gh_calls": gh.used, "gh_token": bool(gh.token)}


async def channel_scheduler():
    """Фон: раз в 5 минут обходим джиннов с настроенным каналом и выпускаем тех, кому пора."""
    await asyncio.sleep(90)
    while True:
        try:
            async with async_session() as db:
                ids = (await db.execute(select(Agent.id).where(
                    Agent.channel_config.isnot(None), Agent.is_active == True))).scalars().all()  # noqa: E712
            for aid in ids:
                try:
                    await run_agent(aid)
                except Exception as e:  # noqa: BLE001
                    print(f"[channel] run #{aid} error: {e}")
        except Exception as e:  # noqa: BLE001
            print(f"[channel] scheduler error: {e}")
        await asyncio.sleep(300)
