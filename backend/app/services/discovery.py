"""Семантический поиск джиннов (Discovery 2) — одна коллекция Qdrant для всего Города."""
from typing import List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.agent import Agent
from app.services.embedding import get_embedding, get_embeddings, get_embedding_dimensions
from app.services.rag import _qdrant_request


def _collection() -> str:
    return f"{settings.QDRANT_COLLECTION_PREFIX}_agents_discovery"


def _agent_text(a: Agent) -> str:
    parts = [a.name, a.profession, a.brand or "", a.description or "", a.skills_text or ""]
    return ". ".join(p.strip() for p in parts if p and p.strip())


async def ensure_collection() -> bool:
    name = _collection()
    dims = await get_embedding_dimensions()
    result = await _qdrant_request("GET", f"/collections/{name}")
    if result.get("status") != "not_found" and "result" in result:
        return True
    result = await _qdrant_request("PUT", f"/collections/{name}", {
        "vectors": {"size": dims, "distance": "Cosine"},
    })
    ok = result.get("status") != "error"
    if ok:
        print(f"[discovery] Created collection {name} (dims={dims})")
    return ok


async def index_agents(agents: List[Agent]) -> int:
    """Проиндексировать список джиннов (id точки = id джинна)."""
    if not agents:
        return 0
    await ensure_collection()
    name = _collection()
    total = 0
    batch = 40
    for i in range(0, len(agents), batch):
        chunk = agents[i:i + batch]
        texts = [_agent_text(a) for a in chunk]
        embeddings = await get_embeddings(texts)
        points = []
        for a, emb in zip(chunk, embeddings):
            points.append({
                "id": a.id,
                "vector": emb,
                "payload": {
                    "agent_id": a.id,
                    "agent_type": a.agent_type,
                    "visibility": a.visibility,
                    "name": a.name,
                },
            })
        result = await _qdrant_request("PUT", f"/collections/{name}/points", {"points": points})
        if result.get("status") != "error":
            total += len(points)
    print(f"[discovery] Indexed {total} agents")
    return total


async def reindex_all(db: AsyncSession) -> int:
    """Переиндексировать всех активных джиннов Города (кроме core)."""
    result = await db.execute(
        select(Agent).where(Agent.is_active == True, Agent.visibility != "core")
    )
    agents = list(result.scalars().all())
    # Пересоздаём коллекцию для чистоты
    await _qdrant_request("DELETE", f"/collections/{_collection()}")
    return await index_agents(agents)


async def index_one(agent: Agent) -> None:
    """Индексировать/обновить одного джинна (при create/update)."""
    if not agent.is_active or agent.visibility == "core":
        await remove_one(agent.id)
        return
    await index_agents([agent])


async def remove_one(agent_id: int) -> None:
    name = _collection()
    await _qdrant_request("POST", f"/collections/{name}/points/delete", {"points": [agent_id]})


async def discover(query: str, limit: int = 20) -> List[Tuple[int, float]]:
    """Семантический поиск: вернуть [(agent_id, score)] по убыванию релевантности."""
    q = (query or "").strip()
    if not q:
        return []
    name = _collection()
    exists = await _qdrant_request("GET", f"/collections/{name}")
    if exists.get("status") == "not_found":
        return []
    emb = await get_embedding(q)
    body = {"vector": emb, "limit": limit, "with_payload": True}
    result = await _qdrant_request("POST", f"/collections/{name}/points/search", body)
    hits = result.get("result") or []
    out: List[Tuple[int, float]] = []
    for h in hits:
        payload = h.get("payload") or {}
        aid = payload.get("agent_id") or h.get("id")
        if aid is not None:
            out.append((int(aid), float(h.get("score", 0))))
    return out
