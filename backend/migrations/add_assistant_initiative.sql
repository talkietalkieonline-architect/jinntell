-- Правило инициации разговора помощника
ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_initiative varchar(20);
