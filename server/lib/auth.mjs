/**
 * Authentication helpers.
 *
 * Owns: rateLimitStore, SUPER_ADMIN_EMAILS
 * Exports: getRequestAuthContext, requireAuthenticatedRequest,
 *          enforceAuthenticatedIdentity, requireAuthWithAiRateLimit,
 *          checkAiRateLimit, createRateLimitMiddleware, stopRateLimitCleanup,
 *          requireSuperAdmin,
 *          getOrgContext, resolveOrganizationContext
 */

import {
  createOrgContext,
  hasPermission as roleHasPermission,
  OrganizationAccessError,
} from "../helpers/organization-context.mjs";
import logger from "./logger.mjs";

// ============================================================================
// RATE LIMITING FOR AI ENDPOINTS
// Upstash Redis when UPSTASH_REDIS_REST_URL is set, in-memory fallback otherwise
// ============================================================================

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let upstashRedis = null;
let RatelimitClass = null;

if (UPSTASH_URL && UPSTASH_TOKEN) {
  try {
    const { Redis } = await import("@upstash/redis");
    const { Ratelimit } = await import("@upstash/ratelimit");
    upstashRedis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
    RatelimitClass = Ratelimit;
    logger.info("[RateLimit] Using Upstash Redis");
  } catch (err) {
    logger.warn({ err }, "[RateLimit] Failed to load Upstash, falling back to in-memory");
  }
}

// In-memory fallback (dev / environments without Upstash)
const rateLimitStore = new Map();
let maxWindowMs = 60_000;

function checkAiRateLimitInMemory(identifier, maxRequests = 30, windowMs = 60_000) {
  const key = `ai:${identifier}`;
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now - record.windowStart > windowMs) {
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
  };
}

export async function checkAiRateLimit(identifier, maxRequests = 30, windowMs = 60_000) {
  if (!upstashRedis) {
    return checkAiRateLimitInMemory(identifier, maxRequests, windowMs);
  }

  // Upstash path — create a limiter scoped to (maxRequests, windowMs)
  const limiter = new RatelimitClass({
    redis: upstashRedis,
    limiter: RatelimitClass.slidingWindow(maxRequests, `${Math.ceil(windowMs / 1000)} s`),
    prefix: "rl",
  });

  const { success, remaining } = await limiter.limit(`ai:${identifier}`);
  return { allowed: success, remaining };
}

/**
 * Factory for rate-limit middleware. Returns Express middleware that limits
 * requests per identifier (orgId > userId > IP) within a sliding window.
 */
export function createRateLimitMiddleware(maxRequests = 30, windowMs = 60_000) {
  maxWindowMs = Math.max(maxWindowMs, windowMs);

  // Pre-build an Upstash limiter if available (avoids creating one per request)
  let upstashLimiter = null;
  if (upstashRedis && RatelimitClass) {
    upstashLimiter = new RatelimitClass({
      redis: upstashRedis,
      limiter: RatelimitClass.slidingWindow(maxRequests, `${Math.ceil(windowMs / 1000)} s`),
      prefix: "rl",
    });
  }

  return async (req, res, next) => {
    const authContext = getRequestAuthContext(req);
    const identifier = authContext?.orgId || authContext?.userId || req.ip;
    if (!identifier) {
      logger.warn({ requestId: req.id }, "Rate limit identifier unavailable");
      return res.status(400).json({ error: "Unable to identify request for rate limiting" });
    }

    try {
      let result;
      if (upstashLimiter) {
        const { success, remaining } = await upstashLimiter.limit(`ai:${identifier}`);
        result = { allowed: success, remaining };
      } else {
        result = checkAiRateLimitInMemory(identifier, maxRequests, windowMs);
      }

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", result.remaining);

      if (!result.allowed) {
        return res.status(429).json({
          error: "Rate limit exceeded. Please wait before making more requests.",
          retryAfter: Math.ceil(windowMs / 1000),
        });
      }
      next();
    } catch (err) {
      // If Upstash fails, allow the request (fail-open)
      logger.warn({ err, identifier }, "[RateLimit] Upstash error, allowing request");
      next();
    }
  };
}

// Periodic cleanup for in-memory store (only runs if Upstash is not used)
if (!upstashRedis) {
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const cleanupThreshold = maxWindowMs * 2;
    for (const [key, entry] of rateLimitStore) {
      if (now - entry.windowStart > cleanupThreshold) rateLimitStore.delete(key);
    }
  }, 300_000);
  // Allow process to exit without waiting for this timer
  cleanupInterval.unref?.();
}

/** @deprecated No longer needed — cleanup is self-managing */
export function stopRateLimitCleanup() {}

function getSessionRecord(authSession) {
  if (!authSession || typeof authSession !== "object") return null;

  // Better Auth getSession usually returns { user, session }, but some client/server
  // paths can expose session fields on the root object.
  if (authSession.session && typeof authSession.session === "object") {
    return authSession.session;
  }

  return authSession;
}

function getActiveOrganizationId(authSession) {
  const sessionRecord = getSessionRecord(authSession);

  return (
    sessionRecord?.activeOrganizationId ||
    sessionRecord?.active_organization_id ||
    null
  );
}

function getActiveOrganizationRole(authSession) {
  const sessionRecord = getSessionRecord(authSession);

  return (
    sessionRecord?.activeOrganizationRole ||
    sessionRecord?.active_organization_role ||
    null
  );
}

/**
 * Extract auth context from request.
 * Reads from req.authSession (set by Better Auth session middleware)
 * or req.internalAuth (set by internal API token middleware).
 */
export function getRequestAuthContext(req) {
  if (req.internalAuth?.userId) {
    return {
      userId: req.internalAuth.userId,
      orgId: req.internalAuth.orgId || null,
    };
  }

  const session = req.authSession;
  if (!session?.user?.id) {
    return null;
  }

  return {
    userId: session.user.id,
    orgId: getActiveOrganizationId(session),
  };
}

export function requireAuthenticatedRequest(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  const authContext = getRequestAuthContext(req);
  if (!authContext?.userId) {
    return res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
  }

  req.authUserId = authContext.userId;
  req.authOrgId = authContext.orgId;
  next();
}

export function enforceAuthenticatedIdentity(req, res, next) {
  const authUserId = req.authUserId;
  const authOrgId = req.authOrgId || null;

  if (!authUserId) {
    return next();
  }

  const queryUserIds = [req.query?.user_id, req.query?.clerk_user_id, req.query?.userId]
    .filter(Boolean)
    .map((value) => String(value));

  const bodyUserIds =
    req.body && typeof req.body === "object"
      ? [req.body.user_id, req.body.clerk_user_id, req.body.userId]
          .filter(Boolean)
          .map((value) => String(value))
      : [];

  const mismatchedUserId = [...queryUserIds, ...bodyUserIds].find(
    (value) => value !== authUserId,
  );

  if (mismatchedUserId) {
    return res.status(403).json({
      error: "User context mismatch",
      code: "FORBIDDEN_USER_CONTEXT",
    });
  }

  const queryOrgIds = [req.query?.organization_id, req.query?.organizationId]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value) => String(value));

  const bodyOrgIds =
    req.body && typeof req.body === "object"
      ? [req.body.organization_id, req.body.organizationId]
          .filter((value) => value !== undefined && value !== null && value !== "")
          .map((value) => String(value))
      : [];

  const allOrgIds = [...queryOrgIds, ...bodyOrgIds];
  if (authOrgId) {
    const mismatchedOrgId = allOrgIds.find((value) => value !== authOrgId);
    if (mismatchedOrgId) {
      return res.status(403).json({
        error: "Organization context mismatch",
        code: "FORBIDDEN_ORG_CONTEXT",
      });
    }
  } else if (allOrgIds.length > 0) {
    return res.status(403).json({
      error: "Organization context not available in authentication token",
      code: "FORBIDDEN_ORG_CONTEXT",
    });
  }

  if (req.query && typeof req.query === "object") {
    req.query.user_id = authUserId;
    req.query.clerk_user_id = authUserId;
    req.query.userId = authUserId;

    if (authOrgId) {
      req.query.organization_id = authOrgId;
      req.query.organizationId = authOrgId;
    }
  }

  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    req.body.user_id = authUserId;
    req.body.clerk_user_id = authUserId;
    req.body.userId = authUserId;

    if (authOrgId) {
      req.body.organization_id = authOrgId;
      req.body.organizationId = authOrgId;
    }
  }

  next();
}

// Middleware for AI endpoints with stricter rate limiting
export async function requireAuthWithAiRateLimit(req, res, next) {
  const authCtx = getRequestAuthContext(req);

  if (!authCtx?.userId) {
    return res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
  }

  try {
    // Apply stricter AI rate limiting
    const rateLimit = await checkAiRateLimit(authCtx.userId);
    res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);

    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: "AI rate limit exceeded. Please try again later.",
        code: "AI_RATE_LIMIT_EXCEEDED",
      });
    }
  } catch (err) {
    // Fail-open: allow request if rate limiting errors
    logger.warn({ err, userId: authCtx.userId }, "[RateLimit] Error in requireAuthWithAiRateLimit");
  }

  req.authUserId = authCtx.userId;
  req.authOrgId = authCtx.orgId || null;
  next();
}

// ============================================================================
// SUPER ADMIN
// ============================================================================

export const SUPER_ADMIN_EMAILS = (
  process.env.SUPER_ADMIN_EMAILS || process.env.VITE_SUPER_ADMIN_EMAILS || ""
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

if (SUPER_ADMIN_EMAILS.length === 0) {
  logger.warn(
    "[Admin] SUPER_ADMIN_EMAILS is empty. All /api/admin routes will return 403.",
  );
}

export async function requireSuperAdmin(req, res, next) {
  try {
    const session = req.authSession;

    if (!session?.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userEmail = session.user.email?.toLowerCase();

    if (!userEmail || !SUPER_ADMIN_EMAILS.includes(userEmail)) {
      logger.warn(
        {
          requestId: req.id,
          userId: session.user.id ? `${session.user.id.slice(0, 8)}...` : null,
          userEmail: userEmail ? userEmail.replace(/^[^@]+/, "***") : null,
          superAdminCount: SUPER_ADMIN_EMAILS.length,
        },
        "[Admin] Access denied for super admin endpoint",
      );
      return res
        .status(403)
        .json({ error: "Access denied. Super admin only." });
    }

    req.adminEmail = userEmail;
    next();
  } catch (error) {
    logger.error({ err: error }, "[Admin] Auth error");
    res.status(500).json({ error: "Authentication error" });
  }
}

// ============================================================================
// ORGANIZATION CONTEXT HELPERS
// ============================================================================

export function getOrgContext(req) {
  const session = req.authSession;
  const userId = session?.user?.id;
  const orgId = getActiveOrganizationId(session);
  // Better Auth org roles: owner, admin, member
  // Map to org:admin / org:member for compatibility
  const rawRole = getActiveOrganizationRole(session);
  const orgRole = rawRole === "owner" || rawRole === "admin" ? "org:admin" : rawRole === "member" ? "org:member" : null;
  return createOrgContext({ userId, orgId, orgRole });
}

// Keep old name as alias for backward compatibility during migration
export const getClerkOrgContext = getOrgContext;

export async function resolveOrganizationContext(sql, userId, organizationId) {
  if (!organizationId) {
    return {
      organizationId: null,
      isPersonal: true,
      orgRole: null,
      hasPermission: () => true,
    };
  }

  // Better Auth's "member" table stores userId as Better Auth IDs (not our internal UUIDs).
  // If we receive a UUID (from resolveUserId), look up the auth_provider_id first.
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let memberUserId = userId;
  if (uuidPattern.test(userId)) {
    const userRow = await sql`
      SELECT auth_provider_id FROM users WHERE id = ${userId} LIMIT 1
    `;
    if (userRow.length > 0 && userRow[0].auth_provider_id) {
      memberUserId = userRow[0].auth_provider_id;
    }
  }

  const membership = await sql`
    SELECT role
    FROM "member"
    WHERE "organizationId" = ${organizationId}
      AND "userId" = ${memberUserId}
    LIMIT 1
  `;

  if (!membership.length) {
    throw new OrganizationAccessError("User is not a member of this organization");
  }

  const rawRole = membership[0].role;
  const orgRole =
    rawRole === "owner" || rawRole === "admin" ? "org:admin" : "org:member";

  return {
    organizationId,
    isPersonal: false,
    orgRole,
    hasPermission: (permission) => roleHasPermission(orgRole, permission),
  };
}
