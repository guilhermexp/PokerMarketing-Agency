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

import type { Request, Response, NextFunction } from "express";
import type { SqlClient } from "./db.js";
import {
  createOrgContext,
  hasPermission as roleHasPermission,
  OrganizationAccessError,
  type OrgRole,
  type Permission,
} from "../helpers/organization-context.js";
import logger from "./logger.js";

// ============================================================================
// RATE LIMITING FOR AI ENDPOINTS
// Upstash Redis when UPSTASH_REDIS_REST_URL is set, in-memory fallback otherwise
// ============================================================================

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Types for Upstash (dynamically imported)
interface UpstashRedisClient {
  // Minimal interface for our needs
}

interface UpstashRateLimitResult {
  success: boolean;
  remaining: number;
}

interface UpstashRateLimiter {
  limit(identifier: string): Promise<UpstashRateLimitResult>;
}

interface UpstashRatelimitClass {
  new (config: { redis: UpstashRedisClient; limiter: unknown; prefix: string }): UpstashRateLimiter;
  slidingWindow(tokens: number, window: string): unknown;
}

let upstashRedis: UpstashRedisClient | null = null;
let RatelimitClass: UpstashRatelimitClass | null = null;

// Async IIFE to load Upstash modules
(async () => {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const { Redis } = await import("@upstash/redis");
      const { Ratelimit } = await import("@upstash/ratelimit");
      upstashRedis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN }) as UpstashRedisClient;
      RatelimitClass = Ratelimit as unknown as UpstashRatelimitClass;
      logger.info("[RateLimit] Using Upstash Redis");
    } catch (err) {
      logger.warn({ err }, "[RateLimit] Failed to load Upstash, falling back to in-memory");
    }
  }
})();

// In-memory fallback (dev / environments without Upstash)
interface RateLimitEntry {
  windowStart: number;
  count: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
let maxWindowMs = 60_000;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

interface ConnectionWithRemoteAddress {
  remoteAddress?: string;
}

function checkRateLimitInMemory(
  prefix: string,
  identifier: string,
  maxRequests = 30,
  windowMs = 60_000,
): RateLimitResult {
  const key = `${prefix}:${identifier}`;
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

export async function checkAiRateLimit(identifier: string, maxRequests = 30, windowMs = 60_000): Promise<RateLimitResult> {
  if (!upstashRedis || !RatelimitClass) {
    return checkRateLimitInMemory("ai", identifier, maxRequests, windowMs);
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
export function createRateLimitMiddleware(
  maxRequests = 30,
  windowMs = 60_000,
  prefix = "route",
) {
  maxWindowMs = Math.max(maxWindowMs, windowMs);

  // Pre-build an Upstash limiter if available (avoids creating one per request)
  let upstashLimiter: UpstashRateLimiter | null = null;
  if (upstashRedis && RatelimitClass) {
    upstashLimiter = new RatelimitClass({
      redis: upstashRedis,
      limiter: RatelimitClass.slidingWindow(maxRequests, `${Math.ceil(windowMs / 1000)} s`),
      prefix: `rl:${prefix}`,
    });
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authContext = getRequestAuthContext(req);
    const xForwardedFor = req.headers["x-forwarded-for"];
    const connection = req.connection as ConnectionWithRemoteAddress | undefined;
    const forwardedIp = typeof xForwardedFor === "string"
      ? xForwardedFor.split(",")[0]?.trim()
      : Array.isArray(xForwardedFor)
        ? xForwardedFor[0]
        : undefined;
    const identifier =
      authContext?.orgId ||
      authContext?.userId ||
      req.ip ||
      forwardedIp ||
      connection?.remoteAddress;
    if (!identifier) {
      logger.warn({ requestId: req.id }, "Rate limit identifier unavailable");
      res.status(400).json({ error: "Unable to identify request for rate limiting" });
      return;
    }

    try {
      let result: RateLimitResult;
      if (upstashLimiter) {
        const { success, remaining } = await upstashLimiter.limit(`${prefix}:${identifier}`);
        result = { allowed: success, remaining };
      } else {
        result = checkRateLimitInMemory(prefix, identifier, maxRequests, windowMs);
      }

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", result.remaining);

      if (!result.allowed) {
        res.status(429).json({
          error: "Rate limit exceeded. Please wait before making more requests.",
          retryAfter: Math.ceil(windowMs / 1000),
        });
        return;
      }
      next();
    } catch (err) {
      // Fail-closed: deny request when rate limiter errors (security best practice)
      logger.error({ err, identifier }, "[RateLimit] Rate limiting service error, denying request");
      res.status(503).json({
        error: "Rate limiting service temporarily unavailable. Please try again.",
        retryAfter: 5,
      });
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
export function stopRateLimitCleanup(): void {}

interface SessionRecord {
  activeOrganizationId?: string;
  active_organization_id?: string;
  activeOrganizationRole?: string;
  active_organization_role?: string;
}

interface AuthSession {
  session?: SessionRecord;
  user?: {
    id: string;
    email?: string;
  };
}

function getSessionRecord(authSession: AuthSession | null | undefined): SessionRecord | null {
  if (!authSession || typeof authSession !== "object") return null;

  // Better Auth getSession usually returns { user, session }, but some client/server
  // paths can expose session fields on the root object.
  if (authSession.session && typeof authSession.session === "object") {
    return authSession.session;
  }

  return authSession as unknown as SessionRecord;
}

function getActiveOrganizationId(authSession: AuthSession | null | undefined): string | null {
  const sessionRecord = getSessionRecord(authSession);

  return (
    sessionRecord?.activeOrganizationId ||
    sessionRecord?.active_organization_id ||
    null
  );
}

function getActiveOrganizationRole(authSession: AuthSession | null | undefined): string | null {
  const sessionRecord = getSessionRecord(authSession);

  return (
    sessionRecord?.activeOrganizationRole ||
    sessionRecord?.active_organization_role ||
    null
  );
}

export interface AuthContext {
  userId: string;
  orgId: string | null;
}

/**
 * Extract auth context from request.
 * Reads from req.authSession (set by Better Auth session middleware)
 * or req.internalAuth (set by internal API token middleware).
 */
export function getRequestAuthContext(req: Request): AuthContext | null {
  if (req.internalAuth?.userId) {
    return {
      userId: req.internalAuth.userId,
      orgId: req.internalAuth.orgId || null,
    };
  }

  const session = req.authSession as AuthSession | null | undefined;
  if (!session?.user?.id) {
    return null;
  }

  return {
    userId: session.user.id,
    orgId: getActiveOrganizationId(session),
  };
}

export function requireAuthenticatedRequest(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  const authContext = getRequestAuthContext(req);
  if (!authContext?.userId) {
    res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
    return;
  }

  req.authUserId = authContext.userId;
  req.authOrgId = authContext.orgId;
  next();
}

export function enforceAuthenticatedIdentity(req: Request, res: Response, next: NextFunction): void {
  const authUserId = req.authUserId;
  const authOrgId = req.authOrgId || null;

  if (!authUserId) {
    next();
    return;
  }

  const query = req.query as Record<string, unknown> | undefined;
  const body = req.body as Record<string, unknown> | undefined;

  const queryUserIds = [query?.user_id, query?.clerk_user_id, query?.userId]
    .filter(Boolean)
    .map((value) => String(value));

  const bodyUserIds =
    body && typeof body === "object"
      ? [body.user_id, body.clerk_user_id, body.userId]
          .filter(Boolean)
          .map((value) => String(value))
      : [];

  const mismatchedUserId = [...queryUserIds, ...bodyUserIds].find(
    (value) => value !== authUserId,
  );

  if (mismatchedUserId) {
    res.status(403).json({
      error: "User context mismatch",
      code: "FORBIDDEN_USER_CONTEXT",
    });
    return;
  }

  const queryOrgIds = [query?.organization_id, query?.organizationId]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value) => String(value));

  const bodyOrgIds =
    body && typeof body === "object"
      ? [body.organization_id, body.organizationId]
          .filter((value) => value !== undefined && value !== null && value !== "")
          .map((value) => String(value))
      : [];

  const allOrgIds = [...queryOrgIds, ...bodyOrgIds];
  if (authOrgId) {
    const mismatchedOrgId = allOrgIds.find((value) => value !== authOrgId);
    if (mismatchedOrgId) {
      res.status(403).json({
        error: "Organization context mismatch",
        code: "FORBIDDEN_ORG_CONTEXT",
      });
      return;
    }
  } else if (allOrgIds.length > 0) {
    res.status(403).json({
      error: "Organization context not available in authentication token",
      code: "FORBIDDEN_ORG_CONTEXT",
    });
    return;
  }

  if (query && typeof query === "object") {
    (query as Record<string, unknown>).user_id = authUserId;
    (query as Record<string, unknown>).clerk_user_id = authUserId;
    (query as Record<string, unknown>).userId = authUserId;

    if (authOrgId) {
      (query as Record<string, unknown>).organization_id = authOrgId;
      (query as Record<string, unknown>).organizationId = authOrgId;
    }
  }

  if (body && typeof body === "object" && !Array.isArray(body)) {
    body.user_id = authUserId;
    body.clerk_user_id = authUserId;
    body.userId = authUserId;

    if (authOrgId) {
      body.organization_id = authOrgId;
      body.organizationId = authOrgId;
    }
  }

  next();
}

// Middleware for AI endpoints with stricter rate limiting
export async function requireAuthWithAiRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authCtx = getRequestAuthContext(req);

  if (!authCtx?.userId) {
    res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
    return;
  }

  try {
    // Apply stricter AI rate limiting
    const rateLimit = await checkAiRateLimit(authCtx.userId);
    res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);

    if (!rateLimit.allowed) {
      res.status(429).json({
        error: "AI rate limit exceeded. Please try again later.",
        code: "AI_RATE_LIMIT_EXCEEDED",
      });
      return;
    }
  } catch (err) {
    // Fail-closed: deny request when rate limiter errors (security best practice)
    logger.error({ err, userId: authCtx.userId }, "[RateLimit] Rate limiting service error, denying request");
    res.status(503).json({
      error: "Rate limiting service temporarily unavailable. Please try again.",
      code: "RATE_LIMIT_SERVICE_ERROR",
      retryAfter: 5,
    });
    return;
  }

  req.authUserId = authCtx.userId;
  req.authOrgId = authCtx.orgId || null;
  next();
}

// ============================================================================
// SUPER ADMIN
// ============================================================================

export const SUPER_ADMIN_EMAILS: string[] = (
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

function getAdminAuditContext(
  req: Request,
  adminAction: string,
  session: AuthSession | null | undefined,
  details: Record<string, unknown> = {},
) {
  return {
    adminAction,
    adminEmail: session?.user?.email?.toLowerCase() ?? null,
    adminUserId: session?.user?.id ?? null,
    method: req.method,
    path: req.path,
    requestId: req.id,
    happenedAt: new Date().toISOString(),
    ...details,
  };
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = req.authSession as AuthSession | null | undefined;

    if (!session?.user?.id) {
      logger.warn(
        getAdminAuditContext(req, "admin.access.denied", session, {
          result: "denied",
          statusCode: 401,
          reason: "missing-session-user",
        }),
        "[Admin] Unauthorized access attempt for super admin endpoint",
      );
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userEmail = session.user.email?.toLowerCase();

    if (!userEmail || !SUPER_ADMIN_EMAILS.includes(userEmail)) {
      logger.warn(
        getAdminAuditContext(req, "admin.access.denied", session, {
          result: "denied",
          statusCode: 403,
          reason: "not-super-admin",
          superAdminCount: SUPER_ADMIN_EMAILS.length,
        }),
        "[Admin] Access denied for super admin endpoint",
      );
      res
        .status(403)
        .json({ error: "Access denied. Super admin only." });
      return;
    }

    req.adminEmail = userEmail;
    next();
  } catch (error) {
    logger.error(
      {
        err: error,
        ...getAdminAuditContext(
          req,
          "admin.access.fail",
          req.authSession as AuthSession | null | undefined,
          {
            result: "fail",
            statusCode: 500,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        ),
      },
      "[Admin] Auth error",
    );
    res.status(500).json({ error: "Authentication error" });
  }
}

// ============================================================================
// ORGANIZATION CONTEXT HELPERS
// ============================================================================

export function getOrgContext(req: Request) {
  const session = req.authSession as AuthSession | null | undefined;
  const userId = session?.user?.id;
  const orgId = getActiveOrganizationId(session);
  // Better Auth org roles: owner, admin, member
  // Map to org:admin / org:member for compatibility
  const rawRole = getActiveOrganizationRole(session);
  const orgRole: OrgRole = rawRole === "owner" || rawRole === "admin" ? "org:admin" : rawRole === "member" ? "org:member" : null;
  return createOrgContext({ userId, orgId, orgRole });
}

// Keep old name as alias for backward compatibility during migration
export const getClerkOrgContext = getOrgContext;

export interface ResolvedOrgContext {
  organizationId: string | null;
  isPersonal: boolean;
  orgRole: OrgRole;
  hasPermission: (permission: Permission) => boolean;
}

export async function resolveOrganizationContext(
  sql: SqlClient,
  userId: string,
  organizationId: string | null | undefined
): Promise<ResolvedOrgContext> {
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
    ` as Array<{ auth_provider_id: string | null }>;
    if (userRow.length > 0 && userRow[0]?.auth_provider_id) {
      memberUserId = userRow[0].auth_provider_id;
    }
  }

  const membership = await sql`
    SELECT role
    FROM "member"
    WHERE "organizationId" = ${organizationId}
      AND "userId" = ${memberUserId}
    LIMIT 1
  ` as Array<{ role: string }>;

  if (!membership.length) {
    throw new OrganizationAccessError("User is not a member of this organization");
  }

  const rawRole = membership[0]?.role;
  const orgRole: OrgRole =
    rawRole === "owner" || rawRole === "admin" ? "org:admin" : "org:member";

  return {
    organizationId,
    isPersonal: false,
    orgRole,
    hasPermission: (permission: Permission) => roleHasPermission(orgRole, permission),
  };
}
