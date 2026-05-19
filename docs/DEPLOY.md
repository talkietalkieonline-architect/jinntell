# JINNTELL — Инструкция по деплою

## Требования к VPS

- **OS:** Ubuntu 22.04+ / Debian 12+
- **RAM:** минимум 2 GB (рекомендуется 4 GB)
- **CPU:** 2 vCPU
- **Диск:** 20 GB SSD
- **Docker** + **Docker Compose** установлены
- **Домен** направлен на IP сервера (A-запись)

### Рекомендуемые VPS-провайдеры (от $5/мес)
- Timeweb Cloud (Россия)
- Selectel (Россия)
- Hetzner (Европа)
- DigitalOcean (США/Европа)

---

## Быстрый старт

### 1. Установка Docker (если не установлен)

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Перелогиниться после этого
```

### 2. Клонирование проекта

```bash
git clone https://github.com/YOUR_REPO/aimigo.git
cd aimigo
```

### 3. Настройка .env

```bash
cp env.template .env
nano .env
```

**Обязательно заполнить:**

| Переменная | Описание | Пример |
|---|---|---|
| `DOMAIN` | Ваш домен | `aimigo.ru` |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL | сгенерировать |
| `REDIS_PASSWORD` | Пароль Redis | сгенерировать |
| `SECRET_KEY` | JWT-секрет | `openssl rand -hex 32` |
| `GEMINI_API_KEY` | Ключ Gemini (бесплатно) | aistudio.google.com/apikey |

**Генерация паролей:**
```bash
# SECRET_KEY
openssl rand -hex 32

# POSTGRES_PASSWORD
openssl rand -base64 24

# REDIS_PASSWORD
openssl rand -base64 16
```

### 4. Запуск

```bash
chmod +x deploy.sh
./deploy.sh
```

Скрипт автоматически:
1. Проверит `.env`
2. Создаст директории для certbot
3. Соберёт Docker-образы
4. Получит SSL-сертификат через Let's Encrypt
5. Запустит все сервисы

### 5. Проверка

```bash
# Все контейнеры запущены?
docker compose -f docker-compose.prod.yml ps

# Логи
docker compose -f docker-compose.prod.yml logs -f

# Health check
curl https://your-domain.ru/api/health
```

---

## Управление

```bash
# Остановить
docker compose -f docker-compose.prod.yml down

# Перезапустить
docker compose -f docker-compose.prod.yml restart

# Обновить код + пересобрать
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Логи конкретного сервиса
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f nginx
```

## Обновление SSL-сертификата

Certbot автоматически обновляет сертификат в фоне. Для ручного обновления:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml restart nginx
```

## Бэкап БД

```bash
# Создать бэкап
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U aimigo aimigo > backup_$(date +%Y%m%d).sql

# Восстановить
docker compose -f docker-compose.prod.yml exec -i postgres psql -U aimigo aimigo < backup_20250101.sql
```

---

## Архитектура production

```
Internet
  │
  ├─ :80 (HTTP) ──→ Nginx ──→ redirect to :443
  │
  └─ :443 (HTTPS) ──→ Nginx
                       ├─ /api/*  ──→ Backend (FastAPI :8000)
                       ├─ /ws/*   ──→ Backend (WebSocket)
                       └─ /*      ──→ Frontend (Next.js :3000)

Docker Compose:
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐  ┌───────┐
  │  Nginx   │→ │ Frontend │  │ Backend  │→ │ PG   │  │ Redis │
  │  :80/443 │→ │  :3000   │  │  :8000   │→ │ :5432│  │ :6379 │
  └──────────┘  └──────────┘  └──────────┘  └──────┘  └───────┘
```

---

## Aimigo Links

После деплоя работают публичные ссылки на агентов:

```
https://your-domain.ru/a/tim-adidas
https://your-domain.ru/a/dvoretskiy
```

Ссылки генерируются автоматически из имени + бренда агента.

---

## FAQ

**Q: Микрофон не работает?**
A: Web Speech API требует HTTPS. Убедитесь что сертификат валиден.

**Q: Агенты не отвечают?**
A: Проверьте LLM-ключ в `.env`. Минимум один ключ нужен (Gemini — бесплатно).
Статус LLM: `curl https://domain.ru/api/admin/llm-status` (нужен токен админа).

**Q: Как добавить нового админа?**
A: В `.env` добавьте номер в `ADMIN_PHONES`:
```
ADMIN_PHONES=["+79214787478", "+79991234567"]
```
Затем: `docker compose -f docker-compose.prod.yml restart backend`
