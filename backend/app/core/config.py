"""Конфигурация приложения"""
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Приложение
    APP_NAME: str = "JinnTell"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://jinntell:jinntell@localhost:5432/jinntell"
    DATABASE_URL_SYNC: str = "postgresql://jinntell:jinntell@localhost:5432/jinntell"

    # JWT
    SECRET_KEY: str = "jinntell-dev-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 дней

    # SMS
    SMS_CODE_EXPIRE_MINUTES: int = 5
    SMS_CODE_LENGTH: int = 4
    SMS_PROVIDER: str = "sms_ru"  # sms_ru / smsc / debug
    SMS_RU_API_KEY: str = ""  # https://sms.ru/my/settings
    SMSC_LOGIN: str = ""
    SMSC_PASSWORD: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Qdrant (vector DB for RAG)
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION_PREFIX: str = "jinntell"

    # Embeddings
    EMBEDDING_PROVIDER: str = "jina"  # jina / openai
    JINA_API_KEY: str = ""
    EMBEDDING_MODEL: str = "jina-embeddings-v3"  # or text-embedding-3-small for openai

    # LLM — мульти-провайдер
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"

    # Провайдер по умолчанию для Дворецкого: openai / gemini / groq / openrouter / deepseek
    DEFAULT_LLM_PROVIDER: str = "deepseek"

    # Админка — номера телефонов админов (при регистрации получают is_admin=True)
    ADMIN_PHONES: List[str] = []

    # OAuth — ВК, Яндекс, Telegram
    VK_CLIENT_ID: str = ""
    VK_CLIENT_SECRET: str = ""
    YANDEX_CLIENT_ID: str = ""
    YANDEX_CLIENT_SECRET: str = ""
    TELEGRAM_BOT_TOKEN: str = ""  # для проверки подписи Telegram Login Widget

    # Сайт (для OAuth redirect)
    SITE_URL: str = "https://jinntell.com"

    # CORS (в production nginx проксирует — CORS не нужен,
    # но оставляем для прямого доступа к API)
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
