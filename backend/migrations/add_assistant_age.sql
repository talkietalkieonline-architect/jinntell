-- Возраст образа помощника (п.7 списка правок)
ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_age integer;
