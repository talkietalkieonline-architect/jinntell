"""Конфигурация приложения"""
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "JinnTell"
    APP_VERSION: str = "0.2.0"
    DEBUG: bool = True

    DATABASE_URL: str = "postgresql+asyncpg://jinntell:jinntell@localhost:5432/jinntell"
    DATABASE_URL_SYNC: str = "postgresql://jinntell:jinntell@localhost:5432/jinntell"

    SECRET_KEY: str = "jinntell-dev-secret-key-change-in-production"
    TURN_SECRET: str = ""
    TURN_REALM: str = "jinntell.ru"
    TURN_HOST: str = "jinntell.ru"
    TURN_PUBLIC_IP: str = "194.67.101.9"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30

    SMS_CODE_EXPIRE_MINUTES: int = 5
    SMS_CODE_LENGTH: int = 4
    SMS_PROVIDER: str = "sms_ru"
    SMS_RU_API_KEY: str = ""
    SMSC_LOGIN: str = ""
    SMSC_PASSWORD: str = ""

    REDIS_URL: str = "redis://localhost:6379/0"
    RAG_MIN_SCORE: float = 0.55  # порог релевантности чанка (ниже — не подмешиваем)

    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION_PREFIX: str = "jinntell"

    EMBEDDING_PROVIDER: str = "yandex"
    JINA_API_KEY: str = ""
    EMBEDDING_MODEL: str = "jina-embeddings-v3"

    # LLM
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
    DEFAULT_LLM_PROVIDER: str = "deepseek"

    # TTS
    DEFAULT_TTS_PROVIDER: str = ""
    YANDEX_SPEECHKIT_API_KEY: str = ""
    YANDEX_SPEECHKIT_FOLDER_ID: str = ""
    YANDEX_SPEECHKIT_URL: str = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize"
    # STT (распознавание речи) — провайдер переключается в админке
    STT_PROVIDER: str = "yandex"
    SELF_TTS_URL: str = ""
    SELF_TTS_API_KEY: str = ""
    SELF_TTS_MODEL: str = "gptsovits"

    # VIDEO
    DEFAULT_VIDEO_PROVIDER: str = ""
    SELF_VIDEO_URL: str = ""
    SELF_VIDEO_API_KEY: str = ""
    SELF_VIDEO_MODEL: str = "sadtalker"
    HEDRA_API_KEY: str = ""
    HEDRA_URL: str = "https://api.hedra.com/v1"
    DID_API_KEY: str = ""
    DID_URL: str = "https://api.d-id.com"

    ADMIN_PHONES: List[str] = []

    VK_CLIENT_ID: str = ""
    VK_CLIENT_SECRET: str = ""
    YANDEX_CLIENT_ID: str = ""
    YANDEX_CLIENT_SECRET: str = ""
    TELEGRAM_BOT_TOKEN: str = ""

    SITE_URL: str = "https://jinntell.com"

    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
