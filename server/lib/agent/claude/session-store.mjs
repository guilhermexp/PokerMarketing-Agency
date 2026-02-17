import { getSql } from '../../db.mjs';

function normalizeOrgId(orgId) {
  return orgId || null;
}

export async function getThreadByTopic({
  userId,
  organizationId,
  studioType,
  topicId,
}) {
  const sql = getSql();
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

  return rows[0] || null;
}

export async function ensureThread({
  userId,
  organizationId,
  studioType,
  topicId,
}) {
  const sql = getSql();
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

  return row;
}

export async function getThreadById({ threadId, userId, organizationId }) {
  const sql = getSql();
  const orgId = normalizeOrgId(organizationId);

  const rows = await sql`
    SELECT *
    FROM studio_agent_threads
    WHERE id = ${threadId}
      AND user_id = ${userId}
      AND organization_id IS NOT DISTINCT FROM ${orgId}
    LIMIT 1
  `;

  return rows[0] || null;
}

export async function updateThreadSessionId({ threadId, sessionId }) {
  const sql = getSql();

  await sql`
    UPDATE studio_agent_threads
    SET
      claude_session_id = ${sessionId},
      updated_at = NOW()
    WHERE id = ${threadId}
  `;
}

export async function appendThreadMessage({ threadId, role, payload }) {
  const sql = getSql();

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

export async function listThreadMessages({ threadId, limit = 200 }) {
  const sql = getSql();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200;

  const rows = await sql`
    SELECT *
    FROM studio_agent_messages
    WHERE thread_id = ${threadId}
    ORDER BY created_at ASC
    LIMIT ${safeLimit}
  `;

  return rows;
}

export async function resetThread({ threadId, userId, organizationId }) {
  const sql = getSql();
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
