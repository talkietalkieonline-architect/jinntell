-- Профиль интересов, который растит помощник
ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_interests text;
