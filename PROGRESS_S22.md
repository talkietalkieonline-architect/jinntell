
### Сессия 22 (Май 2026)
- [x] **Переименование Мэл → Помощник Джим:**
  - Backend: ASSISTANT_SYSTEM_PROMPT (legacy MEL/BUTLER aliases), _assistant_reply()
  - Frontend: useChat "assistant" sender type (backward compat mel/butler)
  - Default name "Джим" (пользователь может менять)
  - Роль "Помощник" — константа в UI
  - БД: user.assistant_name default="Джим", seed agent name="Помощник Джим"
- [x] **Бесплатная LLM модель:**
  - NVIDIA Nemotron 3 Super 120B (free) — основная
  - OpenAI GPT-OSS 120B (free) — fallback
  - Обновлён OPENROUTER_FREE_MODELS (6 моделей)
  - OpenRouter Referer: jinntell.ru
- [x] **DeepSeek reasoning filter:**
  - _clean_reasoning() — вырезает thinking/CoT блоки из ответов
  - Поддержка <think> тегов и английского reasoning
- [x] **Двухуровневая система Помощника:**
  - Уровень 1 (Админ): модель, правила, скилы, обучение — Core-агенты
  - Уровень 2 (Пользователь): имя, пол, голос, манера — Центр Управления
  - user_persona_suffix инжектируется в промпт (не меняет базовые правила)
  - _build_user_persona_injection() — строит блок ПЕРСОНАЛИЗАЦИЯ
- [x] **Мини-чат с Core-агентами в админке:**
  - Диалоговое окно во вкладке "Основное" (только core)
  - Прямое общение с моделью для тестирования/задач
- [x] **Вкладка "Системные агенты" → "Core-агенты":**
  - Переименована вкладка, заголовок, кнопка, описание
  - Core-агенты — упрощённые настройки (скрыты: Тип, Бренд, JinnTell Link)
  - Badge "Core" красным
- [x] **Core-агенты убраны из Города:**
  - Backend: visibility != "core" (было)
  - Frontend admin: agents.filter(a.agent_type !== "core")
  - Тип "Ядро" убран из фильтра типов
- [x] **Вкладки Система и Статистика — очищены:**
  - Убран блок "Настройки Помощника" из Системы
  - Убран блок "Настройки Дворецкого" (legacy) из Статистики
  - Единственное место настроек помощника: Core-агенты
  - Удалено 80+ строк неиспользуемого mel/butler кода
- [x] **Список моделей обновлён:**
  - AgentSettingsPanel: Nemotron 3 Super 120B, GPT-OSS 120B, Gemma 4 31B, DeepSeek V4 Flash, Qwen3 Next 80B
  - admin.py AVAILABLE_MODELS: 12 моделей (free + paid + direct API)
- [x] **Фикс ввода пароля:** setError на onFocus вместо onChange
- [x] **Фикс iPhone splash:** WebkitTransition, fallback 5с, CSS var fallbacks
- [x] **Фикс скролла чата:** WebkitOverflowScrolling: touch
- [x] **user_age добавлен в UserProfile** (frontend type)
- [x] **Помощник Джим — agent_type=core** в БД

### Архитектура после Сессии 22
```
ИЗМЕНЁННЫЕ ФАЙЛЫ (12):
backend/app/services/llm.py           ← ASSISTANT_SYSTEM_PROMPT, _clean_reasoning, user_persona_suffix
backend/app/services/seed.py          ← "Помощник Джим" core agent
backend/app/websocket/chat_ws.py      ← _assistant_reply(), _get_user_assistant_settings(), _build_user_persona_injection()
backend/app/api/admin.py              ← AVAILABLE_MODELS обновлён, комментарии
backend/app/models/user.py            ← default="Джим"
backend/app/schemas/user.py           ← default="Джим"

frontend/src/hooks/useChat.ts         ← "assistant" sender, динамическое имя из user context
frontend/src/components/communicator/ChatArea.tsx    ← "assistant" type, scroll fix
frontend/src/components/communicator/RightPanel.tsx  ← isAssistant, "Помощник"
frontend/src/components/communicator/SettingsModal.tsx ← "Джим" default
frontend/src/components/admin/AgentSettingsPanel.tsx ← новые модели, isCore, мини-чат
frontend/src/app/admin/page.tsx       ← Core-агенты, очистка mel/butler, фильтрация
frontend/src/components/auth/SplashScreen.tsx ← iPhone fix
frontend/src/components/auth/LoginScreen.tsx  ← password input fix
frontend/src/app/layout.tsx           ← viewport-fit, apple-web-app
frontend/src/services/api.ts          ← user_age, комментарии
```

### Двухуровневая система Помощника
```
┌─────────────────────────────────────────────┐
│  АДМИН (Core-агенты → Помощник Джим)        │
│  ─────────────────────────────────────       │
│  Модель LLM    → deepseek-chat / nemotron   │
│  Правила       → системный промпт           │
│  Скилы         → навыки, скрипты             │
│  Обучение      → база знаний                 │
│  Отмена        → запреты                     │
│  Мини-чат      → прямое общение с моделью    │
├─────────────────────────────────────────────┤
│  ПОЛЬЗОВАТЕЛЬ (Центр Управления)            │
│  ─────────────────────────────────────       │
│  Имя           → "Джим" (можно менять)       │
│  Пол           → м/ж/нейтральный             │
│  Голос         → тип голоса (будущее TTS)     │
│  Фото/Аватар   → внешний вид (будущее)       │
│                                              │
│  → Инжектируется в промпт:                   │
│  "Тебя зовут {имя}. Ты {пол}."             │
│  Не меняет модель/правила/скилы              │
└─────────────────────────────────────────────┘
```

### Вкладки админки (6):
```
🤖 Агенты           — CRUD агентов (system/business/citizen/specialist) — без core
⚙️ Core-агенты      — 4 core-агента с мини-чатом и упрощёнными настройками
🏢 Контрагенты      — CRUD контрагентов
👥 Пользователи     — таблица пользователей
🖥️ Система          — сервисы, LLM провайдеры, Embedding, SMS
📊 Статистика        — счётчики, LLM статус
```

### Что дальше (Сессия 23)
1. **Загрузка фото помощника** — file input в Центре Управления + отображение
2. **Говорящий аватар (R&D):**
   - Генерация видео по фото (SadTalker / Wav2Lip / LivePortrait)
   - Интеграция с TTS для синхронизации губ
   - Где показывать: в чате (bubble), fullscreen mode, PiP
3. **Голос — Яндекс SpeechKit:**
   - Подключение TTS API через админку
   - Выбор голоса в настройках пользователя
   - Streaming audio в чат
4. **Альтернативный TTS — self-hosted:**
   - Piper TTS (бесплатный, русский, Docker)
   - XTTS v2 (клонирование голоса)
   - Сравнение качества с SpeechKit
5. **Настройка интерфейса пользователя** (темы, шрифты)
6. **Настройка персонажа пользователя** (аватар, цвет)
7. **Красивые URL** — /city/spb/slug
8. **Git commit + push**

---

*Обновляется после каждой сессии работы*
