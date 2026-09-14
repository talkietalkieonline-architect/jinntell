"""Библиотека «Образы» контрагента: генерация (Qwen) + галереи (лица/одежда/аксессуары) + постановка джину.
Аккаунт-уровень (переиспользуется на любом джине). Existing per-agent AgentWardrobe не трогаем."""
import os
import uuid

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.contractor import Contractor
from app.models.media_asset import MediaAsset
from app.services import image_gen
from app.api.contractor_agents import _require_contractor, _get_owned_agent

router = APIRouter(prefix="/api/contractor/library", tags=["library"])

_STORAGE = "/app/storage"


async def _rehost(url: str, cid: int):
    """OSS-URL Qwen временный → скачать и отдавать с нашего storage."""
    try:
        async with httpx.AsyncClient(timeout=120) as c:
            r = await c.get(url)
        if r.status_code != 200:
            return None
        d = os.path.join(_STORAGE, "contractors", str(cid), "library")
        os.makedirs(d, exist_ok=True)
        fn = f"{uuid.uuid4().hex}.png"
        with open(os.path.join(d, fn), "wb") as f:
            f.write(r.content)
        return f"/api/storage/contractors/{cid}/library/{fn}"
    except Exception as e:
        print(f"[library] rehost {e}")
        return None


def _out(a: MediaAsset) -> dict:
    return {"id": a.id, "kind": a.kind, "url": a.url, "prompt": a.prompt, "source": a.source, "label": a.label}


@router.get("")
async def list_assets(kind: str = None, contractor: Contractor = Depends(_require_contractor),
                      db: AsyncSession = Depends(get_db)):
    q = select(MediaAsset).where(MediaAsset.owner_contractor_id == contractor.id)
    if kind:
        q = q.where(MediaAsset.kind == kind)
    rows = (await db.execute(q.order_by(MediaAsset.created_at.desc()))).scalars().all()
    return [_out(a) for a in rows]


@router.post("/generate")
async def generate(body: dict = Body(...), contractor: Contractor = Depends(_require_contractor),
                   db: AsyncSession = Depends(get_db)):
    if not await image_gen.enabled():
        raise HTTPException(403, "Генерация изображений выключена администратором.")
    prompt = (body.get("prompt") or "").strip()
    kind = (body.get("kind") or "face").strip()
    n = int(body.get("n") or 4)
    if not prompt:
        raise HTTPException(400, "Опиши, что сгенерировать.")
    urls = await image_gen.generate(prompt, n=n)
    if not urls:
        raise HTTPException(502, "Не удалось сгенерировать. Попробуй иначе сформулировать.")
    saved = []
    for u in urls:
        local = await _rehost(u, contractor.id)
        if local:
            a = MediaAsset(owner_contractor_id=contractor.id, kind=kind, url=local, prompt=prompt, source="generated")
            db.add(a)
            saved.append(a)
    await db.commit()
    for a in saved:
        await db.refresh(a)
    return [_out(a) for a in saved]


@router.delete("/{asset_id}")
async def delete_asset(asset_id: int, contractor: Contractor = Depends(_require_contractor),
                       db: AsyncSession = Depends(get_db)):
    a = (await db.execute(select(MediaAsset).where(
        MediaAsset.id == asset_id, MediaAsset.owner_contractor_id == contractor.id))).scalar_one_or_none()
    if a:
        await db.delete(a)
        await db.commit()
    return {"ok": True}


@router.post("/apply-face/{agent_id}")
async def apply_face(agent_id: int, body: dict = Body(...), contractor: Contractor = Depends(_require_contractor),
                     db: AsyncSession = Depends(get_db)):
    """Поставить лицо из библиотеки как фото джина."""
    agent = await _get_owned_agent(agent_id, contractor, db)
    a = (await db.execute(select(MediaAsset).where(
        MediaAsset.id == body.get("asset_id"), MediaAsset.owner_contractor_id == contractor.id))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Ассет не найден")
    agent.photo_url = a.url
    await db.commit()
    return {"photo_url": a.url}
