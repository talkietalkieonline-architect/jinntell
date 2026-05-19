-- Миграция: уникальные UID для контрагентов и агентов
-- Выполнить: docker compose -f docker-compose.prod.yml -p jinntell exec -T postgres psql -U jinntell -d jinntell < backend/migrations/add_uid_fields.sql

-- Контрагенты
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS uid VARCHAR(20) UNIQUE;

-- Агенты
ALTER TABLE agents ADD COLUMN IF NOT EXISTS uid VARCHAR(20) UNIQUE;

-- Индексы
CREATE UNIQUE INDEX IF NOT EXISTS ix_contractors_uid ON contractors (uid) WHERE uid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ix_agents_uid ON agents (uid) WHERE uid IS NOT NULL;

-- Заполнить существующие записи
UPDATE contractors SET uid = 'C-' || LPAD(id::text, 5, '0') WHERE uid IS NULL;
UPDATE agents SET uid = 'A-' || LPAD(id::text, 5, '0') WHERE uid IS NULL;
