-- Сессия 20: Core-агенты + Дворецкий → Мэл
-- Выполнить: docker exec -i jinntell-postgres-1 psql -U jinntell -d jinntell < migrations/session20_core_agents.sql

-- 1. Переименование старого Дворецкого в Мэл (если существует)
UPDATE agents SET
    name = 'Мэл',
    profession = 'Личный помощник',
    agent_type = 'core',
    visibility = 'core',
    jinntell_link = 'mel',
    greeting = 'Привет! Я Мэл, ваш персональный помощник в JinnTell. Могу рассказать о сервисе, найти нужного агента или просто поболтать.',
    description = 'Ваш персональный AI-помощник. Связующее звено между вами и Городом Агентов. Всегда рядом.'
WHERE name = 'Дворецкий' AND jinntell_link = 'butler';

-- 2. Обновляем jinntell_link старого если был
UPDATE agents SET jinntell_link = 'mel' WHERE jinntell_link = 'butler';

-- 3. Обновляем sender_name в сообщениях
UPDATE messages SET sender_name = 'Мэл', sender_type = 'mel' WHERE sender_type = 'butler';
UPDATE messages SET sender_name = 'Мэл' WHERE sender_name = 'Дворецкий' AND sender_type = 'butler';

-- Готово!
