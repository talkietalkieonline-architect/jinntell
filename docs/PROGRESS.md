# JINNTELL — Прогресс разработки

---

## Текущий статус: LIVE — работает на сервере http://194.67.101.9:3080

### Сессия 1 (Июнь 2025)
- [x] Обсуждение концепции и функционала
- [x] Составлено полное ТЗ (TECHNICAL_SPECIFICATION.md)
- [x] Изучен старый проект Talkie-Talkie Online (GitHub)
- [x] Определён технологический стек
- [x] Создание структуры проекта
- [x] Инициализация Next.js (frontend)
- [x] Инициализация FastAPI (backend)
- [x] Базовый UI Коммуникатора — РАБОТАЕТ!
- [x] GitHub репозиторий подключён
- [x] Автозакрытие панелей (4 сек)
- [x] Центр Управления + переключение тем (5 пресетов)
- [x] Заставка + Экран входа (телефон/SMS/пароль)
- [x] Мои агенты (модалка с группами + меню агента)
- [x] Всё запушено в GitHub

### Что сделано
1. Полное ТЗ на 20 разделов (505 строк)
2. Система документации (4 файла)
3. Next.js + TypeScript + Tailwind — инициализирован
4. FastAPI backend — инициализирован
5. Система тем — 5 пресетов (Noir Gold, Cyberpunk, Arctic, Midnight, Sunset)
6. UI Коммуникатора:
   - Фоновые частицы (анимация)
   - Верхняя панель (лого JINNTELL + бегущая строка ЭФИР)
   - Центральный чат (пузыри, аватары, демо-сообщения)
   - Нижняя панель (5 кнопок)
   - Левая панель (Режимы + Комнаты) — выдвижная
   - Правая панель (Дворецкий + Участники) — выдвижная
   - Золотые язычки по бокам

### Сессия 2 (Июнь 2025)
- [x] Рабочий чат — поле ввода, отправка сообщений, автоответы Дворецкого, индикатор «печатает...», анимация появления сообщений
- [x] Город Агентов — полноценный каталог с 14 агентами, поиск, фильтры по профессии и типу, счётчики, меню агента с действиями, добавление/удаление из избранного
- [x] Мои Контакты — список контактов, онлайн/офлайн статус, Aimigo Link, меню контакта, добавление по ссылке
- [x] Связь Мои Агенты → Город Агентов (переход по кнопке)
- [x] CSS-анимации: fade-in сообщений, typing dots, marquee (ЭФИР)

### Сессия 3 (Июнь 2025)
- [x] FastAPI + PostgreSQL (async SQLAlchemy, auto-create tables)
- [x] Модели БД: User, Agent, Message
- [x] API авторизации: send-sms, verify-sms, set-password, login (JWT, bcrypt)
- [x] API агентов: каталог с поиском, фильтрами, счётчиками
- [x] API чата: история + отправка сообщений
- [x] API пользователя: профиль, обновление настроек
- [x] WebSocket чат по комнатам (ConnectionManager + JWT аутентификация)
- [x] Seed-скрипт: 14 начальных агентов (системные + бизнес + жители)
- [x] Фикс размера чата — поле ввода перенесено в BottomBar

### API Эндпоинты (16 роутов)
- `POST /api/auth/send-sms` — отправка SMS-кода
- `POST /api/auth/verify-sms` — проверка кода
- `POST /api/auth/set-password` — установка пароля (регистрация)
- `POST /api/auth/login` — вход (телефон + пароль)
- `GET /api/agents` — каталог агентов
- `GET /api/agents/{id}` — карточка агента
- `GET /api/chat/history` — история сообщений
- `POST /api/chat/send` — отправка сообщения
- `GET /api/users/me` — профиль
- `PATCH /api/users/me` — обновление настроек
- `WS /ws/chat/{room}` — реалтайм чат
- `GET /api/health` — здоровье сервиса

### Сессия 4 (Июнь 2025)
- [x] Авторизация переделана: только SMS (без пароля)
  - 🇷🇺 Флаг + зашитый +7, курсор сразу на первой цифре
  - Маска ввода: (___) ___-__-__ — только цифры
  - Номер сохраняется в localStorage, подтягивается при повторном входе
  - SMS-код автоподставляется (MVP)
  - Таймер повторной отправки 60 сек
- [x] Сохранение сессии 30 дней (как ChatGPT — не просит логин повторно)
- [x] UI фиксы:
  - Аватарки Дворецкого (CSS var + hex не работал — заменено на rgba)
  - Бегущая строка ЭФИР (padding-left:100% для плавного входа)
  - Фон TopBar (bar-bg)
  - Убран Next.js dev indicator (N)
- [x] Чат переделан:
  - Сообщения прижаты к низу (как Telegram)
  - Отступы 52px от краёв — панели не наезжают на текст
  - Пузыри: агенты СЛЕВА, пользователь СПРАВА
  - Хвостики пузырей (borderRadius разный)
  - max-width 70%
- [x] Панели уже (w-44) — не перекрывают чат
- [x] Прикрепление медиа (скрепка 📎) — фото/видео в чате
- [x] Голосовые дорожки (VoiceWave) — волновая анимация + play через Web Speech API
- [x] Динамический размер чата — TopBar/BottomBar сообщают высоту через ResizeObserver

### Сессия 5 (Июнь 2025)
- [x] Пузыри перевёрнуты: пользователь СЛЕВА, агенты СПРАВА
- [x] Чат отцентрован (max-width 620px, flex justify-center)
- [x] Крылышки (язычки) — всегда видны, сдвигаются к краю панели, стрелка меняется
- [x] Панели ПОВЕРХ строки ЭФИР (z-index иерархия)
- [x] Панели шире: w-44 → w-48 (192px)
- [x] Поле ввода отцентровано (600px)
- [x] Отступ пузырей от BottomBar (+16px + pb-6)
- [x] Кнопка прослушивания пузыря (динамик) + кнопка "показать как голосовое"
- [x] VoiceBubble в стиле Telegram (play/pause, волновая дорожка, прогресс, таймер)
- [x] Адаптив под мобильные (media queries + safe area)
- [x] Документация бизнес-концепции (BUSINESS_VISION.md)
- [x] Переключатель ввода: кнопка «Текст ⌨️» вместо Mute, поле ввода скрыто по умолчанию (voice-first)
- [x] Микрофон 4 состояния: OFF / ON / ALWAYS-ON (пульсация) / MUTE (красный)
  - Короткое нажатие: вкл/выкл
  - Длинное нажатие (600ms): always-on / mute
  - Подсказка состояния под кнопками
- [x] Кнопка «+» для медиа в голосовом режиме (Фото / Видео / Файл / Ссылка)
- [x] Пузыри: 2 кнопки (прослушать + голосовое ↔ Aа текст)
- [x] Контекстное меню пузыря: long press (мобиле) / right click (десктоп)
  - Копировать текст
  - Сохранить медиа (фото/видео)

### Сессия 6 (Июнь 2025)
- [x] **AuthContext** — единый React-контекст авторизации (AuthProvider)
  - Проверка сессии при загрузке (localStorage + API /users/me)
  - login() / logout() функции
  - Флаг isOnline (бэкенд доступен / нет)
  - Graceful fallback на offline-режим
- [x] **useChat хук** — реалтайм чат через WebSocket
  - Подключение к WS /ws/chat/{room} с JWT-токеном
  - Загрузка истории из API /chat/history
  - Автопереподключение через 3 сек
  - Offline fallback: локальные ответы Дворецкого (как раньше)
  - Индикатор isConnected (online badge)
- [x] **useAgents хук** — агенты из API
  - Загрузка из GET /api/agents с поиском/фильтрами
  - Fallback на 14 хардкод-агентов если API недоступен
  - Счётчики: total, business, citizen, system
- [x] **LoginScreen → API** — реальная авторизация
  - send-sms → verify-sms → JWT токен
  - При успехе — сохранение в AuthContext
  - Fallback на локальный режим (как раньше)
- [x] **AgentCityModal → API** — каталог из бэкенда
  - Убран хардкод CITY_AGENTS (170 строк)
  - Использует useAgents хук
  - Синхронизированы типы AgentOut (фронт ↔ бэкенд)
- [x] **page.tsx рефакторинг** — убраны inline данные
  - Убраны BUTLER_REPLIES, INITIAL_MESSAGES, hasValidSession
  - Использует useAuth + useChat
  - Индикатор «online» при подключении к серверу
- [x] **api.ts** — синхронизация типов
  - AgentOut: color (не avatar_color), rating_count, aimigo_link
  - Убраны несуществующие поля (greeting, avatar_emoji, is_active)
- [x] **Docker Compose** — добавлен Redis
  - redis:7-alpine с healthcheck
  - REDIS_URL в env бэкенда
  - depends_on: postgres + redis
- [x] **Build проходит чисто** (TypeScript + Next.js production build)

### Архитектура после Сессии 6
```
frontend/src/
  context/AuthContext.tsx     ← NEW: единый контекст авторизации
  hooks/useChat.ts            ← NEW: WebSocket чат + offline fallback
  hooks/useAgents.ts          ← NEW: агенты из API + fallback
  services/api.ts             ← UPDATED: синхронизированы типы
  app/page.tsx                ← UPDATED: useAuth + useChat
  app/layout.tsx              ← UPDATED: AuthProvider
  components/auth/LoginScreen ← UPDATED: API авторизация
  components/communicator/AgentCityModal ← UPDATED: useAgents
```

### Сессия 7 (Июнь 2025)
- [x] **Коммерческий блок** — кнопка «Для бизнеса» в Городе Агентов
- [x] **ЛК Бизнеса** (BusinessDashboardModal) — список своих агентов, статистика, удаление
- [x] **Конструктор Агента** (AgentConstructorModal) — 3 шага:
  - Шаг 1: Имя, профессия, бренд, цвет аватара (14 пресетов)
  - Шаг 2: Описание + приветственное сообщение
  - Шаг 3: AI-модель (GPT-4o Mini/GPT-4o) + системный промпт + превью
- [x] **Backend API конструктора:**
  - `POST /api/agents` — создание агента с owner_id
  - `GET /api/agents/my` — мои агенты
  - `PATCH /api/agents/{id}` — редактирование (только владелец)
  - `DELETE /api/agents/{id}` — мягкое удаление (только владелец)
- [x] **Модель Agent расширена:**
  - `owner_id` (FK на users)
  - `system_prompt` (инструкция для LLM)
  - `llm_model` (gpt-4o-mini / gpt-4o)
  - `greeting` (приветствие)
- [x] **LLM Service** (app/services/llm.py):
  - OpenAI GPT через httpx (async)
  - Системный промпт Дворецкого
  - Контекст диалога (10 последних сообщений)
  - Fallback-ответы если API недоступен
  - Функция `get_agent_reply()` для конкретных агентов
- [x] **WebSocket чат + LLM:**
  - Дворецкий отвечает через GPT (асинхронно, не блокирует WS)
  - Индикатор «печатает...» (typing/typing_stop события)
  - История для контекста LLM
  - Ответы сохраняются в БД
- [x] **Голосовой ввод** (Web Speech API):
  - Распознавание речи на русском (ru-RU)
  - Индикатор распознавания (текст под кнопками)
  - Автоотправка при паузе
  - Режим always-on: перезапуск после каждой фразы
  - Короткое нажатие микрофона: вкл/выкл распознавание
  - Длинное нажатие: always-on / mute
- [x] **Типы Speech API** (speech.d.ts) — полные TypeScript-декларации
- [x] **Build проходит чисто** (TypeScript + Next.js)

### API Эндпоинты после Сессии 7 (20 роутов)
- `POST /api/auth/send-sms` — отправка SMS-кода
- `POST /api/auth/verify-sms` — проверка кода → JWT
- `GET /api/agents` — каталог агентов
- `GET /api/agents/my` — мои агенты (**NEW**)
- `GET /api/agents/{id}` — карточка агента
- `POST /api/agents` — создать агента (**NEW**)
- `PATCH /api/agents/{id}` — редактировать агента (**NEW**)
- `DELETE /api/agents/{id}` — удалить агента (**NEW**)
- `GET /api/chat/history` — история сообщений
- `POST /api/chat/send` — отправка сообщения
- `GET /api/users/me` — профиль
- `PATCH /api/users/me` — обновление настроек
- `WS /ws/chat/{room}` — реалтайм чат + **LLM-ответы**
- `GET /api/health` — здоровье сервиса

### Архитектура после Сессии 7
```
frontend/src/
  types/speech.d.ts                  ← NEW: Web Speech API типы
  services/api.ts                    ← UPDATED: CRUD агентов
  hooks/useChat.ts                   ← UPDATED: typing/typing_stop от сервера
  app/page.tsx                       ← UPDATED: Business + Constructor модалки
  components/communicator/
    AgentCityModal.tsx               ← UPDATED: кнопка «Для бизнеса»
    BusinessDashboardModal.tsx       ← NEW: ЛК Бизнеса
    AgentConstructorModal.tsx        ← NEW: Конструктор (3 шага)
    BottomBar.tsx                    ← UPDATED: Web Speech API голосовой ввод

backend/app/
  models/agent.py                    ← UPDATED: owner_id, system_prompt, llm_model, greeting
  schemas/agent.py                   ← UPDATED: AgentCreate, AgentUpdate
  api/agents.py                      ← UPDATED: CRUD + /my
  services/llm.py                    ← NEW: LLM Service (OpenAI GPT)
  websocket/chat_ws.py               ← UPDATED: LLM-ответы Дворецкого
  core/config.py                     ← UPDATED: OPENAI_API_KEY, OPENAI_MODEL, REDIS_URL
```

### Сессия 7.5 (Июнь 2025)
- [x] **Админка `/admin`** — полная панель управления:
  - Таблица агентов (фильтры, поиск, удалённые)
  - Создание агента (system/business/citizen) + привязка к бизнесу
  - Редактирование всех полей + промпт
  - Привязка/отвязка агента от бизнеса
  - Деактивация / восстановление / жёсткое удаление
  - Пользователи: таблица, поиск, роль/статус
  - Статистика платформы
- [x] **Разделение ролей:**
  - User.is_admin + ADMIN_PHONES в конфиге
  - get_admin_user dependency
  - Админ создаёт агентов → привязывает к бизнесу
  - Бизнес настраивает агента (не создаёт!)
- [x] **Модель персонажа агента** (заложена на масштабирование):
  - Голос: voice_id, voice_speed, voice_pitch
  - Внешность: appearance_preset/face/hair/skin/body
  - Одежда: outfit_style/top/bottom/shoes/accessory
  - Манеры: manner_style/temperament/humor/emoji_use
  - Знания: knowledge_text/urls/files
- [x] **ЛК Бизнеса перестроен:**
  - Убрано создание агентов
  - Настройка: описание, приветствие, промпт, модель
  - Плейсхолдеры: Голос, Внешность, Одежда, Манеры, Знания
- [x] **Admin API (8 новых роутов):**
  - GET/POST /api/admin/agents
  - GET/PATCH/DELETE /api/admin/agents/{id}
  - PATCH /api/admin/agents/{id}/assign
  - PATCH /api/admin/agents/{id}/restore
  - GET /api/admin/users
  - GET /api/admin/stats
- [x] Build чист

### Сессия 8 (Июнь 2025)
- [x] **ЛК Бизнеса — полный UI настройки персонажа (6 секций):**
  - Табы: AI | Манеры | Знания | Голос | Внешность | Одежда
  - AI: описание, приветствие, системный промпт, выбор модели
  - Манеры: стиль общения (4), темперамент (4), юмор ВКЛ/ВЫКЛ, эмодзи ВКЛ/ВЫКЛ
  - Знания: textarea 50 000 символов + плейсхолдеры файлов/URL
  - Голос: 5 пресетов + слайдеры скорость/тон (0.5–2.0)
  - Внешность: лицо (4), волосы (5), кожа (4), телосложение (4)
  - Одежда: стиль (4) + текстовые поля верх/низ/обувь/аксессуар
  - Сохранение всех секций разом через PATCH /api/agents/{id}
- [x] **API типы обновлены:**
  - `AgentFullOut` — 30+ полей персонажа (AI, голос, внешность, одежда, манеры, знания)
  - `AgentPersonaUpdate` — обновление всех секций
  - `getMyAgents()` → `AgentFullOut[]`
- [x] **Сценарий приветствия Дворецкого:**
  - Новый пользователь: развёрнутое приветствие + упоминание голоса
  - Возвращающийся: 5 вариантов с именем, не повторяются подряд
  - Индекс приветствия в localStorage
- [x] **Личный агент пользователя:**
  - Группа «Личные» в MyAgentsModal загружает из API (тип citizen)
  - Есть агенты — аватары с меткой «Личный»
  - Нет агентов — карточка «Создайте своего AI-агента» + кнопка «Подписаться»
- [x] **TTS автоозвучка ответов агентов:**
  - ChatArea.autoSpeak — когда микрофон активен, новые ответы озвучиваются через speechSynthesis
  - BottomBar.onMicStateChange → page.tsx → ChatArea.autoSpeak
- [x] **LLM Service — манеры + знания:**
  - `_build_agent_prompt()` — собирает промпт из манер, знаний, system_prompt
  - Маппинг стилей/темперамента на русские описания
  - База знаний вставляется в контекст (лимит 8000 симв.)
  - `get_agent_reply()` принимает все параметры персонажа
- [x] **Build чист** (TypeScript + Next.js)

### Архитектура после Сессии 8
```
frontend/src/
  services/api.ts                    ← UPDATED: AgentFullOut, AgentPersonaUpdate
  hooks/useChat.ts                   ← UPDATED: buildWelcome() умное приветствие
  app/page.tsx                       ← UPDATED: micActive + autoSpeak
  components/communicator/
    BusinessDashboardModal.tsx       ← REWRITTEN: 6 табов настройки персонажа
    ChatArea.tsx                     ← UPDATED: autoSpeak TTS
    BottomBar.tsx                    ← UPDATED: onMicStateChange
    MyAgentsModal.tsx                ← UPDATED: личные агенты из API

backend/app/
  services/llm.py                    ← UPDATED: _build_agent_prompt(), манеры+знания
```

### Сессия 9 (Июнь 2025)
- [x] **Личный чат с агентом** — основная фича сессии:
  - Нажатие «Начать чат» в Городе Агентов / Моих агентах → переключение комнаты на `agent-{id}`
  - WS комната `agent-{id}` — агент отвечает через `get_agent_reply()` с полным персонажем
  - Манеры, знания, system_prompt агента влияют на ответы
  - История диалога с каждым агентом сохраняется отдельно
  - Offline fallback: локальный ответ агента
- [x] **TopBar — заголовок агента:**
  - В комнате агента: аватар + имя + профессия + online индикатор
  - Кнопка «Назад» → возврат в общую комнату
  - Бегущая строка ЭФИР скрывается в личном чате
- [x] **ChatArea — цвета агентов:**
  - Аватары и имена агентов в их цвете (не только золотой)
  - Индикатор «печатает...» показывает имя агента (не только Дворецкий)
- [x] **Приветствие агента:**
  - При первом открытии чата — greeting агента как первое сообщение
  - Инфо об агенте приходит через WS event `user_joined.agent_info`
- [x] **Backend `_agent_reply()`** — новая функция:
  - Загрузка агента из БД при подключении к комнате `agent-{id}`
  - Typing индикатор с именем агента
  - LLM-ответ через `get_agent_reply()` с полным персонажем
  - Ответ сохраняется в БД с sender_agent_id + agent_color
  - Валидация: если агент не найден — WS закрывается с кодом 4004
- [x] **useChat хук — полный рефакторинг:**
  - `typingName` — кто печатает (агент / Дворецкий)
  - `agentInfo` — информация об агенте в текущей комнате
  - `setRoom()` — переключение комнат (сброс состояния, переподключение WS)
  - Offline fallback: отдельные ответы для агентов и Дворецкого
  - Для комнаты агента: нет welcome Дворецкого, только история + greeting
- [x] **Build чист** (TypeScript + Next.js)

### Архитектура после Сессии 9
```
frontend/src/
  hooks/useChat.ts                   ← UPDATED: AgentRoomInfo, typingName, setRoom, agentInfo, offline agent reply
  app/page.tsx                       ← UPDATED: openAgentChat(), backToGeneral(), room management
  components/communicator/
    TopBar.tsx                       ← UPDATED: заголовок агента + кнопка «Назад»
    ChatArea.tsx                     ← UPDATED: typingName, agentInfo, цветные аватары
    AgentCityModal.tsx               ← UPDATED: onStartChat → открывает личный чат
    MyAgentsModal.tsx                ← UPDATED: onStartChat → открывает личный чат

backend/app/
  websocket/chat_ws.py               ← UPDATED: _agent_reply(), _parse_agent_room(), _load_agent()
                                       Комната agent-{id} → агент отвечает с полным персонажем
```

### Поток «Личный чат с агентом»
```
Пользователь нажимает «Начать чат» в каталоге
  → page.tsx: openAgentChat(agentId)
    → useChat: setRoom("agent-5")
      → WS переподключается к /ws/chat/agent-5
      → Backend: загружает Agent(id=5) из БД
      → WS broadcast: user_joined + agent_info {name, color, greeting}
        → Frontend: setAgentInfo(), показывает greeting
      → TopBar: заголовок агента + кнопка «Назад»

Пользователь пишет сообщение
  → WS send: {text: "Привет!"}
  → Backend: сохраняет в БД + broadcast message
  → Backend: asyncio.create_task(_agent_reply(room, agent, text))
    → typing индикатор с именем агента
    → get_agent_reply(манеры, знания, промпт)
    → typing_stop + broadcast ответ с agent_color
  → Frontend: показывает ответ в цвете агента
```

### Сессия 9 (продолжение)
- [x] **Кнопка «Выйти»** в Центре Управления (logout + возврат на экран входа)
- [x] **Кнопка «Админ»** перенесена в Город Агентов (рядом с «Для бизнеса»)
- [x] **ADMIN_PHONES** работает: +79214787478, is_admin сохраняется в localStorage
- [x] **Fix auth.py**: is_admin передаётся в JWT, ADMIN_PHONES проверяется при SMS
- [x] **Мульти-провайдер LLM** (OpenAI + Gemini + Groq):
  - `_call_openai()`, `_call_gemini()`, `_call_groq()` — три провайдера
  - Автовыбор по наличию ключей (DEFAULT_LLM_PROVIDER)
  - Автоопределение провайдера по имени модели (gemini-*/gpt-*/llama-*)
- [x] **LLM статус в админке** (`/api/admin/llm-status`):
  - Активный провайдер + модель
  - Все провайдеры: подключен/нет, ключ (маскирован), модель
  - UI в табе «Статистика»

### Беседа о стратегии (Сессия 9)
Обсудили ключевые вопросы развития:

**1. Голосовые модели в России (дешевле ElevenLabs в 10-50раз):**
- Yandex SpeechKit — ~$1.5/1М симв (лучшие русские голоса)
- Сбер SaluteSpeech — сопоставимо
- Silero Models — БЕСПЛАТНО, open-source, self-hosted

**2. Бесплатные LLM ключи:**
- **Gemini 2.0 Flash** — 15 req/min бесплатно (aistudio.google.com)
- **Groq** — Llama 3.3 70B бесплатно (console.groq.com)
- **Together AI** — $5 кредит
- **OpenRouter** — агрегатор 100+ моделей

**3. Масштабирование (100+ сессий):**
- Сейчас asyncio.create_task — уже параллельно
- Узкое место — лимиты API провайдеров
- Решение: Redis-очередь + несколько инстансов + своя LLM на GPU

**4. Собственный «завод» голоса и видео (роадмап):**
- Фаза 1 (0-6 мес): API провайдеров (Yandex SpeechKit)
- Фаза 2 (6-12 мес): Свой TTS-сервер (XTTS v2 / Coqui, 1-2 GPU)
- Фаза 3 (12-24 мес): Видео-аватары (Wav2Lip/SadTalker, 4-8 GPU)
- Фаза 4 (24+ мес): GPU-кластер (TTS+STT+LLM+Video, 16-64 карт)

**5. Собственная LLM (важно для будущего):**
- **vLLM + Llama 3.1 8B** — минимум для старта, 1× RTX 4090 (24GB), хватит для 50-100 агентов
- **Llama 3.1 70B (4-bit quant)** — 2× RTX 4090, качество близко к GPT-4o-mini
- **Qwen 2.5 72B** — альтернатива, хорошо понимает русский
- Себестоимость: ~$0.001/1K токенов vs $0.15 у OpenAI — в 150раз дешевле
- Запуск: `vllm serve meta-llama/Llama-3.1-8B-Instruct --api-key xxx`
- API совместим с OpenAI — наш `_call_openai()` работает без изменений
- Нулевая зависимость от внешних API, полный контроль

### Сессия 10 (Июнь 2025)
- [x] **Production деплой — полный комплект:**
  - `Dockerfile` для фронтенда (multi-stage: deps → build → standalone runner)
  - `docker-compose.prod.yml` — 6 сервисов: postgres, redis, backend, frontend, nginx, certbot
  - `nginx/` — reverse proxy + SSL + WebSocket + gzip + security headers
  - `deploy.sh` — автоматический скрипт первого деплоя (проверка .env, SSL, запуск)
  - `env.template` — шаблон переменных окружения
  - `docs/DEPLOY.md` — полная инструкция по деплою
  - Healthchecks для всех сервисов
  - Certbot автообновление SSL
- [x] **api.ts — production-ready WebSocket:**
  - `connectChat()` автоопределение: wss:// для HTTPS, ws:// для dev
  - API_BASE пустая строка в prod (тот же домен, nginx проксирует)
  - `NEXT_PUBLIC_API_URL` проверка `!== undefined` (пустая строка валидна)
- [x] **Aimigo Links — публичные ссылки на агентов:**
  - `GET /api/agents/link/{slug}` — публичный API (без авторизации)
  - `/a/[slug]` — Next.js динамический роут
  - Красивая карточка агента: аватар, имя, профессия, рейтинг, описание, приветствие
  - Кнопка "Начать чат" → localStorage intent → переход на / → открытие чата
  - Кнопка "Скопировать ссылку" (clipboard)
  - Страница 404 если агент не найден
- [x] **page.tsx — подхват Aimigo Link:**
  - useEffect проверяет `aimigo_open_agent` в localStorage
  - Автооткрытие чата с агентом после авторизации
- [x] **next.config.ts** — `output: "standalone"` (для Docker)
- [x] **Build чист** (TypeScript + Next.js)

### Архитектура после Сессии 10
```
│
├── docker-compose.prod.yml       ← NEW: production compose (6 сервисов)
├── deploy.sh                     ← NEW: скрипт деплоя (авто-SSL)
├── env.template                  ← NEW: шаблон .env
├── nginx/nginx.conf              ← NEW: основной конфиг
├── nginx/conf.d/default.conf     ← NEW: виртуальный хост (SSL + proxy)
│
frontend/
  Dockerfile                        ← NEW: multi-stage build
  .dockerignore                     ← NEW
  next.config.ts                    ← UPDATED: output: "standalone"
  src/services/api.ts               ← UPDATED: production WS, API_BASE
  src/app/page.tsx                  ← UPDATED: Aimigo Link intent
  src/app/a/[slug]/page.tsx         ← NEW: публичная страница агента

backend/
  app/api/agents.py                 ← UPDATED: GET /api/agents/link/{slug}

docs/
  DEPLOY.md                         ← NEW: инструкция по деплою
```

### Production архитектура
```
Internet
  │
  ├─ :80  (HTTP)  ─→ Nginx ─→ redirect to :443
  │
  └─ :443 (HTTPS) ─→ Nginx
                      ├─ /api/*    ─→ Backend (FastAPI :8000)
                      ├─ /ws/*     ─→ Backend (WebSocket)
                      ├─ /a/{slug} ─→ Frontend (Next.js :3000) ─ Aimigo Link
                      └─ /*        ─→ Frontend (Next.js :3000)
```

### Aimigo Links — поток
```
Пользователь открывает https://aimigo.ru/a/tim-adidas
  → Next.js: /a/[slug] роут
  → fetch /api/agents/link/tim-adidas (без авторизации)
  → Красивая карточка агента
  → Кнопка "Начать чат"
    → localStorage.setItem("aimigo_open_agent", agentId)
    → router.push("/")
    → [авторизация если нужна]
    → page.tsx подхватывает intent
    → openAgentChat(agentId)
    → Личный чат с агентом
```

### Сессия 10 (продолжение) — Реальный деплой
- [x] **Сервер 194.67.101.9 — развёрнут и работает!**
  - Ubuntu 24.04, 4GB RAM, 59GB SSD
  - Docker 29.4.1 + Compose 5.1.3 установлены
  - Git clone с GitHub в /root/aimigo/
  - .env настроен (Postgres, Redis, секреты)
  - `docker compose -f docker-compose.prod.yml up -d --build` — все 5 сервисов работают
  - Nginx на порту 3080 (чтобы не конфликтовать со старым nginx на 80/443)
  - Backend DEBUG=true (для SMS-кодов в MVP)
  - Старый talkie-talkie.online не тронут (/root/talkie-talkie-online/)
- [x] **Проверено:**
  - http://194.67.101.9:3080 — фронтенд открывается
  - http://194.67.101.9:3080/api/health — {"status":"ok"}
  - SMS-авторизация работает (debug-код автоподставляется)
  - Вход в коммуникатор — работает

### Сессия 11 (Апрель 2026)
- [x] **OpenRouter подключён** — агрегатор 100+ моделей:
  - `_call_openrouter()` с авто-fallback между бесплатными моделями при 429
  - Gemma 3 27B/12B/4B, Llama 3.3 70B (бесплатные)
  - DeepSeek V3, Gemini Flash, Claude Haiku, GPT-4o (платные)
  - `_prepare_openrouter_messages()` — мерж system prompt для моделей без поддержки
- [x] **DeepSeek провайдер** — прямой API (api.deepseek.com):
  - `_call_deepseek()` — OpenAI-совместимый, дешёвый ($0.27/M), работает из РФ
  - Ключ прописан в .env, но требует пополнения баланса на platform.deepseek.com
  - Модели: deepseek-chat (V3), deepseek-reasoner (R1)
- [x] **5 LLM-провайдеров** в llm.py:
  - DeepSeek, OpenRouter, OpenAI, Gemini, Groq
  - Автовыбор по наличию ключей + автоопределение по имени модели
  - Cascading fallback: если предпочтительный недоступен — пробует следующий
- [x] **Выбор модели в админке** — при создании/редактировании агента:
  - DeepSeek V3/R1
  - OpenRouter: бесплатные (Gemma, Llama) + платные (Claude, GPT)
  - Прямые API (OpenAI, Gemini, Groq)
- [x] **LLM-статус в админке** — DeepSeek добавлен в панель провайдеров
- [x] **Деплой обновлён** — все контейнеры пересобраны и работают
- [ ] **Настройки Дворецкого в админке** — выбор модели/провайдера для Дворецкого (задача для Sonnet)

### Архитектура после Сессии 11
```
backend/app/
  core/config.py                     ← UPDATED: DEEPSEEK_API_KEY, DEEPSEEK_MODEL, DEFAULT_LLM_PROVIDER
  services/llm.py                    ← UPDATED: _call_deepseek(), _call_openrouter(), 5 провайдеров
  api/admin.py                       ← UPDATED: DeepSeek в LLM-статусе

frontend/src/
  app/admin/page.tsx                 ← UPDATED: DeepSeek в выборе моделей
```

---

## Модель работы: Opus + Sonnet

**Принято в Сессии 11.** Разделяем работу между двумя моделями:

**Claude Opus 4 (архитектор):**
- Анализ задачи, декомпозиция на подзадачи
- Архитектурные решения, сложные интеграции
- Подготовка ТЗ для Sonnet
- Ревью результатов Sonnet, исправление ошибок
- Обновление документации, стратегия
- Деплой на сервер

**Claude Sonnet 3.5/3.7 (исполнитель):**
- Написание кода по чёткому ТЗ
- Рутинные фронтенд/бэкенд задачи
- UI-компоненты, API-эндпоинты, CRUD
- Быстрые фиксы и доработки

**Процесс:**
1. Opus анализирует задачу, пишет ТЗ для Sonnet
2. Пользователь переключается на Sonnet, даёт ТЗ
3. Sonnet выполняет задачу
4. Пользователь переключается на Opus, говорит «сонет сделал»
5. Opus проверяет, исправляет если нужно, деплоит

---

### Что следующее (Сессия 12)

**Задача для Sonnet (готово ТЗ):**
- Настройки Дворецкого в админке (выбор модели, промпт, тест)

**После Sonnet (Opus проверяет + деплоит):**
- Ревью кода Sonnet
- Пополнить баланс DeepSeek и переключить провайдер
- Деплой на сервер

**Дальше:**
1. Привязать домен aimigo.online + SSL
2. SMS-сервис (smsc.ru / sms.ru)
3. Микрофон на HTTPS
4. Первый кейс — реальный бизнес, реальные клиенты
5. Дизайн-ревизия

### Сессия 14 (Май 2026)
- [x] **Домен aimigo.online привязан + SSL работает**
- [x] **Настройки Дворецкого в админке** (TASK_SONNET_001 выполнена)
  - GET/PATCH /api/admin/butler-settings
  - POST /api/admin/butler-test
  - UI в админке: провайдер, модель, промпт, тест
  - Redis хранение butler:settings
- [x] **Архитектурные решения сессии:**
  - Qdrant вместо pgvector (D022)
  - Трёхуровневая архитектура: Коммуникатор → Коннектом → Синцитий (D023)
  - GPT-SoVITS основной TTS, XTTS v2 fallback (D024)
  - Библиотека голосов управляется админом (D025)
  - Haystack 2.0 для RAG (D026)
  - "Офис" → "Работа" (D027)
  - Режим "Дорога" (D028)
  - Мультиязычность + Грузия (D029)
  - Умное сохранение в Коннектом (D030)
  - B2B тариф: 35К + 150К (D031)
- [ ] **Баги выявлены:**
  - iPhone 17 Pro: микрофон/голос не работает (Web Speech API iOS)
  - Android: блокировка скроллинга чата в PWA

### Сессия 15 (Май 2026)
- [x] **Фронтенд контрагентов — полный комплект:**
  - api.ts: ContractorOut, ContractorCreateData, ContractorUpdateData типы
  - api.ts: admin CRUD (list, create, update, delete, add-balance, assign-agent)
  - api.ts: contractor auth (login, getMe, getAgents, updateAgent, logout)
  - contractorFetch() с отдельным JWT
- [x] **Админка — вкладка "Контрагенты" (🏢):**
  - Таблица: компания, ИНН, логин, баланс, скидка, статус, дата
  - Карточка: юр. данные, контакты, пополнение баланса, привязка агента
  - Создание/редактирование/деактивация
  - Поиск по компании, логину, ИНН
- [x] **BusinessDashboardModal — ЛК Контрагента:**
  - Форма входа (логин/пароль) если нет сессии
  - При успехе — список агентов с настройкой (6 табов)
  - Кнопка "Выйти"
  - Отдельный JWT токен (aimigo_contractor_token)
- [x] **SMS сервис (sms.ru + smsc.ru):**
  - app/services/sms.py — async httpx
  - Провайдеры: sms_ru (основной), smsc (альт), debug
  - Конфиг: SMS_PROVIDER, SMS_RU_API_KEY, SMSC_LOGIN/PASSWORD
  - При DEBUG=True — код в консоль + ответ API
  - При DEBUG=False — реальная отправка через sms.ru/smsc
- [x] **Системные настройки в админке:**
  - GET/PATCH /api/admin/system-settings
  - Redis хранение (system:settings) перекрывает .env
  - UI: SMS провайдер, API-ключ (маскированный), DEBUG режим
  - Переключение без перезапуска сервера
- [x] **Фикс БД:** добавлены колонки contractor_id, is_template, template_id, visibility, unavailable_message в agents
- [x] **4 деплоя** — всё работает на https://aimigo.online

### Архитектура после Сессии 15
```
frontend/src/
  services/api.ts                    ← UPDATED: Contractor CRUD + auth + SystemSettings types
  app/admin/page.tsx                 ← UPDATED: вкладка "Контрагенты" + "Системные настройки"
  components/communicator/
    BusinessDashboardModal.tsx       ← UPDATED: форма входа + contractor API

backend/app/
  services/sms.py                    ← NEW: SMS сервис (sms.ru + smsc) + Redis override
  api/admin.py                       ← UPDATED: system-settings endpoints
  api/auth.py                        ← UPDATED: вызов send_sms_code()
  core/config.py                     ← UPDATED: SMS_PROVIDER, SMS_RU_API_KEY, SMSC_*
```

### Что дальше (Сессия 16)
1. Получить API-ключ sms.ru → вставить в админке → переключить PRODUCTION
2. Первый кейс — реальный бизнес, реальные клиенты
3. Дизайн-ревизия (AI-native интерфейс)
4. TTS — Yandex SpeechKit / GPT-SoVITS
5. RAG — Haystack 2.0 + Qdrant (база знаний агентов)
6. Нативное приложение (React Native / Expo)

---

## Заметки по дизайну (Сессия 9 — честный анализ)

**Что хорошо:**
- Voice-first концепция — правильная ставка
- Фоновые частицы — атмосферно
- Система тем — гибкость
- Контекстное меню пузырей — продуманно

**Что устарело («прошлый век»):**
- Боковые панели с язычками — паттерн 2015 года (мессенджеры ушли от этого)
- 5 кнопок внизу — перегруженность, нет иерархии
- Бегущая строка ЭФИР — ассоциация с ТВ-новостями 2000-х
- Пузыри чата — стандартные, как везде
- Аватары-буквы — временно (нужны настоящие аватары)

**Куда целиться (AI-native дизайн 2025):**
- Центральный объект — аватар агента (круг, анимация, голосовые волны), как в Her (2013)
- Минимализм: только аватар + голос + текст под ним
- Навигация жестами: свайп влево = следующий агент, свайп вниз = чат, свайп вверх = каталог
- Референсы: фильм Her, Apple Vision Pro, Rabbit R1, Humane AI Pin
- Возможно привлечь UI/UX дизайнера для концепта

---

## Источники
- Старый проект: `talkie-talkie-online/` (склонирован)
- Стабильная версия v0.39: коммит `8680c0c` / файл до разбиения: коммит `50aaa15`
- Оригинальный index.html (5258 строк): `git show 50aaa15:templates/index.html`

### Сессия 16 (Май 2026)
- [x] **Новая архитектура настроек агента (8 табов в админке):**
  - Основное: имя, профессия, бренд, тип, цвет, модель, описание, приветствие
  - Правила: системный промпт (админ: r/w, контрагент: r/o)
  - Скилы: навыки продаж, скрипты, воронки (оба: r/w)
  - Обучение: база знаний + кнопки файлы/1С/облако (плейсхолдеры)
  - Отмена: стоп-слова, запрещённые темы, исключения
  - Режимы: Прогулка/Шоппинг/Дорога/Общение/Работа (вкл/выкл + правила + контекст)
  - Персонаж: манеры, голос, внешность, одежда
  - Управление: остановить/запустить/обновить/удалить/проверить контекст
- [x] **Backend новые поля Agent:**
  - skills_text, exclusions_text
  - mode_{walk,shopping,drive,chat,work}_{enabled,rules,context}
  - SQL миграция (17 колонок)
- [x] **LLM prompt builder обновлён:**
  - Порядок: ПРАВИЛА → СКИЛЫ → ОБУЧЕНИЕ → ОТМЕНА → РЕЖИМ → МАНЕРЫ
- [x] **AgentSettingsPanel** — новый компонент (вынесен из админки)
- [x] **Фикс** created_at сериализация (datetime → str)
- [x] **Деплой** — 2 коммита, всё работает
- [x] **Концепция: Агенты-Специалисты с парсером и RAG** (SESSION16_NOTES.md)

### Архитектура после Сессии 16
```
frontend/src/
  components/admin/AgentSettingsPanel.tsx  ← NEW: 8 табов настроек агента
  app/admin/page.tsx                      ← UPDATED: использует AgentSettingsPanel
  services/api.ts                         ← UPDATED: новые поля в типах

backend/app/
  models/agent.py                         ← UPDATED: skills_text, exclusions_text, mode_*
  schemas/agent.py                        ← UPDATED: AgentDetailOut, AgentUpdate + serializer
  services/llm.py                         ← UPDATED: _build_agent_prompt() 6 блоков
  websocket/chat_ws.py                    ← UPDATED: передаёт skills + exclusions
  migrations/add_agent_settings_v2.sql    ← NEW: 17 колонок
```

### Сессия 17 (Май 2026)
- [x] **RAG System — полная реализация:**
  - Qdrant в docker-compose (healthcheck, volume, интеграция с backend)
  - Embedding Service (Jina v3 1024d / OpenAI 1536d)
  - Parser Service (fetch HTML, extract articles, chunk 1500симв + overlap 200)
  - RAG Service (Qdrant CRUD, semantic search, batch indexing)
  - 8 Admin API endpoints (источники, парсинг, поиск, статистика, лог)
  - Интеграция с LLM: RAG context в промпт для specialist-агентов
  - WebSocket: авто-RAG поиск перед ответом
- [x] **3 новых таблицы БД:**
  - `agent_sources` — источники (URL, тип, слой, расписание)
  - `agent_rag_chunks` — чанки (текст, qdrant_point_id, метаданные)
  - `agent_parse_log` — лог парсинга (действия, ошибки)
- [x] **Тип агента `specialist`:**
  - Новое значение agent_type
  - Таб "Парсер" в админке (только для specialist)
  - RAG search → top-5 chunks → промпт LLM
- [x] **Админка — RAGPanel (таб Парсер):**
  - Статистика (chunks, источники, dimensions)
  - Добавление источников + парсинг + удаление
  - Индексация raw text (без URL)
  - Тестовый поиск (score + фрагменты)
  - Лог парсинга
- [x] **ЛК Контрагента — новые табы:**
  - Правила (read-only)
  - Скилы (r/w)
  - Отмена (r/w)
  - Режимы (r/w — 5 режимов с правилами и контекстом)
- [x] **Деплой** — всё работает на https://aimigo.online

### Архитектура после Сессии 17
```
backend/app/
  services/embedding.py                ← NEW: Jina/OpenAI embeddings
  services/parser.py                   ← NEW: HTML → articles → chunks
  services/rag.py                      ← NEW: Qdrant CRUD + search
  services/llm.py                      ← UPDATED: rag_context в промпте
  api/rag.py                           ← NEW: 8 admin endpoints
  models/rag.py                        ← NEW: AgentSource, AgentRAGChunk, AgentParseLog
  websocket/chat_ws.py                 ← UPDATED: RAG search для specialist
  core/config.py                       ← UPDATED: Qdrant + embedding settings

frontend/src/
  services/api.ts                      ← UPDATED: RAG types + API functions
  components/admin/AgentSettingsPanel   ← UPDATED: RAGPanel + specialist type
  components/communicator/BusinessDashboardModal ← UPDATED: 4 новых таба

docker-compose.prod.yml                ← UPDATED: Qdrant service + volume
migrations/add_rag_tables.sql          ← NEW: 3 таблицы
```

### Что дальше (Сессия 18)
1. Получить JINA_API_KEY → полный тест RAG
2. Первый специалист: Агент ПДД
3. SMS production (ключ sms.ru)
4. Автообновление источников (APScheduler)
5. Дизайн-ревизия

---

*Обновляется после каждой сессии работы*

### Сессия 18 (Май 2026)
- [x] **Ребрендинг: Aimigo → JinnTell**
  - Новый GitHub репо: talkietalkieonline-architect/jinntell.git
  - Новая папка на сервере: /root/jinntell/
  - Домен jinntell куплен (не привязан)
  - Старый aimigo.online — работает, не трогаем
- [x] **Авторизация переделана: SMS → Логин/Пароль**
  - `POST /api/auth/register` — регистрация (телефон + пароль + email)
  - `POST /api/auth/login` — вход (телефон + пароль)
  - `POST /api/auth/forgot-password` — код восстановления на email
  - `POST /api/auth/reset-password` — сброс пароля по коду
  - Legacy SMS endpoints сохранены для совместимости
  - LoginScreen: 4 экрана (вход, регистрация, забыл пароль, сброс)
- [x] **OAuth заготовки (ВК, Яндекс, Telegram):**
  - `GET /api/auth/oauth/vk` → redirect → callback → JWT
  - `GET /api/auth/oauth/yandex` → redirect → callback → JWT
  - `POST /api/auth/oauth/telegram` — Telegram Login Widget + HMAC проверка
  - Кнопки OAuth на экране входа/регистрации
  - AuthContext: обработка ?auth_token= из URL (OAuth callback)
  - Config: VK_CLIENT_ID/SECRET, YANDEX_CLIENT_ID/SECRET, TELEGRAM_BOT_TOKEN, SITE_URL
- [x] **Модель User расширена:**
  - email, first_name, last_name, birth_date, city, about
  - vk_id, telegram_id, yandex_id (OAuth привязки)
  - reset_code, reset_code_expires (восстановление пароля)
- [x] **Персональные данные в Центре Управления:**
  - SettingsModal → "Персональные данные": имя, фамилия, отображаемое имя, телефон (r/o), email, дата рождения, город, о себе
  - Привязанные аккаунты (ВК, Telegram, Яндекс) — статус + кнопка
  - Сохранение через PATCH /api/users/me
- [x] **Админка — расширена таблица пользователей:**
  - Колонки: email, имя/фамилия, город, соцсети (ВК/TG/Я), дата
- [x] **SQL миграция:** backend/migrations/add_user_profile_fields.sql
- [x] **Build чист** (TypeScript + Next.js)
- [x] **Всё запушено в новый GitHub репо**

### Архитектура после Сессии 18
```
ИЗМЕНЁННЫЕ ФАЙЛЫ:
backend/app/models/user.py          ← email, OAuth IDs, reset_code, personal data
backend/app/schemas/auth.py         ← RegisterRequest, LoginRequest, ForgotPassword, ResetPassword
backend/app/schemas/user.py         ← UserOut.from_user(), расширенный UserUpdate
backend/app/api/auth.py             ← ПОЛНОСТЬЮ ПЕРЕПИСАН: register/login/forgot/reset/OAuth
backend/app/api/users.py            ← personal data fields в PATCH /me
backend/app/api/admin.py            ← расширенная таблица пользователей
backend/app/core/config.py          ← OAuth keys, SITE_URL
frontend/src/services/api.ts        ← register/login/forgot/reset/OAuth, UserProfile расширен
frontend/src/components/auth/LoginScreen.tsx  ← ПОЛНОСТЬЮ ПЕРЕПИСАН: 4 экрана
frontend/src/components/communicator/SettingsModal.tsx ← Персональные данные
frontend/src/context/AuthContext.tsx ← OAuth token из URL
frontend/src/app/admin/page.tsx     ← расширенная таблица пользователей
backend/migrations/add_user_profile_fields.sql ← SQL миграция
```


### Сессия 19 (Май 2026)
- [x] **jinntell.com — LIVE!**
  - Docker compose на порту 3090 (параллельно с aimigo на 3080)
  - SSL-сертификат Let's Encrypt для jinntell.com + www
  - Nginx reverse proxy (системный nginx :443 → docker :3090)
  - CORS обновлён для https://jinntell.com
- [x] **Ребрендинг Aimigo → JinnTell:**
  - 18 файлов (frontend + backend) — все UI-тексты, логотипы, заголовки
  - БД: brand "Aimigo" → "JinnTell", greeting обновлён
  - API health: service="jinntell"
  - layout.tsx title: "JinnTell — AI-First"
- [x] **UID-система для агентов и контрагентов:**
  - Поле `uid` в моделях Agent (A-00001) и Contractor (C-00001)
  - Автогенерация при создании
  - SQL миграция: колонки + индексы + заполнение существующих
  - Отображение uid в админке (карточки, списки, привязка)
- [x] **SQL миграции выполнены:** user_profile + agent_settings + rag_tables + uid_fields
- [x] **Всё запушено в GitHub**

### Архитектура после Сессии 19
```
Интернет
  │
  ├─ aimigo.online (:443) → nginx → :3080 → Docker aimigo (7 контейнеров)
  │
  └─ jinntell.com (:443) → nginx → :3090 → Docker jinntell (7 контейнеров)
      ├── postgres (отдельная БД от aimigo)
      ├── redis
      ├── qdrant
      ├── backend (FastAPI)
      ├── frontend (Next.js)
      ├── nginx (внутренний)
      └── certbot
```

### Что дальше (Сессия 20)

**Вкладка «Системные агенты» в админке:**
- Тип агента `core` — скрыт из Города
- 4 предустановленных: Мэл (ex-Дворецкий), Агент Админ, Агент Контента, Агент Железа
- Карточки с настройками, правилами, задачами, ключами

**Вкладка «Система» в админке:**
- LLM-провайдеры, ключи, балансы, статусы
- Сервисы: SMS, Embedding, Qdrant, Redis
- Добавление моделей/ключей из UI

**RAG-инфо в карточке каждого агента**

**Переименование Дворецкий → Мэл**

**Сессия 21:** Системные агенты работают (фоновые таски, middleware, мониторинг)

---

*Обновляется после каждой сессии работы*

### Сессия 20 (Май 2026)
- [x] **Переименование Дворецкий → Мэл:**
  - llm.py: MEL_SYSTEM_PROMPT (legacy alias BUTLER_SYSTEM_PROMPT)
  - chat_ws.py: _mel_reply() (legacy alias _butler_reply)
  - useChat.ts: sender_type "mel" (backward compat с "butler")
  - ChatArea, RightPanel, page.tsx — все UI-тексты
  - БД: messages.sender_name обновлён, sender_type="mel"
  - Старый Дворецкий (id=1) деактивирован
- [x] **Тип агента `core` — системное ядро:**
  - Скрыт из Города Агентов (visibility: "core")
  - agents API фильтрует core из публичного каталога
  - 4 предустановленных core-агента (seed_core_agents)
- [x] **4 core-агента созданы:**
  - Мэл (A-00015) — личный помощник, ex-Дворецкий
  - Агент Админ (A-00016) — мониторинг системы
  - Агент Контента (A-00017) — контроль качества ответов
  - Агент Железа (A-00018) — DevOps, инфраструктура
- [x] **Вкладка «Системные агенты» в админке:**
  - Карточки core-агентов с полным AgentSettingsPanel
  - Кнопка «+ Добавить системного агента»
  - Описание: "Core-агенты — внутреннее ядро платформы"
- [x] **Вкладка «Система» в админке:**
  - Сервисы: Redis, Qdrant, PostgreSQL, Embedding, SMS — статус + метрики
  - LLM-провайдеры: 5 карточек, ключи (маскированные), модели, default метка
  - Настройки Мэла: провайдер, модель, промпт, тест
  - SMS настройки: провайдер, ключи, debug-режим
- [x] **Новые API эндпоинты:**
  - GET /api/admin/core-agents — список core-агентов
  - GET /api/admin/system-info — полная диагностика системы
  - GET/PATCH /api/admin/mel-settings — настройки Мэла
  - POST /api/admin/mel-test — тест Мэла
  - Legacy aliases: butler-settings, butler-test (обратная совместимость)
- [x] **Admin stats обновлены:** core + specialist счётчики
- [x] **Schema обновлена:** visibility в AgentOut/AgentDetailOut
- [x] **Build чист** (TypeScript + Next.js)
- [x] **Деплой** — всё работает на https://jinntell.com
- [x] **Запушено в GitHub**

### Архитектура после Сессии 20
```
ИЗМЕНЁННЫЕ ФАЙЛЫ (14):
backend/app/api/admin.py              ← core-agents endpoint, system-info, mel-settings/test
backend/app/api/agents.py             ← filter core from public catalog
backend/app/schemas/agent.py          ← visibility field
backend/app/services/llm.py           ← MEL_SYSTEM_PROMPT, mel:settings Redis keys
backend/app/services/seed.py          ← seed_core_agents(), 4 core agents
backend/app/websocket/chat_ws.py      ← _mel_reply(), sender_type="mel"
backend/main.py                       ← seed_core_agents() call
backend/migrations/session20_core_agents.sql ← NEW

frontend/src/app/admin/page.tsx       ← 2 новые вкладки: core_agents + system
frontend/src/app/page.tsx             ← Дворецкий → Мэл
frontend/src/components/communicator/ChatArea.tsx   ← mel sender type
frontend/src/components/communicator/RightPanel.tsx ← isMel (ex-isButler)
frontend/src/hooks/useChat.ts         ← mel sender, MEL_REPLIES
frontend/src/services/api.ts          ← MelSettings, SystemInfo, adminGetCoreAgents
```

### Core-агенты
```
Мэл (A-00015)           — Личный помощник, связующее звено с Городом
Агент Админ (A-00016)    — Мониторинг агентов, latency, ошибки
Агент Контента (A-00017) — Контроль качества, антигаллюцинации
Агент Железа (A-00018)   — CPU/RAM/Disk, Docker, БД
```

### Вкладки админки (6):
```
🤖 Агенты           — CRUD всех агентов (system/business/citizen/specialist)
⚙️ Системные агенты — 4 core-агента с полными настройками
🏢 Контрагенты      — CRUD контрагентов
👥 Пользователи     — таблица пользователей
🖥️ Система          — сервисы, LLM, Мэл, SMS
📊 Статистика        — счётчики, LLM статус, Мэл (legacy)
```

### Что дальше (Сессия 21)
1. Системные агенты работают реально (фоновые таски, middleware, cron)
2. RAG-инфо в карточке каждого агента
3. Дашборд реального времени с метриками
4. SMS production (ключ sms.ru)
5. Первый кейс — реальный бизнес

---

*Обновляется после каждой сессии работы*

### Сессия 20 (дополнение)
- [x] Jina API key прописан в .env (заблокирован из РФ — HTTP 451)
- [x] Gemini Embeddings добавлен как провайдер (тоже заблокирован — HTTP 400)
- [x] embedding.py: 3 провайдера (Jina → Gemini → OpenAI) + fallback chain
- [x] Embedding секция в админке: провайдер select + Jina API Key поле + RAG roadmap
- [x] Ключи убраны из кода/документации → только .env
- [x] CLAUDE_SESSION.md: план Сессии 21 (JinnTell ребрендинг + MCP тестирование)

### План Сессии 21
1. **Ребрендинг → JinnTell** (если куплен домен jinntell.com)
   - Структура: /talk (коммуникатор), /city (каталог), /city/spb/slug (карточка), /memo (RAG)
   - Красивые адреса джиннов для контрагентов: jinntell.com/city/spb/tim-adidas
2. **MCP тестирование** (Playwright) — полный E2E тест через браузер
3. **Быстрый чат в карточке джинна** — мини-чат в каталоге
4. Системные агенты реально работают (если останется время)

### Свободные домены (проверено):
- jinntell.com ✅
- jinntell.ru ✅
- jinntell.io ✅
- jinncity.com ✅
- jinncity.ru ✅

### Сессия 21 (Май 2026)
- [x] **Генеральная уборка сервера:**
  - Удалены /root/aimigo/, /root/myelinks/, /root/talkie-talkie-online/
  - Единственный проект: /root/jinntell/
  - Новый GitHub репо: talkietalkieonline-architect/jinntell.git
- [x] **Ребрендинг MyeLinks -> JinnTell** (массовая замена во всех файлах)
- [x] **Домен jinntell.ru привязан + SSL** (Let's Encrypt до 17 авг 2026)
- [x] **Docker 7 контейнеров healthy** на https://jinntell.ru
- [x] **На Маке: ~/jinntell/start_claude.md**
- [x] **Персонализация помощника (Backend готов):**
  - User model: assistant_name, assistant_gender, assistant_voice, assistant_photo
  - SQL миграции выполнены
  - Типы: male/female/animal/other + голоса по типу
  - Фото помощника: base64 в PostgreSQL
- [ ] **Frontend build BROKEN** — SettingsModal.tsx нужен фикс

### Безопасность (заметки):
- Qdrant: данные разделены по agent_id, пользователи не имеют прямого доступа
- Фото помощника: base64 в PostgreSQL (MVP), позже S3/MinIO
- API ключи: только в .env, не в коде, не в Git
- Рекомендация: после запуска сменить SSH пароль, ротировать ключи API

### Что дальше (Сессия 22)
1. ПОЧИНИТЬ frontend build (SettingsModal.tsx через scp)
2. Завершить UI настроек помощника
3. Ребрендинг UI: Агенты -> Джинны
4. fastembed — локальные embeddings
5. Красивые URL
6. Коммит + пуш в GitHub
