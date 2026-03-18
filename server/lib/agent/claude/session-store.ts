import { getSql, type SqlClient } from '../../db.js';

type NullableOrgId = string | null | undefined;

type ThreadIdentityInput = {
  organizationId?: NullableOrgId;
  threadId?: string;
  topicId?: string;
  userId: string;
};

type ThreadKeyInput = {
  organizationId?: NullableOrgId;
  studioType: string;
  topicId: string;
  userId: string;
};

type SessionUpdateInput = {
  sessionId: string | null;
  threadId: string;
};

type ThreadMessageInput = {
  payload: unknown;
  role: string;
  threadId: string;
};

type ListMessagesInput = {
  limit?: number;
  threadId: string;
};

type StudioAgentThreadRow = Record<string, unknown>;
type StudioAgentMessageRow = Record<string, unknown>;

function normalizeOrgId(orgId: NullableOrgId): string | null {
  return orgId || null;
}

function getThreadStoreSql(): SqlClient {
  return getSql();
}

export async function getThreadByTopic({
  userId,
  organizationId,
  studioType,
  topicId,
}: ThreadKeyInput): Promise<StudioAgentThreadRow | null> {
  const sql = getThreadStoreSql();
  const orgId = normalizeOrgId(organizationId);

  const rows = await sql`
    SELECT *
    FROM studio_agent_threads
    WHERE user_id = ${userId}
      AND organization_id IS NOT DISTINCT FROM ${orgId}
      AND studio_type = ${studioType}
      AND topic_id = ${topicId}
    LIMIT 1
  `;

  return (rows[0] as StudioAgentThreadRow | undefined) || null;
}

export async function ensureThread({
  userId,
  organizationId,
  studioType,
  topicId,
}: ThreadKeyInput): Promise<StudioAgentThreadRow | null> {
  const sql = getThreadStoreSql();
  const orgId = normalizeOrgId(organizationId);

  const [row] = await sql`
    INSERT INTO studio_agent_threads (
      user_id,
      organization_id,
      studio_type,
      topic_id,
      status
    )
    VALUES (
      ${userId},
      ${orgId},
      ${studioType},
      ${topicId},
      'active'
    )
    ON CONFLICT (user_id, organization_id, studio_type, topic_id)
    DO UPDATE SET
      updated_at = NOW(),
      status = 'active'
    RETURNING *
  `;

  return (row as StudioAgentThreadRow | undefined) || null;
}

export async function getThreadById({
  threadId,
  userId,
  organizationId,
}: Required<Pick<ThreadIdentityInput, "threadId" | "userId">> & Pick<ThreadIdentityInput, "organizationId">): Promise<StudioAgentThreadRow | null> {
  const sql = getThreadStoreSql();
  const orgId = normalizeOrgId(organizationId);

  const rows = await sql`
    SELECT *
    FROM studio_agent_threads
    WHERE id = ${threadId}
      AND user_id = ${userId}
      AND organization_id IS NOT DISTINCT FROM ${orgId}
    LIMIT 1
  `;

  return (rows[0] as StudioAgentThreadRow | undefined) || null;
}

export async function updateThreadSessionId({ threadId, sessionId }: SessionUpdateInput): Promise<void> {
  const sql = getThreadStoreSql();

  await sql`
    UPDATE studio_agent_threads
    SET
      claude_session_id = ${sessionId},
      updated_at = NOW()
    WHERE id = ${threadId}
  `;
}

export async function appendThreadMessage({ threadId, role, payload }: ThreadMessageInput): Promise<void> {
  const sql = getThreadStoreSql();

  await sql`
    INSERT INTO studio_agent_messages (thread_id, role, payload_json)
    VALUES (${threadId}, ${role}, ${JSON.stringify(payload)})
  `;

  await sql`
    UPDATE studio_agent_threads
    SET updated_at = NOW()
    WHERE id = ${threadId}
  `;
}

export async function listThreadMessages({ threadId, limit = 200 }: ListMessagesInput): Promise<StudioAgentMessageRow[]> {
  const sql = getThreadStoreSql();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200;

  const rows = await sql`
    SELECT *
    FROM studio_agent_messages
    WHERE thread_id = ${threadId}
    ORDER BY created_at ASC
    LIMIT ${safeLimit}
  `;

  return rows as StudioAgentMessageRow[];
}

export async function resetThread({
  threadId,
  userId,
  organizationId,
}: Required<Pick<ThreadIdentityInput, "threadId" | "userId">> & Pick<ThreadIdentityInput, "organizationId">): Promise<void> {
  const sql = getThreadStoreSql();
  const orgId = normalizeOrgId(organizationId);

  await sql`
    DELETE FROM studio_agent_messages
    WHERE thread_id = ${threadId}
  `;

  await sql`
    UPDATE studio_agent_threads
    SET
      claude_session_id = NULL,
      status = 'reset',
      updated_at = NOW()
    WHERE id = ${threadId}
      AND user_id = ${userId}
      AND organization_id IS NOT DISTINCT FROM ${orgId}
  `;
}
