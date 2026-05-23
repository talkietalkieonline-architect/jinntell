-- Сессия 21: Персонализация помощника (Мэла)
ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_name VARCHAR(100) DEFAULT 'Мэл';
ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_gender VARCHAR(20) DEFAULT 'male';
ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_voice VARCHAR(50) DEFAULT 'male_low';
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_age INTEGER;
