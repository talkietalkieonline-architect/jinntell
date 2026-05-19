# Промпт для Сессии 17

## Контекст
Скопируй этот текст целиком в начало новой сессии с Claude Opus 4.

---

## ПРОМПТ:

```
Проект Aimigo — Сессия 17. Продолжаем.
Прочитай файлы:
aimigo/docs/PROGRESS.md — полная история и текущий статус
aimigo/docs/SESSION16_NOTES.md — ТЗ на парсер + RAG (основная задача сессии)
aimigo/docs/SESSION14_NOTES.md — бизнес-решения

Сервер: 194.67.101.9, пароль: EEP9aT7WXfGyh1XO
GitHub пуш идёт через сервер (SSH-ключ там).
Последний коммит: 3dbd13e — всё задеплоено.

Задачи сессии 17 (по приоритету):

1. ГЛАВНОЕ: Агенты-Специалисты + Парсер + RAG
   Полное ТЗ в SESSION16_NOTES.md (секция "Задача на Сессию 17").
   Кратко:
   - Добавить Qdrant в docker-compose.prod.yml
   - Embedding сервис (multilingual-e5 или Jina)
   - Parser Service (парсинг consultant.ru — тестовая страница ПДД)
   - RAG Service (индексация chunks в Qdrant + semantic search)
   - Интеграция с LLM: при вопросе агенту-specialist → RAG search → chunks в промпт
   - Новый тип agent_type = "specialist"
   - Таб "Парсер" в AgentSettingsPanel (только для specialist)
   - Таблицы БД: agent_sources, agent_rag_chunks, agent_parse_log
   - Первый тест: Агент ПДД отвечает на вопросы по правилам

2. Обновить ЛК контрагента (BusinessDashboardModal):
   - Добавить табы Скилы, Отмена, Режимы (как в админке)
   - Правила (system_prompt) — показать read-only
   - Управление — скрыть (только админ видит)

3. Если останется время:
   - SMS production (ключ sms.ru в админке)
   - Протестировать полный цикл: создание агента → наполнение → чат
```

---

## Что уже готово к сессии 17:

### Backend:
- Модель Agent имеет все нужные поля (skills_text, exclusions_text, mode_*)
- LLM prompt builder собирает: ПРАВИЛА → СКИЛЫ → ОБУЧЕНИЕ → ОТМЕНА → РЕЖИМ → МАНЕРЫ
- WebSocket передаёт skills_text и exclusions_text при ответе агента
- 5 LLM провайдеров работают (DeepSeek, OpenRouter, OpenAI, Gemini, Groq)

### Frontend:
- AgentSettingsPanel — 8 табов настройки (готов к расширению, добавить "Парсер")
- api.ts — все типы обновлены

### Инфраструктура:
- Docker Compose с postgres, redis, backend, frontend, nginx, certbot
- Сервер 4GB RAM, Ubuntu 24.04
- Qdrant лёгкий (400MB RAM) — влезет

### Что НЕ готово (нужно сделать в сессии 17):
- Qdrant контейнер не добавлен
- Parser service не существует
- RAG service не существует  
- Embedding не подключён
- Таблицы agent_sources, agent_rag_chunks, agent_parse_log не созданы
- Тип "specialist" не добавлен в допустимые типы
- Таб "Парсер" в AgentSettingsPanel не создан
- ЛК контрагента не обновлён (старые 6 табов)
