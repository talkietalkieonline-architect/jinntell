"""Схемы агентов"""
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_serializer


class AgentOut(BaseModel):
    id: int
    uid: Optional[str] = None
    name: str
    profession: str
    brand: str
    description: str
    color: str
    agent_type: str
    visibility: str = "public"
    jinntell_link: Optional[str] = None
    rating: float
    rating_count: int
    greeting: Optional[str] = None
    owner_id: Optional[int] = None
    tts_enabled: bool = False
    video_enabled: bool = False
    video_mode: str = "bubble"

    class Config:
        from_attributes = True


class AgentDetailOut(AgentOut):
    system_prompt: Optional[str] = None
    llm_model: str = "gpt-4o-mini"
    llm_max_tokens: int = 1000
    is_active: bool = True
    created_at: Optional[Any] = None

    @field_serializer("created_at")
    def serialize_created_at(self, v: Any) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)

    # TTS
    tts_provider: Optional[str] = None
    tts_voice_id: Optional[str] = None
    tts_language: str = "ru-RU"
    tts_speed: float = 1.0
    tts_pitch: float = 1.0
    tts_emotion: str = "neutral"
    tts_sample_url: Optional[str] = None
    tts_audio_format: str = "opus"

    # VIDEO
    video_provider: Optional[str] = None
    video_model: Optional[str] = None
    video_source_photo: Optional[str] = None
    video_quality: str = "standard"
    video_fps: int = 25
    video_resolution: str = "512x512"
    video_background: Optional[str] = None

    # Voice legacy
    voice_id: Optional[str] = None
    voice_speed: float = 1.0
    voice_pitch: float = 1.0

    # Appearance
    appearance_preset: Optional[str] = None
    appearance_face: Optional[str] = None
    appearance_hair: Optional[str] = None
    appearance_skin: Optional[str] = None
    appearance_body: Optional[str] = None
    photo_url: Optional[str] = None

    # Outfit
    outfit_style: Optional[str] = None
    outfit_top: Optional[str] = None
    outfit_bottom: Optional[str] = None
    outfit_shoes: Optional[str] = None
    outfit_accessory: Optional[str] = None

    # Manner
    manner_style: str = "friendly"
    manner_temperament: str = "balanced"
    manner_humor: bool = True
    manner_emoji_use: bool = True

    # Knowledge
    knowledge_text: Optional[str] = None
    knowledge_urls: Optional[str] = None
    knowledge_files: Optional[str] = None

    skills_text: Optional[str] = None
    exclusions_text: Optional[str] = None

    # Modes
    mode_walk_enabled: bool = False
    mode_walk_rules: Optional[str] = None
    mode_walk_context: Optional[str] = None
    mode_shopping_enabled: bool = False
    mode_shopping_rules: Optional[str] = None
    mode_shopping_context: Optional[str] = None
    mode_drive_enabled: bool = False
    mode_drive_rules: Optional[str] = None
    mode_drive_context: Optional[str] = None
    mode_chat_enabled: bool = False
    mode_chat_rules: Optional[str] = None
    mode_chat_context: Optional[str] = None
    mode_work_enabled: bool = False
    mode_work_rules: Optional[str] = None
    mode_work_context: Optional[str] = None

    contractor_id: Optional[int] = None

    class Config:
        from_attributes = True


class AgentListResponse(BaseModel):
    agents: List[AgentOut]
    total: int
    business_count: int
    citizen_count: int
    system_count: int


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    profession: str = Field(..., min_length=1, max_length=100)
    brand: str = Field("", max_length=100)
    description: str = Field("", max_length=2000)
    color: str = Field("#d4a843", max_length=20)
    agent_type: str = Field("business")
    system_prompt: Optional[str] = Field(None, max_length=5000)
    llm_model: str = Field("gpt-4o-mini")
    greeting: Optional[str] = Field(None, max_length=500)


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    profession: Optional[str] = Field(None, max_length=100)
    brand: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    color: Optional[str] = Field(None, max_length=20)
    agent_type: Optional[str] = Field(None, max_length=30)
    visibility: Optional[str] = Field(None, max_length=20)

    system_prompt: Optional[str] = Field(None, max_length=5000)
    llm_model: Optional[str] = Field(None, max_length=100)
    llm_max_tokens: Optional[int] = Field(None, ge=100, le=4000)
    greeting: Optional[str] = Field(None, max_length=500)

    # TTS
    tts_enabled: Optional[bool] = None
    tts_provider: Optional[str] = Field(None, max_length=30)
    tts_voice_id: Optional[str] = Field(None, max_length=100)
    tts_language: Optional[str] = Field(None, max_length=10)
    tts_speed: Optional[float] = Field(None, ge=0.5, le=2.0)
    tts_pitch: Optional[float] = Field(None, ge=0.5, le=2.0)
    tts_emotion: Optional[str] = Field(None, max_length=30)
    tts_sample_url: Optional[str] = Field(None, max_length=500)
    tts_audio_format: Optional[str] = Field(None, max_length=10)

    # VIDEO
    video_enabled: Optional[bool] = None
    video_provider: Optional[str] = Field(None, max_length=30)
    video_model: Optional[str] = Field(None, max_length=50)
    video_source_photo: Optional[str] = None
    video_quality: Optional[str] = Field(None, max_length=20)
    video_mode: Optional[str] = Field(None, max_length=20)
    video_fps: Optional[int] = Field(None, ge=1, le=60)
    video_resolution: Optional[str] = Field(None, max_length=20)
    video_background: Optional[str] = Field(None, max_length=100)

    # Voice legacy
    voice_id: Optional[str] = Field(None, max_length=100)
    voice_speed: Optional[float] = Field(None, ge=0.5, le=2.0)
    voice_pitch: Optional[float] = Field(None, ge=0.5, le=2.0)

    # Appearance
    appearance_preset: Optional[str] = Field(None, max_length=100)
    appearance_face: Optional[str] = Field(None, max_length=100)
    appearance_hair: Optional[str] = Field(None, max_length=100)
    appearance_skin: Optional[str] = Field(None, max_length=50)
    appearance_body: Optional[str] = Field(None, max_length=100)

    # Outfit
    outfit_style: Optional[str] = Field(None, max_length=100)
    outfit_top: Optional[str] = Field(None, max_length=100)
    outfit_bottom: Optional[str] = Field(None, max_length=100)
    outfit_shoes: Optional[str] = Field(None, max_length=100)
    outfit_accessory: Optional[str] = Field(None, max_length=100)

    # Manner
    manner_style: Optional[str] = Field(None, max_length=50)
    manner_temperament: Optional[str] = Field(None, max_length=50)
    manner_humor: Optional[bool] = None
    manner_emoji_use: Optional[bool] = None

    # Knowledge
    knowledge_text: Optional[str] = Field(None, max_length=50000)
    knowledge_urls: Optional[str] = Field(None, max_length=5000)
    knowledge_files: Optional[str] = Field(None, max_length=5000)

    skills_text: Optional[str] = Field(None, max_length=50000)
    exclusions_text: Optional[str] = Field(None, max_length=10000)

    # Modes
    mode_walk_enabled: Optional[bool] = None
    mode_walk_rules: Optional[str] = Field(None, max_length=5000)
    mode_walk_context: Optional[str] = Field(None, max_length=10000)
    mode_shopping_enabled: Optional[bool] = None
    mode_shopping_rules: Optional[str] = Field(None, max_length=5000)
    mode_shopping_context: Optional[str] = Field(None, max_length=10000)
    mode_drive_enabled: Optional[bool] = None
    mode_drive_rules: Optional[str] = Field(None, max_length=5000)
    mode_drive_context: Optional[str] = Field(None, max_length=10000)
    mode_chat_enabled: Optional[bool] = None
    mode_chat_rules: Optional[str] = Field(None, max_length=5000)
    mode_chat_context: Optional[str] = Field(None, max_length=10000)
    mode_work_enabled: Optional[bool] = None
    mode_work_rules: Optional[str] = Field(None, max_length=5000)
    mode_work_context: Optional[str] = Field(None, max_length=10000)
