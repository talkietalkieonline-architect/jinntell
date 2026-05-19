# Задача для Sonnet: Настройки Дворецкого в админке

**Задача #001** | Подготовлена: Opus | Дата: Апрель 2026

---

## Контекст

Aimigo — AI-коммуникационная платформа. Есть админка `/admin` с вкладками: Агенты, Пользователи, Статистика.

**Дворецкий** — встроенный AI-помощник платформы. Отвечает в общей комнате `general`. НЕ является агентом в БД — это встроенная логика в `llm.py` (BUTLER_SYSTEM_PROMPT).

**Проблема:** В админке нет возможности настроить Дворецкого — выбрать модель, изменить промпт, переключить провайдер. Это всё хардкод в `.env` и `llm.py`.

---

## Что нужно сделать

### 1. Backend — два новых эндпоинта

**Файл:** `backend/app/api/admin.py`

**GET /api/admin/butler-settings**
Возвращает текущие настройки Дворецкого:
```json
{
  "provider": "openrouter",
  "model": "meta-llama/llama-3.3-70b-instruct:free",
  "system_prompt": "Ты — Дворецкий, персональный AI-помощник...",
  "available_models": [
    {"value": "deepseek-chat", "label": "DeepSeek V3", "group": "DeepSeek"},
    {"value": "google/gemma-3-27b-it:free", "label": "Gemma 3 27B (бесплатная)", "group": "OpenRouter бесплатные"},
    ...
  ]
}
```

Читать `provider` и `model` из Redis (ключ `butler:settings`). Если в Redis пусто — брать из `settings.DEFAULT_LLM_PROVIDER` и `settings.DEEPSEEK_MODEL` / `settings.OPENROUTER_MODEL` (по провайдеру).

`system_prompt` — из Redis ключ `butler:system_prompt`. Если пусто — из `llm.py` BUTLER_SYSTEM_PROMPT.

`available_models` — статический список (такой же как в выборе модели при создании агента).

**PATCH /api/admin/butler-settings**
Принимает:
```json
{
  "provider": "deepseek",       // опционально
  "model": "deepseek-chat",     // опционально  
  "system_prompt": "..."        // опционально
}
```
Сохраняет в Redis (`butler:settings` как JSON, `butler:system_prompt` как строка).

**POST /api/admin/butler-test**
Принимает:
```json
{
  "message": "Привет, расскажи о себе"
}
```
Отправляет тестовое сообщение Дворецкому через текущие настройки. Возвращает:
```json
{
  "reply": "Привет! Я Дворецкий...",
  "provider": "openrouter",
  "model": "google/gemma-3-27b-it:free",
  "response_time_ms": 1234
}
```

### 2. Backend — llm.py изменения

**Файл:** `backend/app/services/llm.py`

В функцию `get_llm_reply()` добавить чтение настроек из Redis:
- Если вызов без явной модели (model=None), проверить Redis `butler:settings`
- Если есть — использовать provider/model оттуда
- Если нет — как сейчас, из `settings`

Для `BUTLER_SYSTEM_PROMPT` — аналогично: проверить Redis `butler:system_prompt`.

Для Redis использовать `aioredis` или `redis.asyncio`:
```python
import redis.asyncio as aioredis
from app.core.config import settings

async def _get_redis():
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)
```

### 3. Frontend — UI блок в админке

**Файл:** `frontend/src/app/admin/page.tsx`

На вкладке **"Статистика"** после блока "LLM Провайдеры" добавить секцию:

```
═══ Настройки Дворецкого ═══

[Провайдер: deepseek ▼]  [Модель: deepseek-chat ▼]

Системный промпт:
┌─────────────────────────────────────────┐
│ Ты — Дворецкий, персональный AI-       │
│ помощник платформы Aimigo...            │
│                                         │
└─────────────────────────────────────────┘

[Тест Дворецкого]  [Сохранить]

── Результат теста ──
Вопрос: "Привет!"
Ответ: "Привет! Я — Дворецкий..."
Время: 1.2сек | Провайдер: openrouter | Модель: gemma-3-27b
```

**Элементы:**
- Выпадающий список провайдера (deepseek / openrouter / openai / gemini / groq)
- Выпадающий список модели (фильтруется по провайдеру)
- Textarea с системным промптом (редактируемый)
- Кнопка "Сохранить" — PATCH /api/admin/butler-settings
- Кнопка "Тест" — POST /api/admin/butler-test с текстовым полем
- Блок результата теста (ответ, время, провайдер)

### 4. Frontend — API функции

**Файл:** `frontend/src/services/api.ts`

Добавить:
```typescript
export interface ButlerSettings {
  provider: string;
  model: string;
  system_prompt: string;
  available_models: { value: string; label: string; group: string }[];
}

export interface ButlerTestResult {
  reply: string;
  provider: string;
  model: string;
  response_time_ms: number;
}

export async function adminGetButlerSettings(): Promise<ButlerSettings> { ... }
export async function adminUpdateButlerSettings(data: Partial<ButlerSettings>): Promise<ButlerSettings> { ... }
export async function adminTestButler(message: string): Promise<ButlerTestResult> { ... }
```

---

## Файлы для изменения
1. `backend/app/api/admin.py` — 3 новых эндпоинта
2. `backend/app/services/llm.py` — чтение из Redis
3. `frontend/src/app/admin/page.tsx` — UI блок
4. `frontend/src/services/api.ts` — 3 API функции + типы

## Важные замечания
- Стиль UI — как в остальной админке (dark theme, gray-900 фоны, amber-500 акценты)
- Все эндпоинты требуют `admin = Depends(get_admin_user)`
- Redis уже подключён (REDIS_URL в config), но нужен async клиент
- `redis` пакет уже в requirements.txt (проверить: `redis[hiredis]`)
- Не ломать существующую логику — Redis-настройки ДОПОЛНЯЮТ .env, не заменяют

---

## Как проверить
1. Открыть http://194.67.101.9:3080/admin → Статистика
2. Должен появиться блок "Настройки Дворецкого"
3. Изменить модель → Сохранить → Тест должен использовать новую модель
4. Сбросить Redis — должны использоваться настройки из .env
