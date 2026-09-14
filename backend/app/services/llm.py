"""
LLM Service — мульти-провайдер: DeepSeek, OpenAI, Gemini, Groq, OpenRouter.
Автовыбор по наличию ключей.
"""
import asyncio
import json
import random
import re
from typing import Optional

import httpx

from app.core.config import settings


async def _get_setting(name: str, default: str = "") -> str:
    """Настройка из settings_store с фолбэком."""
    try:
        from app.services.settings_store import get_setting
        v = await get_setting(name)
        if v:
            return v
    except Exception:
        pass
    return default


async def _llm_client(timeout: float = 30.0) -> "httpx.AsyncClient":
    """HTTP-клиент LLM; через OUTBOUND_PROXY, если задан (зарубежные провайдеры из РФ: OpenRouter/Gemini/Groq)."""
    proxy = await _get_setting("OUTBOUND_PROXY")
    if proxy:
        return httpx.AsyncClient(timeout=timeout, proxy=proxy)
    return httpx.AsyncClient(timeout=timeout)


# Системный промпт Помощника (по умолчанию, перекрывается Redis)
ASSISTANT_SYSTEM_PROMPT = """Ты — персональный AI-помощник платформы JinnTell.
JinnTell — это AI-first коммуникационная платформа, где пользователи общаются с AI-агентами голосом и текстом.

Твои задачи:
- Помогать пользователю ориентироваться на платформе
- Отвечать на вопросы о сервисе, агентах, комнатах
- Вести приятную беседу на любые темы
- Подсказывать подходящих агентов из Города Агентов
- Быть вежливым, лаконичным и полезным

Ты говоришь по-русски. Ответы давай кратко — 1-3 предложения, если не просят подробнее.
Будь дружелюбным, но профессиональным. Используй эмодзи умеренно.

ВАЖНО: Отвечай ТОЛЬКО готовым ответом на русском языке. НЕ пиши свои рассуждения, мысли, планы или анализ. НЕ пиши на английском. Сразу давай финальный ответ пользователю."""

# Legacy aliases
MEL_SYSTEM_PROMPT = ASSISTANT_SYSTEM_PROMPT
BUTLER_SYSTEM_PROMPT = ASSISTANT_SYSTEM_PROMPT

# Fallback ответы (когда LLM недоступен)
FALLBACK_REPLIES = [
    "Отличный вопрос! К сожалению, я сейчас работаю в ограниченном режиме. Попробуйте позже.",
    "Я рядом, но мои AI-мощности временно ограничены. Скоро вернусь в полную силу!",
    "Записал ваш вопрос. Отвечу, как только восстановлю подключение к AI.",
]


def get_active_provider() -> dict:
    """Определяем активный провайдер по наличию ключей"""
    pref = settings.DEFAULT_LLM_PROVIDER
    providers = {
        "deepseek": {"key": settings.DEEPSEEK_API_KEY, "model": settings.DEEPSEEK_MODEL, "name": "deepseek"},
        "openrouter": {"key": settings.OPENROUTER_API_KEY, "model": settings.OPENROUTER_MODEL, "name": "openrouter"},
        "gemini": {"key": settings.GEMINI_API_KEY, "model": settings.GEMINI_MODEL, "name": "gemini"},
        "openai": {"key": settings.OPENAI_API_KEY, "model": settings.OPENAI_MODEL, "name": "openai"},
        "groq":   {"key": settings.GROQ_API_KEY,   "model": settings.GROQ_MODEL,   "name": "groq"},
    }
    if pref in providers and providers[pref]["key"]:
        return providers[pref]
    for p in providers.values():
        if p["key"]:
            return p
    return {"key": "", "model": "none", "name": "none"}


def _clean_reasoning(text: str) -> str:
    """Убираем reasoning/thinking из ответа LLM (DeepSeek, R1 и др.), в т.ч. русский."""
    if not text:
        return text

    # 1. Явные <think>...</think> блоки
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()

    low = text.lower()

    # Сильные мета-маркеры — таких фраз не бывает в нормальном ответе пользователю
    strong_markers = [
        "хорошо, пользовател", "пользователь пишет", "пользователь спрашивает",
        "пользователь написал", "пользователь просит", "пользователь, видимо",
        "посмотрю на истори", "историю диалога", "я (или система)",
        "инструкция четко", "инструкция говорит", "вариант ответа",
        "the user is", "the user wrote", "the user asks", "let me think",
    ]
    # Слабые маркеры — срабатывают только на длинном тексте
    weak_markers = [
        "мне нужно", "нужно ответить", "нужно дать", "сначала посмотр",
        "okay, let", "let us see", "i need to",
    ]
    is_reasoning = any(m in low for m in strong_markers) or (
        len(text) > 500 and any(m in low for m in weak_markers)
    )

    if is_reasoning:
        # Пытаемся вытащить финальный ответ из явного маркера
        answer_markers = [
            "вариант ответа:", "финальный ответ:", "итоговый ответ:",
            "мой ответ:", "ответ пользователю:", "final answer:",
        ]
        best_pos, best_len = -1, 0
        for m in answer_markers:
            pos = low.rfind(m)
            if pos > best_pos:
                best_pos, best_len = pos, len(m)
        if best_pos >= 0:
            after = text[best_pos + best_len:].strip()
            q = re.search(r'[«"“](.+?)[»"”]', after, flags=re.DOTALL)
            cand = (q.group(1) if q else after.split(chr(10))[0])
            cand = cand.strip().strip('"«»“”')
            if cand and len(cand) < 600:
                return cand
        # Не удалось аккуратно извлечь — пусть caller подставит fallback
        return ""

    # Мягкая очистка: англ. reasoning перед русским ответом
    russian_pattern = re.compile(r'[А-Яа-яЁё]')
    lines = text.strip().split(chr(10))
    first_russian_line = -1
    for i, line in enumerate(lines):
        if len(russian_pattern.findall(line)) >= 10:
            first_russian_line = i
            break
    if first_russian_line > 0:
        text = chr(10).join(lines[first_russian_line:]).strip()

    # Срезаем оставшиеся англ. reasoning-строки в начале
    lines = text.strip().split(chr(10))
    clean_lines = []
    found_content = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if found_content:
                clean_lines.append(line)
            continue
        lower = stripped.lower()
        if not found_content and any(lower.startswith(m) for m in [
            'so,', 'wait,', 'let me', 'i need', 'looking at', 'the user',
            'my task', 'possible', 'from the', 'i should', 'thinking',
            'the exact', 'so my', 'let me check', 'previous', 'the latest',
            'but keep', 'check ', 'final answer', 'example response',
            'also,', 'note ', 'make sure', 'maybe ', 'hmm', 'okay',
        ]):
            continue
        found_content = True
        clean_lines.append(line)
    result = chr(10).join(clean_lines).strip()

    # Обрезанный хвост (незаконченное предложение)
    if result and result[-1] not in '.!?»"' + chr(10):
        last_dot = max(result.rfind('.'), result.rfind('!'), result.rfind('?'))
        if last_dot > len(result) // 2:
            result = result[:last_dot + 1]

    return result if result else text.strip()


async def _call_deepseek(messages: list, model: str, api_key: str, max_tokens: int = 1000) -> str:
    """DeepSeek — дешёвый и качественный, работает из РФ. OpenAI-совместимый API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.7},
        )
        if r.status_code != 200:
            print(f"[llm] DeepSeek error: {r.status_code} {r.text[:300]}")
            return ""
        data = r.json()
        choice = data["choices"][0]
        # DeepSeek R1 может иметь reasoning_content отдельно — берём только content
        text = (choice.get("message", {}).get("content") or "").strip()
        # Чистим от reasoning-мусора
        text = _clean_reasoning(text)
        print(f"[llm] DeepSeek OK: {model}")
        return text


async def deepseek_tools(messages: list, tools: list, model: str = None, max_tokens: int = 800,
                         temperature: float = 0.4, frequency_penalty: float = 0.0) -> dict:
    """DeepSeek с function calling. Возвращает assistant-сообщение: {"content": str, "tool_calls": list}."""
    api_key = settings.DEEPSEEK_API_KEY
    m = model or settings.DEEPSEEK_MODEL or "deepseek-chat"
    if not api_key:
        return {"content": "", "tool_calls": []}
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": m, "messages": messages, "tools": tools, "tool_choice": "auto",
                  "max_tokens": max_tokens, "temperature": temperature, "frequency_penalty": frequency_penalty},
        )
        if r.status_code != 200:
            print(f"[llm] DeepSeek tools error: {r.status_code} {r.text[:300]}")
            return {"content": "", "tool_calls": []}
        msg = r.json()["choices"][0]["message"]
        return {"content": msg.get("content") or "", "tool_calls": msg.get("tool_calls") or []}


async def _call_anthropic(messages: list, model: str, api_key: str, max_tokens: int = 1000) -> str:
    """Claude (Anthropic Messages API) — «мозг Архитектора». system отдельным полем, messages user/assistant.
    ⚠️ Anthropic может требовать не-РФ IP; ключ владельца в app_settings ANTHROPIC_API_KEY."""
    if not api_key:
        print("[llm] Anthropic: нет ключа")
        return ""
    system_txt = ""
    conv = []
    for m in messages:
        role = m.get("role")
        content = str(m.get("content", "") or "")
        if role == "system":
            system_txt += (("\n\n" if system_txt else "") + content)
        else:
            conv.append({"role": ("assistant" if role == "assistant" else "user"), "content": content})
    if not conv:
        conv = [{"role": "user", "content": ""}]
    body = {"model": model, "max_tokens": max(max_tokens, 4096), "messages": conv}
    if system_txt:
        body["system"] = system_txt
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json=body,
        )
        if r.status_code != 200:
            print(f"[llm] Anthropic error: {r.status_code} {r.text[:300]}")
            return ""
        data = r.json()
        parts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
        text = "".join(parts).strip()
        print(f"[llm] Anthropic OK: {model}")
        return _clean_reasoning(text)


async def _call_moonshot(messages: list, model: str, api_key: str, max_tokens: int = 1000) -> str:
    """Kimi / Moonshot AI (OpenAI-совместимый). Китайский провайдер, из РФ обычно доступен."""
    if not api_key:
        return ""
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            "https://api.moonshot.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.7},
        )
        if r.status_code != 200:
            print(f"[llm] Moonshot error: {r.status_code} {r.text[:300]}")
            return ""
        data = r.json()
        text = (data["choices"][0].get("message", {}).get("content") or "").strip()
        print(f"[llm] Moonshot OK: {model}")
        return _clean_reasoning(text)


async def _call_openai_compat(messages: list, model: str, api_key: str, base_url: str,
                              max_tokens: int = 1000, label: str = "OpenAI-compat") -> str:
    """Универсальный вызов OpenAI-совместимого эндпоинта.
    Используется для MiniMax (прямой) и хабов OrcaRouter/OmniRoute (второстепенные — тест/фри)."""
    if not base_url:
        return ""
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            url, headers=headers,
            json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.7},
        )
        if r.status_code != 200:
            print(f"[llm] {label} error: {r.status_code} {r.text[:300]}")
            return ""
        data = r.json()
        text = (data["choices"][0].get("message", {}).get("content") or "").strip()
        print(f"[llm] {label} OK: {model}")
        return _clean_reasoning(text)


async def _call_openai(messages: list, model: str, api_key: str, max_tokens: int = 1000) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.7},
        )
        if r.status_code != 200:
            print(f"[llm] OpenAI error: {r.status_code} {r.text[:200]}")
            return ""
        return r.json()["choices"][0]["message"]["content"].strip()


async def _call_qwen(messages: list, model: str, max_tokens: int = 1000) -> str:
    """Qwen (Alibaba DashScope, OpenAI-совместимый). Ключ+base из app_settings."""
    from app.services.settings_store import get_setting
    key = await get_setting("DASHSCOPE_API_KEY")
    base = (await get_setting("DASHSCOPE_BASE_URL")) or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    if not key:
        return ""
    async with httpx.AsyncClient(timeout=40.0) as client:
        r = await client.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.7},
        )
        if r.status_code != 200:
            print(f"[llm] Qwen error: {r.status_code} {r.text[:200]}")
            return ""
        return r.json()["choices"][0]["message"]["content"].strip()


async def qwen_vision(prompt: str, image_url: str, model: str = "qwen-vl-max", max_tokens: int = 800) -> str:
    """ЗРЕНИЕ через Qwen-VL. image_url — прямая ссылка или data:...;base64,... . Ключ из app_settings."""
    from app.services.settings_store import get_setting
    key = await get_setting("DASHSCOPE_API_KEY")
    base = (await get_setting("DASHSCOPE_BASE_URL")) or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    if not key or not image_url:
        return ""
    content = [
        {"type": "text", "text": prompt or "Опиши по-русски, что на изображении."},
        {"type": "image_url", "image_url": {"url": image_url}},
    ]
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": model, "messages": [{"role": "user", "content": content}], "max_tokens": max_tokens},
        )
        if r.status_code != 200:
            print(f"[llm] Qwen-VL error: {r.status_code} {r.text[:200]}")
            return ""
        return r.json()["choices"][0]["message"]["content"].strip()


async def _call_gemini(messages: list, model: str, api_key: str, max_tokens: int = 1000) -> str:
    contents = []
    system_text = ""
    for m in messages:
        if m["role"] == "system":
            system_text = m["content"]
        else:
            role = "user" if m["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": m["content"]}]})
    async with await _llm_client(30.0) as client:
        body = {"contents": contents, "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7}}
        if system_text:
            body["systemInstruction"] = {"parts": [{"text": system_text}]}
        r = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            json=body,
        )
        if r.status_code != 200:
            print(f"[llm] Gemini error: {r.status_code} {r.text[:200]}")
            return ""
        data = r.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()


async def _call_groq(messages: list, model: str, api_key: str, max_tokens: int = 1000) -> str:
    async with await _llm_client(30.0) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.7},
        )
        if r.status_code != 200:
            print(f"[llm] Groq error: {r.status_code} {r.text[:200]}")
            return ""
        return r.json()["choices"][0]["message"]["content"].strip()


OPENROUTER_FREE_MODELS = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "openai/gpt-oss-120b:free",
    "google/gemma-4-31b-it:free",
    "deepseek/deepseek-v4-flash:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
]


def _prepare_openrouter_messages(messages: list, model: str) -> list:
    """Некоторые модели не поддерживают system prompt — вставляем его в user message."""
    no_system = ["gemma-3-4b", "gemma-3-1b"]
    needs_merge = any(ns in model for ns in no_system)
    if not needs_merge:
        return messages
    system_text = ""
    other_msgs = []
    for m in messages:
        if m["role"] == "system":
            system_text = m["content"]
        else:
            other_msgs.append(m)
    if system_text and other_msgs:
        first = other_msgs[0]
        if first["role"] == "user":
            other_msgs[0] = {"role": "user", "content": f"[Инструкция: {system_text}]\n\n{first['content']}"}
        else:
            other_msgs.insert(0, {"role": "user", "content": f"[Инструкция: {system_text}]"})
    return other_msgs or messages


async def _call_openrouter(messages: list, model: str, api_key: str, max_tokens: int = 1000) -> str:
    """OpenRouter — агрегатор LLM. Авто-fallback на другие бесплатные модели при 429."""
    models_to_try = [model] + [m for m in OPENROUTER_FREE_MODELS if m != model]
    async with await _llm_client(30.0) as client:
        for try_model in models_to_try:
            prepared = _prepare_openrouter_messages(messages, try_model)
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://jinntell.ru",
                    "X-Title": "JinnTell",
                },
                json={"model": try_model, "messages": prepared, "max_tokens": max_tokens, "temperature": 0.7},
            )
            if r.status_code == 200:
                text = r.json()["choices"][0]["message"]["content"].strip()
                if text:
                    print(f"[llm] OpenRouter OK: {try_model}")
                    return text
            elif r.status_code in (429, 402):
                print(f"[llm] OpenRouter {r.status_code} ({try_model}), trying next...")
                continue
            elif r.status_code == 404:
                print(f"[llm] OpenRouter 404 ({try_model}), model unavailable, trying next...")
                continue
            else:
                print(f"[llm] OpenRouter error ({try_model}): {r.status_code} {r.text[:200]}")
                continue
    print("[llm] OpenRouter: all models exhausted")
    return ""


def _est_tokens(text: str) -> int:
    return max(1, len(text or "") // 3)


async def _record_usage(user_id, agent_id, provider, model, prompt_tokens, completion_tokens, payer_type=None, payer_id=None):
    try:
        from app.core.database import async_session
        from app.models.llm_usage import LlmUsage
        async with async_session() as db:
            db.add(LlmUsage(user_id=user_id or None, agent_id=agent_id, provider=provider,
                            model=model, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                            payer_type=payer_type, payer_id=payer_id))
            # Списание с плательщика по нашей цене (кроме free)
            if payer_type in ("contractor", "user") and payer_id:
                try:
                    import json as _j
                    from app.services.settings_store import get_setting
                    rates = _j.loads(await get_setting("MODEL_RATES") or "{}")
                    rr = rates.get(model) or rates.get("default") or {}
                    _dflt = rates.get("default") or {}
                    _legacy = rr.get("sell")
                    if _legacy in (None, ""):
                        _legacy = _dflt.get("sell") or 0
                    _legacy = float(_legacy or 0)

                    def _pick(f):
                        v = rr.get(f)
                        if v in (None, ""):
                            v = _dflt.get(f)
                        return float(v) if v not in (None, "") else _legacy
                    sell_in = _pick("sell_in")
                    sell_out = _pick("sell_out")
                    base = (prompt_tokens / 1_000_000.0 * sell_in) + (completion_tokens / 1_000_000.0 * sell_out)
                    if payer_type == "contractor":
                        try:
                            base *= float(await get_setting("BIZ_MARKUP") or 1) or 1
                        except Exception:
                            pass
                    try:
                        _ov = _j.loads(await get_setting("PRICE_OVERRIDES") or "{}").get(f"{payer_type}:{payer_id}")
                        if _ov:
                            if _ov.get("free"):
                                base = 0.0
                            elif _ov.get("mult") is not None:
                                base *= float(_ov.get("mult"))
                    except Exception:
                        pass
                    kop = round(base * 100)
                    if kop > 0:
                        from app.services import billing as _billing
                        _desc = f"Джин #{agent_id}" if agent_id else "Генерация"
                        await _billing.charge_generation(db, payer_type, payer_id, agent_id, kop, _desc)
                except Exception as _e:
                    print(f"[usage] deduct failed: {_e}")
            await db.commit()
    except Exception as e:
        print(f"[usage] record failed: {e}")


async def get_llm_reply(
    user_message: str,
    system_prompt: Optional[str] = None,
    model: Optional[str] = None,
    conversation_history: Optional[list] = None,
    user_persona_suffix: Optional[str] = None,
    user_id: int = 0,
    agent_id: Optional[int] = None,
    payer_type: Optional[str] = None,
    payer_id: Optional[int] = None,
    max_tokens: int = 1000,
) -> str:
    """Получить ответ от LLM. Автовыбор провайдера."""
    provider = get_active_provider()
    if not provider["key"]:
        return random.choice(FALLBACK_REPLIES)

    # Если вызов без явных параметров — проверяем Redis (настройки помощника)
    if system_prompt is None and model is None:
        try:
            import redis.asyncio as aioredis
            _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            # Поддерживаем все ключи: assistant:settings (новый), mel:settings, butler:settings (legacy)
            _assistant_settings = await _redis.get("assistant:settings") or await _redis.get("assistant:settings") or await _redis.get("butler:settings")
            _assistant_prompt = await _redis.get("assistant:system_prompt") or await _redis.get("assistant:system_prompt") or await _redis.get("butler:system_prompt")
            await _redis.aclose()
            if _assistant_settings:
                _bs = json.loads(_assistant_settings)
                if _bs.get("model"):
                    model = _bs["model"]
                if _bs.get("max_tokens"):
                    max_tokens = int(_bs["max_tokens"])
            if _assistant_prompt:
                system_prompt = _assistant_prompt
        except Exception as e:
            print(f"[llm] Redis assistant settings error: {e}")

    prompt = system_prompt or ASSISTANT_SYSTEM_PROMPT
    # Инжектим пользовательскую персонализацию (имя, пол, манера)
    if user_persona_suffix:
        prompt = prompt + user_persona_suffix
    messages = [{"role": "system", "content": prompt}]
    if conversation_history:
        messages.extend(conversation_history[-10:])
    messages.append({"role": "user", "content": user_message})

    llm_model = model or provider["model"]
    pname = provider["name"]
    # Хабы моделей (второстепенный маршрут: тест/фри) — по явному префиксу хаба.
    # Формат id: "<hub>/<vendor>/<model>", напр. "orcarouter/qwen/qwen3.8-max-0902".
    if llm_model.startswith("orcarouter/"):
        pname = "orcarouter"; llm_model = llm_model[len("orcarouter/"):]
    elif llm_model.startswith(("omniroute/", "omnirouter/")):
        pname = "omniroute"; llm_model = llm_model.split("/", 1)[1]
    elif llm_model.startswith("minimax"):
        pname = "minimax"
    # OpenRouter-модели всегда содержат "/" в имени (vendor/model[:free])
    # и должны идти через OpenRouter, а не определяться по префиксу.
    elif "/" in llm_model:
        pname = "openrouter"
    elif llm_model.startswith("deepseek"):
        pname = "deepseek"
    elif llm_model.startswith("gemini"):
        pname = "gemini"
    elif llm_model.startswith(("gpt-", "o1", "o3")):
        pname = "openai"
    elif llm_model.startswith(("llama", "mixtral")):
        pname = "groq"
    elif llm_model.startswith("qwen"):
        pname = "qwen"
    elif llm_model.startswith("claude"):
        pname = "anthropic"
    elif llm_model.startswith(("kimi", "moonshot")):
        pname = "moonshot"

    # Эффективные ключи: админка (app_settings) поверх .env — «поменял в админке = применилось»
    _dk = (await _get_setting("DEEPSEEK_API_KEY")) or settings.DEEPSEEK_API_KEY
    _ok = (await _get_setting("OPENROUTER_API_KEY")) or settings.OPENROUTER_API_KEY
    _gk = (await _get_setting("GEMINI_API_KEY")) or settings.GEMINI_API_KEY
    _aik = (await _get_setting("OPENAI_API_KEY")) or settings.OPENAI_API_KEY
    _grk = (await _get_setting("GROQ_API_KEY")) or settings.GROQ_API_KEY
    _mk = await _get_setting("MOONSHOT_API_KEY")
    _antk = (await _get_setting("ANTHROPIC_API_KEY")) or getattr(settings, "ANTHROPIC_API_KEY", "") or ""
    _mmk = await _get_setting("MINIMAX_API_KEY")  # MiniMax (прямой, OpenAI-совместимый)
    _orcak = await _get_setting("ORCAROUTER_API_KEY")  # хаб OrcaRouter
    _omnik = await _get_setting("OMNIROUTER_API_KEY")  # хаб OmniRoute (self-host, ключ опционален)
    _omni_base = (await _get_setting("OMNIROUTER_BASE_URL")) or ""
    try:
        if pname == "deepseek" and _dk:
            reply = await _call_deepseek(messages, llm_model, _dk)
        elif pname == "openrouter" and _ok:
            reply = await _call_openrouter(messages, llm_model, _ok)
        elif pname == "gemini" and _gk:
            reply = await _call_gemini(messages, llm_model, _gk)
        elif pname == "groq" and _grk:
            reply = await _call_groq(messages, llm_model, _grk)
        elif pname == "openai" and _aik:
            reply = await _call_openai(messages, llm_model, _aik)
        elif pname == "qwen":
            reply = await _call_qwen(messages, llm_model)
        elif pname == "anthropic":
            reply = await _call_anthropic(messages, llm_model, _antk)
        elif pname == "moonshot" and _mk:
            reply = await _call_moonshot(messages, llm_model, _mk)
        elif pname == "minimax" and _mmk:
            reply = await _call_openai_compat(messages, llm_model, _mmk, "https://api.minimax.io/v1", label="MiniMax")
        elif pname == "orcarouter" and _orcak:
            reply = await _call_openai_compat(messages, llm_model, _orcak, "https://api.orcarouter.ai/v1", label="OrcaRouter")
        elif pname == "omniroute" and (_omni_base or _omnik):
            reply = await _call_openai_compat(messages, llm_model, _omnik, _omni_base or "http://localhost:20128/v1", label="OmniRoute")
        else:
            if _dk:
                reply = await _call_deepseek(messages, settings.DEEPSEEK_MODEL, _dk)
            elif _ok:
                reply = await _call_openrouter(messages, settings.OPENROUTER_MODEL, _ok)
            elif _gk:
                reply = await _call_gemini(messages, settings.GEMINI_MODEL, _gk)
            elif _aik:
                reply = await _call_openai(messages, settings.OPENAI_MODEL, _aik)
            elif _grk:
                reply = await _call_groq(messages, settings.GROQ_MODEL, _grk)
            else:
                return random.choice(FALLBACK_REPLIES)
        if reply:
            reply = _clean_reasoning(reply)
        final = reply or random.choice(FALLBACK_REPLIES)
        try:
            pt = sum(_est_tokens(m.get("content", "")) for m in messages)
            asyncio.create_task(_record_usage(user_id, agent_id, pname, llm_model, pt, _est_tokens(final), payer_type, payer_id))
        except Exception:
            pass
        return final
    except Exception as e:
        print(f"[llm] Error ({pname}): {e}")
        return random.choice(FALLBACK_REPLIES)


# Маппинг манер для промпта
_MANNER_LABELS = {
    "friendly": "дружелюбно и непринуждённо",
    "formal": "формально и профессионально",
    "playful": "игриво и с юмором",
    "strict": "строго и по делу",
}
_TEMPERAMENT_LABELS = {
    "calm": "спокойный и размеренный",
    "balanced": "сбалансированный",
    "energetic": "энергичный и эмоциональный",
    "reserved": "сдержанный и лаконичный",
}


def _build_agent_prompt(
    agent_name: str,
    agent_profession: str,
    agent_description: str,
    system_prompt: Optional[str],
    manner_style: str = "friendly",
    manner_temperament: str = "balanced",
    manner_humor: bool = True,
    manner_emoji_use: bool = True,
    knowledge_text: Optional[str] = None,
    skills_text: Optional[str] = None,
    exclusions_text: Optional[str] = None,
    active_mode: Optional[str] = None,
    mode_rules: Optional[str] = None,
    mode_context: Optional[str] = None,
    rag_context: Optional[str] = None,
) -> str:
    """Собираем промпт агента. Порядок: ПРАВИЛА -> СКИЛЫ -> ОБУЧЕНИЕ -> ОТМЕНА -> РЕЖИМ -> МАНЕРЫ"""
    parts = []

    # Личность/роль — ВСЕГДА и авторитетно (настройки владельца важнее истории переписки)
    ident = f"Тебя зовут {agent_name}. Ты — {agent_profession}."
    if agent_description and agent_description.strip():
        ident += f" {agent_description.strip()}"
    parts.append(
        "=== ТВОЯ ЛИЧНОСТЬ (задана владельцем — ВЫСШИЙ ПРИОРИТЕТ, важнее истории переписки) ===\n"
        + ident
        + f"\nВсегда действуй как {agent_name} ({agent_profession}) — строго по правилам, знаниям и запретам ниже. "
        + "На вопрос «кто ты / как тебя зовут / чем занимаешься / что умеешь» отвечай согласно этой роли и настройкам владельца. "
        + "Если в истории переписки ты называл себя иначе — это устарело, полностью игнорируй.\n=== КОНЕЦ ==="
    )
    if system_prompt and system_prompt.strip():
        parts.append(f"\n=== ПРАВИЛА ВЛАДЕЛЬЦА ===\n{system_prompt.strip()}\n=== КОНЕЦ ПРАВИЛ ===")

    if skills_text and skills_text.strip():
        sk = skills_text.strip()[:10000]
        parts.append(f"\n=== СКИЛЫ (навыки и скрипты) ===\n{sk}\n=== КОНЕЦ СКИЛОВ ===")

    if knowledge_text and knowledge_text.strip():
        kb = knowledge_text.strip()[:8000]
        parts.append(f"\n=== БАЗА ЗНАНИЙ ===\n{kb}\n=== КОНЕЦ БАЗЫ ЗНАНИЙ ===")
        parts.append("Отвечай на основе базы знаний. Если информации нет — честно скажи, что не знаешь.")

    if rag_context and rag_context.strip():
        parts.append(f"\n=== СПРАВОЧНЫЕ МАТЕРИАЛЫ (база знаний) ===\n{rag_context.strip()}\n=== КОНЕЦ МАТЕРИАЛОВ ===")
        parts.append("Опирайся на эти материалы как на источник фактов. Если в них указаны номера/названия источников (статьи, документы) — ссылайся на них. Если нужной информации в материалах нет — честно скажи, что не нашёл, и НЕ выдумывай.")

    if exclusions_text and exclusions_text.strip():
        ex = exclusions_text.strip()[:3000]
        parts.append(f"\n=== ЗАПРЕТЫ И ИСКЛЮЧЕНИЯ ===\nНИКОГДА не делай следующее:\n{ex}\n=== КОНЕЦ ЗАПРЕТОВ ===")

    if active_mode and (mode_rules or mode_context):
        parts.append(f"\n=== РЕЖИМ: {active_mode.upper()} ===")
        if mode_rules:
            parts.append(f"Правила режима:\n{mode_rules.strip()[:3000]}")
        if mode_context:
            parts.append(f"Контекст режима:\n{mode_context.strip()[:5000]}")
        parts.append(f"=== КОНЕЦ РЕЖИМА ===")

    style = _MANNER_LABELS.get(manner_style, "дружелюбно")
    temp = _TEMPERAMENT_LABELS.get(manner_temperament, "сбалансированный")
    parts.append(f"\nОбщайся {style}. Твой темперамент: {temp}.")

    if manner_humor:
        parts.append("Можно использовать юмор и шутки, если уместно.")
    else:
        parts.append("Не шути, будь серьёзным.")

    if manner_emoji_use:
        parts.append("Используй эмодзи умеренно.")
    else:
        parts.append("Не используй эмодзи.")

    parts.append("\nОтвечай кратко — 1-3 предложения, если не просят подробнее. Говори по-русски.")
    parts.append("ВАЖНО: Отвечай ТОЛЬКО готовым ответом. НЕ пиши рассуждения, мысли или анализ. Сразу давай финальный ответ.")

    return "\n".join(parts)


async def get_agent_reply(
    agent_name: str,
    agent_profession: str,
    agent_description: str,
    system_prompt: Optional[str],
    llm_model: str,
    user_message: str,
    conversation_history: Optional[list] = None,
    manner_style: str = "friendly",
    manner_temperament: str = "balanced",
    manner_humor: bool = True,
    manner_emoji_use: bool = True,
    knowledge_text: Optional[str] = None,
    skills_text: Optional[str] = None,
    exclusions_text: Optional[str] = None,
    active_mode: Optional[str] = None,
    mode_rules: Optional[str] = None,
    mode_context: Optional[str] = None,
    rag_context: Optional[str] = None,
    user_id: int = 0,
    agent_id: Optional[int] = None,
    payer_type: Optional[str] = None,
    payer_id: Optional[int] = None,
    max_tokens: int = 1000,
) -> str:
    """Получить ответ от конкретного агента."""
    prompt = _build_agent_prompt(
        agent_name=agent_name,
        agent_profession=agent_profession,
        agent_description=agent_description,
        system_prompt=system_prompt,
        manner_style=manner_style,
        manner_temperament=manner_temperament,
        manner_humor=manner_humor,
        manner_emoji_use=manner_emoji_use,
        knowledge_text=knowledge_text,
        skills_text=skills_text,
        exclusions_text=exclusions_text,
        active_mode=active_mode,
        mode_rules=mode_rules,
        mode_context=mode_context,
        rag_context=rag_context,
    )
    return await get_llm_reply(
        user_message=user_message,
        system_prompt=prompt,
        model=llm_model,
        conversation_history=conversation_history,
        user_id=user_id,
        agent_id=agent_id,
        payer_type=payer_type,
        payer_id=payer_id,
        max_tokens=max_tokens,
    )
