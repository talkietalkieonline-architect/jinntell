# JinnTell — Инструкция для новой сессии Claude

## !!! ПЕРВЫМ ДЕЛОМ — ЧИТАЙ С СЕРВЕРА (НЕ с Мака!) !!!

Проект НЕ на локальном компьютере. На Маке только start_claude.md.
Всё живёт ТОЛЬКО на сервере 194.67.101.9 + GitHub.

**Сервер:** 194.67.101.9 | **Логин:** root | **Пароль:** EEP9aT7WXfGyh1XO
**Проект:** /root/jinntell/
**Домены:** jinntell.ru (LIVE + SSL), jinntell.com, jinntell.io (куплены, не привязаны)
**GitHub:** git@github.com:talkietalkieonline-architect/jinntell.git

### Как подключиться и прочитать контекст:
```
expect -c "
set timeout 30
spawn ssh -o StrictHostKeyChecking=no root@194.67.101.9
expect \"password:\"
send \"EEP9aT7WXfGyh1XO\r\"
expect \"# \"
send \"cat /root/jinntell/CLAUDE_SESSION.md\r\"
expect \"# \"
send \"cat /root/jinntell/docs/PROGRESS.md\r\"
expect \"# \"
send \"exit\r\"
expect eof
"
```

---

## Система документации

| Файл | Что содержит | Когда читать |
|------|-----------------|----------------|
| `CLAUDE_SESSION.md` | Этот файл. Сервер, SSH, схема работы | **ВСЕГДА первым** |
| `docs/PROGRESS.md` | Полная история: все сессии, что сделано, что дальше | **ВСЕГДА вторым** |
| `docs/TECHNICAL_SPECIFICATION.md` | Полное ТЗ | При работе над новыми фичами |
| `docs/BUSINESS_VISION.md` | Монетизация, аудитория | При работе над бизнес-функциями |
| `docs/ARCHITECTURE.md` | Структура проекта | При рефакторинге |
| `docs/DECISIONS.md` | Ключевые решения | Перед изменением архитектуры |
| `docs/DEPLOY.md` | Инструкция по деплою | При работе с сервером |

---

## История ребрендинга
- **Aimigo** → **MyeLinks** → **JinnTell** (текущее)
- Концепция: Агенты = Джинны. Пользователь говорит с джиннами.
- Старые проекты удалены с сервера. Единственный проект: /root/jinntell/

---

## Сервер

- **IP:** 194.67.101.9
- **SSH:** root / EEP9aT7WXfGyh1XO
- **Проект:** /root/jinntell/
- **Сайт:** https://jinntell.ru (LIVE, SSL Let's Encrypt до 17 авг 2026)
- **Порт Docker nginx:** 3090 → системный nginx :443 → jinntell.ru

### Подключение через expect:
```bash
expect -c "
set timeout 30
spawn ssh -o StrictHostKeyChecking=no root@194.67.101.9
expect \"password:\"
send \"EEP9aT7WXfGyh1XO\r\"
expect \"# \"
send \"КОМАНДА\r\"
expect \"# \"
send \"exit\r\"
expect eof
"
```

### Интерактивный SSH (для владельца):
```bash
expect -c "
set timeout 30
spawn ssh -o StrictHostKeyChecking=no root@194.67.101.9
expect \"password:\"
send \"EEP9aT7WXfGyh1XO\r\"
interact
"
```

### Проверка статуса:
```bash
cd /root/jinntell && docker compose -f docker-compose.prod.yml ps
curl -s http://localhost:3090/api/health
docker compose -f docker-compose.prod.yml logs --tail 20
```

---

## GitHub

- **Репо:** git@github.com:talkietalkieonline-architect/jinntell.git
- **Аутентификация:** SSH-ключ на сервере (/root/.ssh/id_ed25519)
- **Ветка:** main

---

## Архитектура

```
Интернет → jinntell.ru (:443 SSL)
  → системный nginx → :3090
    → Docker nginx → backend/frontend

Docker Compose (7 контейнеров):
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐  ┌───────┐  ┌────────┐
  │  Nginx   │→ │ Frontend │  │ Backend  │→ │ PG   │  │ Redis │  │ Qdrant │
  │  :3090   │→ │  :3000   │  │  :8000   │→ │ :5432│  │ :6379 │  │ :6333  │
  └──────────┘  └──────────┘  └──────────┘  └──────┘  └───────┘  └────────┘
  + Certbot (SSL renewal)
```

### Безопасность данных:
- **Qdrant**: данные разделены по agent_id. Каждый агент видит только свои чанки. Пользователи не имеют прямого доступа — только через API с фильтрацией.
- **Фото помощника**: base64 в PostgreSQL (поле assistant_photo, до 2МБ). В будущем — S3/MinIO.
- **API ключи**: только в .env на сервере, не в коде, не в Git.

---

## Стек

### Frontend
- Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- Standalone Docker build

### Backend
- FastAPI + async SQLAlchemy + PostgreSQL + Redis + Qdrant
- WebSocket чат с LLM-ответами
- 5 LLM-провайдеров: DeepSeek, OpenRouter, OpenAI, Gemini, Groq
- RAG system (Qdrant + embeddings — нужен fastembed)

---

## Текущее состояние (после Сессии 21)

### Работает:
- https://jinntell.ru — LIVE с SSL
- 7 контейнеров healthy
- Авторизация: логин/пароль + OAuth заготовки
- Чат с Мэлом (LLM через OpenRouter/Gemma 3 27B)
- 18 seed-агентов (4 core + 4 system + 7 business + 2 citizen)
- Город Агентов, Мои Агенты, Контакты
- Админка /admin (6 вкладок)
- ЛК Контрагента
- Центр Управления: персональные данные, настройки помощника (WIP), темы

### В процессе (Сессия 21, не завершено):
- Настройки Помощника: имя, тип (мужчина/женщина/животное/другое), голос, фото
  - Backend готов (модель + API + миграция)
  - Frontend: SettingsModal — build error, нужно починить
- Ребрендинг UI: Агенты → Джинны

### Нужно сделать:
- Починить frontend build (SettingsModal)
- fastembed (локальные embeddings, RAG без API)
- Ребрендинг UI → Джинны
- Красивые URL: /city/spb/slug
- SMS production (ключ sms.ru)
- TTS (голос джиннов)
- Дизайн-ревизия
- Привязать jinntell.com (редирект на jinntell.ru)

---

## Правила

1. **Проект — `/root/jinntell/`** — единственный источник правды
2. **Экономия токенов** — не коммитить/пушить/docker compose через expect
3. **Владелец выполняет**: git commit/push, docker compose, проверяет сайт
4. **Claude**: пишет код, правит файлы, отправляет через scp или expect+base64
5. **Обновляй документацию** в конце каждой сессии
6. **Не спрашивай что делать** — сам решай приоритеты как CTO
7. **ВАЖНО**: При передаче больших TSX файлов через heredoc — спецсимволы ломают файл. Лучше использовать scp с временным файлом на Маке или base64.

### Передача файлов:
```bash
# Через scp (предпочтительно):
scp файл root@194.67.101.9:/root/jinntell/путь/

# Через expect+base64 (для файлов с $, `, " и т.д.):
b64=$(base64 < "local/file.py")
expect -c "
  ...send {echo '$b64' | base64 -d > /root/jinntell/path/file.py}...
"
```
