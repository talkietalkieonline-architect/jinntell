# Сессия 16 — Заметки

## Что сделано:

### 1. Новая архитектура настроек агента (8 табов):
- **Основное** — имя, профессия, бренд, тип, цвет, модель, описание, приветствие
- **Правила** — системный промпт (админ: r/w, контрагент: r/o)
- **Скилы** — навыки продаж, скрипты, воронки (оба: r/w)
- **Обучение** — база знаний текст + кнопки файлы/1С/облако (оба: r/w)
- **Отмена** — стоп-слова, запрещённые темы (оба: r/w)
- **Режимы** — Прогулка/Шоппинг/Дорога/Общение/Работа (вкл/выкл + правила + контекст)
- **Персонаж** — манеры, голос, внешность, одежда
- **Управление** — остановить/запустить/обновить/удалить/проверить контекст

### 2. Backend:
- Новые поля в модели Agent: skills_text, exclusions_text, mode_*_{enabled,rules,context}
- Обновлены схемы AgentDetailOut, AgentUpdate
- LLM prompt builder: ПРАВИЛА → СКИЛЫ → ОБУЧЕНИЕ → ОТМЕНА → РЕЖИМ → МАНЕРЫ
- WebSocket передаёт skills_text и exclusions_text в get_agent_reply()
- Фикс сериализации created_at (datetime → str)

### 3. Frontend:
- Новый компонент AgentSettingsPanel (8 табов)
- Обновлены типы AgentFullOut, AgentPersonaUpdate в api.ts
- Админка: при клике на агента — сразу полные настройки вместо readonly-просмотра

### 4. Деплой:
- SQL миграция (17 новых колонок)
- 2 коммита: основной + фикс
- Всё работает на https://aimigo.online

---

## Решение сессии: Агенты-Специалисты с парсером и RAG

### Концепция:
Новый тип агента `specialist` — владеет живой нормативной базой, которая автообновляется.

### Трёхслойная архитектура знаний:
1. **Слой «Текст правил»** — полный текст закона (ПДД, ТК, СК, НК...)
2. **Слой «Изменения»** — парсер ищет "в редакции от [дата]", заменяет старое новым
3. **Слой «Разъяснения»** — постановления Пленума ВС РФ, обзоры практики

### Источники:
- consultant.ru (HTML парсинг)
- garant.ru (HTML парсинг)
- pravo.gov.ru (официальный портал)
- API ключи Гарант/Консультант (если доступны)

### Защита от «захлёбывания»:
- RAG (Qdrant) — агент не держит всё в промпте
- Semantic search → top-5 релевантных chunks → вставка в контекст
- Каждый chunk: текст + метаданные (слой, статья, дата, источник)

### Специалисты (первая волна):
- Агент ПДД (КоАП + ПДД + ПП ВС)
- Агент Труд (ТК РФ + Роструд)
- Агент Семья (СК РФ)
- Агент Жильё (ЖК РФ + ЖКХ)
- Агент Налоги (НК РФ + письма Минфина)
- Агент Бизнес (ГК РФ + 44-ФЗ)

---

## Задача на Сессию 17: Парсер + RAG для агентов-специалистов

### Фаза 1 (MVP):

#### 1. Qdrant в docker-compose:
```yaml
qdrant:
  image: qdrant/qdrant:latest
  ports:
    - "6333:6333"
  volumes:
    - qdrant_data:/qdrant/storage
```

#### 2. Embedding сервис:
- Модель: `intfloat/multilingual-e5-large` (русский + английский)
- Или: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- Через API: Jina Embeddings / OpenAI embeddings / локальная модель

#### 3. Parser Service (`backend/app/services/parser.py`):
```python
class LegalParser:
    async def fetch_document(url: str) -> str  # HTML
    async def extract_articles(html: str) -> list[Article]  # Разбивка на статьи
    async def chunk_article(article: Article) -> list[Chunk]  # Разбивка на chunks
    async def detect_edition_date(text: str) -> Optional[date]  # "в редакции от"
```

#### 4. RAG Service (`backend/app/services/rag.py`):
```python
class RAGService:
    async def index_chunks(agent_id: int, chunks: list[Chunk])  # Индексация в Qdrant
    async def search(agent_id: int, query: str, top_k: int = 5) -> list[Chunk]  # Поиск
    async def get_stats(agent_id: int) -> RAGStats  # Статистика
```

#### 5. Интеграция с LLM:
- В `get_agent_reply()`: если агент specialist → search RAG → вставить chunks в промпт
- Промпт: "Отвечай на основе следующих фрагментов закона: [chunks]"

#### 6. Тип агента `specialist`:
- Новое значение agent_type
- В админке: дополнительный таб «Парсер» (только для specialist)
- UI: источники URL, API-ключи, расписание, лог обновлений, статистика RAG

#### 7. Модель в БД:
```sql
CREATE TABLE agent_sources (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id),
    source_type VARCHAR(20),  -- 'consultant' / 'garant' / 'pravo'
    url TEXT NOT NULL,
    layer VARCHAR(20),  -- 'law' / 'changes' / 'explanations'
    last_parsed_at TIMESTAMP,
    last_change_found_at TIMESTAMP,
    schedule VARCHAR(20) DEFAULT 'daily',
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE agent_rag_chunks (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id),
    source_id INTEGER REFERENCES agent_sources(id),
    layer VARCHAR(20),  -- 'law' / 'changes' / 'explanations'
    article_number VARCHAR(50),
    text TEXT NOT NULL,
    edition_date DATE,
    metadata JSONB,
    qdrant_point_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE agent_parse_log (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id),
    source_id INTEGER REFERENCES agent_sources(id),
    action VARCHAR(20),  -- 'added' / 'updated' / 'deleted'
    article_number VARCHAR(50),
    old_text TEXT,
    new_text TEXT,
    edition_date DATE,
    parsed_at TIMESTAMP DEFAULT NOW()
);
```

### Фаза 2 (автообновление — следующая итерация):
- APScheduler / Celery — крон-задачи
- daily_check_changes() — обход источников
- diff_and_update() — сравнение, замена старых chunks
- notify_admin() — "найдены изменения в ПДД"

### Фаза 3 (судебная практика — позже):
- Парсер vsrf.ru (Верховный Суд)
- Парсер consultant.ru/cons/cgi/online.cgi?req=doc (ПП ВС)
- Связывание разъяснений с конкретными статьями
