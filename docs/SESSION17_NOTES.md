# Сессия 17 — Заметки

## Что сделано:

### 1. RAG System — полная реализация (Парсер + Индексация + Поиск)

#### Qdrant (Vector DB):
- Добавлен в docker-compose.prod.yml
- Healthcheck через bash /dev/tcp
- Том `qdrant_data` для персистентности
- Доступен бэкенду по `http://qdrant:6333`

#### Embedding Service (`backend/app/services/embedding.py`):
- Провайдеры: Jina Embeddings v3 (1024 dims) / OpenAI (1536 dims)
- Автовыбор по конфигу `EMBEDDING_PROVIDER`
- Батчевая обработка текстов
- Jina: бесплатный тир 1M токенов, multilingual

#### Parser Service (`backend/app/services/parser.py`):
- `fetch_document(url)` — скачивание HTML
- `extract_text_from_html(html)` — извлечение текста без BS4
- `extract_articles(text, source_type)` — разбивка на статьи/разделы
- `chunk_articles(articles)` — разбивка на chunks (1500 симв. + overlap 200)
- `_detect_edition_date(text)` — поиск "в ред. от DD.MM.YYYY"
- Поддержка: consultant.ru, garant.ru, pravo.gov.ru, произвольный текст

#### RAG Service (`backend/app/services/rag.py`):
- `ensure_collection(agent_id)` — создание коллекции в Qdrant
- `index_chunks(agent_id, chunks)` — батчевая индексация с эмбеддингами
- `search(agent_id, query, top_k, layer)` — семантический поиск
- `delete_chunks(agent_id, point_ids)` — удаление конкретных chunks
- `delete_all_chunks(agent_id)` — полная очистка
- `get_stats(agent_id)` — статистика коллекции

#### RAG API (`backend/app/api/rag.py`) — 8 эндпоинтов:
- `GET /api/admin/rag/sources/{agent_id}` — список источников
- `POST /api/admin/rag/sources` — добавить источник
- `DELETE /api/admin/rag/sources/{source_id}` — удалить
- `POST /api/admin/rag/parse` — запустить парсинг URL
- `POST /api/admin/rag/parse-text` — индексировать сырой текст
- `POST /api/admin/rag/search` — тестовый поиск
- `GET /api/admin/rag/stats/{agent_id}` — статистика
- `GET /api/admin/rag/log/{agent_id}` — лог парсинга

#### Интеграция с LLM:
- Новый блок в промпте: `=== РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ ЗАКОНОДАТЕЛЬСТВА ===`
- WebSocket: для агентов `specialist` — автоматический RAG-поиск перед LLM-ответом
- Top-5 chunks вставляются в контекст с номерами статей
- Инструкция: "Отвечай СТРОГО на основе фрагментов. Цитируй номера статей."

### 2. Модели БД (3 таблицы):
- `agent_sources` — источники данных (URL, тип, слой, расписание)
- `agent_rag_chunks` — чанки текста (связь с Qdrant point_id)
- `agent_parse_log` — лог парсинга (действия, ошибки, статистика)
- SQL миграция выполнена на production

### 3. Тип агента `specialist`:
- Новое значение `agent_type = "specialist"`
- В админке: кнопка типа "specialist" при создании/редактировании
- Таб "Парсер" (🔍) появляется ТОЛЬКО для specialist-агентов
- При общении: автоматический RAG search → chunks в промпт LLM

### 4. Админка — таб "Парсер" (RAGPanel):
- Статистика: chunks (Qdrant), chunks (БД), источников, dimensions
- Добавление источников (URL): тип + слой + название
- Список источников: парсинг, удаление, счётчик chunks
- Индексация текста напрямую (без URL)
- Тестовый поиск (вводишь вопрос — получаешь релевантные chunks с score)
- Лог парсинга (успехи/ошибки)
- Опасная зона: удаление всех chunks

### 5. ЛК Контрагента — новые табы:
- **Правила** — read-only (видит системный промпт, не может редактировать)
- **Скилы** — навыки продаж, скрипты (r/w для контрагента)
- **Отмена** — запреты, стоп-слова (r/w для контрагента)
- **Режимы** — Прогулка/Шоппинг/Дорога/Общение/Работа (вкл/выкл + правила + контекст)
- Всё сохраняется через PATCH API

### 6. Конфигурация:
- `QDRANT_URL` — адрес Qdrant
- `QDRANT_COLLECTION_PREFIX` — префикс коллекций
- `EMBEDDING_PROVIDER` — jina / openai
- `JINA_API_KEY` — ключ для Jina Embeddings
- `EMBEDDING_MODEL` — модель эмбеддингов

---

## Деплой:
- 2 коммита: основной + фикс healthcheck
- Qdrant запущен и работает
- SQL миграция выполнена
- Все 6 контейнеров online (postgres, redis, qdrant, backend, frontend, nginx)

---

## Что нужно для полноценного тестирования:
1. **Получить JINA_API_KEY** — https://jina.ai/ → бесплатная регистрация → API key
2. Вставить в `.env` на сервере
3. Создать агента типа `specialist` в админке
4. Добавить источник (URL закона) → Парсить → Проверить поиск
5. Открыть чат с агентом → задать вопрос → увидеть ответ на основе RAG

---

## Архитектура RAG (поток данных):

```
Админ добавляет источник (URL)
  → Parser: fetch HTML → extract text → split articles → chunk (1500 chars)
  → Embedding: получить векторы (Jina API / OpenAI)
  → Qdrant: upsert points (vector + payload)
  → БД: сохранить metadata (source_id, article_number, text)

Пользователь задаёт вопрос агенту-специалисту
  → WebSocket: получить сообщение
  → RAG Search: embed query → Qdrant search top-5 → format context
  → LLM: system_prompt + RAG_CONTEXT + user_message
  → Ответ с цитатами статей закона
```

---

## Следующие шаги:
1. Получить Jina API key и протестировать полный цикл
2. Создать первого Агента ПДД (specialist) с источником
3. SMS production (получить ключ sms.ru)
4. Фаза 2 RAG: автообновление (APScheduler + daily_check_changes)
5. Фаза 3 RAG: судебная практика (vsrf.ru)
