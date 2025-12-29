/**
 * Database helpers for Vercel Serverless Functions
 * Provides connection pooling and common database utilities
 */

import { neon, NeonQueryFunction } from '@neondatabase/serverless';

/**
 * Get a Neon SQL client
 * Uses the DATABASE_URL environment variable
 */
export function getSql(): NeonQueryFunction<false, false> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not configured');
  }
  return neon(databaseUrl);
}

/**
 * Resolve a user ID from either a UUID or Clerk auth_provider_id
 * Returns the internal UUID or null if not found
 */
export async function resolveUserId(
  sql: NeonQueryFunction<false, false>,
  userId: string
): Promise<string | null> {
  // Check if it's already a UUID
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(userId)) {
    return userId;
  }

  // Look up by Clerk auth_provider_id
  const result = await sql`
    SELECT id FROM users
    WHERE auth_provider_id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `;

  return result[0]?.id || null;
}

/**
 * Set RLS context for the current transaction
 * Note: This only works with direct connections, not the serverless pooler
 */
export async function setRLSContext(
  sql: NeonQueryFunction<false, false>,
  userId: string,
  organizationId?: string | null
): Promise<void> {
  if (!userId) return;

  try {
    await sql`
      SELECT
        set_config('app.user_id', ${userId}, true),
        set_config('app.organization_id', ${organizationId || ''}, true)
    `;
  } catch (error) {
    // Don't fail the request if RLS context can't be set
    console.warn('[RLS] Failed to set context:', error);
  }
}

/**
 * Validate that a user exists and return their data
 */
export async function validateUser(
  sql: NeonQueryFunction<false, false>,
  userId: string
): Promise<{ id: string; email: string } | null> {
  const resolvedId = await resolveUserId(sql, userId);
  if (!resolvedId) return null;

  const result = await sql`
    SELECT id, email FROM users
    WHERE id = ${resolvedId} AND deleted_at IS NULL
    LIMIT 1
  `;

  return result[0] || null;
}
