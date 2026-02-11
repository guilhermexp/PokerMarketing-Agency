/**
 * Authentication helpers.
 *
 * Owns: rateLimitStore, SUPER_ADMIN_EMAILS
 * Exports: getRequestAuthContext, requireAuthenticatedRequest,
 *          enforceAuthenticatedIdentity, requireAuthWithAiRateLimit,
 *          checkAiRateLimit, requireSuperAdmin,
 *          getClerkOrgContext, resolveOrganizationContext
 */

import { getAuth } from "@clerk/express";
import { createOrgContext } from "../helpers/organization-context.mjs";
import logger from "./logger.mjs";

// ============================================================================
// RATE LIMITING FOR AI ENDPOINTS
// ============================================================================
const rateLimitStore = new Map();
const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const AI_RATE_LIMIT_MAX_REQUESTS = 30; // max AI requests per window

export function checkAiRateLimit(identifier) {
  const key = `ai:${identifier}`;
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now - record.windowStart > AI_RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: AI_RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= AI_RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return {
    allowed: true,
    remaining: AI_RATE_LIMIT_MAX_REQUESTS - record.count,
  };
}

export function getRequestAuthContext(req) {
  if (req.internalAuth?.userId) {
    return {
      userId: req.internalAuth.userId,
      orgId: req.internalAuth.orgId || null,
    };
  }

  const auth = getAuth(req);
  if (!auth?.userId) {
    return null;
  }

  return {
    userId: auth.userId,
    orgId: auth.orgId || null,
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
export function requireAuthWithAiRateLimit(req, res, next) {
  const auth = getRequestAuthContext(req);

  if (!auth?.userId) {
    return res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHORIZED",
    });
  }

  // Apply stricter AI rate limiting
  const rateLimit = checkAiRateLimit(auth.userId);
  res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);

  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: "AI rate limit exceeded. Please try again later.",
      code: "AI_RATE_LIMIT_EXCEEDED",
    });
  }

  req.authUserId = auth.userId;
  req.authOrgId = auth.orgId || null;
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
    const auth = getAuth(req);

    if (!auth?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get user email from Clerk
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    const userResponse = await fetch(
      `https://api.clerk.com/v1/users/${auth.userId}`,
      {
        headers: { Authorization: `Bearer ${clerkSecretKey}` },
      },
    );

    if (!userResponse.ok) {
      return res.status(401).json({ error: "Failed to verify user" });
    }

    const userData = await userResponse.json();
    const primaryEmailId = userData.primary_email_address_id;
    const primaryEmail =
      userData.email_addresses?.find((email) => email.id === primaryEmailId)
        ?.email_address || userData.email_addresses?.[0]?.email_address;
    const userEmail = primaryEmail?.toLowerCase();

    if (!userEmail || !SUPER_ADMIN_EMAILS.includes(userEmail)) {
      logger.warn(
        {
          requestId: req.id,
          clerkUserId: auth.userId ? `${auth.userId.slice(0, 8)}...` : null,
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

export function getClerkOrgContext(req) {
  const auth = getAuth(req);
  return createOrgContext(auth);
}

export async function resolveOrganizationContext(sql, userId, organizationId) {
  if (!organizationId) {
    return {
      organizationId: null,
      isPersonal: true,
      orgRole: null,
      hasPermission: () => true,
    };
  }

  return {
    organizationId,
    isPersonal: false,
    orgRole: "org:member",
    hasPermission: (permission) => true,
  };
}
