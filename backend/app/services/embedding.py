"""
Embedding Service — получение векторных представлений текста.
Провайдеры: Jina / OpenAI / Gemini.
Автовыбор: gemini (если ключ есть) → jina → openai.
"""
from typing import List

import httpx

from app.core.config import settings


async def get_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Получить эмбеддинги для списка текстов.
    Автовыбор провайдера по конфигу + наличию ключей.
    """
    if not texts:
        return []

    provider = settings.EMBEDDING_PROVIDER

    if provider == "gemini" and settings.GEMINI_API_KEY:
        return await _embed_gemini(texts)
    elif provider == "jina" and settings.JINA_API_KEY:
        return await _embed_jina(texts)
    elif provider == "openai" and settings.OPENAI_API_KEY:
        return await _embed_openai(texts)
    else:
        # Fallback chain: gemini → jina → openai → error
        if settings.GEMINI_API_KEY:
            return await _embed_gemini(texts)
        if settings.JINA_API_KEY:
            return await _embed_jina(texts)
        if settings.OPENAI_API_KEY:
            return await _embed_openai(texts)
        raise RuntimeError("No embedding provider configured. Set GEMINI_API_KEY, JINA_API_KEY or OPENAI_API_KEY.")


async def get_embedding(text: str) -> List[float]:
    """Получить эмбеддинг для одного текста."""
    results = await get_embeddings([text])
    return results[0] if results else []


async def _embed_gemini(texts: List[str]) -> List[List[float]]:
    """
    Google Gemini text-embedding-004 — бесплатный, 768 dims, multilingual.
    Работает из РФ через generativelanguage.googleapis.com.
    Batch: до 100 текстов за запрос.
    """
    model = "text-embedding-004"
    all_embeddings = []

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Gemini batchEmbedContents — до 100 текстов за раз
        batch_size = 100
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            requests_list = [
                {
                    "model": f"models/{model}",
                    "content": {"parts": [{"text": t}]},
                    "taskType": "RETRIEVAL_DOCUMENT",
                }
                for t in batch
            ]

            r = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents?key={settings.GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={"requests": requests_list},
            )

            if r.status_code != 200:
                print(f"[embedding] Gemini error: {r.status_code} {r.text[:300]}")
                raise RuntimeError(f"Gemini embedding error: {r.status_code}")

            data = r.json()
            for emb in data["embeddings"]:
                all_embeddings.append(emb["values"])

    print(f"[embedding] Gemini OK: {len(texts)} texts, {len(all_embeddings[0])}d")
    return all_embeddings


async def _embed_jina(texts: List[str]) -> List[List[float]]:
    """Jina Embeddings v3 — 1024 dims, multilingual. Может быть заблокирован из РФ."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            "https://api.jina.ai/v1/embeddings",
            headers={
                "Authorization": f"Bearer {settings.JINA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.EMBEDDING_MODEL or "jina-embeddings-v3",
                "input": texts,
                "task": "retrieval.passage",
            },
        )
        if r.status_code != 200:
            print(f"[embedding] Jina error: {r.status_code} {r.text[:300]}")
            # Если 451 (geo-block) — пробуем Gemini fallback
            if r.status_code == 451 and settings.GEMINI_API_KEY:
                print("[embedding] Jina blocked (451), falling back to Gemini")
                return await _embed_gemini(texts)
            raise RuntimeError(f"Jina embedding error: {r.status_code}")

        data = r.json()
        embeddings_data = sorted(data["data"], key=lambda x: x["index"])
        print(f"[embedding] Jina OK: {len(texts)} texts, {len(embeddings_data[0]['embedding'])}d")
        return [item["embedding"] for item in embeddings_data]


async def _embed_openai(texts: List[str]) -> List[List[float]]:
    """OpenAI text-embedding-3-small — 1536 dims."""
    model = "text-embedding-3-small"
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "input": texts,
            },
        )
        if r.status_code != 200:
            print(f"[embedding] OpenAI error: {r.status_code} {r.text[:300]}")
            raise RuntimeError(f"OpenAI embedding error: {r.status_code}")

        data = r.json()
        embeddings_data = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in embeddings_data]


def get_embedding_dimensions() -> int:
    """Размерность вектора в зависимости от провайдера."""
    provider = settings.EMBEDDING_PROVIDER
    
    if provider == "gemini" or (not provider and settings.GEMINI_API_KEY):
        return 768  # text-embedding-004
    elif provider == "jina" or (not provider and settings.JINA_API_KEY):
        return 1024  # jina-embeddings-v3
    elif provider == "openai" or (not provider and settings.OPENAI_API_KEY):
        return 1536  # text-embedding-3-small
    
    # Fallback по наличию ключей
    if settings.GEMINI_API_KEY:
        return 768
    if settings.JINA_API_KEY:
        return 1024
    return 768  # default (gemini most likely)
