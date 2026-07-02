# JinnTell — Карта сервиса (SERVICE_MAP)

Единый обзор архитектуры: данные, API, WebSocket, инварианты, фронт, сервисы.
Цель — чтобы при доработках (в т.ч. мобильное приложение) **не ломать существующие механики**.
Мобильное приложение переиспользует те же REST + WebSocket + JWT — бэкенд не привязан к вебу.

## 1. Стек и инфраструктура
- **Frontend:** Next.js 16 (App Router, standalone), TypeScript, Tailwind. Клиент общается с бэком по REST (`/api/*`) и WebSocket (`/ws/*`).
- **Backend:** FastAPI (async), SQLAlchemy async, PostgreSQL, Redis, Qdrant.
- **Docker Compose** (`docker-compose.prod.yml`): postgres, redis, qdrant, backend, frontend, nginx.
- **nginx** (`nginx/conf.d/default.conf`): `/api/`→backend, `/ws/`→backend (upgrade), `/_next/static/`→immutable, `/`→frontend с **`Cache-Control: no-store`** (фикс чёрного экрана после деплоя). Внешний хостовый nginx терминирует HTTPS (jinntell.ru → :3090).
- **Хранилище файлов:** том `./storage`, отдаётся статикой `app.mount("/api/storage", StaticFiles(...))`. Пути: `storage/users/{id}/avatar.*`, `assistant.*`; агентские фото/гардероб.
- **Деплой:** `docker compose build <svc> && up -d --force-recreate <svc>`. ВСЕГДА проверять `Compiled successfully` в логе сборки фронта перед деплоем.

## 2. Данные (таблицы PostgreSQL)
| Таблица | Назначение |
|---|---|
| `users` | пользователи: phone(логин), display_name(ник), jinntell_link(@username), email, first/last_name, birth_date, city, **gender**(реальный), **persona_gender**(образ), **interests**, **avatar_url**, assistant_name/gender/voice/photo, theme/background/custom_accent, is_online, is_admin |
| `agents` | джинны: name, profession, brand, color, agent_type(business/specialist/core/citizen), **visibility**(public/hidden/core), owner_id, contractor_id, system_prompt, llm_model, greeting, manner_*, knowledge_text, skills_text, exclusions_text, tts_*, video_*, appearance_*/outfit_*, photo_url, mode_* |
| `agent_access` | список доступа к **скрытым** агентам: (agent_id, user_id) |
| `user_favorites` | избранные джинны пользователя: (user_id, agent_id) |
| `contacts` | адресная книга людей: (owner_user_id, contact_user_id) |
| `messages` | сообщения чата: room, sender_type(user/assistant/agent), sender_user_id, sender_agent_id, sender_name, text, created_at |
| `rooms` / `room_members` | комнаты с несколькими джиннами (owner_user_id, title) + участники-агенты (room_id, agent_id) |
| `feed_events` | Лента: user_id, kind(info/reminder/offer/event), icon, title, body, link_room, agent_id, is_read |
| `contractors` | бизнес-аккаунты (ЛК): реквизиты, баланс |
| `agent_sources`/`agent_rag_chunks`/`agent_parse_log` | RAG знаний джиннов (источники, чанки в Qdrant, лог парсинга) |
| `agent_wardrobe` | гардероб джинна (образы) |
| `app_settings` | key/value настройки из админки (ключи интеграций, EMBEDDING_PROVIDER, OUTBOUND_PROXY) |

## 3. REST API (по роутерам)
- **/api/auth** — register, login, forgot/reset-password, oauth (vk/yandex/telegram), send/verify-sms. Возвращает JWT (Bearer).
- **/api/users** — `GET/PATCH /me`; `/me/businesses`, `/me/businesses/{cid}/token`; `POST/DELETE /me/assistant-photo`; `POST/DELETE /me/avatar`.
- **/api/agents** (Город) — `GET ""` (каталог, фильтр по видимости+городу), `/my`, `/favorites` (GET/POST/DELETE), `/recommended`, `/link/{slug}`, `GET/PATCH /{id}`. Скрытые агенты гейтятся (`services/access.py:can_access_agent`).
- **/api/contacts** — `GET /search` (поиск людей), `GET/POST ""`, `DELETE /{user_id}`.
- **/api/chat** — `GET /history?room=` (для agent-комнат агрегирует 1:1+комнаты), `GET /my-chats` (DM+мои комнаты для ленты), `POST /send`.
- **/api/rooms** — `POST ""` (создать комнату из джиннов), `POST /{id}/invite`, `GET /{id}`.
- **/api/feed** — `GET ""`, `POST /{id}/read`, `DELETE /{id}`.
- **/api/tts** — `POST ""` (Yandex SpeechKit, ключ из app_settings).
- **/api/contractor** (ЛК бизнеса, свой токен) — agents (GET/PATCH), `/{id}/access` (видимость), stats/dialogs, photo/wardrobe, login/me.
- **/api/admin** — agents/core-agents/users/contractors CRUD, stats, assistant-settings, system-settings, **integrations** (ключи), **embedding-config** (провайдер/прокси).
- **/api/admin/rag** — источники знаний, парсинг, поиск, чанки.
- **Auth:** `Authorization: Bearer <JWT>` (пользователь) / отдельный токен контрагента. `get_current_user`, `get_current_user_optional` (публичные с фильтрацией), `get_admin_user`, `_require_contractor`.

## 4. WebSocket — `/ws/chat/{room}?token=<JWT>`
**Типы комнат (room):**
- `jim-{userId}` — персональный чат с помощником (отвечает помощник).
- `agent-{agentId}-u{userId}` — личный чат 1:1 с джинном (отвечает этот джинн).
- `room-{roomId}` — комната с несколькими джиннами (отвечает джинн, к кому обратились по имени/профессии; иначе — последний адресованный).
- `dm-{minId}-{maxId}` — личный диалог человек↔человек (id отсортированы; НИКАКОЙ бот не отвечает; только broadcast между людьми).
- `channel-{agentId}` — **планируется** (каналы-broadcast, fan-out-on-read).
- `general` — legacy.

**Сообщения (JSON):** входящее от клиента `{text}`; сервер шлёт `{type: message|typing|typing_stop|user_joined|user_left, ...}`. При `user_joined` для agent-комнаты приходит `agent_info`, для room — `room_members`.

**Маршрутизация ответа (chat_ws.py):** agent → `_agent_reply`; room-{id} → адресат по имени; jim-*/general → `_assistant_reply`; dm-* → без бота. Помощник получает «память о комнатах» (дайджест). Персона помощника инжектится в системный промпт (имя/пол — высший приоритет).

## 5. ⚠️ Инварианты — НЕ ЛОМАТЬ
1. **Приватность на пользователя:** чаты/комнаты/помощник НИКОГДА не общие. Помощник = `jim-{userId}`; чат джинна = `agent-{id}-u{userId}`; лента открытых чатов — в localStorage на пользователя (`jinntell_open_chats_{id}`).
2. **DM детерминирован:** `dm-{min(a,b)}-{max(a,b)}` — одна комната независимо от того, кто кого добавил. НЕ плодить.
3. **Видимость:** скрытый агент (`visibility=hidden`) виден только владельцу и `agent_access`. Гейтинг в каталоге, get-by-id, link, WS и при создании/приглашении в комнату (`can_access_agent`).
4. **Сквозная история пары:** `GET /history` для `agent-{id}-u{uid}` агрегирует 1:1 + комнаты с этим джинном; чужие реплики помечаются `context=true` (рисуются приглушённо «из комнаты»).
5. **Синхронизация ленты:** `GET /my-chats` подмешивает входящие DM и мои комнаты в ленту (иначе получатель не увидит входящий).
6. **WebSocket reconnect:** переподключение ТОЛЬКО при смене комнаты; при намеренном закрытии сокета снимать `onclose` (иначе вечная 3с-петля → чёрный экран). См. `hooks/useChat.ts`.
7. **HTML no-store:** документы не кэшировать (иначе старый Server Action → чёрный экран).
8. **Телефон/хендл:** контакты/доступ ищут по нормализованному телефону (`8…/7…/+7…`) ИЛИ jinntell_link.

## 6. Frontend
- **Экраны/поток:** SplashScreen → LoginScreen → коммуникатор (`app/page.tsx`) / бизнес (BusinessDashboardModal) / admin (`app/admin/page.tsx`).
- **Коммуникатор:** NavBar (панель 🚗/☆Собеседники/🔔Лента + лента аватаров открытых чатов + шапка активного чата), центр = HomeRoom(Лента) или ChatArea, BottomBar (ввод/микрофон/настройки/собеседники). Модалки: MyAgentsModal(Собеседники: Джинны/Контакты), AgentCityModal(Город), SettingsModal, BusinessDashboardModal.
- **Модель «с кем общаюсь»:** OpenChat {room, agentId, name, color, photo?, count?}; активная комната = `room` из `useChat`; view = feed|chat.
- **localStorage:** `jinntell_session`(userId), `jinntell_token`, `jinntell_open_chats_{uid}`, `jinntell_archived_chats_{uid}`, `jinntell_theme/bg/accent/anim_off/drive/wake_enabled`, `jinntell_assistant_voice`, `jinntell_contractor_token/session`, `jinntell_open_agent`(JinnTell Link).
- **Window-события:** `jinntell_theme_change/bg_change/anim_change/drive_change/wake_change/assistant_photo/tts_start/tts_end`.
- **Устарело (не рендерится, на диске):** TopBar, LeftPanel, RightPanel, SideTab, Particles, ContactsModal (заменены редизайном).

## 7. Внешние сервисы
- **LLM** (`services/llm.py`): ответы помощника/джиннов. Провайдер по ключам (DeepSeek/… ), usage сейчас НЕ трекается (нет биллинга).
- **Embeddings** (`services/embedding.py`): провайдер/ключи/прокси из app_settings (админка). **Yandex** (256d, из РФ, по умолчанию) / gemini(768,нужен прокси) / openai(1536) / jina(1024). См. [reference_embeddings_config].
- **TTS** (`services/tts` через `/api/tts`): Yandex SpeechKit, ключ из app_settings.
- **RAG** (`services/rag.py` + Qdrant): знания джиннов, семантический поиск. Коллекция на агента, размерность = провайдер эмбеддингов.

## 8. Заметки для мобильного приложения
- Переиспользовать: **REST `/api/*` + WS `/ws/chat/{room}` + JWT**. Логика чатов/комнат/видимости — на бэке, не в вебе.
- Соблюдать инварианты раздела 5 (особенно room-конвенции и приватность на пользователя).
- Медиа/аватары — по `/api/storage/...` (абсолютный путь через `mediaUrl`).
- Онлайн-статус/typing идут по WS (`user_joined`/`typing`).

_Обновлять этот файл при добавлении эндпоинтов/комнат/таблиц._
