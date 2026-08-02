"""Q&A-кэш джинна — ВТОРАЯ память (отдельно от knowledge-RAG).
Похожий вопрос уже задавали → берём готовый ответ, не генерим заново.
Экономит токены/время для джиннов-консультантов. Анти-устаревание: свежесть по дате.
См. [[design_data_and_memory_layers]]."""
import uuid
from datetime import datetime, timezone

from app.core.config import settings
from app.services.embedding import get_embedding, get_embedding_dimensions
from app.services.rag import _qdrant_request  # переиспользуем HTTP-хелпер Qdrant

MAX_AGE_DAYS = 14          # старше — не переиспользуем (знания могли обновиться)
DEFAULT_THRESHOLD = 0.86   # калибровано на Yandex-256: перефразы 0.887-0.912, чужие вопросы <0.4 — 0.86 их разделяет


def _qa_collection(agent_id: int) -> str:
    return f"{settings.QDRANT_COLLECTION_PREFIX}_qa_agent_{agent_id}"


async def _ensure(agent_id: int) -> bool:
    name = _qa_collection(agent_id)
    res = await _qdrant_request("GET", f"/collections/{name}")
    if res.get("status") != "not_found" and "result" in res:
        return True
    dims = await get_embedding_dimensions()
    r = await _qdrant_request("PUT", f"/collections/{name}", {"vectors": {"size": dims, "distance": "Cosine"}})
    return r.get("status") != "error"


async def lookup(agent_id: int, question: str, threshold: float = DEFAULT_THRESHOLD):
    """Очень похожий СВЕЖИЙ вопрос? → {answer, question, date, score}. Иначе None. Fail-soft."""
    q = (question or "").strip()
    if not q:
        return None
    try:
        name = _qa_collection(agent_id)
        res = await _qdrant_request("GET", f"/collections/{name}")
        if res.get("status") == "not_found":
            return None
        vec = await get_embedding(q)
        if not vec:
            return None
        r = await _qdrant_request("POST", f"/collections/{name}/points/search",
                                  {"vector": vec, "limit": 1, "with_payload": True})
        hits = (r or {}).get("result") or []
        if not hits or hits[0].get("score", 0) < threshold:
            return None
        p = hits[0].get("payload") or {}
        d = p.get("date")
        if d:
            try:
                age = (datetime.now(timezone.utc) - datetime.strptime(str(d)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)).days
                if age > MAX_AGE_DAYS:
                    return None  # устарело — пусть перегенерит
            except Exception:
                pass
        return {"answer": p.get("answer", ""), "question": p.get("question", ""), "date": d, "score": hits[0].get("score")}
    except Exception as e:
        print(f"[qa_cache] lookup error agent {agent_id}: {e}")
        return None


async def store(agent_id: int, question: str, answer: str) -> bool:
    """Сохранить пару вопрос→ответ. Fail-soft."""
    q = (question or "").strip()
    a = (answer or "").strip()
    if not q or not a:
        return False
    try:
        await _ensure(agent_id)
        vec = await get_embedding(q)
        if not vec:
            return False
        name = _qa_collection(agent_id)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await _qdrant_request("PUT", f"/collections/{name}/points", {
            "points": [{"id": str(uuid.uuid4()), "vector": vec,
                        "payload": {"question": q[:1000], "answer": a[:4000], "date": today}}],
        })
        return True
    except Exception as e:
        print(f"[qa_cache] store error agent {agent_id}: {e}")
        return False
