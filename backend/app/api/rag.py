"""RAG API — управление источниками и парсингом для агентов-специалистов."""
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_admin_user
from app.models.agent import Agent
from app.models.rag import AgentSource, AgentRAGChunk, AgentParseLog
from app.services import rag as rag_service
from app.services import parser as parser_service

router = APIRouter(prefix="/api/admin/rag", tags=["rag"])


# ═══ Schemas ═══

class SourceCreate(BaseModel):
    agent_id: int
    url: str = Field(..., min_length=1)
    title: str = ""
    source_type: str = "custom"  # consultant / garant / pravo / custom
    layer: str = "law"  # law / changes / explanations
    schedule: str = "manual"  # manual / daily / weekly


class SourceOut(BaseModel):
    id: int
    agent_id: int
    source_type: str
    url: str
    title: str
    layer: str
    last_parsed_at: Optional[str] = None
    last_change_found_at: Optional[str] = None
    chunks_count: int
    schedule: str
    is_active: bool
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class ParseLogOut(BaseModel):
    id: int
    agent_id: int
    source_id: int
    action: str
    article_number: Optional[str] = None
    chunks_added: int
    chunks_updated: int
    chunks_deleted: int
    error_message: Optional[str] = None
    parsed_at: Optional[str] = None

    class Config:
        from_attributes = True


class RAGStatsOut(BaseModel):
    total_chunks_db: int
    total_chunks_qdrant: int
    collection_exists: bool
    vector_dimensions: int
    sources_count: int


class ParseRequest(BaseModel):
    """Запрос на парсинг источника."""
    source_id: int


class ParseRawTextRequest(BaseModel):
    """Парсинг сырого текста (без URL)."""
    agent_id: int
    text: str = Field(..., min_length=10)
    title: str = "Ручной ввод"
    layer: str = "law"


class SearchRequest(BaseModel):
    """Тестовый поиск по RAG."""
    agent_id: int
    query: str = Field(..., min_length=2)
    top_k: int = 5
    layer: Optional[str] = None


class SearchResultOut(BaseModel):
    text: str
    score: float
    article_number: Optional[str] = None
    layer: str
    source_title: str


# ═══ Endpoints ═══

@router.get("/sources/{agent_id}", response_model=list[SourceOut])
async def get_sources(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_admin_user),
):
    """Получить все источники агента."""
    result = await db.execute(
        select(AgentSource)
        .where(AgentSource.agent_id == agent_id)
        .order_by(AgentSource.created_at.desc())
    )
    sources = result.scalars().all()
    return [_source_to_out(s) for s in sources]


@router.post("/sources", response_model=SourceOut)
async def add_source(
    data: SourceCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_admin_user),
):
    """Добавить источник для агента."""
    # Проверяем что агент существует
    agent = await db.get(Agent, data.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    source = AgentSource(
        agent_id=data.agent_id,
        source_type=data.source_type,
        url=data.url,
        title=data.title,
        layer=data.layer,
        schedule=data.schedule,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return _source_to_out(source)


@router.delete("/sources/{source_id}")
async def delete_source(
    source_id: int,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_admin_user),
):
    """Удалить источник и все его chunks."""
    source = await db.get(AgentSource, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    # Удаляем chunks из Qdrant
    result = await db.execute(
        select(AgentRAGChunk.qdrant_point_id)
        .where(AgentRAGChunk.source_id == source_id)
    )
    point_ids = [r for r in result.scalars().all() if r]
    if point_ids:
        await rag_service.delete_chunks(source.agent_id, point_ids)

    # Удаляем chunks из БД
    await db.execute(
        AgentRAGChunk.__table__.delete().where(AgentRAGChunk.source_id == source_id)
    )

    # Удаляем логи
    await db.execute(
        AgentParseLog.__table__.delete().where(AgentParseLog.source_id == source_id)
    )

    # Удаляем источник
    await db.delete(source)
    await db.commit()

    return {"status": "deleted", "source_id": source_id}


@router.post("/parse")
async def parse_source(
    data: ParseRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_admin_user),
):
    """
    Запустить парсинг источника: скачать → разбить → индексировать в Qdrant.
    """
    source = await db.get(AgentSource, data.source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    try:
        # Парсим URL
        chunks = await parser_service.parse_and_chunk(
            url=source.url,
            source_type=source.source_type,
            source_title=source.title,
            layer=source.layer,
        )

        if not chunks:
            raise HTTPException(status_code=400, detail="No content found at URL")

        # Удаляем старые chunks этого источника
        old_result = await db.execute(
            select(AgentRAGChunk.qdrant_point_id)
            .where(AgentRAGChunk.source_id == source.id)
        )
        old_point_ids = [r for r in old_result.scalars().all() if r]
        if old_point_ids:
            await rag_service.delete_chunks(source.agent_id, old_point_ids)

        await db.execute(
            AgentRAGChunk.__table__.delete().where(AgentRAGChunk.source_id == source.id)
        )

        # Индексируем новые chunks в Qdrant
        chunks_dicts = [
            {
                "text": c.text,
                "article_number": c.article_number,
                "layer": c.layer,
                "source_title": c.source_title,
                "metadata": c.metadata,
            }
            for c in chunks
        ]
        point_ids = await rag_service.index_chunks(source.agent_id, chunks_dicts)

        # Сохраняем chunks в БД
        for i, (chunk, point_id) in enumerate(zip(chunks, point_ids)):
            db_chunk = AgentRAGChunk(
                agent_id=source.agent_id,
                source_id=source.id,
                layer=chunk.layer,
                article_number=chunk.article_number,
                text=chunk.text,
                chunk_metadata=chunk.metadata or None,
                qdrant_point_id=point_id,
            )
            db.add(db_chunk)

        # Обновляем источник
        source.last_parsed_at = datetime.now(timezone.utc)
        source.chunks_count = len(chunks)

        # Лог
        log_entry = AgentParseLog(
            agent_id=source.agent_id,
            source_id=source.id,
            action="parsed",
            chunks_added=len(chunks),
        )
        db.add(log_entry)

        await db.commit()

        return {
            "status": "success",
            "source_id": source.id,
            "chunks_parsed": len(chunks),
            "chunks_indexed": len(point_ids),
        }

    except HTTPException:
        raise
    except Exception as e:
        # Логируем ошибку
        log_entry = AgentParseLog(
            agent_id=source.agent_id,
            source_id=source.id,
            action="error",
            error_message=str(e)[:500],
        )
        db.add(log_entry)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Parse error: {str(e)[:200]}")


@router.post("/parse-text")
async def parse_raw_text(
    data: ParseRawTextRequest,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_admin_user),
):
    """Индексировать сырой текст (без скачивания по URL)."""
    # Проверяем агента
    agent = await db.get(Agent, data.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Создаём виртуальный источник
    source = AgentSource(
        agent_id=data.agent_id,
        source_type="manual",
        url="manual://input",
        title=data.title,
        layer=data.layer,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)

    # Парсим текст
    chunks = await parser_service.parse_raw_text(
        text=data.text,
        source_title=data.title,
        layer=data.layer,
    )

    if not chunks:
        raise HTTPException(status_code=400, detail="Text too short or empty")

    # Индексируем
    chunks_dicts = [
        {
            "text": c.text,
            "article_number": c.article_number,
            "layer": c.layer,
            "source_title": c.source_title,
            "metadata": c.metadata,
        }
        for c in chunks
    ]
    point_ids = await rag_service.index_chunks(data.agent_id, chunks_dicts)

    # Сохраняем в БД
    for chunk, point_id in zip(chunks, point_ids):
        db_chunk = AgentRAGChunk(
            agent_id=data.agent_id,
            source_id=source.id,
            layer=data.layer,
            article_number=chunk.article_number,
            text=chunk.text,
            chunk_metadata=chunk.metadata or None,
            qdrant_point_id=point_id,
        )
        db.add(db_chunk)

    source.last_parsed_at = datetime.now(timezone.utc)
    source.chunks_count = len(chunks)

    log_entry = AgentParseLog(
        agent_id=data.agent_id,
        source_id=source.id,
        action="parsed",
        chunks_added=len(chunks),
    )
    db.add(log_entry)
    await db.commit()

    return {
        "status": "success",
        "source_id": source.id,
        "chunks_parsed": len(chunks),
        "chunks_indexed": len(point_ids),
    }


@router.post("/search", response_model=list[SearchResultOut])
async def search_rag(
    data: SearchRequest,
    admin=Depends(get_admin_user),
):
    """Тестовый поиск по RAG (для отладки)."""
    results = await rag_service.search(
        agent_id=data.agent_id,
        query=data.query,
        top_k=data.top_k,
        layer=data.layer,
    )
    return [
        SearchResultOut(
            text=r.text,
            score=r.score,
            article_number=r.article_number,
            layer=r.layer,
            source_title=r.source_title,
        )
        for r in results
    ]


@router.get("/stats/{agent_id}", response_model=RAGStatsOut)
async def get_rag_stats(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_admin_user),
):
    """Статистика RAG для агента."""
    # Qdrant stats
    qdrant_stats = await rag_service.get_stats(agent_id)

    # DB stats
    chunks_count = await db.scalar(
        select(func.count(AgentRAGChunk.id)).where(AgentRAGChunk.agent_id == agent_id)
    )
    sources_count = await db.scalar(
        select(func.count(AgentSource.id)).where(AgentSource.agent_id == agent_id)
    )

    return RAGStatsOut(
        total_chunks_db=chunks_count or 0,
        total_chunks_qdrant=qdrant_stats.total_chunks,
        collection_exists=qdrant_stats.collection_exists,
        vector_dimensions=qdrant_stats.vector_dimensions,
        sources_count=sources_count or 0,
    )


@router.get("/log/{agent_id}", response_model=list[ParseLogOut])
async def get_parse_log(
    agent_id: int,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_admin_user),
):
    """Лог парсинга для агента."""
    result = await db.execute(
        select(AgentParseLog)
        .where(AgentParseLog.agent_id == agent_id)
        .order_by(AgentParseLog.parsed_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return [_log_to_out(l) for l in logs]


@router.delete("/chunks/{agent_id}")
async def delete_all_agent_chunks(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_admin_user),
):
    """Удалить ВСЕ chunks агента (из Qdrant + БД)."""
    # Удаляем коллекцию из Qdrant
    await rag_service.delete_all_chunks(agent_id)

    # Удаляем из БД
    await db.execute(
        AgentRAGChunk.__table__.delete().where(AgentRAGChunk.agent_id == agent_id)
    )
    await db.commit()

    return {"status": "deleted", "agent_id": agent_id}


# ═══ Helpers ═══

def _source_to_out(s: AgentSource) -> SourceOut:
    return SourceOut(
        id=s.id,
        agent_id=s.agent_id,
        source_type=s.source_type,
        url=s.url,
        title=s.title,
        layer=s.layer,
        last_parsed_at=s.last_parsed_at.isoformat() if s.last_parsed_at else None,
        last_change_found_at=s.last_change_found_at.isoformat() if s.last_change_found_at else None,
        chunks_count=s.chunks_count,
        schedule=s.schedule,
        is_active=s.is_active,
        created_at=s.created_at.isoformat() if s.created_at else None,
    )


def _log_to_out(l: AgentParseLog) -> ParseLogOut:
    return ParseLogOut(
        id=l.id,
        agent_id=l.agent_id,
        source_id=l.source_id,
        action=l.action,
        article_number=l.article_number,
        chunks_added=l.chunks_added,
        chunks_updated=l.chunks_updated,
        chunks_deleted=l.chunks_deleted,
        error_message=l.error_message,
        parsed_at=l.parsed_at.isoformat() if l.parsed_at else None,
    )
