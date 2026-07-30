"""Движок таргетинга + барьер: посты джиннов ↔ интересы пользователя.
Fan-out-on-read: посты индексируются в Qdrant; при чтении матчим интересы пользователя.
Барьер: уважает согласие пользователя (настройки действий)."""
import json

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session
from app.models.agent import Agent
from app.models.channel_post import ChannelPost
from app.models.user import User
from app.services.embedding import get_embedding, get_embedding_dimensions
from app.services.rag import _qdrant_request


def _collection() -> str:
    return f"{settings.QDRANT_COLLECTION_PREFIX}_channel_posts"


async def ensure() -> bool:
    name = _collection()
    res = await _qdrant_request("GET", f"/collections/{name}")
    if res.get("status") != "not_found" and "result" in res:
        return True
    dims = await get_embedding_dimensions()
    r = await _qdrant_request("PUT", f"/collections/{name}", {"vectors": {"size": dims, "distance": "Cosine"}})
    return r.get("status") != "error"


async def index_post(post_id: int, agent_id: int, text: str, date: str = "") -> bool:
    """Проиндексировать пост джинна в общий индекс постов (для таргетинга)."""
    emb = await get_embedding((text or "")[:2000])
    if not emb:
        return False
    await ensure()
    r = await _qdrant_request("PUT", f"/collections/{_collection()}/points", {
        "points": [{"id": post_id, "vector": emb, "payload": {"post_id": post_id, "agent_id": agent_id, "date": date}}],
    })
    return r.get("status") != "error"


def _consent(user: User) -> dict:
    defaults = {"approaches": "all", "allow_promo": True}
    try:
        d = json.loads(user.action_settings) if user and user.action_settings else {}
    except Exception:
        d = {}
    return {"approaches": d.get("approaches", "all"), "allow_promo": d.get("allow_promo", True)}


async def match_for_user(user_id: int, top_k: int = 8, min_score: float = 0.35) -> dict:
    """Подобрать посты джиннов под интересы пользователя (с барьером).
    Возвращает {ok, reason, posts:[{post_id,agent_id,agent_name,title,body,url,score}]}."""
    async with async_session() as db:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not u:
        return {"ok": False, "reason": "no_user", "posts": []}
    # барьер: согласие пользователя
    cons = _consent(u)
    if cons["approaches"] == "off":
        return {"ok": False, "reason": "approaches_off", "posts": []}
    # интересы
    try:
        interests = json.loads(u.assistant_interests or "[]")
    except Exception:
        interests = []
    if not interests:
        return {"ok": False, "reason": "no_interests", "posts": []}
    # вектор интересов → поиск по постам
    q = ", ".join(interests)
    emb = await get_embedding(q)
    if not emb:
        return {"ok": False, "reason": "no_embedding", "posts": []}
    name = _collection()
    chk = await _qdrant_request("GET", f"/collections/{name}")
    if chk.get("status") == "not_found":
        return {"ok": True, "reason": "empty_index", "posts": []}
    res = await _qdrant_request("POST", f"/collections/{name}/points/search", {
        "vector": emb, "limit": max(top_k * 3, 20), "with_payload": True, "score_threshold": min_score,
    })
    if res.get("status") == "error" or "result" not in res:
        return {"ok": True, "reason": "search_error", "posts": []}
    hits = [(p.get("payload", {}).get("post_id"), float(p.get("score", 0.0))) for p in res["result"]]
    hits = [(pid, sc) for pid, sc in hits if pid]
    if not hits:
        return {"ok": True, "reason": "no_match", "posts": []}
    ids = [pid for pid, _ in hits]
    score_by = {pid: sc for pid, sc in hits}
    async with async_session() as db:
        rows = (await db.execute(select(ChannelPost).where(ChannelPost.id.in_(ids)))).scalars().all()
        agent_ids = {r.agent_id for r in rows}
        agents = {a.id: a.name for a in (await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))).scalars().all()}
    posts = [{
        "post_id": r.id, "agent_id": r.agent_id, "agent_name": agents.get(r.agent_id, ""),
        "title": r.title, "body": r.body or "", "url": r.url or "", "score": round(score_by.get(r.id, 0.0), 3),
    } for r in rows]
    posts.sort(key=lambda x: x["score"], reverse=True)
    return {"ok": True, "reason": "", "posts": posts[:top_k]}
