"""Динамическая память: извлечение фактов о пользователе, дедуп, recall, чистка.
Хранение — Qdrant (коллекция user_memory, payload {user_id, fact})."""
import asyncio
import json
import re
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func

from app.core.config import settings
from app.core.database import async_session
from app.services.rag import _qdrant_request
from app.services.embedding import get_embedding, get_embedding_dimensions
from app.services.llm import get_llm_reply
from app.models.message import Message


def _collection() -> str:
    return f"{settings.QDRANT_COLLECTION_PREFIX}_user_memory"


async def _ensure():
    name = _collection()
    r = await _qdrant_request("GET", f"/collections/{name}")
    if r.get("status") != "not_found" and "result" in r:
        return
    dims = await get_embedding_dimensions()
    await _qdrant_request("PUT", f"/collections/{name}", {"vectors": {"size": dims, "distance": "Cosine"}})


_EXTRACT_PROMPT = (
    "Из реплик пользователя извлеки устойчивые ФАКТЫ о нём: имя, город, работа/род занятий, "
    "интересы, предпочтения, важные обстоятельства, планы, отношения. "
    "Игнорируй пустой трёп (приветствия, «как дела», болтовню без информации). "
    "Верни СТРОГО JSON-массив коротких строк-фактов на русском. Если фактов нет — []. Только JSON, без пояснений."
)


async def extract_and_store(user_id: int, texts: list[str]) -> int:
    joined = "\n".join(t for t in texts if t and t.strip())[:4000]
    if len(joined.strip()) < 12:
        return 0
    raw = await get_llm_reply(user_message=joined, system_prompt=_EXTRACT_PROMPT,
                              max_tokens=300, user_id=user_id, payer_type="free")
    t = (raw or "").strip().strip("`")
    t = re.sub(r"^\s*json\s*", "", t, flags=re.I)
    if "[" not in t:
        t = "[" + t
    if not t.rstrip().endswith("]"):
        t = t.rstrip() + "]"
    facts = []
    m = re.search(r"\[.*\]", t, re.S)
    if m:
        try:
            facts = [str(x).strip() for x in json.loads(m.group(0)) if str(x).strip()]
        except Exception:
            facts = [q.strip() for q in re.findall(r'"([^"]{3,})"', t)]
    if not facts:
        return 0
    await _ensure()
    name = _collection()
    added = 0
    flt = {"must": [{"key": "user_id", "match": {"value": user_id}}]}
    for f in facts[:20]:
        emb = await get_embedding(f)
        sr = await _qdrant_request("POST", f"/collections/{name}/points/search",
                                   {"vector": emb, "limit": 1, "with_payload": False, "filter": flt})
        hits = sr.get("result") or []
        if hits and hits[0].get("score", 0) > 0.92:
            continue  # уже есть похожий факт — дедуп
        await _qdrant_request("PUT", f"/collections/{name}/points",
                              {"points": [{"id": str(uuid.uuid4()), "vector": emb,
                                           "payload": {"user_id": user_id, "fact": f}}]})
        added += 1
    if added:
        print(f"[memory] user {user_id}: +{added} facts")
    return added


async def recall(user_id: int, query: str, k: int = 5) -> list[str]:
    name = _collection()
    ex = await _qdrant_request("GET", f"/collections/{name}")
    if ex.get("status") == "not_found":
        return []
    emb = await get_embedding(query or "пользователь")
    sr = await _qdrant_request("POST", f"/collections/{name}/points/search",
                               {"vector": emb, "limit": k, "with_payload": True,
                                "filter": {"must": [{"key": "user_id", "match": {"value": user_id}}]}})
    out = []
    for h in (sr.get("result") or []):
        f = (h.get("payload") or {}).get("fact")
        if f:
            out.append(f)
    return out


async def clear(user_id: int):
    name = _collection()
    await _qdrant_request("POST", f"/collections/{name}/points/delete",
                          {"filter": {"must": [{"key": "user_id", "match": {"value": user_id}}]}})


async def _cycle():
    from app.models.memory_state import MemoryState
    idle_before = datetime.now(timezone.utc) - timedelta(minutes=2)
    async with async_session() as db:
        rows = (await db.execute(
            select(Message.sender_user_id, func.max(Message.id), func.max(Message.created_at))
            .where(Message.sender_type == "user", Message.sender_user_id.isnot(None))
            .group_by(Message.sender_user_id)
        )).all()
        for uid, maxid, maxts in rows:
            if not uid or maxts is None or maxts > idle_before:
                continue  # ещё активен или нет данных
            st = await db.get(MemoryState, uid)
            last = st.last_msg_id if st else 0
            if maxid <= last:
                continue
            texts = (await db.execute(
                select(Message.text).where(
                    Message.sender_user_id == uid, Message.sender_type == "user",
                    Message.id > last, Message.id <= maxid
                ).order_by(Message.id)
            )).scalars().all()
            try:
                await extract_and_store(uid, list(texts))
            except Exception as e:
                print(f"[memory] extract err u{uid}: {e}")
            if st:
                st.last_msg_id = maxid
                st.updated_at = datetime.now(timezone.utc)
            else:
                db.add(MemoryState(user_id=uid, last_msg_id=maxid))
            await db.commit()


async def memory_scheduler():
    while True:
        try:
            await _cycle()
        except Exception as e:
            print(f"[memory] scheduler error: {e}")
        await asyncio.sleep(300)  # 5 минут
