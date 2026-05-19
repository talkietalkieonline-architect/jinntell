-- Migration: add agent settings v2 (Session 16)
-- New fields: skills_text, exclusions_text, mode_* (walk/shopping/drive/chat/work)

ALTER TABLE agents ADD COLUMN IF NOT EXISTS skills_text TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS exclusions_text TEXT;

ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_walk_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_walk_rules TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_walk_context TEXT;

ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_shopping_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_shopping_rules TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_shopping_context TEXT;

ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_drive_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_drive_rules TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_drive_context TEXT;

ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_chat_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_chat_rules TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_chat_context TEXT;

ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_work_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_work_rules TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS mode_work_context TEXT;
