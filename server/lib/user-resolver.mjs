/**
 * User ID resolution with caching.
 *
 * Resolves Clerk user IDs (user_xxx) to database UUIDs.
 * Owns: userIdCache
 */

import { getSql } from "./db.mjs";
import { isUndefinedColumnError } from "./db.mjs";
import logger from "./logger.mjs";

// Cache for resolved user IDs (5 minute TTL)
export const userIdCache = new Map();
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCachedUserId(clerkId) {
  const cached = userIdCache.get(clerkId);
  if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
    return cached.userId;
  }
  return null;
}

export function setCachedUserId(clerkId, userId) {
  userIdCache.set(clerkId, { userId, timestamp: Date.now() });
}

/**
 * Resolve user ID (handles both Clerk IDs and UUIDs).
 * Clerk IDs look like: user_2qyqJjnqMXEGJWJNf9jx86C0oQT
 * UUIDs look like: 550e8400-e29b-41d4-a716-446655440000
 * Uses caching to avoid repeated DB lookups.
 */
export async function resolveUserId(sql, userId) {
  if (!userId) return null;
  const normalizedUserId = String(userId).trim();
  if (!normalizedUserId) return null;

  // Check if it's a UUID format (8-4-4-4-12 hex characters)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(normalizedUserId)) {
    return normalizedUserId; // Already a UUID
  }

  // Check cache first
  const cachedId = getCachedUserId(normalizedUserId);
  if (cachedId) {
    return cachedId;
  }

  // It's a Clerk ID - look up the user by auth_provider_id
  let result;
  try {
    result = await sql`
      SELECT id FROM users
      WHERE auth_provider_id = ${normalizedUserId}
      AND deleted_at IS NULL
      LIMIT 1
    `;
  } catch (error) {
    // Backward compatibility for legacy schemas without deleted_at on users
    if (!isUndefinedColumnError(error, "deleted_at")) {
      throw error;
    }
    result = await sql`
      SELECT id FROM users
      WHERE auth_provider_id = ${normalizedUserId}
      LIMIT 1
    `;
  }

  if (result.length > 0) {
    const resolvedId = result[0].id;
    setCachedUserId(normalizedUserId, resolvedId); // Cache it!
    return resolvedId;
  }

  // User doesn't exist - return null
  logger.debug(
    { auth_provider_id: normalizedUserId },
    "[User Lookup] No user found for auth_provider_id",
  );
  return null;
}
