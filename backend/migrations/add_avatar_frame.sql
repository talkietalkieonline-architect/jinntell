-- Рамка/декор аватара (п.26)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_frame varchar(30);
