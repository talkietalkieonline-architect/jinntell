-- Миграция: Персональные данные + OAuth + восстановление пароля
-- Выполнить на production: docker compose exec postgres psql -U jinntell -d jinntell

-- Персональные данные
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS about TEXT;

-- OAuth привязки
ALTER TABLE users ADD COLUMN IF NOT EXISTS vk_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS yandex_id VARCHAR(50);

-- Восстановление пароля
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_expires TIMESTAMPTZ;

-- Индексы
CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_vk_id ON users (vk_id) WHERE vk_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_telegram_id ON users (telegram_id) WHERE telegram_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_yandex_id ON users (yandex_id) WHERE yandex_id IS NOT NULL;
