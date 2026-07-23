-- Характеристики общения помощника (п.8): JSON тон/длина/юмор/эмодзи
ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_traits text;
