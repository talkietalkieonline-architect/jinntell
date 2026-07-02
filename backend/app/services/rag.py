"""
RAG Service — индексация и семантический поиск через Qdrant.
Управляет коллекциями агентов, индексирует chunks, ищет релевантные фрагменты.
"""
import uuid
from typing import List, Optional
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.services.embedding import get_embedding, get_embeddings, get_embedding_dimensions


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
            r = await client.delete(url, json=json_data)
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
    search_body = {
        "vector": query_embedding,
        "limit": top_k,
        "with_payload": True,
    }
    if search_filter:
        search_body["filter"] = search_filter

    result = await _qdrant_request("POST", f"/collections/{name}/points/search", search_body)

    if result.get("status") == "error" or "result" not in result:
        return []

    # Формируем результат
    chunks = []
    for point in result["result"]:
        payload = point.get("payload", {})
        chunks.append(RAGChunk(
            text=payload.get("text", ""),
            score=point.get("score", 0.0),
            article_number=payload.get("article_number"),
            layer=payload.get("layer", "law"),
            source_title=payload.get("source_title", ""),
            metadata={k: v for k, v in payload.items() if k not in ("text", "article_number", "layer", "source_title", "agent_id")},
        ))

    return chunks


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
