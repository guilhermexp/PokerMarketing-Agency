/**
 * Database Queries - Vercel AI SDK Chat
 *
 * Queries para persistência de chats e mensagens
 */

import { neon } from '@neondatabase/serverless';

/**
 * Get SQL client (reutiliza conexão existente)
 */
function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada');
  }
  return neon(process.env.DATABASE_URL);
}

// ============================================================================
// CHAT QUERIES
// ============================================================================

/**
 * Busca um chat por ID
 *
 * @param {object} params
 * @param {string} params.id - UUID do chat
 * @returns {Promise<object|null>}
 */
export async function getChatById({ id }) {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM chats
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] || null;
}

/**
 * Salva um novo chat
 *
 * @param {object} params
 * @param {string} params.id - UUID do chat
 * @param {string} params.userId - ID do usuário (Clerk)
 * @param {string} params.orgId - ID da organização (opcional)
 * @param {string} params.title - Título do chat
 * @param {string} params.visibility - 'public' ou 'private'
 * @returns {Promise<object>}
 */
export async function saveChat({ id, userId, orgId, title, visibility = 'private' }) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO chats (id, user_id, org_id, title, visibility, created_at, updated_at)
    VALUES (${id}, ${userId}, ${orgId}, ${title}, ${visibility}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      title = ${title},
      updated_at = NOW()
    RETURNING *
  `;
  return rows[0];
}

/**
 * Atualiza o título de um chat
 *
 * @param {object} params
 * @param {string} params.chatId - UUID do chat
 * @param {string} params.title - Novo título
 * @returns {Promise<object>}
 */
export async function updateChatTitleById({ chatId, title }) {
  const sql = getSql();
  const rows = await sql`
    UPDATE chats
    SET title = ${title}, updated_at = NOW()
    WHERE id = ${chatId}
    RETURNING *
  `;
  return rows[0];
}

/**
 * Busca todos os chats de um usuário
 *
 * @param {object} params
 * @param {string} params.userId - ID do usuário
 * @param {number} params.limit - Limite de resultados (default: 20)
 * @param {number} params.offset - Offset para paginação (default: 0)
 * @returns {Promise<Array>}
 */
export async function getChatsByUserId({ userId, limit = 20, offset = 0 }) {
  const sql = getSql();
  return await sql`
    SELECT * FROM chats
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

/**
 * Deleta um chat (e todas suas mensagens em cascata)
 *
 * @param {object} params
 * @param {string} params.id - UUID do chat
 * @returns {Promise<void>}
 */
export async function deleteChatById({ id }) {
  const sql = getSql();
  await sql`
    DELETE FROM chats
    WHERE id = ${id}
  `;
}

// ============================================================================
// MESSAGE QUERIES
// ============================================================================

/**
 * Salva uma mensagem
 *
 * @param {object} params
 * @param {string} params.chatId - UUID do chat
 * @param {string} params.id - UUID da mensagem
 * @param {string} params.role - 'user' ou 'assistant'
 * @param {Array} params.parts - Array de parts da mensagem
 * @returns {Promise<object>}
 */
export async function saveMessage({ chatId, id, role, parts }) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO messages (id, chat_id, role, parts, created_at)
    VALUES (${id}, ${chatId}, ${role}, ${JSON.stringify(parts)}, NOW())
    RETURNING *
  `;
  return rows[0];
}

/**
 * Salva múltiplas mensagens em batch
 *
 * @param {Array} messages - Array de objetos { chatId, id, role, parts }
 * @returns {Promise<Array>}
 */
export async function saveMessages(messages) {
  const sql = getSql();

  if (messages.length === 0) {
    return [];
  }

  // Construir valores para insert
  const values = messages.map(msg => [
    msg.id,
    msg.chatId,
    msg.role,
    JSON.stringify(msg.parts)
  ]);

  // Insert com múltiplos valores
  const placeholders = values.map((_, i) => {
    const base = i * 4;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, NOW())`;
  }).join(', ');

  const flatValues = values.flat();

  const query = `
    INSERT INTO messages (id, chat_id, role, parts, created_at)
    VALUES ${placeholders}
    RETURNING *
  `;

  return await sql(query, flatValues);
}

/**
 * Busca mensagens de um chat
 *
 * @param {object} params
 * @param {string} params.id - UUID do chat
 * @param {number} params.limit - Limite de resultados (opcional)
 * @returns {Promise<Array>}
 */
export async function getMessagesByChatId({ id, limit = 100 }) {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM messages
    WHERE chat_id = ${id}
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;

  // Parse JSONB parts
  return rows.map(row => ({
    ...row,
    parts: typeof row.parts === 'string' ? JSON.parse(row.parts) : row.parts
  }));
}

/**
 * Conta mensagens de um usuário nas últimas N horas
 * (Para rate limiting)
 *
 * @param {object} params
 * @param {string} params.id - User ID
 * @param {number} params.differenceInHours - Janela de tempo em horas
 * @returns {Promise<number>}
 */
export async function getMessageCountByUserId({ id, differenceInHours = 24 }) {
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*) as count
    FROM messages m
    JOIN chats c ON m.chat_id = c.id
    WHERE c.user_id = ${id}
      AND m.role = 'user'
      AND m.created_at >= NOW() - INTERVAL '${differenceInHours} hours'
  `;
  return parseInt(rows[0]?.count || 0);
}

// ============================================================================
// STREAM ID QUERIES
// ============================================================================

/**
 * Cria um stream ID para tracking de resume
 *
 * @param {object} params
 * @param {string} params.streamId - UUID do stream
 * @param {string} params.chatId - UUID do chat
 * @returns {Promise<object>}
 */
export async function createStreamId({ streamId, chatId }) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO stream_ids (stream_id, chat_id, created_at)
    VALUES (${streamId}, ${chatId}, NOW())
    RETURNING *
  `;
  return rows[0];
}

/**
 * Busca stream IDs recentes de um chat
 *
 * @param {object} params
 * @param {string} params.chatId - UUID do chat
 * @param {number} params.limit - Limite de resultados (default: 5)
 * @returns {Promise<Array>}
 */
export async function getStreamIdsByChatId({ chatId, limit = 5 }) {
  const sql = getSql();
  return await sql`
    SELECT * FROM stream_ids
    WHERE chat_id = ${chatId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

/**
 * Limpa stream IDs antigos (mais de 1 hora)
 * (Executar periodicamente via cron)
 *
 * @returns {Promise<number>} - Número de registros deletados
 */
export async function cleanupOldStreamIds() {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM stream_ids
    WHERE created_at < NOW() - INTERVAL '1 hour'
    RETURNING id
  `;
  return rows.length;
}
