# JinnTell — Инструкция для новой сессии Claude

## !!! ПЕРВЫМ ДЕЛОМ — ЧИТАЙ С СЕРВЕРА (НЕ с Мака!) !!!

Проект НЕ на локальном компьютере. На Маке только start_claude.md.
Всё живёт ТОЛЬКО на сервере 194.67.101.9 + GitHub.

**Сервер:** 194.67.101.9 | **Логин:** root | **Пароль:** EEP9aT7WXfGyh1XO
**Проект:** /root/jinntell/
**Домены:** jinntell.com, jinntell.ru, jinntell.io (куплены)
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
- Старые проекты на сервере удалены. Единственный проект: /root/jinntell/

---

## Сервер

- **IP:** 194.67.101.9
- **SSH:** root / EEP9aT7WXfGyh1XO
- **Проект:** /root/jinntell/
- **Домены:** jinntell.com / jinntell.ru / jinntell.io (нужно привязать)
- **Текущий порт:** 3090 (nginx docker)

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
Docker Compose (порт 3090):
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐  ┌───────┐  ┌────────┐
  │  Nginx   │→ │ Frontend │  │ Backend  │→ │ PG   │  │ Redis │  │ Qdrant │
  │  :3090   │→ │  :3000   │  │  :8000   │→ │ :5432│  │ :6379 │  │ :6333  │
  └──────────┘  └──────────┘  └──────────┘  └──────┘  └───────┘  └────────┘
```

---

## Стек

### Frontend
- Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- Standalone Docker build

### Backend
- FastAPI + async SQLAlchemy + PostgreSQL + Redis + Qdrant
- WebSocket чат с LLM-ответами
- 5 LLM-провайдеров: DeepSeek, OpenRouter, OpenAI, Gemini, Groq
- RAG system (Qdrant + embeddings)

---

## Правила

1. **Проект — `/root/jinntell/`** — единственный источник правды
2. **Экономия токенов** — не коммитить/пушить/docker compose через expect
3. **Владелец выполняет**: git commit/push, docker compose, проверяет сайт
4. **Claude**: пишет код, правит файлы, отправляет через expect+base64 или scp
5. **Обновляй документацию** в конце каждой сессии
6. **Не спрашивай что делать** — сам решай приоритеты как CTO

### Передача файлов на сервер:
Через expect+base64:
```bash
b64=$(base64 < "local/file.py")
expect -c "
  ...
  send {echo '$b64' | base64 -d > /root/jinntell/path/file.py}
  send \"\r\"
  ...
"
```

---

## Текущее состояние (после Сессии 21)

### Работает:
- 7 контейнеров: postgres, redis, qdrant, backend, frontend, nginx, certbot
- Авторизация: логин/пароль + OAuth заготовки (ВК/Яндекс/Telegram)
- Чат с Мэлом через LLM (5 провайдеров)
- WebSocket реалтайм
- 4 core-агента (Мэл, Админ, Контент, Железо)
- Город Агентов, Мои Агенты, Контакты
- Админка /admin (6 вкладок)
- ЛК Контрагента
- RAG система (Qdrant, но embeddings заблокированы из РФ — нужен fastembed)

### Нужно сделать:
- Привязать домен jinntell.com + SSL
- fastembed (локальные embeddings, без API)
- SMS production (ключ sms.ru)
- TTS (голос джиннов)
- Красивые URL: /city/spb/slug
- Дизайн-ревизия
