"""
RAG Service — индексация и семантический поиск через Qdrant.
Управляет коллекциями агентов, индексирует chunks, ищет релевантные фрагменты.
"""
import math
import re as _re
import time as _time
import uuid
from typing import List, Optional
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.services.embedding import get_embedding, get_embeddings, get_embedding_dimensions


# Порог релевантности: настраивается из админки (system:settings.rag_min_score), кэш 60с
_MIN_SCORE_CACHE = {"v": None, "t": 0.0}


async def _get_min_score() -> float:
    now = _time.time()
    c = _MIN_SCORE_CACHE
    if c["v"] is not None and now - c["t"] < 60:
        return c["v"]
    val = float(getattr(settings, "RAG_MIN_SCORE", 0.55) or 0.55)
    try:
        import json
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        sj = await r.get("system:settings")
        await r.aclose()
        if sj:
            ss = json.loads(sj)
            if ss.get("rag_min_score") not in (None, ""):
                val = float(ss.get("rag_min_score"))
    except Exception:
        pass
    c["v"] = val
    c["t"] = now
    return val


# ── Лёгкий гибрид: лексический reranking поверх векторных кандидатов ──
_LEX_WEIGHT = 0.30   # вклад лексического совпадения
_CAND_FLOOR = 0.3    # минимальный dense-score кандидата до reranking
_RECENCY_WEIGHT = 0.15  # бонус за новизну для датированного контента (новости/каналы)
_RECENCY_DAYS = 30      # за сколько дней бонус убывает до 0


def _recency_bonus(date_str) -> float:
    """Бонус за свежесть для чанков с датой YYYY-MM-DD. Недатированные (законы/ПДД) → 0."""
    if not date_str:
        return 0.0
    try:
        from datetime import datetime, timezone
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - d).days
        if age_days < 0:
            age_days = 0
        return _RECENCY_WEIGHT * max(0.0, 1.0 - age_days / _RECENCY_DAYS)
    except Exception:
        return 0.0
_RU_STOP = {
    "как", "что", "где", "для", "это", "при", "или", "под", "над", "без", "про",
    "мне", "мой", "моя", "мои", "они", "она", "его", "нее", "них", "тебя", "меня",
    "вас", "нас", "вам", "нам", "так", "вот", "же", "ли", "если", "чтобы", "когда",
    "есть", "быть", "твой", "ваш", "наш", "приложении", "приложение", "нужно", "можно",
}


def _tokenize(text: str):
    toks = _re.findall(r"[а-яёa-z0-9]+", (text or "").lower())
    return [t for t in toks if len(t) >= 3 and t not in _RU_STOP]


def _lex_overlap(q_tokens, c_tokens) -> float:
    """Доля токенов запроса, нашедших совпадение в чанке (по префиксу >=4 симв. — грубый стемминг)."""
    if not q_tokens:
        return 0.0
    cset = list(dict.fromkeys(c_tokens))
    matched = 0
    for qt in q_tokens:
        for ct in cset:
            n = min(len(qt), len(ct))
            if n >= 4 and qt[:n] == ct[:n]:
                matched += 1
                break
    return matched / len(q_tokens)


# ── BM25-lite: IDF-взвешенная лексика по корпусу коллекции (кэш 5 мин) ──
_DF_CACHE: dict = {}


async def _get_df(agent_id: int) -> dict:
    now = _time.time()
    c = _DF_CACHE.get(agent_id)
    if c and now - c["t"] < 300:
        return c
    name = _collection_name(agent_id)
    df: dict = {}
    total = 0
    n_docs = 0
    try:
        res = await _qdrant_request("POST", f"/collections/{name}/points/scroll",
                                    {"limit": 2000, "with_payload": True, "with_vector": False})
        pts = (res.get("result") or {}).get("points") or []
        for pt in pts:
            toks = _tokenize((pt.get("payload") or {}).get("text", ""))
            n_docs += 1
            total += len(toks)
            for t in set(toks):
                df[t] = df.get(t, 0) + 1
    except Exception as e:
        print(f"[rag] df fetch error: {e}")
    data = {"t": now, "N": max(n_docs, 1), "df": df, "avgdl": (total / n_docs if n_docs else 1.0)}
    _DF_CACHE[agent_id] = data
    return data


def _idf(term: str, N: int, df: dict) -> float:
    n = df.get(term, 0)
    return math.log((N - n + 0.5) / (n + 0.5) + 1.0)


def _lex_score(q_tokens, c_tokens, N: int, df: dict) -> float:
    """IDF-взвешенная доля терминов запроса, найденных в чанке (по префиксу >=4 — морфология)."""
    if not q_tokens:
        return 0.0
    cset = list(dict.fromkeys(c_tokens))
    num = 0.0
    den = 0.0
    for qt in q_tokens:
        w = _idf(qt, N, df)
        den += w
        for ct in cset:
            k = min(len(qt), len(ct))
            if k >= 4 and qt[:k] == ct[:k]:
                num += w
                break
    return (num / den) if den > 0 else 0.0


@dataclass
class RAGChunk:
    """Результат поиска"""
    text: str
    score: float
    article_number: Optional[str] = None
    layer: str = "law"
    source_title: str = ""
    metadata: Optional[dict] = None


@dataclass
class RAGStats:
    """Статистика RAG-коллекции агента"""
    total_chunks: int
    collection_exists: bool
    vector_dimensions: int


def _collection_name(agent_id: int) -> str:
    """Имя коллекции в Qdrant для конкретного агента."""
    return f"{settings.QDRANT_COLLECTION_PREFIX}_agent_{agent_id}"


async def _qdrant_request(method: str, path: str, json_data: dict = None) -> dict:
    """HTTP запрос к Qdrant."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        url = f"{settings.QDRANT_URL}{path}"
        if method == "GET":
            r = await client.get(url)
        elif method == "PUT":
            r = await client.put(url, json=json_data)
        elif method == "POST":
            r = await client.post(url, json=json_data)
        elif method == "DELETE":
            r = await client.request("DELETE", url, json=json_data)
        else:
            raise ValueError(f"Unknown method: {method}")

        if r.status_code not in (200, 201):
            # 404 for collection not found is OK for some operations
            if r.status_code == 404:
                return {"status": "not_found"}
            print(f"[rag] Qdrant error: {method} {path} → {r.status_code} {r.text[:300]}")
        return r.json() if r.status_code in (200, 201) else {"status": "error", "code": r.status_code}


async def ensure_collection(agent_id: int) -> bool:
    """Создать коллекцию если не существует. Возвращает True если успешно."""
    name = _collection_name(agent_id)
    dims = await get_embedding_dimensions()

    # Проверяем существование
    result = await _qdrant_request("GET", f"/collections/{name}")
    if result.get("status") != "not_found" and "result" in result:
        return True

    # Создаём коллекцию
    result = await _qdrant_request("PUT", f"/collections/{name}", {
        "vectors": {
            "size": dims,
            "distance": "Cosine",
        },
    })
    ok = result.get("status") != "error"
    if ok:
        print(f"[rag] Created collection {name} (dims={dims})")
    return ok


async def index_chunks(
    agent_id: int,
    chunks: List[dict],
) -> List[str]:
    """
    Индексировать chunks в Qdrant.
    chunks: list of {"text": str, "article_number": str, "layer": str, "source_title": str, "metadata": dict}
    Возвращает список point_ids.
    """
    if not chunks:
        return []

    await ensure_collection(agent_id)
    name = _collection_name(agent_id)

    # Получаем эмбеддинги батчами (макс 100 за раз)
    batch_size = 50
    all_point_ids = []

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        texts = [c["text"] for c in batch]
        embeddings = await get_embeddings(texts)

        points = []
        for j, (chunk, embedding) in enumerate(zip(batch, embeddings)):
            point_id = str(uuid.uuid4())
            all_point_ids.append(point_id)
            points.append({
                "id": point_id,
                "vector": embedding,
                "payload": {
                    "text": chunk["text"],
                    "article_number": chunk.get("article_number", ""),
                    "layer": chunk.get("layer", "law"),
                    "source_title": chunk.get("source_title", ""),
                    "agent_id": agent_id,
                    **(chunk.get("metadata") or {}),
                },
            })

        # Upsert в Qdrant
        result = await _qdrant_request("PUT", f"/collections/{name}/points", {
            "points": points,
        })
        if result.get("status") == "error":
            print(f"[rag] Failed to index batch {i//batch_size} for agent {agent_id}")

    print(f"[rag] Indexed {len(all_point_ids)} chunks for agent {agent_id}")
    return all_point_ids


async def search(
    agent_id: int,
    query: str,
    top_k: int = 5,
    layer: Optional[str] = None,
    min_score: Optional[float] = None,
) -> List[RAGChunk]:
    """
    Семантический поиск по знаниям агента.
    Возвращает top_k наиболее релевантных chunks.
    """
    name = _collection_name(agent_id)

    # Проверяем существование коллекции
    result = await _qdrant_request("GET", f"/collections/{name}")
    if result.get("status") == "not_found":
        return []

    # Получаем эмбеддинг запроса
    query_embedding = await get_embedding(query)
    if not query_embedding:
        return []

    # Фильтр по слою если указан
    search_filter = None
    if layer:
        search_filter = {
            "must": [{"key": "layer", "match": {"value": layer}}]
        }

    # Поиск в Qdrant
    ms = min_score if min_score is not None else await _get_min_score()
    top_n = max(top_k * 4, 12)
    search_body = {
        "vector": query_embedding,
        "limit": top_n,
        "with_payload": True,
    }
    if ms and ms > 0:
        search_body["score_threshold"] = _CAND_FLOOR
    if search_filter:
        search_body["filter"] = search_filter

    result = await _qdrant_request("POST", f"/collections/{name}/points/search", search_body)

    if result.get("status") == "error" or "result" not in result:
        return []

    # Гибрид: dense-score + лексический вклад, затем отсечение по порогу ms
    q_tokens = _tokenize(query)
    _corpus = await _get_df(agent_id)
    scored = []
    for point in result["result"]:
        payload = point.get("payload", {})
        dense = float(point.get("score", 0.0) or 0.0)
        text = payload.get("text", "")
        combined = dense + _LEX_WEIGHT * _lex_score(q_tokens, _tokenize(text), _corpus["N"], _corpus["df"])
        combined += _recency_bonus(payload.get("date"))
        scored.append((combined, RAGChunk(
            text=text,
            score=round(combined, 4),
            article_number=payload.get("article_number"),
            layer=payload.get("layer", "law"),
            source_title=payload.get("source_title", ""),
            metadata={k: v for k, v in payload.items() if k not in ("text", "article_number", "layer", "source_title", "agent_id")},
        )))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [ch for (comb, ch) in scored if comb >= ms][:top_k]


async def delete_chunks(agent_id: int, point_ids: List[str]) -> bool:
    """Удалить конкретные chunks по их point_ids."""
    if not point_ids:
        return True

    name = _collection_name(agent_id)
    result = await _qdrant_request("POST", f"/collections/{name}/points/delete", {
        "points": point_ids,
    })
    return result.get("status") != "error"


async def delete_all_chunks(agent_id: int) -> bool:
    """Удалить все chunks агента (удаление коллекции)."""
    name = _collection_name(agent_id)
    result = await _qdrant_request("DELETE", f"/collections/{name}")
    return result.get("status") != "error"


async def get_stats(agent_id: int) -> RAGStats:
    """Получить статистику RAG-коллекции агента."""
    name = _collection_name(agent_id)
    result = await _qdrant_request("GET", f"/collections/{name}")

    if result.get("status") == "not_found":
        return RAGStats(
            total_chunks=0,
            collection_exists=False,
            vector_dimensions=await get_embedding_dimensions(),
        )

    info = result.get("result", {})
    return RAGStats(
        total_chunks=info.get("points_count", 0),
        collection_exists=True,
        vector_dimensions=info.get("config", {}).get("params", {}).get("vectors", {}).get("size", await get_embedding_dimensions()),
    )
