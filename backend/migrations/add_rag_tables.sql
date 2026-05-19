-- Миграция: таблицы для RAG (агенты-специалисты)
-- Сессия 17

-- Источники данных агента
CREATE TABLE IF NOT EXISTS agent_sources (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    source_type VARCHAR(30) NOT NULL DEFAULT 'custom',
    url TEXT NOT NULL,
    title VARCHAR(300) DEFAULT '',
    layer VARCHAR(30) NOT NULL DEFAULT 'law',
    last_parsed_at TIMESTAMP WITH TIME ZONE,
    last_change_found_at TIMESTAMP WITH TIME ZONE,
    chunks_count INTEGER DEFAULT 0,
    schedule VARCHAR(20) DEFAULT 'manual',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_sources_agent_id ON agent_sources(agent_id);

-- Чанки текста (связь с Qdrant)
CREATE TABLE IF NOT EXISTS agent_rag_chunks (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES agent_sources(id) ON DELETE CASCADE,
    layer VARCHAR(30) NOT NULL DEFAULT 'law',
    article_number VARCHAR(100),
    text TEXT NOT NULL,
    edition_date DATE,
    chunk_metadata JSONB,
    qdrant_point_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_rag_chunks_agent_id ON agent_rag_chunks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_rag_chunks_source_id ON agent_rag_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_agent_rag_chunks_qdrant ON agent_rag_chunks(qdrant_point_id);

-- Лог парсинга
CREATE TABLE IF NOT EXISTS agent_parse_log (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES agent_sources(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL DEFAULT 'parsed',
    article_number VARCHAR(100),
    chunks_added INTEGER DEFAULT 0,
    chunks_updated INTEGER DEFAULT 0,
    chunks_deleted INTEGER DEFAULT 0,
    error_message TEXT,
    parsed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_parse_log_agent_id ON agent_parse_log(agent_id);

-- Добавляем 'specialist' в допустимые типы агентов (если будет enum)
-- Сейчас agent_type — просто varchar, так что достаточно добавить в seed/UI
