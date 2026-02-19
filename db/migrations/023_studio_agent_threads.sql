-- Migration: Studio Agent Threads
-- Created: 2026-02-17
-- Description: Persistência de threads e mensagens do modo agente por tópico de studio

CREATE TABLE IF NOT EXISTS studio_agent_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT,
  studio_type TEXT NOT NULL CHECK (studio_type IN ('image', 'video')),
  topic_id UUID NOT NULL,
  claude_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, organization_id, studio_type, topic_id)
);

CREATE TABLE IF NOT EXISTS studio_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES studio_agent_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_agent_threads_user
  ON studio_agent_threads(user_id, organization_id, studio_type);

CREATE INDEX IF NOT EXISTS idx_studio_agent_threads_topic
  ON studio_agent_threads(topic_id, studio_type);

CREATE INDEX IF NOT EXISTS idx_studio_agent_messages_thread
  ON studio_agent_messages(thread_id, created_at);

COMMENT ON TABLE studio_agent_threads IS 'Threads de conversa do modo agente para Image/Video Studio';
COMMENT ON TABLE studio_agent_messages IS 'Mensagens/eventos persistidos por thread do modo agente';
