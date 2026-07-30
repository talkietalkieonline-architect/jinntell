-- Блок-лист тем (барьер)
ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_blocklist text;
