"""JinnTell — FastAPI Backend"""
from contextlib import asynccontextmanager

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine, Base, async_session
from app.api.auth import router as auth_router
from app.api.agents import router as agents_router
from app.api.chat import router as chat_router
from app.api.users import router as users_router
from app.api.admin import router as admin_router
from app.api.contractor_auth import router as contractor_auth_router
from app.api.contractor_agents import router as contractor_agents_router
from app.api.rag import router as rag_router
from app.api.tts import router as tts_router
from app.api.feed import router as feed_router
from app.api.rooms import router as rooms_router
from app.api.contacts import router as contacts_router
from app.websocket.chat_ws import router as ws_router
from app.services.seed import seed_agents, seed_core_agents


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / Shutdown"""
    # Создаём таблицы (для dev; в prod — alembic)
    async with engine.begin() as conn:
        import app.models  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)

    # Заполняем начальными данными
    async with async_session() as db:
        await seed_agents(db)
        # Добавляем core-агентов на существующую БД (если их ещё нет)
        await seed_core_agents(db)

    print(f"[jinntell] Сервер запущен — {settings.APP_NAME} v{settings.APP_VERSION}")
    yield
    print("[jinntell] Сервер остановлен")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры
app.include_router(auth_router)
app.include_router(agents_router)
app.include_router(chat_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(contractor_auth_router)
app.include_router(contractor_agents_router)
app.include_router(rag_router)
app.include_router(tts_router)
app.include_router(feed_router)
app.include_router(rooms_router)
app.include_router(contacts_router)
app.include_router(ws_router)

# Хранилище загруженных файлов (фото агентов, гардероб, в будущем RAG-база контрагента)
STORAGE_ROOT = "/app/storage"
os.makedirs(STORAGE_ROOT, exist_ok=True)
app.mount("/api/storage", StaticFiles(directory=STORAGE_ROOT), name="storage")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "jinntell", "version": settings.APP_VERSION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
