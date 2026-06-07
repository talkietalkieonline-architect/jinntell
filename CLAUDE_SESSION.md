# JinnTell — Контекст для Claude

## Проект
**JinnTell** — AI-first коммуникационная платформа. Голос + текст + видео.
Пользователи общаются с AI-джиннами (агентами). Бизнес покупает джиннов для своих клиентов.

## Сервер
- **IP:** 194.67.101.9
- **SSH:** root / EEP9aT7WXfGyh1XO
- **Проект:** /root/jinntell/
- **Домен:** https://jinntell.ru (SSL Let's Encrypt)
- **Docker:** 7 контейнеров (postgres, redis, qdrant, backend, frontend, nginx, certbot)
- **GitHub:** talkietalkieonline-architect/jinntell.git

## Стек
### Frontend
- Next.js 16 + TypeScript + Tailwind
- Standalone Docker build

### Backend
- FastAPI + async SQLAlchemy + PostgreSQL + Redis + Qdrant
- WebSocket чат с LLM-ответами
- 5 LLM-провайдеров: DeepSeek, OpenRouter, OpenAI, Gemini, Groq
- TTS/Video инфраструктура заложена (Yandex SpeechKit, Self-hosted, Hedra, D-ID)

---

## Текущее состояние (после Сессии 23)

### Работает:
- https://jinntell.ru — LIVE с SSL
- 7 контейнеров healthy
- Авторизация: логин/пароль + OAuth заготовки
- Чат с Помощником (LLM через OpenRouter/бесплатные модели)
- 18 seed-агентов (4 core + 4 system + 7 business + 2 citizen)
- Город Джиннов (ex-Агентов), Мои Джинны, Контакты
- Админка /admin (6 вкладок)
- ЛК Контрагента
- Центр Управления: персональные данные, настройки помощника, темы
- Reasoning-фильтр для всех LLM-провайдеров
- Скролл чата: можно листать вверх без автовозврата
- TTS/Video поля в модели Agent (готовы для подключения провайдеров)
- llm_max_tokens — динамическая длина ответа

### Терминология:
- **Помощник** (ex-Мэл, ex-Дворецкий) — персональный AI-помощник пользователя
  - Админ настраивает: модель, правила, скилы
  - Пользователь кастомизирует: имя (default "Джим"), пол, голос, фото
- **Джинн** (ex-Агент) — AI-персонаж в Городе Джиннов
- **Контрагент** — бизнес-клиент, покупает джиннов
- **Core-агенты** — внутреннее ядро (скрыты из Города)
- Redis ключи: assistant:settings, assistant:system_prompt

### Нужно сделать (Сессия 24):
- UI настроек TTS/Video в админке
- Яндекс SpeechKit подключение
- Видео-кружочки в чате (bubble)
- Голосовое управление приложением
- Git commit + push
- Тестирование LLM моделей

---

## Правила

1. **Проект — `/root/jinntell/`** — единственный источник правды
2. **Экономия токенов** — не делать лишних cat/grep если не нужно
3. **Владелец выполняет**: git commit/push, docker compose, проверяет сайт
4. **Claude**: пишет код, правит файлы, отправляет через base64
5. **Обновляй документацию** в конце каждой сессии
6. **Не спрашивай что делать** — сам решай приоритеты как CTO

### Передача файлов:
```bash
# Через base64 (надёжный способ):
cat << 'EOF' | base64 | tr -d '\n' > /tmp/file_b64.txt
...содержимое файла...
EOF
B64=$(cat /tmp/file_b64.txt)
expect -c "
  spawn ssh root@194.67.101.9
  expect password:
  send EEP9aT7WXfGyh1XO\r
  expect #
  send \"echo '$B64' | base64 -d > /path/to/file\r\"
  expect #
  send exit\r
  expect eof
"
```
