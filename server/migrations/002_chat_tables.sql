-- ============================================================================
-- Migration 002: Chat Tables for Vercel AI SDK
-- ============================================================================
-- Tabelas para persistência de conversações usando Vercel AI SDK
-- Data: 2026-01-15
-- ============================================================================

-- Tabela de chats (conversações)
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  org_id VARCHAR(255),
  title TEXT DEFAULT 'New chat',
  visibility VARCHAR(20) DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  parts JSONB NOT NULL, -- Array de parts (text, file, toolCall, toolResult)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de stream IDs (para resume de streams interrompidos)
CREATE TABLE IF NOT EXISTS stream_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID NOT NULL UNIQUE,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Índices para Performance
-- ============================================================================

-- Índice para buscar chats por usuário
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);

-- Índice para buscar chats por organização
CREATE INDEX IF NOT EXISTS idx_chats_org_id ON chats(org_id);

-- Índice para buscar mensagens por chat
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);

-- Índice para buscar mensagens por data (útil para paginação)
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Índice para buscar stream IDs por chat
CREATE INDEX IF NOT EXISTS idx_stream_ids_chat_id ON stream_ids(chat_id);

-- Índice para buscar stream IDs por ID único
CREATE INDEX IF NOT EXISTS idx_stream_ids_stream_id ON stream_ids(stream_id);

-- ============================================================================
-- Comentários nas Tabelas
-- ============================================================================

COMMENT ON TABLE chats IS 'Armazena conversações do chat com agente';
COMMENT ON COLUMN chats.user_id IS 'ID do usuário no Clerk';
COMMENT ON COLUMN chats.org_id IS 'ID da organização no Clerk (opcional)';
COMMENT ON COLUMN chats.visibility IS 'public: acessível a todos, private: apenas dono';

COMMENT ON TABLE messages IS 'Armazena mensagens individuais de cada chat';
COMMENT ON COLUMN messages.role IS 'user: mensagem do usuário, assistant: resposta do agente';
COMMENT ON COLUMN messages.parts IS 'Array de parts no formato Vercel AI SDK (text, file, toolCall, etc)';

COMMENT ON TABLE stream_ids IS 'Rastreia IDs de streams para permitir resume após interrupções';

-- ============================================================================
-- Fim da Migration
-- ============================================================================
