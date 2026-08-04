"""Сервис подборок: помощник опрашивает релевантных джиннов Города по запросу и
собирает ДОКУМЕНТ с атрибуцией (кто что сказал). Освобождает помощника от самостоятельного
поиска; можно ставить крупные задачи. Опрос — бесплатный (payer=free), как превью;
глубже — пользователь идёт к конкретному джинну (там уже биллинг). См. [[design_home_strips]]."""
import json
import re

from sqlalchemy import select

from app.core.database import async_session
from app.models.agent import Agent
from app.models.digest import Digest
from app.services.llm import get_agent_reply

_STOP = {"этот", "того", "чтобы", "какой", "какие", "нужен", "нужно", "хочу", "составь", "собери",
         "мне", "меня", "рейтинг", "самых", "список", "какая", "какое", "будет", "можно", "есть"}


async def build_digest(user_id: int, query: str, max_jinns: int = 4) -> dict:
    q = (query or "").strip()
    if not q:
        return {"ok": False, "reason": "empty"}
    words = [w for w in re.findall(r"[\wа-яё]{4,}", q.lower()) if w not in _STOP]
    if not words:
        return {"ok": False, "reason": "no_keywords"}

    async with async_session() as db:
        cond = None
        for w in words[:6]:
            p = f"%{w}%"
            c = (Agent.name.ilike(p) | Agent.profession.ilike(p) | Agent.description.ilike(p) | Agent.skills_text.ilike(p))
            cond = c if cond is None else (cond | c)
        qq = (select(Agent)
              .where(Agent.is_active == True, Agent.visibility == "public", cond)
              .order_by(Agent.rating.desc()).limit(max_jinns))
        agents = list((await db.execute(qq)).scalars().all())

    if not agents:
        return {"ok": False, "reason": "no_agents"}

    from app.services import rag as _rag
    sections = []
    for a in agents:
        rag_ctx = None
        try:
            _kn = await _rag.search(agent_id=a.id, query=q, top_k=3)
            if _kn:
                rag_ctx = "\n\n".join(f"[{i}]: {c.text}" for i, c in enumerate(_kn, 1))
        except Exception:
            pass
        try:
            ans = await get_agent_reply(
                agent_name=a.name, agent_profession=a.profession, agent_description=a.description or "",
                system_prompt=a.system_prompt, llm_model=a.llm_model or "deepseek-chat",
                user_message=f"{q}\n\n(Ответь кратко и по делу — 2-4 предложения, только по своей теме.)",
                rag_context=rag_ctx, user_id=user_id, agent_id=a.id, payer_type="free", max_tokens=260,
            )
        except Exception:
            ans = ""
        ans = (ans or "").strip()
        if ans:
            sections.append({"agent_id": a.id, "agent_name": a.name, "color": a.color, "text": ans})

    if not sections:
        return {"ok": False, "reason": "no_answers"}

    async with async_session() as db:
        d = Digest(user_id=user_id, query=q[:500], sections=json.dumps(sections, ensure_ascii=False))
        db.add(d)
        await db.commit()
        await db.refresh(d)
        return {"ok": True, "id": d.id, "query": q, "sections": sections, "created_at": d.created_at.isoformat()}
