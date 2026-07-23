-- Свой фон приложения (п.13)
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_bg_url text;
