"""Автопарсинг новостей СПб (Fontanka RSS) в канал джинна «Новости СПб». Без дублей (по guid)."""
import asyncio
import re
from xml.etree import ElementTree as ET

import httpx
from sqlalchemy import select

from app.core.database import async_session
from app.models.channel_post import ChannelPost

NEWS_AGENT_ID = 33  # Новости СПб
SOURCES = [
    "https://www.spb.kp.ru/rss/allsections.xml",
    "https://47news.ru/rss/",
]


async def _fetch(url: str):
    async with httpx.AsyncClient(timeout=20.0, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True) as c:
        r = await c.get(url)
        r.raise_for_status()
        root = ET.fromstring(r.content)
    out = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        desc = (it.findtext("description") or "").strip()
        guid = (it.findtext("guid") or link).strip()
        if not (title and link):
            continue
        desc = re.sub(r"<[^>]+>", "", desc)
        desc = re.sub(r"\s+", " ", desc).strip()[:300]
        out.append({"title": title[:500], "url": link[:1000], "body": desc, "guid": guid[:500]})
    return out[:30]


async def update_news_channel() -> int:
    items = []
    for src in SOURCES:
        try:
            items += await _fetch(src)
        except Exception as e:
            print(f"[news] fetch failed {src}: {e}")
    if not items:
        return 0
    added = 0
    new_items = []
    async with async_session() as db:
        for it in items:
            ex = (await db.execute(select(ChannelPost).where(
                ChannelPost.agent_id == NEWS_AGENT_ID, ChannelPost.guid == it["guid"]
            ))).scalar_one_or_none()
            if ex:
                continue
            db.add(ChannelPost(agent_id=NEWS_AGENT_ID, title=it["title"], body=it["body"], url=it["url"], guid=it["guid"]))
            new_items.append(it)
            added += 1
        if added:
            await db.commit()
    # Память канала: те же новости кладём в RAG агента (с датой), чтобы он МОГ ОТВЕЧАТЬ, а не только постить
    if new_items:
        try:
            from datetime import datetime, timezone
            from app.services import rag as _rag
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            chunks = [{
                "text": f"[{today}] {it['title']}. {it['body']}".strip(),
                "article_number": "",
                "layer": "news",
                "source_title": "Новости СПб",
                "metadata": {"url": it["url"], "guid": it["guid"], "date": today},
            } for it in new_items]
            await _rag.index_chunks(NEWS_AGENT_ID, chunks)
            print(f"[news] indexed {len(chunks)} news chunks into RAG")
        except Exception as e:
            print(f"[news] RAG index failed: {e}")
    print(f"[news] added {added} posts")
    return added


async def news_scheduler():
    """Фоновый цикл: обновляем новости каждые 30 минут."""
    while True:
        try:
            await update_news_channel()
        except Exception as e:
            print(f"[news] scheduler error: {e}")
        await asyncio.sleep(1800)
