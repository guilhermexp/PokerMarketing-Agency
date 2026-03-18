/**
 * Database Queries - Vercel AI SDK Chat
 *
 * Queries para persistência de chats e mensagens
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

type SqlClient = NeonQueryFunction<false, false>;

/**
 * Get SQL client (reutiliza conexão existente)
 */
function getSql(): SqlClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada');
  }
  return neon(process.env.DATABASE_URL);
}

// ============================================================================
// TYPES
// ============================================================================

export interface Chat {
  id: string;
  user_id: string;
  org_id: string | null;
  title: string;
  visibility: string;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  chat_id: string;
  role: string;
  parts: unknown[];
  created_at: Date;
}

export interface StreamId {
  id: string;
  stream_id: string;
  chat_id: string;
  created_at: Date;
}

// ============================================================================
// CHAT QUERIES
// ============================================================================

interface GetChatByIdParams {
  id: string;
}

/**
 * Busca um chat por ID
 */
export async function getChatById({ id }: GetChatByIdParams): Promise<Chat | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM chats
    WHERE id = ${id}
    LIMIT 1
  ` as Chat[];
  return rows[0] || null;
}

interface SaveChatParams {
  id: string;
  userId: string;
  orgId: string | null;
  title: string;
  visibility?: string;
}

/**
 * Salva um novo chat
 */
export async function saveChat({ id, userId, orgId, title, visibility = 'private' }: SaveChatParams): Promise<Chat> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO chats (id, user_id, org_id, title, visibility, created_at, updated_at)
    VALUES (${id}, ${userId}, ${orgId}, ${title}, ${visibility}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      title = ${title},
      updated_at = NOW()
    RETURNING *
  ` as Chat[];
  return rows[0]!;
}

interface UpdateChatTitleParams {
  chatId: string;
  title: string;
}

/**
 * Atualiza o título de um chat
 */
export async function updateChatTitleById({ chatId, title }: UpdateChatTitleParams): Promise<Chat | undefined> {
  const sql = getSql();
  const rows = await sql`
    UPDATE chats
    SET title = ${title}, updated_at = NOW()
    WHERE id = ${chatId}
    RETURNING *
  ` as Chat[];
  return rows[0];
}

interface GetChatsByUserIdParams {
  userId: string;
  limit?: number;
  offset?: number;
}

/**
 * Busca todos os chats de um usuário
 */
export async function getChatsByUserId({ userId, limit = 20, offset = 0 }: GetChatsByUserIdParams): Promise<Chat[]> {
  const sql = getSql();
  return await sql`
    SELECT * FROM chats
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  ` as Chat[];
}

interface DeleteChatByIdParams {
  id: string;
}

/**
 * Deleta um chat (e todas suas mensagens em cascata)
 */
export async function deleteChatById({ id }: DeleteChatByIdParams): Promise<void> {
  const sql = getSql();
  await sql`
    DELETE FROM chats
    WHERE id = ${id}
  `;
}

// ============================================================================
// MESSAGE QUERIES
// ============================================================================

interface SaveMessageParams {
  chatId: string;
  id: string;
  role: string;
  parts: unknown[];
}

/**
 * Salva uma mensagem
 */
export async function saveMessage({ chatId, id, role, parts }: SaveMessageParams): Promise<Message> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO messages (id, chat_id, role, parts, created_at)
    VALUES (${id}, ${chatId}, ${role}, ${JSON.stringify(parts)}, NOW())
    RETURNING *
  ` as Message[];
  return rows[0]!;
}

/**
 * Salva múltiplas mensagens em batch
 */
export async function saveMessages(messages: SaveMessageParams[]): Promise<Message[]> {
  if (messages.length === 0) {
    return [];
  }

  // Insert messages one by one (neon doesn't support dynamic batch inserts with tagged templates)
  const results: Message[] = [];
  for (const msg of messages) {
    const result = await saveMessage(msg);
    results.push(result);
  }
  return results;
}

interface GetMessagesByChatIdParams {
  id: string;
  limit?: number;
}

/**
 * Busca mensagens de um chat
 */
export async function getMessagesByChatId({ id, limit = 100 }: GetMessagesByChatIdParams): Promise<Message[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM messages
    WHERE chat_id = ${id}
    ORDER BY created_at ASC
    LIMIT ${limit}
  ` as Array<Message & { parts: string | unknown[] }>;

  // Parse JSONB parts
  return rows.map(row => ({
    ...row,
    parts: typeof row.parts === 'string' ? JSON.parse(row.parts) : row.parts
  }));
}

interface GetMessageCountParams {
  id: string;
  differenceInHours?: number;
}

/**
 * Conta mensagens de um usuário nas últimas N horas
 * (Para rate limiting)
 */
export async function getMessageCountByUserId({ id, differenceInHours = 24 }: GetMessageCountParams): Promise<number> {
  const sql = getSql();
  // Note: Using raw SQL with parameter because template literals can't interpolate interval values safely
  const intervalHours = `${differenceInHours} hours`;
  const rows = await sql`
    SELECT COUNT(*) as count
    FROM messages m
    JOIN chats c ON m.chat_id = c.id
    WHERE c.user_id = ${id}
      AND m.role = 'user'
      AND m.created_at >= NOW() - ${intervalHours}::interval
  ` as Array<{ count: string }>;
  return parseInt(rows[0]?.count || '0');
}

// ============================================================================
// STREAM ID QUERIES
// ============================================================================

interface CreateStreamIdParams {
  streamId: string;
  chatId: string;
}

/**
 * Cria um stream ID para tracking de resume
 */
export async function createStreamId({ streamId, chatId }: CreateStreamIdParams): Promise<StreamId> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO stream_ids (stream_id, chat_id, created_at)
    VALUES (${streamId}, ${chatId}, NOW())
    RETURNING *
  ` as StreamId[];
  return rows[0]!;
}

interface GetStreamIdsByChatIdParams {
  chatId: string;
  limit?: number;
}

/**
 * Busca stream IDs recentes de um chat
 */
export async function getStreamIdsByChatId({ chatId, limit = 5 }: GetStreamIdsByChatIdParams): Promise<StreamId[]> {
  const sql = getSql();
  return await sql`
    SELECT * FROM stream_ids
    WHERE chat_id = ${chatId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as StreamId[];
}

/**
 * Limpa stream IDs antigos (mais de 1 hora)
 * (Executar periodicamente via cron)
 */
export async function cleanupOldStreamIds(): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM stream_ids
    WHERE created_at < NOW() - INTERVAL '1 hour'
    RETURNING id
  ` as Array<{ id: string }>;
  return rows.length;
}
