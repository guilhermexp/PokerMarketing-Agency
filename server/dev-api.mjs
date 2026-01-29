/**
 * Development API Server
 * Runs alongside Vite to handle API routes during development
 */

// CRITICAL: This import auto-loads .env BEFORE other imports are evaluated
import "dotenv/config";

import express from "express";
import cors from "cors";
import { neon, neonConfig } from "@neondatabase/serverless";

// Enable HTTP connection caching for better performance
neonConfig.fetchConnectionCache = true;
import { put, del } from "@vercel/blob";
import { fal } from "@fal-ai/client";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { GoogleGenAI } from "@google/genai";
import { OpenRouter } from "@openrouter/sdk";
import Replicate from "replicate";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
  OrganizationAccessError,
  createOrgContext,
} from "./helpers/organization-context.mjs";
import {
  buildCampaignPrompt,
  buildQuantityInstructions,
} from "./helpers/campaign-prompts.mjs";
import {
  logAiUsage,
  extractGeminiTokens,
  extractOpenRouterTokens,
  createTimer,
} from "./helpers/usage-tracking.mjs";
import { urlToBase64 } from "./helpers/image-helpers.mjs";
import { chatHandler } from "./api/chat/route.mjs";
import {
  initializeScheduledPostsChecker,
  isRedisAvailable,
  waitForRedis,
  getRedisConnection,
  schedulePostForPublishing,
  cancelScheduledPost,
} from "./helpers/job-queue.mjs";
import {
  checkAndPublishScheduledPosts,
  publishScheduledPostById,
} from "./helpers/scheduled-publisher.mjs";
import {
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  getBatches,
  deleteBatch,
  deleteGeneration,
  getGenerationStatus,
  createImageBatch,
  generateTopicTitle,
} from "./helpers/image-playground.mjs";
import { requestLogger } from "./middleware/requestLogger.mjs";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.mjs";
import logger from "./lib/logger.mjs";
import {
  ValidationError,
  AuthError,
  NotFoundError,
  DatabaseError,
  ExternalServiceError,
  RateLimitError,
} from "./lib/errors/index.mjs";

const app = express();
const PORT = 3002;

// Surface fatal errors during dev so the API doesn't silently exit.
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception in Dev API");
  process.exit(1); // Exit with error code
});

process.on("unhandledRejection", (error) => {
  logger.fatal({ err: error }, "Unhandled rejection in Dev API");
  process.exit(1); // Exit with error code
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Clerk authentication middleware
// Adds auth object to all requests (non-blocking)
app.use(
  clerkMiddleware({
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  }),
);

const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;
const getHeaderValue = (value) => (Array.isArray(value) ? value[0] : value);

// Internal auth bridge for server-to-server tool calls
app.use((req, res, next) => {
  const token = getHeaderValue(req.headers["x-internal-token"]);
  if (INTERNAL_API_TOKEN && token === INTERNAL_API_TOKEN) {
    const userId =
      getHeaderValue(req.headers["x-internal-user-id"]) || req.body?.user_id;
    const orgId =
      getHeaderValue(req.headers["x-internal-org-id"]) ||
      req.body?.organization_id ||
      null;
    if (!userId) {
      return res.status(400).json({ error: "internal user id is required" });
    }
    req.auth = {
      userId,
      orgId,
    };
  }
  next();
});

// Request logging middleware - logs all HTTP requests with structured format
app.use(requestLogger);

// Helper to get Clerk org context from request
function getClerkOrgContext(req) {
  const auth = getAuth(req);
  return createOrgContext(auth);
}

// Legacy helper for organization context resolution
// In Clerk system, we trust the JWT claims instead of DB validation
// This is a simplified version that returns org context based on Clerk auth
async function resolveOrganizationContext(sql, userId, organizationId) {
  // If no organization_id, it's personal context - full access
  if (!organizationId) {
    return {
      organizationId: null,
      isPersonal: true,
      orgRole: null,
      hasPermission: () => true,
    };
  }

  // Organization context - return member-level context
  // Note: With Clerk, actual permissions come from JWT, this is just for compatibility
  return {
    organizationId,
    isPersonal: false,
    orgRole: "org:member", // Default to member, actual role comes from Clerk auth
    hasPermission: (permission) => {
      // For legacy compatibility, allow all permissions
      // Real permission checks should use getClerkOrgContext(req)
      return true;
    },
  };
}

const DATABASE_URL = process.env.DATABASE_URL;

// ============================================================================
// RATE LIMITING FOR AI ENDPOINTS
// ============================================================================
const rateLimitStore = new Map();
const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const AI_RATE_LIMIT_MAX_REQUESTS = 30; // max AI requests per window

function checkAiRateLimit(identifier) {
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

// Middleware for AI endpoints with stricter rate limiting
function requireAuthWithAiRateLimit(req, res, next) {
  const auth = getAuth(req);

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
// LOGGING: Clean, organized request tracking
// ============================================================================
let requestCounter = 0;
const requestLog = new Map();

// ANSI colors for terminal
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

// ============================================================================
// LOGGING HELPERS
// ============================================================================

function logExternalAPI(service, action, details = "") {
  const timestamp = new Date().toLocaleTimeString("pt-BR");
  logger.debug(
    { service, action, details: details || undefined },
    `[${service}] ${action}${details ? ` ${details}` : ""}`,
  );
}

function logExternalAPIResult(service, action, duration, success = true) {
  const status = success
    ? `${colors.green}✓${colors.reset}`
    : `${colors.red}✗${colors.reset}`;
  logger.debug(
    { service, action, durationMs: duration, success },
    `[${service}] ${success ? "✓" : "✗"} ${action}`,
  );
}

function logError(context, error) {
  logger.error({ err: error, context }, `ERROR: ${context}`);
  logger.error({ message: error.message }, `Message: ${error.message}`);
  if (error.stack) {
    logger.error({ stack: error.stack }, "Stack trace");
  }
  if (error.response?.data) {
    logger.error({ responseData: error.response.data }, "Response data");
  }
}

function logQuery(requestId, _endpoint, _queryName) {
  if (!requestLog.has(requestId)) {
    requestLog.set(requestId, 0);
  }
  requestLog.set(requestId, requestLog.get(requestId) + 1);
}

function logRequestSummary(requestId, _endpoint) {
  requestLog.delete(requestId);
}

// Cache for resolved user IDs (5 minute TTL)
const userIdCache = new Map();
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedUserId(clerkId) {
  const cached = userIdCache.get(clerkId);
  if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
    return cached.userId;
  }
  return null;
}

function setCachedUserId(clerkId, userId) {
  userIdCache.set(clerkId, { userId, timestamp: Date.now() });
}

// SINGLETON: Reuse neon() instance with HTTP connection caching
let sqlInstance = null;

function getSql() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL not configured");
  }
  if (!sqlInstance) {
    sqlInstance = neon(DATABASE_URL);
  }
  return sqlInstance;
}

// WARMUP: Pre-warm database connection on server start
async function warmupDatabase() {
  try {
    const start = Date.now();
    const sql = getSql();
    await sql`SELECT 1 as warmup`;
    logger.info(
      { durationMs: Date.now() - start },
      "Database connection warmed up",
    );
  } catch (error) {
    logger.error({ err: error }, "Database warmup failed");
  }
}

// Run warmup on module load
warmupDatabase();

async function ensureGallerySourceType(sql) {
  try {
    const result = await sql`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'gallery_images' AND column_name = 'source'
      LIMIT 1
    `;

    const column = result?.[0];
    if (!column) return;

    const isEnum =
      column.data_type === "USER-DEFINED" && column.udt_name === "image_source";
    if (!isEnum) return;

    logger.info(
      {},
      "[Dev API Server] Migrating gallery_images.source from enum to varchar",
    );
    await sql`ALTER TABLE gallery_images ALTER COLUMN source TYPE VARCHAR(100) USING source::text`;
    await sql`DROP TYPE IF EXISTS image_source`;
    logger.info(
      {},
      "[Dev API Server] gallery_images.source migration complete",
    );
  } catch (error) {
    logger.error(
      { err: error },
      "[Dev API Server] Failed to migrate gallery_images.source",
    );
  }
}

// Helper to resolve user ID (handles both Clerk IDs and UUIDs)
// Clerk IDs look like: user_2qyqJjnqMXEGJWJNf9jx86C0oQT
// UUIDs look like: 550e8400-e29b-41d4-a716-446655440000
// NOW WITH CACHING to avoid repeated DB lookups!
async function resolveUserId(sql, userId, requestId = 0) {
  if (!userId) return null;

  // Check if it's a UUID format (8-4-4-4-12 hex characters)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(userId)) {
    return userId; // Already a UUID
  }

  // Check cache first
  const cachedId = getCachedUserId(userId);
  if (cachedId) {
    return cachedId;
  }

  // It's a Clerk ID - look up the user by auth_provider_id
  logQuery(requestId, "resolveUserId", "users.auth_provider_id lookup");
  const result = await sql`
    SELECT id FROM users
    WHERE auth_provider_id = ${userId}
    AND deleted_at IS NULL
    LIMIT 1
  `;

  if (result.length > 0) {
    const resolvedId = result[0].id;
    setCachedUserId(userId, resolvedId); // Cache it!
    return resolvedId;
  }

  // User doesn't exist - return the original ID (will fail on insert, but that's expected)
  logger.debug(
    { auth_provider_id: userId },
    "[User Lookup] No user found for auth_provider_id",
  );
  return null;
}

// ============================================================================
// RLS: Set session variables for Row Level Security
// This MUST be called before any queries that should be protected by RLS
// ============================================================================
async function setRLSContext(sql, userId, organizationId = null) {
  if (!userId) return;

  try {
    // Set both variables in a single query for efficiency
    await sql`
      SELECT
        set_config('app.user_id', ${userId}, true),
        set_config('app.organization_id', ${organizationId || ""}, true)
    `;
  } catch (error) {
    // Don't fail the request if RLS context can't be set
    // The application-level security (WHERE clauses) will still work
    logger.warn(
      { err: error, userId, organizationId },
      "Failed to set RLS context",
    );
  }
}

// ============================================================================
// Request logging middleware - clean, organized output
// ============================================================================
app.use("/api/db", (req, res, next) => {
  const reqId = ++requestCounter;
  req.requestId = reqId;
  const start = Date.now();

  // Extract clean endpoint name
  const endpoint = req.originalUrl.split("?")[0].replace("/api/db/", "");
  const method = req.method.padEnd(4);

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const statusColor = status < 400 ? colors.green : colors.red;
    const durationColor = duration > 500 ? colors.yellow : colors.dim;

    logger.info(
      { method, endpoint, status, durationMs: duration },
      `${method} /${endpoint} ${status}`,
    );

    logRequestSummary(reqId, req.originalUrl);
  });

  next();
});

// Health check
app.get("/api/db/health", async (req, res) => {
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch (error) {
    throw new DatabaseError("Database health check failed", error);
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

// Super admin emails from environment
const SUPER_ADMIN_EMAILS = (process.env.VITE_SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// Middleware to verify super admin access
async function requireSuperAdmin(req, res, next) {
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
    const userEmail =
      userData.email_addresses?.[0]?.email_address?.toLowerCase();

    if (!userEmail || !SUPER_ADMIN_EMAILS.includes(userEmail)) {
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

// Admin: Get overview stats
app.get("/api/admin/stats", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();

    // Get all stats in parallel
    // Note: organizations are managed by Clerk, not in our DB
    const [
      usersResult,
      campaignsResult,
      postsResult,
      galleryResult,
      aiUsageResult,
      errorsResult,
      orgCountResult,
    ] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM users`,
      sql`SELECT COUNT(*) as count FROM campaigns`,
      sql`SELECT COUNT(*) as count,
          COUNT(*) FILTER (WHERE status = 'scheduled') as pending
          FROM scheduled_posts`,
      sql`SELECT COUNT(*) as count FROM gallery_images`,
      sql`SELECT
          COALESCE(SUM(estimated_cost_cents), 0) as total_cost,
          COUNT(*) as total_requests
          FROM api_usage_logs
          WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
      sql`SELECT COUNT(*) as count FROM api_usage_logs
          WHERE created_at >= NOW() - INTERVAL '24 hours'
          AND status = 'failed'`,
      sql`SELECT COUNT(DISTINCT organization_id) as count FROM api_usage_logs WHERE organization_id IS NOT NULL`,
    ]);

    res.json({
      totalUsers: parseInt(usersResult[0]?.count || 0),
      activeUsersToday: 0, // Would need session tracking
      totalOrganizations: parseInt(orgCountResult[0]?.count || 0),
      totalCampaigns: parseInt(campaignsResult[0]?.count || 0),
      totalScheduledPosts: parseInt(postsResult[0]?.count || 0),
      pendingPosts: parseInt(postsResult[0]?.pending || 0),
      totalGalleryImages: parseInt(galleryResult[0]?.count || 0),
      aiCostThisMonth: parseInt(aiUsageResult[0]?.total_cost || 0),
      aiRequestsThisMonth: parseInt(aiUsageResult[0]?.total_requests || 0),
      recentErrors: parseInt(errorsResult[0]?.count || 0),
    });
  } catch (error) {
    logger.error({ err: error }, "[Admin] Stats error");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Admin: Get AI usage analytics
app.get("/api/admin/usage", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();
    const { days = 30 } = req.query;

    const timeline = await sql`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total_requests,
        COALESCE(SUM(estimated_cost_cents), 0) as total_cost_cents,
        operation
      FROM api_usage_logs
      WHERE created_at >= NOW() - INTERVAL '1 day' * ${parseInt(days)}
      GROUP BY DATE(created_at), operation
      ORDER BY date DESC
    `;

    // Aggregate by date
    const aggregated = {};
    for (const row of timeline) {
      const dateKey =
        row.date instanceof Date
          ? row.date.toISOString().split("T")[0]
          : String(row.date);
      if (!aggregated[dateKey]) {
        aggregated[dateKey] = {
          date: dateKey,
          total_requests: 0,
          total_cost_cents: 0,
        };
      }
      aggregated[dateKey].total_requests += parseInt(row.total_requests);
      aggregated[dateKey].total_cost_cents += parseInt(row.total_cost_cents);
    }

    res.json({
      timeline: Object.values(aggregated).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    });
  } catch (error) {
    logger.error({ err: error }, "[Admin] Usage error");
    res.status(500).json({ error: "Failed to fetch usage data" });
  }
});

// Admin: Get users list
app.get("/api/admin/users", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();
    const { limit = 20, page = 1, search = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const searchFilter = search ? `%${search}%` : null;

    const users = await sql`
      SELECT
        u.id,
        u.auth_provider_id as clerk_user_id,
        u.email,
        u.name,
        u.avatar_url,
        u.last_login_at,
        u.created_at,
        COUNT(DISTINCT c.id) as campaign_count,
        COUNT(DISTINCT bp.id) as brand_count,
        COUNT(DISTINCT sp.id) as scheduled_post_count
      FROM users u
      LEFT JOIN campaigns c ON c.user_id = u.id AND c.deleted_at IS NULL
      LEFT JOIN brand_profiles bp ON bp.user_id = u.id AND bp.deleted_at IS NULL
      LEFT JOIN scheduled_posts sp ON sp.user_id = u.id
      WHERE (${searchFilter}::text IS NULL OR u.email ILIKE ${searchFilter} OR u.name ILIKE ${searchFilter})
      GROUP BY u.id, u.auth_provider_id, u.email, u.name, u.avatar_url, u.last_login_at, u.created_at
      ORDER BY u.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*) as total FROM users
      WHERE (${searchFilter}::text IS NULL OR email ILIKE ${searchFilter} OR name ILIKE ${searchFilter})
    `;
    const total = parseInt(countResult[0]?.total || 0);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Admin] Users error");
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Admin: Get organizations list (from Clerk org IDs in brand_profiles/campaigns/usage tables)
app.get("/api/admin/organizations", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();
    const { limit = 20, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get organization base data with counts from various tables
    const orgs = await sql`
      WITH org_base AS (
        SELECT DISTINCT organization_id
        FROM brand_profiles
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        UNION
        SELECT DISTINCT organization_id
        FROM campaigns
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
      ),
      brand_data AS (
        SELECT
          organization_id,
          COUNT(*) as brand_count,
          MIN(name) as primary_brand_name,
          MIN(created_at) as first_brand_created
        FROM brand_profiles
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY organization_id
      ),
      campaign_data AS (
        SELECT
          organization_id,
          COUNT(*) as campaign_count
        FROM campaigns
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY organization_id
      ),
      gallery_data AS (
        SELECT
          organization_id,
          COUNT(*) as gallery_image_count
        FROM gallery_images
        WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY organization_id
      ),
      post_data AS (
        SELECT
          organization_id,
          COUNT(*) as scheduled_post_count
        FROM scheduled_posts
        WHERE organization_id IS NOT NULL
        GROUP BY organization_id
      ),
      activity_data AS (
        SELECT
          organization_id,
          MAX(created_at) as last_activity
        FROM (
          SELECT organization_id, created_at FROM brand_profiles WHERE organization_id IS NOT NULL
          UNION ALL
          SELECT organization_id, created_at FROM campaigns WHERE organization_id IS NOT NULL
          UNION ALL
          SELECT organization_id, created_at FROM gallery_images WHERE organization_id IS NOT NULL
          UNION ALL
          SELECT organization_id, created_at FROM scheduled_posts WHERE organization_id IS NOT NULL
        ) all_activity
        GROUP BY organization_id
      ),
      usage_this_month AS (
        SELECT
          organization_id,
          COUNT(*) as request_count,
          COALESCE(SUM(estimated_cost_cents), 0) as cost_cents
        FROM api_usage_logs
        WHERE organization_id IS NOT NULL
          AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY organization_id
      )
      SELECT
        o.organization_id,
        COALESCE(b.primary_brand_name, 'Unnamed') as primary_brand_name,
        COALESCE(b.brand_count, 0) as brand_count,
        COALESCE(c.campaign_count, 0) as campaign_count,
        COALESCE(g.gallery_image_count, 0) as gallery_image_count,
        COALESCE(p.scheduled_post_count, 0) as scheduled_post_count,
        b.first_brand_created,
        a.last_activity,
        COALESCE(u.request_count, 0) as ai_requests,
        COALESCE(u.cost_cents, 0) as ai_cost_cents
      FROM org_base o
      LEFT JOIN brand_data b ON b.organization_id = o.organization_id
      LEFT JOIN campaign_data c ON c.organization_id = o.organization_id
      LEFT JOIN gallery_data g ON g.organization_id = o.organization_id
      LEFT JOIN post_data p ON p.organization_id = o.organization_id
      LEFT JOIN activity_data a ON a.organization_id = o.organization_id
      LEFT JOIN usage_this_month u ON u.organization_id = o.organization_id
      ORDER BY a.last_activity DESC NULLS LAST
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;

    // Transform data to match frontend interface
    const organizations = orgs.map((org) => ({
      organization_id: org.organization_id,
      primary_brand_name: org.primary_brand_name,
      brand_count: String(org.brand_count),
      campaign_count: String(org.campaign_count),
      gallery_image_count: String(org.gallery_image_count),
      scheduled_post_count: String(org.scheduled_post_count),
      first_brand_created: org.first_brand_created,
      last_activity: org.last_activity,
      aiUsageThisMonth: {
        requests: parseInt(org.ai_requests) || 0,
        costCents: parseInt(org.ai_cost_cents) || 0,
        costUsd: (parseInt(org.ai_cost_cents) || 0) / 100,
      },
    }));

    // Count total organizations
    const countResult = await sql`
      SELECT COUNT(DISTINCT organization_id) as total FROM (
        SELECT organization_id FROM brand_profiles WHERE organization_id IS NOT NULL AND deleted_at IS NULL
        UNION
        SELECT organization_id FROM campaigns WHERE organization_id IS NOT NULL AND deleted_at IS NULL
      ) orgs
    `;
    const total = parseInt(countResult[0]?.total || 0);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      organizations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Admin] Organizations error");
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

// Admin: Get activity logs
app.get("/api/admin/logs", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();
    const { limit = 100, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Simple query without dynamic filters for now
    const logs = await sql`
      SELECT id, user_id, organization_id, endpoint, operation as category, model_id as model,
             estimated_cost_cents as cost_cents, error_message as error,
             CASE WHEN status = 'failed' THEN 'error' ELSE 'info' END as severity,
             status, latency_ms as duration_ms, created_at as timestamp
      FROM api_usage_logs
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;

    const totalResult = await sql`SELECT COUNT(*) as count FROM api_usage_logs`;

    // Get unique categories
    const categoriesResult =
      await sql`SELECT DISTINCT operation as category FROM api_usage_logs WHERE operation IS NOT NULL`;

    // Get recent error count
    const errorCountResult =
      await sql`SELECT COUNT(*) as count FROM api_usage_logs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'`;

    const total = parseInt(totalResult[0]?.count || 0);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
      },
      filters: {
        categories: categoriesResult.map((r) => r.category),
        recentErrorCount: parseInt(errorCountResult[0]?.count || 0),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Admin] Logs error");
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// Admin: Get single log details
app.get("/api/admin/logs/:id", requireSuperAdmin, async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.params;

    const logs = await sql`
      SELECT id, request_id, user_id, organization_id,
             endpoint, operation, provider, model_id,
             input_tokens, output_tokens, total_tokens,
             image_count, image_size, video_duration_seconds,
             estimated_cost_cents, latency_ms, status,
             error_message, metadata, created_at
      FROM api_usage_logs
      WHERE id = ${id}
    `;

    if (!logs || logs.length === 0) {
      return res.status(404).json({ error: "Log not found" });
    }

    res.json(logs[0]);
  } catch (error) {
    logger.error({ err: error }, "[Admin] Log detail error");
    res.status(500).json({ error: "Failed to fetch log details" });
  }
});

// Cache for AI suggestions (1 hour TTL)
const aiSuggestionsCache = new Map();
const CACHE_DURATION_MS = 3600000; // 1 hour

// Admin: Get AI suggestions for a log
app.post(
  "/api/admin/logs/:id/ai-suggestions",
  requireSuperAdmin,
  async (req, res) => {
    try {
      const sql = getSql();
      const { id } = req.params;

      // Check cache first
      const cacheKey = `suggestions_${id}`;
      const cached = aiSuggestionsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
        return res.json({ suggestions: cached.suggestions, cached: true });
      }

      // Fetch log from database
      const logs = await sql`
      SELECT id, endpoint, operation, model_id, error_message,
             metadata, latency_ms, status
      FROM api_usage_logs
      WHERE id = ${id}
    `;

      if (!logs || logs.length === 0) {
        return res.status(404).json({ error: "Log not found" });
      }

      const log = logs[0];

      // Only generate suggestions for failed logs
      if (log.status !== "failed") {
        return res.json({
          suggestions:
            'Este log não contém erros. Sugestões de IA estão disponíveis apenas para logs com status "failed".',
          cached: false,
        });
      }

      // Construct prompt for AI
      const prompt = `Você é um expert em análise de erros de API. Forneça sugestões para corrigir este erro:

**Detalhes do Erro:**
- Endpoint: ${log.endpoint || "N/A"}
- Operação: ${log.operation || "N/A"}
- Modelo: ${log.model_id || "N/A"}
- Mensagem: ${log.error_message || "N/A"}
- Metadata: ${log.metadata ? JSON.stringify(log.metadata) : "N/A"}
- Latência: ${log.latency_ms || "N/A"}ms

**Sua Tarefa:**
1. Análise da causa raiz (2-3 frases)
2. Correções específicas (3-5 bullet points)
3. Estratégias de prevenção (2-3 bullet points)
4. Exemplos de código se relevante

Formate em markdown claro com seções.`;

      // Call Gemini API
      const gemini = getGeminiAi();
      const result = await withRetry(() =>
        gemini.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
        }),
      );

      const suggestions =
        result.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Não foi possível gerar sugestões.";

      // Cache the result
      aiSuggestionsCache.set(cacheKey, {
        suggestions,
        timestamp: Date.now(),
      });

      res.json({ suggestions, cached: false });
    } catch (error) {
      logger.error({ err: error }, "[Admin] AI suggestions error");
      res.status(500).json({ error: "Failed to generate AI suggestions" });
    }
  },
);

// ============================================================================
// DEBUG: Stats endpoint to monitor database usage
// ============================================================================
app.get("/api/db/stats", (req, res) => {
  res.json({
    totalRequests: requestCounter,
    totalQueries: queryCounter,
    avgQueriesPerRequest:
      requestCounter > 0 ? (queryCounter / requestCounter).toFixed(2) : 0,
    cachedUserIds: userIdCache.size,
    timestamp: new Date().toISOString(),
    message: "Check server console for detailed per-request logging",
  });
});

// Reset stats (useful for testing)
app.post("/api/db/stats/reset", (req, res) => {
  requestCounter = 0;
  queryCounter = 0;
  userIdCache.clear();
  logger.info({}, "[STATS] Counters reset");
  res.json({ success: true, message: "Stats reset" });
});

// ============================================================================
// OPTIMIZED: Unified initial data endpoint
// Loads ALL user data in a SINGLE request instead of 6 separate requests
// This dramatically reduces network transfer and connection overhead
// ============================================================================
app.get("/api/db/init", async (req, res) => {
  const reqId = req.requestId || ++requestCounter;
  const start = Date.now();

  try {
    const sql = getSql();
    const { user_id, organization_id, clerk_user_id } = req.query;

    if (!user_id && !clerk_user_id) {
      return res
        .status(400)
        .json({ error: "user_id or clerk_user_id is required" });
    }

    // If clerk_user_id is provided explicitly, try to find/create user
    let resolvedUserId = null;
    let resolveTime = 0;
    if (clerk_user_id) {
      // First check if it's a UUID (db user id)
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidPattern.test(clerk_user_id)) {
        resolvedUserId = clerk_user_id;
      } else {
        // It's a Clerk ID - look up or create the user
        const resolveStart = Date.now();
        resolvedUserId = await resolveUserId(sql, clerk_user_id, reqId);
        resolveTime = Date.now() - resolveStart;
        logger.debug(
          { durationMs: resolveTime },
          "[Init API] resolveUserId took",
        );
        if (!resolvedUserId) {
          // User doesn't exist yet - this happens during parallel loading
          // Return empty data - the frontend will retry after user sync completes
          logger.debug(
            { clerk_user_id },
            "[Init API] User not found for clerk_user_id",
          );
          return res.json({
            brandProfile: null,
            gallery: [],
            scheduledPosts: [],
            campaigns: [],
            tournamentSchedule: null,
            tournamentEvents: [],
            schedulesList: [],
            _meta: {
              loadTime: Date.now() - start,
              queriesExecuted: 0,
              timestamp: new Date().toISOString(),
              userNotFound: true, // Signal to frontend to retry
            },
          });
        }
      }
    } else if (user_id) {
      // Original behavior: resolve user_id
      resolvedUserId = await resolveUserId(sql, user_id, reqId);
      if (!resolvedUserId) {
        logger.debug({}, "[Init API] User not found, returning empty data");
        return res.json({
          brandProfile: null,
          gallery: [],
          scheduledPosts: [],
          campaigns: [],
          tournamentSchedule: null,
          tournamentEvents: [],
          schedulesList: [],
        });
      }
    }

    // Note: RLS context via session vars doesn't work with Neon serverless pooler
    // Security is enforced via WHERE clauses in each query (application-level)
    // RLS policies protect direct database access (psql, DB clients)

    // SEQUENTIAL queries - counterintuitively FASTER than parallel with Neon serverless!
    // Neon has connection limits that cause parallel queries to queue and wait.
    // Test results: Sequential 2475ms vs Parallel 5112ms for 5 queries.
    const isOrgContext = !!organization_id;

    // TIMING: Measure each query individually
    const queryTimings = {};
    const timedQuery = async (name, queryFn) => {
      const qStart = Date.now();
      const result = await queryFn();
      queryTimings[name] = Date.now() - qStart;
      return result;
    };

    // Run queries SEQUENTIALLY (faster with Neon connection limits)

    // CACHE: Try Redis cache for brandProfile (rarely changes, saves ~1.5s)
    const cacheKey = `brandProfile:${isOrgContext ? organization_id : resolvedUserId}`;
    let brandProfileResult = [];
    let brandProfileCached = false;

    const redis = getRedisConnection();
    if (redis && isRedisAvailable()) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          brandProfileResult = JSON.parse(cached);
          brandProfileCached = true;
          queryTimings.brandProfile = 0; // Cache hit
          logger.debug({ cacheKey }, "[Init API] brandProfile cache HIT");
        }
      } catch (e) {
        logger.debug(
          { error: e.message },
          "[Init API] brandProfile cache error",
        );
      }
    }

    if (!brandProfileCached) {
      // OPTIMIZATION: Don't return data URLs for logo_url - they can be 3MB each!
      brandProfileResult = await timedQuery("brandProfile", () =>
        isOrgContext
          ? sql`SELECT id, user_id, organization_id, name, description, CASE WHEN logo_url LIKE 'data:%' THEN '' ELSE logo_url END as logo_url, primary_color, secondary_color, tertiary_color, tone_of_voice, settings, created_at, updated_at, deleted_at FROM brand_profiles WHERE organization_id = ${organization_id} AND deleted_at IS NULL LIMIT 1`
          : sql`SELECT id, user_id, organization_id, name, description, CASE WHEN logo_url LIKE 'data:%' THEN '' ELSE logo_url END as logo_url, primary_color, secondary_color, tertiary_color, tone_of_voice, settings, created_at, updated_at, deleted_at FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`,
      );

      // Cache for 5 minutes
      if (redis && isRedisAvailable() && brandProfileResult.length > 0) {
        try {
          await redis.set(
            cacheKey,
            JSON.stringify(brandProfileResult),
            "EX",
            300,
          );
          logger.debug({ cacheKey }, "[Init API] brandProfile cached");
        } catch (e) {
          // Ignore cache write errors
        }
      }
    }

    // OPTIMIZATION: Don't return data URLs (base64) for gallery - they're 113MB+ total!
    // Use thumbnail_url if available, otherwise filter out (frontend will hide empty src_url)
    // NOTE: Old images with data URLs won't appear until migrated to Blob
    const galleryResult = await timedQuery("gallery", () =>
      isOrgContext
        ? sql`SELECT id, user_id, organization_id, source, CASE WHEN src_url LIKE 'data:%' THEN COALESCE(thumbnail_url, '') ELSE src_url END as src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name FROM gallery_images WHERE organization_id = ${organization_id} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`
        : sql`SELECT id, user_id, organization_id, source, CASE WHEN src_url LIKE 'data:%' THEN COALESCE(thumbnail_url, '') ELSE src_url END as src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name FROM gallery_images WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`,
    );

    // OPTIMIZATION: Don't return data URLs (base64) in image_url - they're huge (26MB+ total!)
    // Use CASE to return empty string for data URLs, full URL otherwise
    const scheduledPostsResult = await timedQuery("scheduledPosts", () =>
      isOrgContext
        ? sql`SELECT id, user_id, organization_id, content_type, content_id, CASE WHEN image_url LIKE 'data:%' THEN '' ELSE image_url END as image_url, carousel_image_urls, caption, hashtags, scheduled_date, scheduled_time, scheduled_timestamp, timezone, platforms, instagram_content_type, status, published_at, error_message, created_from, created_at, updated_at FROM scheduled_posts WHERE organization_id = ${organization_id} AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000 AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000 ORDER BY scheduled_timestamp ASC`
        : sql`SELECT id, user_id, organization_id, content_type, content_id, CASE WHEN image_url LIKE 'data:%' THEN '' ELSE image_url END as image_url, carousel_image_urls, caption, hashtags, scheduled_date, scheduled_time, scheduled_timestamp, timezone, platforms, instagram_content_type, status, published_at, error_message, created_from, created_at, updated_at FROM scheduled_posts WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000 AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000 ORDER BY scheduled_timestamp ASC`,
    );

    const campaignsResult = await timedQuery("campaigns", () =>
      isOrgContext
        ? sql`SELECT c.id, c.user_id, c.organization_id, c.name, c.description, c.input_transcript, c.status, c.created_at, c.updated_at, COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count, COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count, COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count, COALESCE((SELECT COUNT(*) FROM carousel_scripts WHERE campaign_id = c.id), 0)::int as carousels_count, (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url, (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url, (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url, (SELECT cover_url FROM carousel_scripts WHERE campaign_id = c.id AND cover_url IS NOT NULL LIMIT 1) as carousel_preview_url FROM campaigns c WHERE c.organization_id = ${organization_id} AND c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 10`
        : sql`SELECT c.id, c.user_id, c.organization_id, c.name, c.description, c.input_transcript, c.status, c.created_at, c.updated_at, COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count, COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count, COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count, COALESCE((SELECT COUNT(*) FROM carousel_scripts WHERE campaign_id = c.id), 0)::int as carousels_count, (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url, (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url, (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url, (SELECT cover_url FROM carousel_scripts WHERE campaign_id = c.id AND cover_url IS NOT NULL LIMIT 1) as carousel_preview_url FROM campaigns c WHERE c.user_id = ${resolvedUserId} AND c.organization_id IS NULL AND c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 10`,
    );

    const schedulesListResult = await timedQuery("schedulesList", () =>
      isOrgContext
        ? sql`SELECT ws.id, ws.user_id, ws.organization_id, ws.original_filename as name, ws.start_date, ws.end_date, ws.created_at, ws.updated_at, COUNT(te.id)::int as event_count FROM week_schedules ws LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id WHERE ws.organization_id = ${organization_id} GROUP BY ws.id, ws.original_filename ORDER BY ws.created_at DESC`
        : sql`SELECT ws.id, ws.user_id, ws.organization_id, ws.original_filename as name, ws.start_date, ws.end_date, ws.created_at, ws.updated_at, COUNT(te.id)::int as event_count FROM week_schedules ws LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id WHERE ws.user_id = ${resolvedUserId} AND ws.organization_id IS NULL GROUP BY ws.id, ws.original_filename ORDER BY ws.created_at DESC`,
    );

    // LOG: Query timing breakdown for performance analysis
    const totalTime = Date.now() - start;
    logger.debug(
      { totalTimeMs: totalTime, queryTimings },
      "[Init API] Query timings",
    );

    // PERFORMANCE: Only tournament schedule/events are loaded lazily via /api/db/tournaments
    // schedulesList is loaded here because it's essential for flyers page
    res.json({
      brandProfile: brandProfileResult[0] || null,
      gallery: galleryResult,
      scheduledPosts: scheduledPostsResult,
      campaigns: campaignsResult,
      tournamentSchedule: null, // Loaded lazily
      tournamentEvents: [], // Loaded lazily
      schedulesList: schedulesListResult, // List of saved spreadsheets
      _meta: {
        loadTime: totalTime,
        queryTimings, // Include breakdown in response for frontend debugging
        queriesExecuted: 5,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logError("Init API", error);
    res.status(500).json({ error: error.message });
  }
});

// Users API
app.get("/api/db/users", async (req, res) => {
  try {
    const sql = getSql();
    const { email, id } = req.query;

    if (id) {
      const result =
        await sql`SELECT * FROM users WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    if (email) {
      const result =
        await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    throw new ValidationError("email or id is required");
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError("Failed to fetch user", error);
  }
});

app.post("/api/db/users", async (req, res) => {
  try {
    const sql = getSql();
    const { email, name, avatar_url, auth_provider, auth_provider_id } =
      req.body;

    if (!email || !name) {
      throw new ValidationError("email and name are required");
    }

    const existing =
      await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;

    if (existing.length > 0) {
      await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${existing[0].id}`;
      return res.json(existing[0]);
    }

    const result = await sql`
      INSERT INTO users (email, name, avatar_url, auth_provider, auth_provider_id)
      VALUES (${email}, ${name}, ${avatar_url || null}, ${auth_provider || "email"}, ${auth_provider_id || null})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError("Failed to create or update user", error);
  }
});

// Brand Profiles API
app.get("/api/db/brand-profiles", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, id, organization_id } = req.query;

    if (id) {
      const result =
        await sql`SELECT * FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    if (user_id) {
      // Resolve user_id (handles both Clerk IDs and UUIDs)
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        return res.json(null); // No user found, return null
      }

      let result;
      if (organization_id) {
        // Organization context - verify membership
        await resolveOrganizationContext(sql, resolvedUserId, organization_id);
        result = await sql`
          SELECT * FROM brand_profiles
          WHERE organization_id = ${organization_id} AND deleted_at IS NULL
          LIMIT 1
        `;
      } else {
        // Personal context
        result = await sql`
          SELECT * FROM brand_profiles
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
          LIMIT 1
        `;
      }
      return res.json(result[0] || null);
    }

    throw new ValidationError("user_id or id is required");
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    throw new DatabaseError("Failed to fetch brand profile", error);
  }
});

app.post("/api/db/brand-profiles", async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id,
      organization_id,
      name,
      description,
      logo_url,
      primary_color,
      secondary_color,
      tone_of_voice,
    } = req.body;

    if (!user_id || !name) {
      throw new ValidationError("user_id and name are required");
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      throw new NotFoundError("User", user_id);
    }

    // Verify organization membership and permission if organization_id provided
    if (organization_id) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.MANAGE_BRAND)) {
        throw new PermissionDeniedError("manage_brand");
      }
    }

    const result = await sql`
      INSERT INTO brand_profiles (user_id, organization_id, name, description, logo_url, primary_color, secondary_color, tone_of_voice)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${name}, ${description || null}, ${logo_url || null},
              ${primary_color || "#FFFFFF"}, ${secondary_color || "#000000"}, ${tone_of_voice || "Profissional"})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }
    throw new DatabaseError("Failed to create brand profile", error);
  }
});

app.put("/api/db/brand-profiles", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const {
      user_id,
      name,
      description,
      logo_url,
      primary_color,
      secondary_color,
      tone_of_voice,
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    // Get the brand profile to check organization
    const existing =
      await sql`SELECT organization_id FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL`;
    if (existing.length === 0) {
      return res.status(404).json({ error: "Brand profile not found" });
    }

    // If profile belongs to an organization, verify permission
    if (existing[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          existing[0].organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.MANAGE_BRAND)) {
          return res
            .status(403)
            .json({ error: "Permission denied: manage_brand required" });
        }
      }
    }

    const result = await sql`
      UPDATE brand_profiles
      SET name = COALESCE(${name || null}, name),
          description = COALESCE(${description || null}, description),
          logo_url = COALESCE(${logo_url || null}, logo_url),
          primary_color = COALESCE(${primary_color || null}, primary_color),
          secondary_color = COALESCE(${secondary_color || null}, secondary_color),
          tone_of_voice = COALESCE(${tone_of_voice || null}, tone_of_voice)
      WHERE id = ${id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    logError("Brand Profiles API", error);
    res.status(500).json({ error: error.message });
  }
});

// Gallery Images API
app.get("/api/db/gallery", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, source, limit, include_src } = req.query;

    if (!user_id) {
      throw new ValidationError("user_id is required");
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]); // No user found, return empty array
    }

    let query;
    const limitNum = parseInt(limit) || 50;

    // OPTIMIZATION: Only include src (base64 image data) when explicitly requested
    // This dramatically reduces egress data transfer (50-250MB → 50KB per request)
    const selectColumns =
      include_src === "true"
        ? "*"
        : "id, user_id, organization_id, source, src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name";

    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      if (source) {
        query = await sql`
          SELECT ${sql.unsafe(selectColumns)} FROM gallery_images
          WHERE organization_id = ${organization_id} AND source = ${source} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        query = await sql`
          SELECT ${sql.unsafe(selectColumns)} FROM gallery_images
          WHERE organization_id = ${organization_id} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }
    } else {
      // Personal context
      if (source) {
        query = await sql`
          SELECT ${sql.unsafe(selectColumns)} FROM gallery_images
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND source = ${source} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        query = await sql`
          SELECT ${sql.unsafe(selectColumns)} FROM gallery_images
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }
    }

    res.json(query);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    throw new DatabaseError("Failed to fetch gallery images", error);
  }
});

// Get daily flyers for a specific week schedule
app.get("/api/db/gallery/daily-flyers", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, week_schedule_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    if (!week_schedule_id) {
      return res.status(400).json({ error: "week_schedule_id is required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]); // No user found, return empty array
    }

    // Verify organization membership if organization_id provided
    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    }

    // Select all relevant columns including daily flyer fields
    const selectColumns = `id, user_id, organization_id, source, src_url, thumbnail_url, prompt, model,
                          aspect_ratio, image_size, week_schedule_id, daily_flyer_day, daily_flyer_period,
                          created_at, updated_at`;

    let query;
    if (organization_id) {
      query = await sql`
        SELECT ${sql.unsafe(selectColumns)} FROM gallery_images
        WHERE organization_id = ${organization_id}
          AND week_schedule_id = ${week_schedule_id}
          AND deleted_at IS NULL
        ORDER BY daily_flyer_day, daily_flyer_period, created_at DESC
      `;
    } else {
      query = await sql`
        SELECT ${sql.unsafe(selectColumns)} FROM gallery_images
        WHERE user_id = ${resolvedUserId}
          AND organization_id IS NULL
          AND week_schedule_id = ${week_schedule_id}
          AND deleted_at IS NULL
        ORDER BY daily_flyer_day, daily_flyer_period, created_at DESC
      `;
    }

    // Transform to a structured format: { DAY: { PERIOD: [images] } }
    const structured = {};
    for (const img of query) {
      const day = img.daily_flyer_day || "UNKNOWN";
      const period = img.daily_flyer_period || "UNKNOWN";

      if (!structured[day]) {
        structured[day] = {};
      }
      if (!structured[day][period]) {
        structured[day][period] = [];
      }
      structured[day][period].push(img);
    }

    res.json({ images: query, structured });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Gallery Daily Flyers API GET", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/gallery", async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id,
      organization_id,
      src_url,
      prompt,
      source,
      model,
      aspect_ratio,
      image_size,
      post_id,
      ad_creative_id,
      video_script_id,
      is_style_reference,
      style_reference_name,
      media_type,
      duration,
      // Daily flyer fields
      week_schedule_id,
      daily_flyer_day,
      daily_flyer_period,
    } = req.body;

    if (!user_id || !src_url || !source || !model) {
      return res
        .status(400)
        .json({ error: "user_id, src_url, source, and model are required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    // Verify organization membership if organization_id provided
    if (organization_id) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.CREATE_FLYER)) {
        return res
          .status(403)
          .json({ error: "Permission denied: create_flyer required" });
      }
    }

    const result = await sql`
      INSERT INTO gallery_images (user_id, organization_id, src_url, prompt, source, model, aspect_ratio, image_size,
                                  post_id, ad_creative_id, video_script_id, is_style_reference, style_reference_name,
                                  media_type, duration, week_schedule_id, daily_flyer_day, daily_flyer_period)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${src_url}, ${prompt || null}, ${source}, ${model},
              ${aspect_ratio || null}, ${image_size || null},
              ${post_id || null}, ${ad_creative_id || null}, ${video_script_id || null},
              ${is_style_reference || false}, ${style_reference_name || null},
              ${media_type || "image"}, ${duration || null},
              ${week_schedule_id || null}, ${daily_flyer_day || null}, ${daily_flyer_period || null})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    logError("Gallery API POST", error);
    res.status(500).json({ error: error.message });
  }
});

// Gallery PATCH - Update gallery image (e.g., mark as published, toggle favorite)
app.patch("/api/db/gallery", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { published_at, is_style_reference, style_reference_name, src_url } =
      req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    // Get current image to preserve unmodified fields
    const current = await sql`SELECT * FROM gallery_images WHERE id = ${id}`;
    if (current.length === 0) {
      return res.status(404).json({ error: "Gallery image not found" });
    }

    const result = await sql`
      UPDATE gallery_images
      SET
        published_at = ${published_at !== undefined ? published_at || null : current[0].published_at},
        is_style_reference = ${is_style_reference !== undefined ? is_style_reference : current[0].is_style_reference},
        style_reference_name = ${style_reference_name !== undefined ? style_reference_name || null : current[0].style_reference_name},
        src_url = ${src_url !== undefined ? src_url : current[0].src_url},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return res.status(200).json(result[0]);
  } catch (error) {
    logError("Gallery API PATCH", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/db/gallery", async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    // Get image info including src_url before deleting
    const image =
      await sql`SELECT organization_id, src_url FROM gallery_images WHERE id = ${id} AND deleted_at IS NULL`;
    if (image.length === 0) {
      return res.status(404).json({ error: "Image not found" });
    }

    if (image[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          image[0].organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.DELETE_GALLERY)) {
          return res
            .status(403)
            .json({ error: "Permission denied: delete_gallery required" });
        }
      }
    }

    const srcUrl = image[0].src_url;

    // HARD DELETE: Permanently remove from database
    await sql`DELETE FROM gallery_images WHERE id = ${id}`;

    // Delete physical file from Vercel Blob Storage if applicable
    if (
      srcUrl &&
      (srcUrl.includes(".public.blob.vercel-storage.com/") ||
        srcUrl.includes(".blob.vercel-storage.com/"))
    ) {
      try {
        await del(srcUrl);
        logger.info({ url: srcUrl }, "[Gallery] Deleted file from Vercel Blob");
      } catch (blobError) {
        logger.error(
          { err: blobError, srcUrl },
          `[Gallery] Failed to delete file from Vercel Blob: ${srcUrl}`,
        );
        // Don't fail the request if blob deletion fails - DB record is already deleted
      }
    }

    res.status(204).end();
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    logError("Gallery API", error);
    res.status(500).json({ error: error.message });
  }
});

// Posts API - Update image_url
app.patch("/api/db/posts", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { image_url } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const result = await sql`
      UPDATE posts SET image_url = ${image_url}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.json(result[0]);
  } catch (error) {
    logError("Posts API", error);
    res.status(500).json({ error: error.message });
  }
});

// Ad Creatives API - Update image_url
app.patch("/api/db/ad-creatives", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { image_url } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const result = await sql`
      UPDATE ad_creatives SET image_url = ${image_url}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Ad creative not found" });
    }

    res.json(result[0]);
  } catch (error) {
    logError("Ad Creatives API", error);
    res.status(500).json({ error: error.message });
  }
});

// Scheduled Posts API
app.get("/api/db/scheduled-posts", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, status, start_date, end_date } =
      req.query;

    if (!user_id) {
      throw new ValidationError("user_id is required");
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]); // No user found, return empty array
    }

    // SMART LOADING: Load posts in relevant time window (last 7 days + next 60 days)
    // Shows recent activity + upcoming schedule without arbitrary quantity limits
    // NOTE: scheduled_timestamp is bigint (unix ms), convert NOW() to match
    let query;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      if (status) {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE organization_id = ${organization_id}
            AND status = ${status}
            AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000
            AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000
          ORDER BY scheduled_timestamp ASC
        `;
      } else {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE organization_id = ${organization_id}
            AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000
            AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000
          ORDER BY scheduled_timestamp ASC
        `;
      }
    } else {
      // Personal context
      if (status) {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE user_id = ${resolvedUserId}
            AND organization_id IS NULL
            AND status = ${status}
            AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000
            AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000
          ORDER BY scheduled_timestamp ASC
        `;
      } else {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE user_id = ${resolvedUserId}
            AND organization_id IS NULL
            AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000
            AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000
          ORDER BY scheduled_timestamp ASC
        `;
      }
    }

    res.json(query);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    throw new DatabaseError("Failed to fetch scheduled posts", error);
  }
});

app.post("/api/db/scheduled-posts", async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id,
      organization_id,
      content_type,
      content_id,
      image_url,
      caption,
      hashtags,
      scheduled_date,
      scheduled_time,
      scheduled_timestamp,
      timezone,
      platforms,
      instagram_content_type,
      instagram_account_id,
      created_from,
    } = req.body;

    if (
      !user_id ||
      !image_url ||
      !scheduled_timestamp ||
      !scheduled_date ||
      !scheduled_time ||
      !platforms
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    // Verify organization membership and permission if organization_id provided
    if (organization_id) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.SCHEDULE_POST)) {
        return res
          .status(403)
          .json({ error: "Permission denied: schedule_post required" });
      }
    }

    // Convert scheduled_timestamp to bigint (milliseconds) if it's a string
    const timestampMs =
      typeof scheduled_timestamp === "string"
        ? new Date(scheduled_timestamp).getTime()
        : scheduled_timestamp;

    // Validate content_id: only use if it's a valid UUID, otherwise set to null
    // Flyer IDs like "flyer-123-abc" are not valid UUIDs
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validContentId =
      content_id && uuidRegex.test(content_id) ? content_id : null;

    const result = await sql`
      INSERT INTO scheduled_posts (
        user_id, organization_id, content_type, content_id, image_url, caption, hashtags,
        scheduled_date, scheduled_time, scheduled_timestamp, timezone,
        platforms, instagram_content_type, instagram_account_id, created_from
      ) VALUES (
        ${resolvedUserId}, ${organization_id || null}, ${content_type || "flyer"}, ${validContentId}, ${image_url}, ${caption || ""},
        ${hashtags || []}, ${scheduled_date}, ${scheduled_time}, ${timestampMs},
        ${timezone || "America/Sao_Paulo"}, ${platforms || "instagram"},
        ${instagram_content_type || "photo"}, ${instagram_account_id || null}, ${created_from || null}
      )
      RETURNING *
    `;

    const newPost = result[0];

    // Schedule job in BullMQ for exact-time publishing
    try {
      await schedulePostForPublishing(newPost.id, resolvedUserId, timestampMs);
      logger.info(
        {
          postId: newPost.id,
          scheduledAt: new Date(timestampMs).toISOString(),
        },
        "[API] Scheduled job for post",
      );
    } catch (error) {
      logger.error(
        { err: error, postId: newPost.id },
        `[API] Failed to schedule job for post ${newPost.id}`,
      );
      // Don't fail the request if job scheduling fails - fallback checker will catch it
    }

    res.status(201).json(newPost);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    logError("Scheduled Posts API", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/db/scheduled-posts", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    // Check if post belongs to an organization and verify permission
    const post =
      await sql`SELECT organization_id FROM scheduled_posts WHERE id = ${id}`;
    if (post.length === 0) {
      return res.status(404).json({ error: "Scheduled post not found" });
    }

    if (post[0].organization_id && updates.user_id) {
      const resolvedUserId = await resolveUserId(sql, updates.user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          post[0].organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.SCHEDULE_POST)) {
          return res
            .status(403)
            .json({ error: "Permission denied: schedule_post required" });
        }
      }
    }

    // Simple update with raw SQL (not ideal but works for now)
    const result = await sql`
      UPDATE scheduled_posts
      SET status = COALESCE(${updates.status || null}, status),
          published_at = COALESCE(${updates.published_at || null}, published_at),
          error_message = COALESCE(${updates.error_message || null}, error_message),
          instagram_media_id = COALESCE(${updates.instagram_media_id || null}, instagram_media_id),
          publish_attempts = COALESCE(${updates.publish_attempts || null}, publish_attempts),
          last_publish_attempt = COALESCE(${updates.last_publish_attempt || null}, last_publish_attempt)
      WHERE id = ${id}
      RETURNING *
    `;

    const updatedPost = result[0];

    // If status changed to 'cancelled', cancel the scheduled job
    if (updates.status === "cancelled") {
      try {
        await cancelScheduledPost(id);
        logger.info(
          { postId: id },
          "[API] Cancelled scheduled job for post (status changed to cancelled)",
        );
      } catch (error) {
        logger.error(
          { err: error, postId: id },
          `[API] Failed to cancel job for post ${id}`,
        );
      }
    }

    res.json(updatedPost);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    logError("Scheduled Posts API", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/db/scheduled-posts", async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    // Check if post belongs to an organization and verify permission
    const post =
      await sql`SELECT organization_id FROM scheduled_posts WHERE id = ${id}`;
    if (post.length === 0) {
      return res.status(404).json({ error: "Scheduled post not found" });
    }

    if (post[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          post[0].organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.SCHEDULE_POST)) {
          return res
            .status(403)
            .json({ error: "Permission denied: schedule_post required" });
        }
      }
    }

    await sql`DELETE FROM scheduled_posts WHERE id = ${id}`;

    // Cancel scheduled job in BullMQ
    try {
      await cancelScheduledPost(id);
      logger.info(
        { postId: id },
        "[API] Cancelled scheduled job for deleted post",
      );
    } catch (error) {
      logger.error(
        { err: error, postId: id },
        `[API] Failed to cancel job for post ${id}`,
      );
      // Don't fail the request if job cancellation fails
    }

    res.status(204).end();
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    logError("Scheduled Posts API", error);
    res.status(500).json({ error: error.message });
  }
});

// Campaigns API
app.get("/api/db/campaigns", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, id, include_content, limit, offset } =
      req.query;

    // Get single campaign by ID
    if (id) {
      const result = await sql`
        SELECT * FROM campaigns
        WHERE id = ${id} AND deleted_at IS NULL
        LIMIT 1
      `;

      if (!result[0]) {
        return res.status(200).json(null);
      }

      // If include_content is true, also fetch video_clip_scripts, posts, ad_creatives and carousel_scripts
      if (include_content === "true") {
        const campaign = result[0];

        const [videoScripts, posts, adCreatives, carouselScripts] =
          await Promise.all([
            sql`
            SELECT * FROM video_clip_scripts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
            sql`
            SELECT * FROM posts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
            sql`
            SELECT * FROM ad_creatives
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
            sql`
            SELECT * FROM carousel_scripts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
          ]);

        return res.status(200).json({
          ...campaign,
          video_clip_scripts: videoScripts,
          posts: posts,
          ad_creatives: adCreatives,
          carousel_scripts: carouselScripts,
        });
      }

      return res.status(200).json(result[0]);
    }

    if (!user_id) {
      throw new ValidationError("user_id is required");
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(200).json([]);
    }

    // OPTIMIZED: Single query with all counts and previews using subqueries
    // This replaces the N+1 problem (was doing 6 queries PER campaign!)
    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);
    const hasLimit = Number.isFinite(parsedLimit) && parsedLimit > 0;
    const safeOffset =
      Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

    let result;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      result = hasLimit
        ? await sql`
        SELECT
          c.id,
          c.user_id,
          c.organization_id,
          c.name,
          c.description,
          c.input_transcript,
          c.status,
          c.created_at,
          c.updated_at,
          COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
          COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
          COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
          COALESCE((SELECT COUNT(*) FROM carousel_scripts WHERE campaign_id = c.id), 0)::int as carousels_count,
          (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
          (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
          (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url,
          (SELECT cover_url FROM carousel_scripts WHERE campaign_id = c.id AND cover_url IS NOT NULL LIMIT 1) as carousel_preview_url
        FROM campaigns c
        WHERE c.organization_id = ${organization_id} AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
        LIMIT ${parsedLimit} OFFSET ${safeOffset}
      `
        : await sql`
        SELECT
          c.id,
          c.user_id,
          c.organization_id,
          c.name,
          c.description,
          c.input_transcript,
          c.status,
          c.created_at,
          c.updated_at,
          COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
          COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
          COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
          COALESCE((SELECT COUNT(*) FROM carousel_scripts WHERE campaign_id = c.id), 0)::int as carousels_count,
          (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
          (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
          (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url,
          (SELECT cover_url FROM carousel_scripts WHERE campaign_id = c.id AND cover_url IS NOT NULL LIMIT 1) as carousel_preview_url
        FROM campaigns c
        WHERE c.organization_id = ${organization_id} AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `;
    } else {
      // Personal context
      result = hasLimit
        ? await sql`
        SELECT
          c.id,
          c.user_id,
          c.organization_id,
          c.name,
          c.description,
          c.input_transcript,
          c.status,
          c.created_at,
          c.updated_at,
          COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
          COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
          COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
          COALESCE((SELECT COUNT(*) FROM carousel_scripts WHERE campaign_id = c.id), 0)::int as carousels_count,
          (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
          (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
          (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url,
          (SELECT cover_url FROM carousel_scripts WHERE campaign_id = c.id AND cover_url IS NOT NULL LIMIT 1) as carousel_preview_url
        FROM campaigns c
        WHERE c.user_id = ${resolvedUserId} AND c.organization_id IS NULL AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
        LIMIT ${parsedLimit} OFFSET ${safeOffset}
      `
        : await sql`
        SELECT
          c.id,
          c.user_id,
          c.organization_id,
          c.name,
          c.description,
          c.input_transcript,
          c.status,
          c.created_at,
          c.updated_at,
          COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
          COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
          COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
          COALESCE((SELECT COUNT(*) FROM carousel_scripts WHERE campaign_id = c.id), 0)::int as carousels_count,
          (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
          (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
          (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url,
          (SELECT cover_url FROM carousel_scripts WHERE campaign_id = c.id AND cover_url IS NOT NULL LIMIT 1) as carousel_preview_url
        FROM campaigns c
        WHERE c.user_id = ${resolvedUserId} AND c.organization_id IS NULL AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `;
    }

    res.json(result);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    throw new DatabaseError("Failed to fetch campaigns", error);
  }
});

app.post("/api/db/campaigns", async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id,
      organization_id,
      name,
      brand_profile_id,
      input_transcript,
      generation_options,
      status,
      video_clip_scripts,
      posts,
      ad_creatives,
      carousel_scripts,
    } = req.body;

    if (!user_id) {
      throw new ValidationError("user_id is required");
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      throw new NotFoundError("User", user_id);
    }

    // Verify organization membership and permission if organization_id provided
    if (organization_id) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.CREATE_CAMPAIGN)) {
        throw new PermissionDeniedError("create_campaign");
      }
    }

    // Create campaign
    const result = await sql`
      INSERT INTO campaigns (user_id, organization_id, name, brand_profile_id, input_transcript, generation_options, status)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${name || null}, ${brand_profile_id || null}, ${input_transcript || null}, ${JSON.stringify(generation_options) || null}, ${status || "draft"})
      RETURNING *
    `;

    const campaign = result[0];

    // Insert and collect video clip scripts with their IDs
    const createdVideoClipScripts = [];
    if (video_clip_scripts && Array.isArray(video_clip_scripts)) {
      for (let i = 0; i < video_clip_scripts.length; i++) {
        const script = video_clip_scripts[i];
        const result = await sql`
          INSERT INTO video_clip_scripts (campaign_id, user_id, organization_id, title, hook, image_prompt, audio_script, scenes, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${script.title}, ${script.hook}, ${script.image_prompt || null}, ${script.audio_script || null}, ${JSON.stringify(script.scenes || [])}, ${i})
          RETURNING *
        `;
        createdVideoClipScripts.push(result[0]);
      }
    }

    // Insert and collect posts with their IDs
    const createdPosts = [];
    if (posts && Array.isArray(posts)) {
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const result = await sql`
          INSERT INTO posts (campaign_id, user_id, organization_id, platform, content, hashtags, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${post.platform}, ${post.content}, ${post.hashtags || []}, ${post.image_prompt || null}, ${i})
          RETURNING *
        `;
        createdPosts.push(result[0]);
      }
    }

    // Insert and collect ad creatives with their IDs
    const createdAdCreatives = [];
    if (ad_creatives && Array.isArray(ad_creatives)) {
      for (let i = 0; i < ad_creatives.length; i++) {
        const ad = ad_creatives[i];
        const result = await sql`
          INSERT INTO ad_creatives (campaign_id, user_id, organization_id, platform, headline, body, cta, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${ad.platform}, ${ad.headline}, ${ad.body}, ${ad.cta}, ${ad.image_prompt || null}, ${i})
          RETURNING *
        `;
        createdAdCreatives.push(result[0]);
      }
    }

    // Insert and collect carousel scripts with their IDs
    const createdCarouselScripts = [];
    if (carousel_scripts && Array.isArray(carousel_scripts)) {
      for (let i = 0; i < carousel_scripts.length; i++) {
        const carousel = carousel_scripts[i];
        const result = await sql`
          INSERT INTO carousel_scripts (campaign_id, user_id, organization_id, title, hook, cover_prompt, cover_url, caption, slides, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${carousel.title}, ${carousel.hook}, ${carousel.cover_prompt || null}, ${carousel.cover_url || null}, ${carousel.caption || null}, ${JSON.stringify(carousel.slides || [])}, ${i})
          RETURNING *
        `;
        createdCarouselScripts.push(result[0]);
      }
    }

    // Return campaign with all created items including their IDs
    res.status(201).json({
      ...campaign,
      video_clip_scripts: createdVideoClipScripts,
      posts: createdPosts,
      ad_creatives: createdAdCreatives,
      carousel_scripts: createdCarouselScripts,
    });
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError ||
      error instanceof ValidationError ||
      error instanceof NotFoundError
    ) {
      throw error;
    }
    throw new DatabaseError("Failed to create campaign", error);
  }
});

app.delete("/api/db/campaigns", async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    // Check if campaign belongs to an organization and verify permission
    const campaign =
      await sql`SELECT organization_id FROM campaigns WHERE id = ${id} AND deleted_at IS NULL`;
    if (campaign.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(
          sql,
          resolvedUserId,
          campaign[0].organization_id,
        );
        if (!hasPermission(context.orgRole, PERMISSIONS.DELETE_CAMPAIGN)) {
          return res
            .status(403)
            .json({ error: "Permission denied: delete_campaign required" });
        }
      }
    }

    logger.info(
      { campaignId: id },
      "[Campaign Delete] Starting cascade delete for campaign",
    );

    // ========================================================================
    // CASCADE DELETE: Delete all resources associated with the campaign
    // ========================================================================

    // 1. Get all images from gallery that belong to this campaign
    const campaignImages = await sql`
      SELECT id, src_url FROM gallery_images
      WHERE (post_id IN (SELECT id FROM posts WHERE campaign_id = ${id})
         OR ad_creative_id IN (SELECT id FROM ad_creatives WHERE campaign_id = ${id})
         OR video_script_id IN (SELECT id FROM video_clip_scripts WHERE campaign_id = ${id}))
      AND deleted_at IS NULL
    `;

    logger.info(
      { count: campaignImages.length },
      "[Campaign Delete] Found gallery images to delete",
    );

    // 2. Get all posts with their image URLs
    const posts = await sql`
      SELECT id, image_url FROM posts WHERE campaign_id = ${id}
    `;

    // 3. Get all ads with their image URLs
    const ads = await sql`
      SELECT id, image_url FROM ad_creatives WHERE campaign_id = ${id}
    `;

    // 4. Get all video clips with their thumbnail URLs
    const clips = await sql`
      SELECT id, thumbnail_url, video_url FROM video_clip_scripts WHERE campaign_id = ${id}
    `;

    logger.info(
      {
        postsCount: posts.length,
        adsCount: ads.length,
        clipsCount: clips.length,
      },
      "[Campaign Delete] Found posts, ads, and clips",
    );

    // Collect all URLs that need to be deleted from Vercel Blob
    const urlsToDelete = [];

    // Add gallery image URLs
    campaignImages.forEach((img) => {
      if (
        img.src_url &&
        (img.src_url.includes(".public.blob.vercel-storage.com/") ||
          img.src_url.includes(".blob.vercel-storage.com/"))
      ) {
        urlsToDelete.push(img.src_url);
      }
    });

    // Add post image URLs
    posts.forEach((post) => {
      if (
        post.image_url &&
        (post.image_url.includes(".public.blob.vercel-storage.com/") ||
          post.image_url.includes(".blob.vercel-storage.com/"))
      ) {
        urlsToDelete.push(post.image_url);
      }
    });

    // Add ad image URLs
    ads.forEach((ad) => {
      if (
        ad.image_url &&
        (ad.image_url.includes(".public.blob.vercel-storage.com/") ||
          ad.image_url.includes(".blob.vercel-storage.com/"))
      ) {
        urlsToDelete.push(ad.image_url);
      }
    });

    // Add clip thumbnail and video URLs
    clips.forEach((clip) => {
      if (
        clip.thumbnail_url &&
        (clip.thumbnail_url.includes(".public.blob.vercel-storage.com/") ||
          clip.thumbnail_url.includes(".blob.vercel-storage.com/"))
      ) {
        urlsToDelete.push(clip.thumbnail_url);
      }
      if (
        clip.video_url &&
        (clip.video_url.includes(".public.blob.vercel-storage.com/") ||
          clip.video_url.includes(".blob.vercel-storage.com/"))
      ) {
        urlsToDelete.push(clip.video_url);
      }
    });

    // Delete all files from Vercel Blob Storage
    logger.info(
      { count: urlsToDelete.length },
      "[Campaign Delete] Deleting files from Vercel Blob",
    );
    for (const url of urlsToDelete) {
      try {
        await del(url);
        logger.debug({ url }, "[Campaign Delete] Deleted file");
      } catch (blobError) {
        logger.error(
          { err: blobError, url },
          `[Campaign Delete] Failed to delete file: ${url}`,
        );
        // Continue even if blob deletion fails
      }
    }

    // HARD DELETE: Permanently remove all records from database
    logger.info({}, "[Campaign Delete] Deleting database records");

    // Delete gallery images (already have the IDs)
    if (campaignImages.length > 0) {
      const imageIds = campaignImages.map((img) => img.id);
      await sql`DELETE FROM gallery_images WHERE id = ANY(${imageIds})`;
      logger.info(
        { count: imageIds.length },
        "[Campaign Delete] Deleted gallery images from DB",
      );
    }

    // Delete posts
    await sql`DELETE FROM posts WHERE campaign_id = ${id}`;
    logger.info({}, "[Campaign Delete] Deleted posts from DB");

    // Delete ad creatives
    await sql`DELETE FROM ad_creatives WHERE campaign_id = ${id}`;
    logger.info({}, "[Campaign Delete] Deleted ad creatives from DB");

    // Delete video clip scripts
    await sql`DELETE FROM video_clip_scripts WHERE campaign_id = ${id}`;
    logger.info({}, "[Campaign Delete] Deleted video clips from DB");

    // Finally, delete the campaign itself
    await sql`DELETE FROM campaigns WHERE id = ${id}`;
    logger.info({}, "[Campaign Delete] Deleted campaign from DB");

    logger.info(
      { campaignId: id },
      "[Campaign Delete] Cascade delete completed successfully",
    );

    res.status(200).json({
      success: true,
      deleted: {
        campaign: 1,
        posts: posts.length,
        ads: ads.length,
        clips: clips.length,
        galleryImages: campaignImages.length,
        files: urlsToDelete.length,
      },
    });
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    logError("Campaigns API", error);
    res.status(500).json({ error: error.message });
  }
});

// Campaigns API - Update clip thumbnail_url
app.patch("/api/db/campaigns", async (req, res) => {
  try {
    const sql = getSql();
    const { clip_id } = req.query;
    const { thumbnail_url } = req.body;

    if (!clip_id) {
      return res.status(400).json({ error: "clip_id is required" });
    }

    const result = await sql`
      UPDATE video_clip_scripts
      SET thumbnail_url = ${thumbnail_url || null},
          updated_at = NOW()
      WHERE id = ${clip_id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Clip not found" });
    }

    res.json(result[0]);
  } catch (error) {
    logError("Campaigns API (PATCH clip)", error);
    res.status(500).json({ error: error.message });
  }
});

// Campaigns API - Update scene image_url in scenes JSONB
app.patch("/api/db/campaigns/scene", async (req, res) => {
  try {
    const sql = getSql();
    const { clip_id, scene_number } = req.query;
    const { image_url } = req.body;

    if (!clip_id || scene_number === undefined) {
      return res
        .status(400)
        .json({ error: "clip_id and scene_number are required" });
    }

    const sceneNum = parseInt(scene_number, 10);

    // Get current scenes
    const [clip] = await sql`
      SELECT scenes FROM video_clip_scripts WHERE id = ${clip_id}
    `;

    if (!clip) {
      return res.status(404).json({ error: "Clip not found" });
    }

    // Update the specific scene with image_url
    // Note: In DB, the field is "scene" not "sceneNumber"
    const scenes = clip.scenes || [];
    const updatedScenes = scenes.map((scene) => {
      if (scene.scene === sceneNum) {
        return { ...scene, image_url: image_url || null };
      }
      return scene;
    });

    // Save updated scenes back to database
    const result = await sql`
      UPDATE video_clip_scripts
      SET scenes = ${JSON.stringify(updatedScenes)}::jsonb,
          updated_at = NOW()
      WHERE id = ${clip_id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    logError("Campaigns API (PATCH scene)", error);
    res.status(500).json({ error: error.message });
  }
});

// Carousels API - Update carousel (cover_url, caption)
app.patch("/api/db/carousels", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { cover_url, caption } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    // Build dynamic update
    const updates = [];
    const values = [];

    if (cover_url !== undefined) {
      updates.push("cover_url = $1");
      values.push(cover_url);
    }
    if (caption !== undefined) {
      updates.push(`caption = $${values.length + 1}`);
      values.push(caption);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const result = await sql`
      UPDATE carousel_scripts
      SET cover_url = COALESCE(${cover_url}, cover_url),
          caption = COALESCE(${caption}, caption),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Carousel not found" });
    }

    res.json(result[0]);
  } catch (error) {
    logError("Carousels API (PATCH)", error);
    res.status(500).json({ error: error.message });
  }
});

// Carousels API - Update slide image_url in slides JSONB
app.patch("/api/db/carousels/slide", async (req, res) => {
  try {
    const sql = getSql();
    const { carousel_id, slide_number } = req.query;
    const { image_url } = req.body;

    if (!carousel_id || slide_number === undefined) {
      return res
        .status(400)
        .json({ error: "carousel_id and slide_number are required" });
    }

    const slideNum = parseInt(slide_number, 10);

    // Get current slides
    const [carousel] = await sql`
      SELECT slides FROM carousel_scripts WHERE id = ${carousel_id}
    `;

    if (!carousel) {
      return res.status(404).json({ error: "Carousel not found" });
    }

    // Update the specific slide with image_url
    const slides = carousel.slides || [];
    const updatedSlides = slides.map((slide) => {
      if (slide.slide === slideNum) {
        return { ...slide, image_url: image_url || null };
      }
      return slide;
    });

    // Save updated slides back to database
    const result = await sql`
      UPDATE carousel_scripts
      SET slides = ${JSON.stringify(updatedSlides)}::jsonb,
          updated_at = NOW()
      WHERE id = ${carousel_id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    logError("Carousels API (PATCH slide)", error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API - List all schedules for a user
app.get("/api/db/tournaments/list", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ schedules: [] }); // No user found
    }

    let schedules;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      schedules = await sql`
        SELECT
          ws.*,
          COUNT(te.id)::int as event_count
        FROM week_schedules ws
        LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
        WHERE ws.organization_id = ${organization_id}
        GROUP BY ws.id
        ORDER BY ws.start_date DESC
      `;
    } else {
      // Personal context
      schedules = await sql`
        SELECT
          ws.*,
          COUNT(te.id)::int as event_count
        FROM week_schedules ws
        LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
        WHERE ws.user_id = ${resolvedUserId} AND ws.organization_id IS NULL
        GROUP BY ws.id
        ORDER BY ws.start_date DESC
      `;
    }

    res.json({ schedules });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Tournaments API List", error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API
app.get("/api/db/tournaments", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, week_schedule_id } = req.query;

    if (!user_id) {
      throw new ValidationError("user_id is required");
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ schedule: null, events: [] }); // No user found
    }

    // If week_schedule_id is provided, get events for that schedule
    if (week_schedule_id) {
      const events = await sql`
        SELECT * FROM tournament_events
        WHERE week_schedule_id = ${week_schedule_id}
        ORDER BY day_of_week, name
      `;
      return res.json({ events });
    }

    let schedules;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      schedules = await sql`
        SELECT * FROM week_schedules
        WHERE organization_id = ${organization_id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    } else {
      // Personal context
      schedules = await sql`
        SELECT * FROM week_schedules
        WHERE user_id = ${resolvedUserId} AND organization_id IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
    }

    if (schedules.length === 0) {
      return res.json({ schedule: null, events: [] });
    }

    const schedule = schedules[0];

    // Get events for this schedule
    const events = await sql`
      SELECT * FROM tournament_events
      WHERE week_schedule_id = ${schedule.id}
      ORDER BY day_of_week, name
    `;

    res.json({ schedule, events });
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    throw new DatabaseError("Failed to fetch tournaments", error);
  }
});

app.post("/api/db/tournaments", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, start_date, end_date, filename, events } =
      req.body;

    if (!user_id || !start_date || !end_date) {
      return res
        .status(400)
        .json({ error: "user_id, start_date, and end_date are required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    // Verify organization membership if organization_id provided
    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    }

    // Create week schedule
    const scheduleResult = await sql`
      INSERT INTO week_schedules (user_id, organization_id, start_date, end_date, filename, original_filename)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${start_date}, ${end_date}, ${filename || null}, ${filename || null})
      RETURNING *
    `;

    const schedule = scheduleResult[0];

    // Create events if provided - using parallel batch inserts for performance
    if (events && Array.isArray(events) && events.length > 0) {
      logger.info(
        { eventsCount: events.length },
        "[Tournaments API] Inserting events in parallel batches",
      );

      // Process in batches - each batch runs concurrently, batches run sequentially
      const batchSize = 50; // 50 concurrent inserts per batch
      const totalBatches = Math.ceil(events.length / batchSize);

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        logger.debug(
          { batchNum, totalBatches, batchSize: batch.length },
          "[Tournaments API] Processing batch",
        );

        // Execute all inserts in this batch concurrently
        await Promise.all(
          batch.map(
            (event) =>
              sql`
              INSERT INTO tournament_events (
                user_id, organization_id, week_schedule_id, day_of_week, name, game, gtd, buy_in,
                rebuy, add_on, stack, players, late_reg, minutes, structure, times, event_date
              )
              VALUES (
                ${resolvedUserId}, ${organization_id || null}, ${schedule.id}, ${event.day}, ${event.name}, ${event.game || null},
                ${event.gtd || null}, ${event.buyIn || null}, ${event.rebuy || null},
                ${event.addOn || null}, ${event.stack || null}, ${event.players || null},
                ${event.lateReg || null}, ${event.minutes || null}, ${event.structure || null},
                ${JSON.stringify(event.times || {})}, ${event.eventDate || null}
              )
            `,
          ),
        );
      }
      logger.info(
        { eventsCount: events.length },
        "[Tournaments API] All events inserted successfully",
      );
    }

    res.status(201).json({
      schedule,
      eventsCount: events?.length || 0,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Tournaments API", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/db/tournaments", async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id || !user_id) {
      return res.status(400).json({ error: "id and user_id are required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    // Check if schedule belongs to an organization and verify membership
    const schedule =
      await sql`SELECT organization_id FROM week_schedules WHERE id = ${id}`;
    if (schedule.length > 0 && schedule[0].organization_id) {
      await resolveOrganizationContext(
        sql,
        resolvedUserId,
        schedule[0].organization_id,
      );
    }

    // Delete events first
    await sql`
      DELETE FROM tournament_events
      WHERE week_schedule_id = ${id}
    `;

    // Delete schedule
    await sql`
      DELETE FROM week_schedules
      WHERE id = ${id}
    `;

    res.json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Tournaments API", error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API - Update event flyer_urls
app.patch("/api/db/tournaments/event-flyer", async (req, res) => {
  try {
    const sql = getSql();
    const { event_id } = req.query;
    const { flyer_url, action } = req.body; // action: 'add' or 'remove'

    if (!event_id) {
      return res.status(400).json({ error: "event_id is required" });
    }

    // Get current flyer_urls
    const [event] = await sql`
      SELECT flyer_urls FROM tournament_events WHERE id = ${event_id}
    `;

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    let flyer_urls = event.flyer_urls || [];

    if (action === "add" && flyer_url) {
      // Add new flyer URL if not already present
      if (!flyer_urls.includes(flyer_url)) {
        flyer_urls = [...flyer_urls, flyer_url];
      }
    } else if (action === "remove" && flyer_url) {
      // Remove flyer URL
      flyer_urls = flyer_urls.filter((url) => url !== flyer_url);
    } else if (action === "set" && Array.isArray(req.body.flyer_urls)) {
      // Replace all flyer URLs
      flyer_urls = req.body.flyer_urls;
    }

    // Update database
    const result = await sql`
      UPDATE tournament_events
      SET flyer_urls = ${JSON.stringify(flyer_urls)}::jsonb,
          updated_at = NOW()
      WHERE id = ${event_id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    logError("Tournaments API (PATCH event-flyer)", error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API - Update daily flyer_urls for week schedule
app.patch("/api/db/tournaments/daily-flyer", async (req, res) => {
  try {
    const sql = getSql();
    const { schedule_id, period } = req.query; // period: 'MORNING', 'AFTERNOON', 'NIGHT', 'HIGHLIGHTS'
    const { flyer_url, action } = req.body; // action: 'add' or 'remove'

    if (!schedule_id || !period) {
      return res
        .status(400)
        .json({ error: "schedule_id and period are required" });
    }

    // Get current daily_flyer_urls
    const [schedule] = await sql`
      SELECT daily_flyer_urls FROM week_schedules WHERE id = ${schedule_id}
    `;

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    let daily_flyer_urls = schedule.daily_flyer_urls || {};
    let periodUrls = daily_flyer_urls[period] || [];

    if (action === "add" && flyer_url) {
      // Add new flyer URL if not already present
      if (!periodUrls.includes(flyer_url)) {
        periodUrls = [...periodUrls, flyer_url];
      }
    } else if (action === "remove" && flyer_url) {
      // Remove flyer URL
      periodUrls = periodUrls.filter((url) => url !== flyer_url);
    } else if (action === "set" && Array.isArray(req.body.flyer_urls)) {
      // Replace all flyer URLs for this period
      periodUrls = req.body.flyer_urls;
    }

    daily_flyer_urls[period] = periodUrls;

    // Update database
    const result = await sql`
      UPDATE week_schedules
      SET daily_flyer_urls = ${JSON.stringify(daily_flyer_urls)}::jsonb,
          updated_at = NOW()
      WHERE id = ${schedule_id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    logError("Tournaments API (PATCH daily-flyer)", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Generation Jobs API (Background Processing)
// Note: In dev mode, QStash callback won't work (needs public URL)
// Jobs are created but will remain in 'queued' status until deployed
// ============================================================================

// DISABLED: Background job queue - use synchronous generation instead
app.post("/api/generate/queue", async (req, res) => {
  return res.status(503).json({
    error:
      "Background job queue is disabled. Use synchronous image generation.",
    disabled: true,
  });
});

app.get("/api/generate/status", async (req, res) => {
  try {
    const sql = getSql();
    const {
      jobId,
      userId,
      organizationId,
      status: filterStatus,
      limit,
    } = req.query;

    // Single job query
    if (jobId) {
      const jobs = await sql`
        SELECT
          id, user_id, organization_id, job_type, status, progress,
          result_url, result_gallery_id, error_message,
          created_at, started_at, completed_at, attempts,
          config->>'_context' as context
        FROM generation_jobs
        WHERE id = ${jobId}
        LIMIT 1
      `;

      if (jobs.length === 0) {
        return res.status(404).json({ error: "Job not found" });
      }

      return res.json(jobs[0]);
    }

    // List jobs for user
    if (userId) {
      let jobs;
      const limitNum = Math.min(parseInt(limit) || 30, 50); // Max 50, default 30
      const cutoffDate = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString(); // 24 hours ago
      // For active jobs, only show recent ones (1 hour) to avoid showing stale queued jobs
      const activeCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

      // Filter by organization context
      if (organizationId) {
        // Organization context - show only org jobs
        if (filterStatus) {
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              CASE WHEN result_url LIKE 'data:%' THEN '' ELSE result_url END as result_url, result_gallery_id,
              CASE WHEN LENGTH(error_message) > 500 THEN LEFT(error_message, 500) || '...' ELSE error_message END as error_message,
              created_at, started_at, completed_at,
              config->>'_context' as context
            FROM generation_jobs
            WHERE organization_id = ${organizationId} AND status = ${filterStatus}
            ORDER BY created_at DESC
            LIMIT ${limitNum}
          `;
        } else {
          // Get recent active jobs + recent completed/failed jobs
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              CASE WHEN result_url LIKE 'data:%' THEN '' ELSE result_url END as result_url, result_gallery_id,
              CASE WHEN LENGTH(error_message) > 500 THEN LEFT(error_message, 500) || '...' ELSE error_message END as error_message,
              created_at, started_at, completed_at,
              config->>'_context' as context
            FROM generation_jobs
            WHERE organization_id = ${organizationId}
              AND (
                (status IN ('queued', 'processing') AND created_at > ${activeCutoff})
                OR created_at > ${cutoffDate}
              )
            ORDER BY created_at DESC
            LIMIT ${limitNum}
          `;
        }
      } else {
        // Personal context - show only personal jobs (no organization)
        if (filterStatus) {
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              CASE WHEN result_url LIKE 'data:%' THEN '' ELSE result_url END as result_url, result_gallery_id,
              CASE WHEN LENGTH(error_message) > 500 THEN LEFT(error_message, 500) || '...' ELSE error_message END as error_message,
              created_at, started_at, completed_at,
              config->>'_context' as context
            FROM generation_jobs
            WHERE user_id = ${userId} AND organization_id IS NULL AND status = ${filterStatus}
            ORDER BY created_at DESC
            LIMIT ${limitNum}
          `;
        } else {
          // Get recent active jobs + recent completed/failed jobs
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              CASE WHEN result_url LIKE 'data:%' THEN '' ELSE result_url END as result_url, result_gallery_id,
              CASE WHEN LENGTH(error_message) > 500 THEN LEFT(error_message, 500) || '...' ELSE error_message END as error_message,
              created_at, started_at, completed_at,
              config->>'_context' as context
            FROM generation_jobs
            WHERE user_id = ${userId} AND organization_id IS NULL
              AND (
                (status IN ('queued', 'processing') AND created_at > ${activeCutoff})
                OR created_at > ${cutoffDate}
              )
            ORDER BY created_at DESC
            LIMIT ${limitNum}
          `;
        }
      }

      return res.json({ jobs, total: jobs.length });
    }

    return res.status(400).json({ error: "jobId or userId is required" });
  } catch (error) {
    logError("Generate Status", error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel all pending/queued jobs for a user
app.post("/api/generate/cancel-all", async (req, res) => {
  try {
    const sql = getSql();
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, userId);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    // Delete all queued jobs (not started yet)
    const result = await sql`
      DELETE FROM generation_jobs
      WHERE user_id = ${resolvedUserId}
        AND status = 'queued'
      RETURNING id
    `;

    const cancelledCount = result.length;

    res.json({
      success: true,
      cancelledCount,
      message: `${cancelledCount} job(s) cancelled`,
    });
  } catch (error) {
    logError("Cancel All Jobs API", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ORGANIZATIONS API - Managed by Clerk
// Organization CRUD, members, roles, and invites are now handled by Clerk
// See: https://clerk.com/docs/organizations/overview
// ============================================================================

// ============================================================================
// VIDEO PROXY API (for COEP bypass in development)
// Vercel Blob doesn't set Cross-Origin-Resource-Policy header, which is required
// when the page has Cross-Origin-Embedder-Policy: require-corp (needed for FFmpeg WASM)
// ============================================================================

app.get("/api/proxy-video", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "url parameter is required" });
    }

    // Only allow proxying Vercel Blob URLs for security
    if (
      !url.includes(".public.blob.vercel-storage.com/") &&
      !url.includes(".blob.vercel-storage.com/")
    ) {
      return res
        .status(403)
        .json({ error: "Only Vercel Blob URLs are allowed" });
    }

    logger.debug({ url }, "[Video Proxy] Fetching");

    const response = await fetch(url);

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Failed to fetch video: ${response.statusText}` });
    }

    // Set CORS and COEP-compatible headers
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "video/mp4",
    );
    res.setHeader(
      "Content-Length",
      response.headers.get("content-length") || "",
    );
    res.setHeader("Accept-Ranges", "bytes");

    // Handle range requests for video seeking
    const range = req.headers.range;
    if (range) {
      const contentLength = parseInt(
        response.headers.get("content-length") || "0",
      );
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${contentLength}`);
      res.setHeader("Content-Length", end - start + 1);
    }

    // Stream the video data
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    logError("Video Proxy", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// FILE UPLOAD API (Vercel Blob)
// ============================================================================

// Max file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

app.post("/api/upload", async (req, res) => {
  try {
    const { filename, contentType, data } = req.body;

    if (!filename || !contentType || !data) {
      return res.status(400).json({
        error: "Missing required fields: filename, contentType, data",
      });
    }

    // Decode base64 data
    const buffer = Buffer.from(data, "base64");

    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;

    // Upload to Vercel Blob
    logExternalAPI(
      "Vercel Blob",
      "Upload file",
      `${contentType} | ${(buffer.length / 1024).toFixed(1)}KB`,
    );
    const uploadStart = Date.now();

    const blob = await put(uniqueFilename, buffer, {
      access: "public",
      contentType,
    });

    logExternalAPIResult(
      "Vercel Blob",
      "Upload file",
      Date.now() - uploadStart,
    );

    return res.status(200).json({
      success: true,
      url: blob.url,
      filename: uniqueFilename,
      size: buffer.length,
    });
  } catch (error) {
    logError("Upload API", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ============================================================================
// AI HELPER FUNCTIONS
// ============================================================================

// Gemini client
const getGeminiAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return new GoogleGenAI({ apiKey });
};

// OpenRouter client
const getOpenRouter = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  return new OpenRouter({ apiKey });
};

const getReplicate = () => {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error("REPLICATE_API_TOKEN not configured");
  }
  return new Replicate({ auth: apiToken });
};

// Check if an error is a quota/rate limit error that warrants fallback
const isQuotaOrRateLimitError = (error) => {
  const errorString = String(error?.message || error || "").toLowerCase();
  return (
    errorString.includes("resource_exhausted") ||
    errorString.includes("quota") ||
    errorString.includes("429") ||
    errorString.includes("rate") ||
    errorString.includes("limit") ||
    errorString.includes("exceeded")
  );
};

const REPLICATE_IMAGE_MODEL = "google/nano-banana-pro";

const toDataUrl = (img) => `data:${img.mimeType};base64,${img.base64}`;

const normalizeReplicateOutputUrl = (output) => {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (first && typeof first.url === "function") return first.url();
    if (first && typeof first.url === "string") return first.url;
  }
  if (output && typeof output.url === "function") return output.url();
  if (output && typeof output.url === "string") return output.url;
  return null;
};

const generateImageWithReplicate = async (
  prompt,
  aspectRatio,
  imageSize = "1K",
  productImages,
  styleReferenceImage,
  personReferenceImage,
) => {
  const replicate = getReplicate();

  const imageInputs = [];
  if (personReferenceImage) imageInputs.push(personReferenceImage);
  if (styleReferenceImage) imageInputs.push(styleReferenceImage);
  if (productImages && productImages.length > 0)
    imageInputs.push(...productImages);

  const input = {
    prompt,
    output_format: "png",
  };

  if (aspectRatio) {
    input.aspect_ratio = aspectRatio;
  }

  if (["1K", "2K", "4K"].includes(imageSize)) {
    input.resolution = imageSize;
  }

  if (imageInputs.length > 0) {
    input.image_input = imageInputs.slice(0, 14).map(toDataUrl);
  }

  const output = await replicate.run(REPLICATE_IMAGE_MODEL, { input });
  const outputUrl = normalizeReplicateOutputUrl(output);
  if (!outputUrl) {
    throw new Error("[Replicate] No image URL in output");
  }
  return outputUrl;
};

// Generate image with OpenRouter as fallback
const generateImageWithOpenRouter = async (prompt, productImages) => {
  logger.info({}, "[OpenRouter Fallback] Tentando gerar imagem via OpenRouter");

  const openrouter = getOpenRouter();

  // Build content parts with optional images
  const contentParts = [];

  // Add images first if provided
  if (productImages && productImages.length > 0) {
    logger.debug(
      { count: productImages.length },
      "[OpenRouter Fallback] Adicionando imagens de referência",
    );
    for (const img of productImages) {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType};base64,${img.base64}`,
        },
      });
    }
  }

  // Add text prompt
  contentParts.push({
    type: "text",
    text: prompt,
  });

  const response = await openrouter.chat.send({
    model: "google/gemini-3-pro-image-preview",
    messages: [
      {
        role: "user",
        content: contentParts,
      },
    ],
    modalities: ["image", "text"],
  });

  const message = response?.choices?.[0]?.message;
  if (!message) {
    throw new Error("[OpenRouter] No message in response");
  }

  // Check for image in response
  if (message.images && message.images.length > 0) {
    const imageUrl = message.images[0].image_url?.url;
    if (imageUrl) {
      logger.info({}, "[OpenRouter Fallback] Imagem gerada com sucesso");
      return imageUrl;
    }
  }

  // Check for base64 image in content
  if (message.content) {
    const base64Match = message.content.match(
      /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/,
    );
    if (base64Match) {
      logger.info({}, "[OpenRouter Fallback] Imagem encontrada no content");
      return base64Match[0];
    }
  }

  logger.error(
    { response },
    "[OpenRouter Fallback] ❌ Nenhuma imagem encontrada na resposta",
  );
  throw new Error("[OpenRouter] No image data in response");
};

// Model defaults
const DEFAULT_TEXT_MODEL = "gemini-3-flash-preview";
const DEFAULT_FAST_TEXT_MODEL = "gemini-3-flash-preview";
const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image-preview";
const DEFAULT_ASSISTANT_MODEL = "gemini-3-flash-preview";

// Retry helper for 503 errors
const withRetry = async (fn, maxRetries = 3, delayMs = 1000) => {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable =
        error?.message?.includes("503") ||
        error?.message?.includes("overloaded") ||
        error?.message?.includes("UNAVAILABLE") ||
        error?.status === 503;

      if (isRetryable && attempt < maxRetries) {
        logger.debug(
          { attempt, maxRetries, delayMs },
          "[Gemini] Retrying after delay",
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

// Map aspect ratios
const mapAspectRatio = (ratio) => {
  const map = {
    "1:1": "1:1",
    "9:16": "9:16",
    "16:9": "16:9",
    "1.91:1": "16:9",
    "4:5": "4:5",
    "3:4": "3:4",
    "4:3": "4:3",
    "2:3": "2:3",
    "3:2": "3:2",
  };
  return map[ratio] || "1:1";
};

// Generate image with Gemini
const generateGeminiImage = async (
  prompt,
  aspectRatio,
  model = DEFAULT_IMAGE_MODEL,
  imageSize = "1K",
  productImages,
  styleReferenceImage,
  personReferenceImage,
) => {
  const ai = getGeminiAi();
  const parts = [{ text: prompt }];

  // Add person/face reference image first (highest priority for face consistency)
  if (personReferenceImage) {
    parts.push({
      inlineData: {
        data: personReferenceImage.base64,
        mimeType: personReferenceImage.mimeType,
      },
    });
  }

  if (styleReferenceImage) {
    parts.push({
      inlineData: {
        data: styleReferenceImage.base64,
        mimeType: styleReferenceImage.mimeType,
      },
    });
  }

  if (productImages) {
    productImages.forEach((img) => {
      parts.push({
        inlineData: { data: img.base64, mimeType: img.mimeType },
      });
    });
  }

  const response = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: mapAspectRatio(aspectRatio),
          imageSize,
        },
      },
    }),
  );

  const responseParts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(responseParts)) {
    logger.error({ response }, "[Image API] Unexpected response");
    throw new Error("Failed to generate image - invalid response structure");
  }

  for (const part of responseParts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Failed to generate image");
};

// Generate image with Gemini + Replicate fallback
const generateImageWithFallback = async (
  prompt,
  aspectRatio,
  model = DEFAULT_IMAGE_MODEL,
  imageSize = "1K",
  productImages,
  styleReferenceImage,
  personReferenceImage,
) => {
  try {
    // Try Gemini first
    const imageUrl = await generateGeminiImage(
      prompt,
      aspectRatio,
      model,
      imageSize,
      productImages,
      styleReferenceImage,
      personReferenceImage,
    );
    return {
      imageUrl,
      usedModel: model,
      usedProvider: "google",
      usedFallback: false,
    };
  } catch (error) {
    // Check if this is a quota/rate limit error that warrants fallback
    if (isQuotaOrRateLimitError(error)) {
      logger.info(
        { error: error.message },
        "[generateImageWithFallback] Gemini falhou com erro de quota/rate limit, tentando fallback para Replicate",
      );

      try {
        const result = await generateImageWithReplicate(
          prompt,
          aspectRatio,
          imageSize,
          productImages,
          styleReferenceImage,
          personReferenceImage,
        );
        logger.info(
          {},
          "[generateImageWithFallback] Replicate fallback bem sucedido",
        );
        return {
          imageUrl: result,
          usedModel: REPLICATE_IMAGE_MODEL,
          usedProvider: "replicate",
          usedFallback: true,
        };
      } catch (fallbackError) {
        logger.error(
          { err: fallbackError },
          "[generateImageWithFallback] ❌ Replicate fallback também falhou",
        );
        // Throw the original error if fallback also fails
        throw error;
      }
    }

    // For other errors, just re-throw
    throw error;
  }
};

// Generate structured content with Gemini
const generateStructuredContent = async (
  model,
  parts,
  responseSchema,
  temperature = 0.7,
) => {
  const ai = getGeminiAi();

  const response = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature,
      },
    }),
  );

  return response.text.trim();
};

// Generate text with OpenRouter
const generateTextWithOpenRouter = async (
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.7,
) => {
  const openrouter = getOpenRouter();

  const response = await openrouter.chat.send({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    responseFormat: { type: "json_object" },
    temperature,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`OpenRouter (${model}) no content returned`);
  }

  return content;
};

// Generate text with OpenRouter + Vision
const generateTextWithOpenRouterVision = async (
  model,
  textParts,
  imageParts,
  temperature = 0.7,
) => {
  const openrouter = getOpenRouter();

  const content = textParts.map((text) => ({ type: "text", text }));

  for (const img of imageParts) {
    content.push({
      type: "image_url",
      imageUrl: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    });
  }

  const response = await openrouter.chat.send({
    model,
    messages: [{ role: "user", content }],
    responseFormat: { type: "json_object" },
    temperature,
  });

  const result = response.choices[0]?.message?.content;
  if (!result) {
    throw new Error(`OpenRouter (${model}) no content returned`);
  }

  return result;
};

// Schema Type constants
const Type = {
  OBJECT: "OBJECT",
  ARRAY: "ARRAY",
  STRING: "STRING",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  NUMBER: "NUMBER",
};

// Prompt builders
const shouldUseTone = (brandProfile, target) => {
  if (!brandProfile) return false;
  const targets = brandProfile.toneTargets || [
    "campaigns",
    "posts",
    "images",
    "flyers",
  ];
  return targets.includes(target);
};

const getToneText = (brandProfile, target) => {
  if (!brandProfile) return "";
  return shouldUseTone(brandProfile, target)
    ? brandProfile.toneOfVoice || ""
    : "";
};

const buildImagePrompt = (
  prompt,
  brandProfile,
  hasStyleReference = false,
  hasLogo = false,
  hasPersonReference = false,
  hasProductImages = false,
  jsonPrompt = null,
) => {
  const toneText = getToneText(brandProfile, "images");
  const primaryColor = brandProfile?.primaryColor || "cores vibrantes";
  const secondaryColor = brandProfile?.secondaryColor || "tons complementares";
  let fullPrompt = `PROMPT TÉCNICO: ${prompt}
ESTILO VISUAL: ${toneText ? `${toneText}, ` : ""}Cores: ${primaryColor}, ${secondaryColor}. Cinematográfico e Luxuoso.`;

  if (jsonPrompt) {
    fullPrompt += `

JSON ESTRUTURADO (REFERÊNCIA):
\`\`\`json
${jsonPrompt}
\`\`\``;
  }

  if (hasPersonReference) {
    fullPrompt += `

**PESSOA/ROSTO DE REFERÊNCIA (PRIORIDADE MÁXIMA):**
- A primeira imagem anexada é uma FOTO DE REFERÊNCIA de uma pessoa
- OBRIGATÓRIO: Use EXATAMENTE o rosto e aparência física desta pessoa na imagem gerada
- Mantenha fielmente: formato do rosto, cor de pele, cabelo, olhos e características faciais
- A pessoa deve ser o protagonista da cena, realizando a ação descrita no prompt
- NÃO altere a identidade da pessoa - preserve sua aparência real`;
  }

  if (hasLogo) {
    fullPrompt += `

**LOGO DA MARCA - PRESERVAÇÃO:**
O logo anexado deve aparecer como uma COLAGEM LITERAL na imagem final.

PRESERVAÇÃO DO LOGO (INVIOLÁVEL):
- COPIE o logo EXATAMENTE como fornecido - pixel por pixel
- NÃO redesenhe, NÃO reinterprete, NÃO estilize o logo
- NÃO altere cores, formas, proporções ou tipografia
- NÃO adicione efeitos (brilho, sombra, gradiente, 3D)
- Mantenha bordas nítidas e definidas
- O logo deve aparecer de forma clara e legível na composição`;
  }

  if (hasProductImages) {
    fullPrompt += `

**IMAGENS DE PRODUTO (OBRIGATÓRIO):**
- As imagens anexadas são referências de produto
- Preserve fielmente o produto (forma, cores e detalhes principais)
- O produto deve aparecer com destaque na composição`;
  }

  if (hasStyleReference) {
    fullPrompt += `

**TIPOGRAFIA OBRIGATÓRIA PARA CENAS (REGRA INVIOLÁVEL):**
- Use EXCLUSIVAMENTE fonte BOLD CONDENSED SANS-SERIF (estilo Bebas Neue, Oswald, Impact, ou similar)
- TODOS os textos devem usar a MESMA família tipográfica - PROIBIDO misturar estilos
- Títulos em MAIÚSCULAS com peso BLACK ou EXTRA-BOLD
- PROIBIDO: fontes script/cursivas, serifadas clássicas, handwriting, ou fontes finas/light`;
  }

  return fullPrompt;
};

const convertImagePromptToJson = async (
  prompt,
  aspectRatio,
  organizationId,
  sql,
) => {
  const timer = createTimer();

  try {
    const ai = getGeminiAi();
    const systemPrompt = getImagePromptSystemPrompt(aspectRatio);

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: DEFAULT_FAST_TEXT_MODEL,
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nPROMPT: ${prompt}` }],
          },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    );

    const text = response.text?.trim() || "";
    let parsed = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const result = JSON.stringify(
      parsed || {
        subject: "",
        environment: "",
        style: "",
        camera: "",
        text: {
          enabled: false,
          content: "",
          language: "pt-BR",
          placement: "",
          font: "",
        },
        output: {
          aspect_ratio: aspectRatio,
          resolution: "2K",
        },
      },
      null,
      2,
    );

    const tokens = extractGeminiTokens(response);
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/convert-image-prompt",
      operation: "text",
      model: DEFAULT_FAST_TEXT_MODEL,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      latencyMs: timer(),
      status: "success",
    });

    return result;
  } catch (error) {
    logger.error({ err: error }, "[Image Prompt JSON] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/convert-image-prompt",
      operation: "text",
      model: DEFAULT_FAST_TEXT_MODEL,
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return null;
  }
};

const buildFlyerPrompt = (brandProfile) => {
  const toneText = getToneText(brandProfile, "flyers");
  const brandName = brandProfile?.name || "a marca";
  const brandDescription = brandProfile?.description || "";
  const primaryColor = brandProfile?.primaryColor || "cores vibrantes";
  const secondaryColor = brandProfile?.secondaryColor || "tons complementares";

  return `
**PERSONA:** Você é Diretor de Arte Sênior de uma agência de publicidade internacional de elite.

**MISSÃO CRÍTICA:**
Crie materiais visuais de alta qualidade que representem fielmente a marca e comuniquem a mensagem de forma impactante.
Se houver valores ou informações importantes no conteúdo, destaque-os visualmente (fonte negrito, cor vibrante ou tamanho maior).

**REGRAS DE CONTEÚDO:**
1. Destaque informações importantes (valores, datas, horários) de forma clara e legível.
2. Use a marca ${brandName}.
3. Siga a identidade visual da marca em todos os elementos.

**IDENTIDADE DA MARCA - ${brandName}:**
${brandDescription ? `- Descrição: ${brandDescription}` : ""}
${toneText ? `- Tom de Comunicação: ${toneText}` : ""}
- Cor Primária (dominante): ${primaryColor}
- Cor de Acento (destaques, CTAs): ${secondaryColor}

**PRINCÍPIOS DE DESIGN PROFISSIONAL:**

1. HARMONIA CROMÁTICA:
   - Use APENAS as cores da marca: ${primaryColor} (primária) e ${secondaryColor} (acento)
   - Crie variações tonais dessas cores para profundidade
   - Evite introduzir cores aleatórias

2. RESPIRAÇÃO VISUAL (Anti-Poluição):
   - Menos é mais: priorize espaços negativos estratégicos
   - Não sobrecarregue com elementos decorativos desnecessários
   - Hierarquia visual clara

3. TIPOGRAFIA CINEMATOGRÁFICA:
   - Máximo 2-3 famílias tipográficas diferentes
   - Contraste forte entre títulos (bold/black) e corpo (regular/medium)

4. ESTÉTICA PREMIUM SEM CLICHÊS:
   - Evite excesso de efeitos (brilhos, sombras, neons chamativos)
   - Prefira elegância sutil a ostentação visual

**ATMOSFERA FINAL:**
- Alta classe, luxo e sofisticação
- Cinematográfico mas não exagerado
- Profissional mas criativo
- Impactante mas elegante`;
};

const buildQuickPostPrompt = (brandProfile, context) => {
  const toneText = getToneText(brandProfile, "posts");
  const brandName = brandProfile?.name || "a marca";
  const brandDescription = brandProfile?.description || "";

  return `
Você é Social Media Manager de elite. Crie um post de INSTAGRAM de alta performance.

**CONTEXTO:**
${context}

**MARCA:** ${brandName}${brandDescription ? ` - ${brandDescription}` : ""}${toneText ? ` | **TOM:** ${toneText}` : ""}

**REGRAS DE OURO:**
1. GANCHO EXPLOSIVO com emojis relevantes ao tema.
2. DESTAQUE informações importantes (valores, datas, ofertas).
3. CTA FORTE (ex: Link na Bio, Saiba Mais).
4. 5-8 Hashtags estratégicas relevantes à marca e ao conteúdo.

Responda apenas JSON:
{ "platform": "Instagram", "content": "Texto Legenda", "hashtags": ["tag1", "tag2"], "image_prompt": "descrição visual" }`;
};

/**
 * Video prompt JSON conversion system prompt
 */
const getVideoPromptSystemPrompt = (duration, aspectRatio) => {
  return `Você é um especialista em prompt engineering para vídeo de IA.
Converta o prompt genérico fornecido em um JSON estruturado e aninhado otimizado para modelos de geração de vídeo (Veo 3, Sora 2).

O JSON deve incluir detalhes ricos sobre:
- visual_style: estética, paleta de cores, iluminação
- camera: movimentos de câmera cinematográficos, posições inicial e final
- subject: personagem/objeto principal, ação, expressão/estado
- environment: cenário, props relevantes, atmosfera
- scene_sequence: 2-3 beats de ação para criar dinamismo
- technical: duração (${duration} seconds), aspect ratio (${aspectRatio}), tokens de qualidade

**TIPOGRAFIA OBRIGATÓRIA (REGRA CRÍTICA PARA CONSISTÊNCIA VISUAL):**
Se o vídeo contiver QUALQUER texto na tela (títulos, legendas, overlays, valores, CTAs):
- Use EXCLUSIVAMENTE fonte BOLD CONDENSED SANS-SERIF (estilo Bebas Neue, Oswald, Impact)
- TODOS os textos devem usar a MESMA família tipográfica
- Textos em MAIÚSCULAS com peso BLACK ou EXTRA-BOLD
- PROIBIDO: fontes script/cursivas, serifadas, handwriting, ou fontes finas/light

**ÁUDIO E NARRAÇÃO (OBRIGATÓRIO):**
Se o prompt contiver uma NARRAÇÃO ou texto de fala, SEMPRE inclua o campo audio_context no JSON:
- audio_context.voiceover: o texto exato da narração em português brasileiro
- audio_context.language: "pt-BR"
- audio_context.tone: tom da narração (ex: "Exciting, professional, persuasive" ou "Calm, informative, trustworthy")
- audio_context.style: estilo de entrega (ex: "energetic announcer", "conversational", "dramatic narrator")

Exemplo de audio_context:
{
  "audio_context": {
    "voiceover": "Texto da narração aqui",
    "language": "pt-BR",
    "tone": "Exciting, professional, persuasive",
    "style": "energetic announcer"
  }
}

Mantenha a essência do prompt original mas expanda com detalhes visuais cinematográficos.`;
};

const getImagePromptSystemPrompt = (aspectRatio) => {
  return `Você é especialista em prompt engineering para imagens de IA.
Converta o prompt fornecido em um JSON estruturado para geração de imagens.

REGRAS IMPORTANTES:
- NÃO invente detalhes que não existam no prompt original.
- Preserve exatamente o conteúdo e as instruções do prompt.
- Se uma informação não estiver explícita, deixe como string vazia.
- Use linguagem objetiva e direta.

O JSON deve seguir esta estrutura:
{
  "subject": "",
  "environment": "",
  "style": "",
  "camera": "",
  "text": {
    "enabled": false,
    "content": "",
    "language": "pt-BR",
    "placement": "",
    "font": ""
  },
  "output": {
    "aspect_ratio": "${aspectRatio}",
    "resolution": "2K"
  }
}

Se houver texto na imagem, marque text.enabled como true e preencha content/placement/font conforme o prompt.`;
};

// Campaign schema for structured generation
const campaignSchema = {
  type: Type.OBJECT,
  properties: {
    videoClipScripts: {
      type: Type.ARRAY,
      description: "Roteiros para vídeos curtos (Reels/Shorts/TikTok).",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scene: { type: Type.INTEGER },
                visual: { type: Type.STRING },
                narration: { type: Type.STRING },
                duration_seconds: { type: Type.INTEGER },
              },
              required: ["scene", "visual", "narration", "duration_seconds"],
            },
          },
          image_prompt: { type: Type.STRING },
          audio_script: { type: Type.STRING },
        },
        required: ["title", "hook", "scenes", "image_prompt", "audio_script"],
      },
    },
    posts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          content: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          image_prompt: { type: Type.STRING },
        },
        required: ["platform", "content", "hashtags", "image_prompt"],
      },
    },
    adCreatives: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          headline: { type: Type.STRING },
          body: { type: Type.STRING },
          cta: { type: Type.STRING },
          image_prompt: { type: Type.STRING },
        },
        required: ["platform", "headline", "body", "cta", "image_prompt"],
      },
    },
    carousels: {
      type: Type.ARRAY,
      description: "Carrosséis para Instagram (4-6 slides cada).",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          cover_prompt: { type: Type.STRING },
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                slide: { type: Type.INTEGER },
                visual: { type: Type.STRING },
                text: { type: Type.STRING },
              },
              required: ["slide", "visual", "text"],
            },
          },
        },
        required: ["title", "hook", "cover_prompt", "slides"],
      },
    },
  },
  required: ["videoClipScripts", "posts", "adCreatives", "carousels"],
};

// Quick post schema
const quickPostSchema = {
  type: Type.OBJECT,
  properties: {
    platform: { type: Type.STRING },
    content: { type: Type.STRING },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    image_prompt: { type: Type.STRING },
  },
  required: ["platform", "content", "hashtags", "image_prompt"],
};

// ============================================================================
// AI GENERATION ENDPOINTS
// ============================================================================

// AI Campaign Generation
app.post("/api/ai/campaign", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const {
      brandProfile,
      transcript,
      options,
      productImages,
      inspirationImages,
      collabLogo,
      compositionAssets,
      toneOfVoiceOverride,
    } = req.body;

    if (!brandProfile || !transcript || !options) {
      return res.status(400).json({
        error: "brandProfile, transcript, and options are required",
      });
    }

    logger.info(
      {
        productImages: productImages?.length || 0,
        inspirationImages: inspirationImages?.length || 0,
        collabLogo: !!collabLogo,
        compositionAssets: compositionAssets?.length || 0,
        toneOverride: toneOfVoiceOverride || null,
      },
      "[Campaign API] Generating campaign",
    );

    // Collect all images for vision models
    const allImages = [];
    if (productImages) allImages.push(...productImages);
    if (inspirationImages) allImages.push(...inspirationImages);
    if (collabLogo) allImages.push(collabLogo);
    if (compositionAssets) allImages.push(...compositionAssets);

    // Model selection - config in config/ai-models.ts
    // OpenRouter models have "/" in their ID (e.g., "openai/gpt-5.2")
    const model = brandProfile.creativeModel || DEFAULT_TEXT_MODEL;
    const isOpenRouter = model.includes("/");

    const quantityInstructions = buildQuantityInstructions(options, "dev");
    const effectiveBrandProfile = toneOfVoiceOverride
      ? { ...brandProfile, toneOfVoice: toneOfVoiceOverride }
      : brandProfile;
    const prompt = buildCampaignPrompt(
      effectiveBrandProfile,
      transcript,
      quantityInstructions,
      getToneText(effectiveBrandProfile, "campaigns"),
    );

    let result;

    if (isOpenRouter) {
      // Add explicit JSON schema for OpenRouter models
      const jsonSchemaPrompt = `${prompt}

**FORMATO JSON OBRIGATÓRIO - TODOS OS CAMPOS SÃO OBRIGATÓRIOS:**

ATENÇÃO: Você DEVE gerar TODOS os 4 arrays: videoClipScripts, posts, adCreatives E carousels.
O campo "carousels" é OBRIGATÓRIO e NÃO pode ser omitido.

\`\`\`json
{
  "videoClipScripts": [
    {
      "title": "Título do vídeo",
      "hook": "Gancho inicial do vídeo",
      "scenes": [
        {"scene": 1, "visual": "descrição visual", "narration": "narração", "duration_seconds": 5}
      ],
      "image_prompt": "prompt para thumbnail com cores da marca, estilo cinematográfico",
      "audio_script": "script de áudio completo"
    }
  ],
  "posts": [
    {
      "platform": "Instagram|Facebook|Twitter|LinkedIn",
      "content": "texto do post",
      "hashtags": ["tag1", "tag2"],
      "image_prompt": "descrição da imagem com cores da marca, estilo cinematográfico"
    }
  ],
  "adCreatives": [
    {
      "platform": "Facebook|Google",
      "headline": "título do anúncio",
      "body": "corpo do anúncio",
      "cta": "call to action",
      "image_prompt": "descrição da imagem com cores da marca, estilo cinematográfico"
    }
  ],
  "carousels": [
    {
      "title": "Título do carrossel Instagram",
      "hook": "Gancho/abertura impactante do carrossel",
      "cover_prompt": "Imagem de capa cinematográfica com cores da marca, título em fonte bold condensed sans-serif, estilo luxuoso e premium, composição visual impactante",
      "slides": [
        {"slide": 1, "visual": "descrição visual detalhada do slide 1 - capa/título", "text": "TEXTO CURTO EM MAIÚSCULAS"},
        {"slide": 2, "visual": "descrição visual detalhada do slide 2 - conteúdo", "text": "TEXTO CURTO EM MAIÚSCULAS"},
        {"slide": 3, "visual": "descrição visual detalhada do slide 3 - conteúdo", "text": "TEXTO CURTO EM MAIÚSCULAS"},
        {"slide": 4, "visual": "descrição visual detalhada do slide 4 - conteúdo", "text": "TEXTO CURTO EM MAIÚSCULAS"},
        {"slide": 5, "visual": "descrição visual detalhada do slide 5 - CTA", "text": "TEXTO CURTO EM MAIÚSCULAS"}
      ]
    }
  ]
}
\`\`\`

REGRAS CRÍTICAS:
1. O JSON DEVE conter EXATAMENTE os 4 arrays: videoClipScripts, posts, adCreatives, carousels
2. O array "carousels" NUNCA pode estar vazio - gere pelo menos 1 carrossel com 5 slides
3. Responda APENAS com o JSON válido, sem texto adicional.`;

      const textParts = [jsonSchemaPrompt];

      if (allImages.length > 0) {
        result = await generateTextWithOpenRouterVision(
          model,
          textParts,
          allImages,
          0.7,
        );
      } else {
        result = await generateTextWithOpenRouter(
          model,
          "",
          jsonSchemaPrompt,
          0.7,
        );
      }
    } else {
      const parts = [{ text: prompt }];

      if (allImages.length > 0) {
        allImages.forEach((img) => {
          parts.push({
            inlineData: { mimeType: img.mimeType, data: img.base64 },
          });
        });
      }

      result = await generateStructuredContent(
        model,
        parts,
        campaignSchema,
        0.7,
      );
    }

    // Clean markdown code blocks if present
    let cleanResult = result.trim();
    if (cleanResult.startsWith("```json")) {
      cleanResult = cleanResult.slice(7);
    } else if (cleanResult.startsWith("```")) {
      cleanResult = cleanResult.slice(3);
    }
    if (cleanResult.endsWith("```")) {
      cleanResult = cleanResult.slice(0, -3);
    }
    cleanResult = cleanResult.trim();

    const campaign = JSON.parse(cleanResult);

    // Normalize field names (ensure arrays exist)
    campaign.posts = campaign.posts || [];
    campaign.adCreatives = campaign.adCreatives || campaign.ad_creatives || [];
    campaign.videoClipScripts =
      campaign.videoClipScripts || campaign.video_clip_scripts || [];

    // Validate videoClipScripts have required fields
    campaign.videoClipScripts = campaign.videoClipScripts
      .filter(
        (script) => script && script.title && script.hook && script.scenes,
      )
      .map((script) => ({
        ...script,
        title: script.title || "Sem título",
        hook: script.hook || "",
        scenes: script.scenes || [],
        image_prompt: script.image_prompt || "",
        audio_script: script.audio_script || "",
      }));

    // Debug: log structure for troubleshooting (v2 - with carousels)
    logger.debug(
      { carousels: campaign.carousels },
      "[Campaign API v2] Raw carousels from AI",
    );
    logger.debug(
      {
        hasPosts: !!campaign.posts,
        postsCount: campaign.posts?.length,
        hasAdCreatives: !!campaign.adCreatives,
        adCreativesCount: campaign.adCreatives?.length,
        hasVideoScripts: !!campaign.videoClipScripts,
        videoScriptsCount: campaign.videoClipScripts?.length,
        hasCarousels: !!campaign.carousels,
        carouselsCount: campaign.carousels?.length,
        hasProductImages: !!productImages?.length,
        productImagesCount: productImages?.length || 0,
        hasInspirationImages: !!inspirationImages?.length,
        inspirationImagesCount: inspirationImages?.length || 0,
        hasCollabLogo: !!collabLogo,
        compositionAssetsCount: compositionAssets?.length || 0,
        toneOverride: toneOfVoiceOverride || null,
      },
      "[Campaign API v2] Campaign structure",
    );

    logger.info({}, "[Campaign API] Campaign generated successfully");

    // Log AI usage
    const inputTokens = prompt.length / 4; // Estimate: ~4 chars per token
    const outputTokens = cleanResult.length / 4;
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/campaign",
      operation: "campaign",
      model,
      inputTokens: Math.round(inputTokens),
      outputTokens: Math.round(outputTokens),
      latencyMs: timer(),
      status: "success",
      metadata: {
        productImagesCount: productImages?.length || 0,
        inspirationImagesCount: inspirationImages?.length || 0,
        hasCollabLogo: !!collabLogo,
        postsCount: campaign.posts?.length || 0,
        videoScriptsCount: campaign.videoClipScripts?.length || 0,
      },
    });

    res.json({
      success: true,
      campaign,
      model,
    });
  } catch (error) {
    logger.error({ err: error }, "[Campaign API] Error");
    // Log failed usage
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/campaign",
      operation: "campaign",
      model: req.body?.brandProfile?.creativeModel || DEFAULT_TEXT_MODEL,
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate campaign" });
  }
});

// AI Flyer Generation
app.post("/api/ai/flyer", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const {
      prompt,
      brandProfile,
      logo,
      referenceImage,
      aspectRatio = "9:16",
      collabLogo: collabLogoSingular,
      collabLogos, // Frontend sends array
      imageSize = "1K",
      compositionAssets,
    } = req.body;

    // Support both singular and array format for collab logos
    const collabLogo =
      collabLogoSingular || (collabLogos && collabLogos[0]) || null;

    if (!prompt || !brandProfile) {
      return res
        .status(400)
        .json({ error: "prompt and brandProfile are required" });
    }

    logger.info(
      {
        aspectRatio,
        hasLogo: !!logo,
        collabLogosCount: collabLogos?.length || 0,
      },
      "[Flyer API] Generating flyer",
    );

    const ai = getGeminiAi();
    const brandingInstruction = buildFlyerPrompt(brandProfile);

    const parts = [
      { text: brandingInstruction },
      { text: `DADOS DO FLYER PARA INSERIR NA ARTE:\n${prompt}` },
    ];

    const jsonPrompt = await convertImagePromptToJson(
      prompt,
      aspectRatio,
      organizationId,
      sql,
    );
    if (jsonPrompt) {
      parts.push({
        text: `JSON ESTRUTURADO (REFERÊNCIA):\n\`\`\`json\n${jsonPrompt}\n\`\`\``,
      });
    }

    // Determine collab logos count for instructions
    const collabLogosCount =
      collabLogos && collabLogos.length > 0
        ? collabLogos.length
        : collabLogo
          ? 1
          : 0;
    const hasCollabLogos = collabLogosCount > 0;

    // Instruções de logo (se fornecido)
    if (logo || hasCollabLogos) {
      let logoInstructions = `
**LOGOS DA MARCA - PRESERVAÇÃO E POSICIONAMENTO:**

PRESERVAÇÃO (INVIOLÁVEL):
- COPIE os logos EXATAMENTE como fornecidos - pixel por pixel
- NÃO redesenhe, NÃO reinterprete, NÃO estilize os logos
- NÃO altere cores, formas, proporções ou tipografia
- NÃO adicione efeitos (brilho, sombra, gradiente, 3D)
- Mantenha bordas nítidas e definidas

POSICIONAMENTO MINIMALISTA:`;

      if (logo && hasCollabLogos) {
        // Collab mode: logos side by side at the bottom like a sponsor bar
        const totalLogos = 1 + collabLogosCount; // main logo + collab logos
        logoInstructions += `
- CRIAR UMA BARRA DE PATROCINADORES na parte INFERIOR da imagem
- Posicione TODOS os logos (${totalLogos}) LADO A LADO horizontalmente nessa barra
- O logo principal fica à ESQUERDA, seguido dos logos parceiros à direita
- A barra deve ter fundo escuro/semi-transparente para contraste
- Tamanho dos logos: pequeno e uniforme (altura ~8-10% da imagem)
- Espaçamento igual entre os logos
- Estilo: clean, profissional, como rodapé de patrocinadores em eventos
- Os logos NÃO devem competir com o conteúdo principal do flyer`;
      } else if (hasCollabLogos && !logo) {
        // Only collab logos, no main logo
        logoInstructions += `
- CRIAR UMA BARRA DE PARCEIROS na parte INFERIOR da imagem
- Posicione os logos LADO A LADO horizontalmente
- Fundo escuro/semi-transparente para contraste
- Tamanho pequeno e uniforme (altura ~8-10% da imagem)
- Espaçamento igual entre os logos`;
      } else {
        logoInstructions += `
- Posicione o logo em um CANTO da imagem (superior ou inferior)
- Use tamanho DISCRETO (10-15% da largura) - como marca d'água profissional
- O logo NÃO deve competir com o conteúdo principal do flyer
- Deixe espaço de respiro entre o logo e as bordas`;
      }

      logoInstructions += `

Os logos devem parecer assinaturas elegantes da marca, não elementos principais.`;

      parts.push({ text: logoInstructions });
    }

    if (logo) {
      parts.push({ text: "LOGO PRINCIPAL DA MARCA (copiar fielmente):" });
      parts.push({
        inlineData: { data: logo.base64, mimeType: logo.mimeType },
      });
    }

    // Support both single collabLogo and array collabLogos
    const allCollabLogos =
      collabLogos && collabLogos.length > 0
        ? collabLogos
        : collabLogo
          ? [collabLogo]
          : [];

    if (allCollabLogos.length > 0) {
      allCollabLogos.forEach((cLogo, index) => {
        if (cLogo && cLogo.base64) {
          const label =
            allCollabLogos.length > 1
              ? `LOGO PARCEIRO ${index + 1} (copiar fielmente):`
              : "LOGO PARCEIRO/COLABORAÇÃO (copiar fielmente):";
          parts.push({ text: label });
          parts.push({
            inlineData: { data: cLogo.base64, mimeType: cLogo.mimeType },
          });
        }
      });
      console.log(
        `[Flyer API] Added ${allCollabLogos.length} collab logo(s) to parts`,
      );
    }

    if (referenceImage) {
      parts.push({
        text: "USE ESTA IMAGEM COMO REFERÊNCIA DE LAYOUT E FONTES:",
      });
      parts.push({
        inlineData: {
          data: referenceImage.base64,
          mimeType: referenceImage.mimeType,
        },
      });
    }

    if (compositionAssets) {
      compositionAssets.forEach((asset, i) => {
        parts.push({ text: `Ativo de composição ${i + 1}:` });
        parts.push({
          inlineData: { data: asset.base64, mimeType: asset.mimeType },
        });
      });
    }

    let imageDataUrl = null;
    let usedProvider = "google";
    let usedModel = DEFAULT_IMAGE_MODEL;

    try {
      // Try Gemini first
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: DEFAULT_IMAGE_MODEL,
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: mapAspectRatio(aspectRatio),
              imageSize,
            },
          },
        }),
      );

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          // Upload to Vercel Blob instead of returning data URL
          console.log("[Flyer API] Uploading Gemini image to Vercel Blob...");
          try {
            const imageBuffer = Buffer.from(part.inlineData.data, "base64");
            const contentType = part.inlineData.mimeType || "image/png";
            const ext = contentType.includes("png") ? "png" : "jpg";
            const filename = `flyer-${Date.now()}.${ext}`;

            const blob = await put(filename, imageBuffer, {
              access: "public",
              contentType,
            });

            imageDataUrl = blob.url;
            console.log("[Flyer API] Uploaded to Vercel Blob:", blob.url);
          } catch (uploadError) {
            console.error(
              "[Flyer API] Failed to upload to Vercel Blob:",
              uploadError.message,
            );
            // Fallback to data URL only if Blob upload fails
            imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
          break;
        }
      }

      if (!imageDataUrl) {
        throw new Error("A IA falhou em produzir o Flyer.");
      }
    } catch (geminiError) {
      // Check if quota/rate limit error - fallback to Replicate
      if (isQuotaOrRateLimitError(geminiError)) {
        logger.info(
          {},
          "[Flyer API] Gemini quota exceeded, trying Replicate fallback",
        );

        // Build text prompt for Replicate (combine all text parts)
        const textPrompt = parts
          .filter((p) => p.text)
          .map((p) => p.text)
          .join("\n\n");

        // Collect image inputs for Replicate
        const imageInputs = parts
          .filter((p) => p.inlineData)
          .map((p) => ({
            base64: p.inlineData.data,
            mimeType: p.inlineData.mimeType,
          }));

        const replicateUrl = await generateImageWithReplicate(
          textPrompt,
          aspectRatio,
          imageSize,
          imageInputs.length > 0 ? imageInputs : undefined,
          undefined,
          undefined,
        );

        logger.info({}, "[Flyer API] Replicate fallback successful");

        // Upload to Vercel Blob (Replicate URLs are temporary)
        logger.info({}, "[Flyer API] Uploading Replicate image to Vercel Blob");
        try {
          const imageResponse = await fetch(replicateUrl);
          if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image: ${imageResponse.status}`);
          }
          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          const contentType =
            imageResponse.headers.get("content-type") || "image/png";
          const ext = contentType.includes("png") ? "png" : "jpg";
          const filename = `flyer-${Date.now()}.${ext}`;

          const blob = await put(filename, imageBuffer, {
            access: "public",
            contentType,
          });

          imageDataUrl = blob.url;
          logger.info({ url: blob.url }, "[Flyer API] Uploaded to Vercel Blob");
        } catch (uploadError) {
          logger.error(
            { err: uploadError },
            "[Flyer API] Failed to upload to Vercel Blob",
          );
          imageDataUrl = replicateUrl; // Use temporary URL as fallback
        }

        usedProvider = "replicate";
        usedModel = "google/nano-banana-pro";
      } else {
        throw geminiError;
      }
    }

    logger.info(
      { provider: usedProvider },
      "[Flyer API] Flyer generated successfully",
    );

    // Log AI usage
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/flyer",
      operation: "flyer",
      model: usedModel,
      provider: usedProvider,
      imageCount: 1,
      imageSize: imageSize || "1K",
      latencyMs: timer(),
      status: "success",
      metadata: {
        aspectRatio,
        hasLogo: !!logo,
        hasReference: !!referenceImage,
        fallbackUsed: usedProvider === "replicate",
      },
    });

    res.json({
      success: true,
      imageUrl: imageDataUrl,
    });
  } catch (error) {
    logger.error({ err: error }, "[Flyer API] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/flyer",
      operation: "flyer",
      model: DEFAULT_IMAGE_MODEL,
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate flyer" });
  }
});

// AI Image Generation
app.post("/api/ai/image", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const {
      prompt,
      brandProfile,
      aspectRatio = "1:1",
      imageSize = "1K",
      productImages,
      styleReferenceImage,
      personReferenceImage,
    } = req.body;
    const model = DEFAULT_IMAGE_MODEL;

    if (!prompt || !brandProfile) {
      return res
        .status(400)
        .json({ error: "prompt and brandProfile are required" });
    }

    logger.info(
      {
        model,
        aspectRatio,
        hasPersonReference: !!personReferenceImage,
        productImagesCount: productImages?.length || 0,
      },
      "[Image API] Generating image",
    );

    // Prepare product images array, including brand logo if available
    let allProductImages = productImages ? [...productImages] : [];

    // Auto-include brand logo as reference if it's an HTTP URL
    // (Frontend handles data URLs, server handles HTTP URLs)
    if (brandProfile.logo && brandProfile.logo.startsWith("http")) {
      try {
        const logoBase64 = await urlToBase64(brandProfile.logo);
        if (logoBase64) {
          logger.debug({}, "[Image API] Including brand logo from HTTP URL");
          // Detect mime type from URL or default to png
          const mimeType = brandProfile.logo.includes(".svg")
            ? "image/svg+xml"
            : brandProfile.logo.includes(".jpg") ||
                brandProfile.logo.includes(".jpeg")
              ? "image/jpeg"
              : "image/png";
          allProductImages.unshift({ base64: logoBase64, mimeType });
        }
      } catch (err) {
        logger.warn(
          { err, brandProfileId: brandProfile.id },
          "Failed to include brand logo in image generation",
        );
      }
    }

    const hasLogo = !!brandProfile.logo && allProductImages.length > 0;
    const hasPersonReference = !!personReferenceImage;
    const jsonPrompt = await convertImagePromptToJson(
      prompt,
      aspectRatio,
      organizationId,
      sql,
    );
    const fullPrompt = buildImagePrompt(
      prompt,
      brandProfile,
      !!styleReferenceImage,
      hasLogo,
      hasPersonReference,
      !!productImages?.length,
      jsonPrompt,
    );

    logger.debug({ prompt: fullPrompt }, "[Image API] Prompt");

    const result = await generateImageWithFallback(
      fullPrompt,
      aspectRatio,
      model,
      imageSize,
      allProductImages.length > 0 ? allProductImages : undefined,
      styleReferenceImage,
      personReferenceImage,
    );

    logger.info(
      { provider: result.usedProvider },
      "[Image API] Image generated successfully",
    );

    // Upload to Vercel Blob for all providers
    let finalImageUrl = result.imageUrl;
    if (result.imageUrl) {
      logger.info(
        {},
        `[Image API] Uploading ${result.usedProvider} image to Vercel Blob`,
      );
      try {
        let imageBuffer;
        let contentType;

        if (result.imageUrl.startsWith("data:")) {
          // Handle data URL (from Gemini)
          const matches = result.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (!matches) {
            throw new Error("Invalid data URL format");
          }
          contentType = matches[1];
          imageBuffer = Buffer.from(matches[2], "base64");
        } else {
          // Handle HTTP URL (from Replicate)
          const imageResponse = await fetch(result.imageUrl);
          if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image: ${imageResponse.status}`);
          }
          imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          contentType =
            imageResponse.headers.get("content-type") || "image/png";
        }

        const ext = contentType.includes("png") ? "png" : "jpg";
        const filename = `generated-${Date.now()}.${ext}`;

        const blob = await put(filename, imageBuffer, {
          access: "public",
          contentType,
        });

        finalImageUrl = blob.url;
        logger.info({ url: blob.url }, "[Image API] Uploaded to Vercel Blob");
      } catch (uploadError) {
        logger.error(
          { err: uploadError },
          "[Image API] Failed to upload to Vercel Blob",
        );
        // Keep using the original URL/data URL as fallback
      }
    }

    // Log AI usage
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/image",
      operation: "image",
      model: result.usedModel,
      provider: result.usedProvider,
      imageCount: 1,
      imageSize: imageSize || "1K",
      latencyMs: timer(),
      status: "success",
      metadata: {
        aspectRatio,
        hasProductImages: !!productImages?.length,
        hasStyleRef: !!styleReferenceImage,
        fallbackUsed: result.usedFallback,
      },
    });

    res.json({
      success: true,
      imageUrl: finalImageUrl,
      model,
    });
  } catch (error) {
    logger.error({ err: error }, "[Image API] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/image",
      operation: "image",
      model: DEFAULT_IMAGE_MODEL,
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate image" });
  }
});

// Convert generic prompt to structured JSON for video generation
app.post("/api/ai/convert-prompt", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const { prompt, duration = 5, aspectRatio = "16:9" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    logger.info(
      { durationSeconds: duration },
      "[Convert Prompt API] Converting prompt to JSON",
    );

    const ai = getGeminiAi();
    const systemPrompt = getVideoPromptSystemPrompt(duration, aspectRatio);

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: DEFAULT_FAST_TEXT_MODEL,
        contents: [
          {
            role: "user",
            parts: [{ text: systemPrompt + "\n\nPrompt: " + prompt }],
          },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      }),
    );

    const text = response.text?.trim() || "";

    // Try to parse as JSON
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      // If not valid JSON, return as-is
      result = text;
    }

    logger.info({}, "[Convert Prompt API] Conversion successful");

    // Log AI usage
    const tokens = extractGeminiTokens(response);
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/convert-prompt",
      operation: "text",
      model: DEFAULT_FAST_TEXT_MODEL,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      latencyMs: timer(),
      status: "success",
    });

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error({ err: error }, "[Convert Prompt API] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/convert-prompt",
      operation: "text",
      model: DEFAULT_FAST_TEXT_MODEL,
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to convert prompt" });
  }
});

// AI Text Generation
app.post("/api/ai/text", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const {
      type,
      brandProfile,
      context,
      systemPrompt,
      userPrompt,
      image,
      temperature = 0.7,
      responseSchema,
    } = req.body;

    if (!brandProfile) {
      return res.status(400).json({ error: "brandProfile is required" });
    }

    logger.info({ type }, "[Text API] Generating text");

    const model = brandProfile.creativeModel || DEFAULT_TEXT_MODEL;
    const isOpenRouter = model.includes("/");

    let result;

    if (type === "quickPost") {
      if (!context) {
        return res
          .status(400)
          .json({ error: "context is required for quickPost" });
      }

      const prompt = buildQuickPostPrompt(brandProfile, context);

      if (isOpenRouter) {
        const parts = [prompt];
        if (image) {
          result = await generateTextWithOpenRouterVision(
            model,
            parts,
            [image],
            temperature,
          );
        } else {
          result = await generateTextWithOpenRouter(
            model,
            "",
            prompt,
            temperature,
          );
        }
      } else {
        const parts = [{ text: prompt }];
        if (image) {
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: image.base64,
            },
          });
        }
        result = await generateStructuredContent(
          model,
          parts,
          quickPostSchema,
          temperature,
        );
      }
    } else {
      if (!systemPrompt && !userPrompt) {
        return res.status(400).json({
          error: "systemPrompt or userPrompt is required for custom text",
        });
      }

      if (isOpenRouter) {
        if (image) {
          const parts = userPrompt ? [userPrompt] : [];
          result = await generateTextWithOpenRouterVision(
            model,
            parts,
            [image],
            temperature,
          );
        } else {
          result = await generateTextWithOpenRouter(
            model,
            systemPrompt || "",
            userPrompt || "",
            temperature,
          );
        }
      } else {
        const parts = [];
        if (userPrompt) {
          parts.push({ text: userPrompt });
        }
        if (image) {
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: image.base64,
            },
          });
        }

        result = await generateStructuredContent(
          model,
          parts,
          responseSchema || quickPostSchema,
          temperature,
        );
      }
    }

    logger.info({}, "[Text API] Text generated successfully");

    // Log AI usage
    const inputTokens = (userPrompt?.length || 0) / 4;
    const outputTokens = result.length / 4;
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/text",
      operation: "text",
      model,
      inputTokens: Math.round(inputTokens),
      outputTokens: Math.round(outputTokens),
      latencyMs: timer(),
      status: "success",
      metadata: { type, hasImage: !!image },
    });

    res.json({
      success: true,
      result: JSON.parse(result),
      model,
    });
  } catch (error) {
    logger.error({ err: error }, "[Text API] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/text",
      operation: "text",
      model: req.body?.brandProfile?.creativeModel || DEFAULT_TEXT_MODEL,
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate text" });
  }
});

// AI Enhance Prompt - Improves user input for better campaign results
app.post("/api/ai/enhance-prompt", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;

  const sql = getSql();

  try {
    const { prompt, brandProfile } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "prompt is required" });
    }

    logger.info({}, "[Enhance Prompt API] Enhancing prompt with Grok");

    const openrouter = getOpenRouter();

    const systemPrompt = `Você é um especialista em marketing digital e criação de conteúdo multiplataforma. Sua função é aprimorar briefings de campanhas para gerar máximo engajamento em TODOS os formatos de conteúdo.

TIPOS DE CONTEÚDO QUE A CAMPANHA PODE GERAR:
1. **Vídeos/Reels**: Conteúdo em vídeo curto para Instagram/TikTok
2. **Posts de Feed**: Imagens estáticas ou carrosséis para Instagram/Facebook
3. **Stories**: Conteúdo efêmero vertical
4. **Anúncios**: Criativos para campanhas pagas

DIRETRIZES DE ENGAJAMENTO (aplicáveis a TODOS os formatos):

**ATENÇÃO IMEDIATA:**
- Para vídeos: Hook visual/auditivo nos primeiros 2 segundos
- Para posts: Headline impactante ou visual que pare o scroll
- Para stories: Elemento interativo ou surpresa inicial

**CURIOSIDADE:**
- Perguntas abertas que o público precisa responder
- Contraste (conhecido vs. desconhecido)
- Premissas intrigantes ou contra-intuitivas

**VALOR PRÁTICO:**
- Dicas concretas que resolvam problemas reais
- Informação útil e acionável
- Transformação clara (antes → depois)

**CONEXÃO EMOCIONAL:**
- Tom autêntico e humanizado
- Storytelling quando apropriado
- Identificação com dores/desejos do público

**CHAMADA PARA AÇÃO:**
- CTA claro e específico
- Senso de urgência quando apropriado
- Próximo passo óbvio

${
  brandProfile
    ? `
CONTEXTO DA MARCA:
- Nome: ${brandProfile.name || "Não especificado"}
- Descrição: ${brandProfile.description || "Não especificado"}
- Tom de Voz: ${brandProfile.toneOfVoice || "Não especificado"}
`
    : ""
}

TAREFA:
Receba o briefing do usuário e transforme-o em um briefing aprimorado que maximize o potencial de engajamento para TODOS os tipos de conteúdo que serão gerados (vídeos, posts e anúncios).

REGRAS:
1. Mantenha a essência e objetivo original do briefing
2. Seja abrangente - o briefing será usado para gerar vídeos E posts estáticos
3. Adicione sugestões de hooks, headlines, e elementos visuais
4. Inclua ideias de CTAs e hashtags relevantes
5. Seja específico e acionável
6. Responda APENAS com o briefing aprimorado, sem explicações
7. Use português brasileiro
8. Mantenha tamanho similar ou ligeiramente maior que o original
9. Use formatação markdown para estruturar (negrito, listas, etc)`;

    const userPrompt = `BRIEFING ORIGINAL:\n${prompt}`;

    const response = await openrouter.chat.send({
      model: "x-ai/grok-4.1-fast",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 2048,
    });

    const enhancedPrompt = response.choices[0]?.message?.content?.trim() || "";

    logger.info(
      {},
      "[Enhance Prompt API] Successfully enhanced prompt with Grok",
    );

    // Log AI usage
    const tokens = extractOpenRouterTokens(response);
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/enhance-prompt",
      operation: "text",
      model: "x-ai/grok-4.1-fast",
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      latencyMs: timer(),
      status: "success",
    });

    res.json({ enhancedPrompt });
  } catch (error) {
    logger.error({ err: error }, "[Enhance Prompt API] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/enhance-prompt",
      operation: "text",
      model: "x-ai/grok-4.1-fast",
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to enhance prompt" });
  }
});

// AI Edit Image
app.post("/api/ai/edit-image", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const { image, prompt, mask, referenceImage } = req.body;

    if (!image || !prompt) {
      return res.status(400).json({ error: "image and prompt are required" });
    }

    logger.info(
      {
        imageSize: image?.base64?.length,
        mimeType: image?.mimeType,
        promptLength: prompt?.length,
        hasMask: !!mask,
        hasReference: !!referenceImage,
      },
      "[Edit Image API] Editing image",
    );

    const ai = getGeminiAi();
    // Usar prompt direto sem adicionar texto extra que pode confundir o modelo
    const instructionPrompt = prompt;

    // Validate and clean base64 data
    let cleanBase64 = image.base64;
    if (cleanBase64.startsWith("data:")) {
      cleanBase64 = cleanBase64.split(",")[1];
    }
    // Check for valid base64
    if (cleanBase64.length % 4 !== 0) {
      logger.debug(
        {},
        "[Edit Image API] Warning: base64 length is not multiple of 4, padding",
      );
      cleanBase64 = cleanBase64.padEnd(
        Math.ceil(cleanBase64.length / 4) * 4,
        "=",
      );
    }

    logger.debug(
      {
        textLength: instructionPrompt.length,
        imageBase64Length: cleanBase64.length,
        mimeType: image.mimeType,
        partsCount: 2 + !!mask + !!referenceImage,
      },
      "[Edit Image API] parts structure",
    );

    const parts = [
      { text: instructionPrompt },
      { inlineData: { data: cleanBase64, mimeType: image.mimeType } },
    ];

    let imageConfig = { imageSize: "1K" };

    if (mask) {
      logger.debug(
        { maskSize: mask.base64?.length },
        "[Edit Image API] Adding mask",
      );
      imageConfig = {
        ...imageConfig,
        mask: {
          image: {
            inlineData: {
              data: mask.base64,
              mimeType: mask.mimeType || "image/png",
            },
          },
        },
      };
    }

    if (referenceImage) {
      parts.push({
        inlineData: {
          data: referenceImage.base64,
          mimeType: referenceImage.mimeType,
        },
      });
    }

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: { parts },
        config: { imageConfig },
      }),
    );

    let imageDataUrl = null;
    const contentParts = response.candidates?.[0]?.content?.parts;
    if (Array.isArray(contentParts)) {
      for (const part of contentParts) {
        if (part.inlineData) {
          imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageDataUrl) {
      logger.debug(
        { response: JSON.stringify(response, null, 2).substring(0, 1000) },
        "[Edit Image API] Empty response",
      );
      throw new Error("Failed to edit image - API returned empty response");
    }

    logger.info({}, "[Edit Image API] Image edited successfully");

    // Log AI usage
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/edit-image",
      operation: "edit_image",
      model: "gemini-3-pro-image-preview",
      imageCount: 1,
      imageSize: "1K",
      latencyMs: timer(),
      status: "success",
      metadata: { hasMask: !!mask, hasReference: !!referenceImage },
    });

    res.json({
      success: true,
      imageUrl: imageDataUrl,
    });
  } catch (error) {
    logger.error({ err: error }, "[Edit Image API] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/edit-image",
      operation: "edit_image",
      model: "gemini-3-pro-image-preview",
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to edit image" });
  }
});

// AI Extract Colors from Logo
app.post("/api/ai/extract-colors", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const { logo } = req.body;

    if (!logo) {
      return res.status(400).json({ error: "logo is required" });
    }

    logger.info({}, "[Extract Colors API] Analyzing logo");

    const ai = getGeminiAi();

    const colorSchema = {
      type: Type.OBJECT,
      properties: {
        primaryColor: { type: Type.STRING },
        secondaryColor: { type: Type.STRING, nullable: true },
        tertiaryColor: { type: Type.STRING, nullable: true },
      },
      required: ["primaryColor"],
    };

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: DEFAULT_TEXT_MODEL,
        contents: {
          parts: [
            {
              text: `Analise este logo e extraia APENAS as cores que REALMENTE existem na imagem visível.

REGRAS IMPORTANTES:
- Extraia somente cores que você pode ver nos pixels da imagem
- NÃO invente cores que não existem
- Ignore áreas transparentes (não conte transparência como cor)
- Se o logo tiver apenas 1 cor visível, retorne null para secondaryColor e tertiaryColor
- Se o logo tiver apenas 2 cores visíveis, retorne null para tertiaryColor

PRIORIDADE DAS CORES:
- primaryColor: A cor mais dominante/presente no logo (maior área)
- secondaryColor: A segunda cor mais presente (se existir), ou null
- tertiaryColor: Uma terceira cor de destaque/acento (se existir), ou null

Retorne as cores em formato hexadecimal (#RRGGBB).`,
            },
            { inlineData: { mimeType: logo.mimeType, data: logo.base64 } },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: colorSchema,
        },
      }),
    );

    const colors = JSON.parse(response.text.trim());

    logger.info({ colors }, "[Extract Colors API] Colors extracted");

    // Log AI usage
    const tokens = extractGeminiTokens(response);
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/extract-colors",
      operation: "text",
      model: DEFAULT_TEXT_MODEL,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      latencyMs: timer(),
      status: "success",
    });

    res.json(colors);
  } catch (error) {
    logger.error({ err: error }, "[Extract Colors API] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/extract-colors",
      operation: "text",
      model: DEFAULT_TEXT_MODEL,
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to extract colors" });
  }
});

// AI Speech Generation (TTS)
app.post("/api/ai/speech", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const { script, voiceName = "Orus" } = req.body;

    if (!script) {
      return res.status(400).json({ error: "script is required" });
    }

    logger.info({}, "[Speech API] Generating speech");

    const ai = getGeminiAi();

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: script }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
        },
      }),
    );

    const audioBase64 =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";

    if (!audioBase64) {
      throw new Error("Failed to generate speech");
    }

    logger.info({}, "[Speech API] Speech generated successfully");

    // Log AI usage - TTS is priced per character
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/speech",
      operation: "speech",
      model: "gemini-2.5-flash-preview-tts",
      characterCount: script.length,
      latencyMs: timer(),
      status: "success",
      metadata: { voiceName },
    });

    res.json({
      success: true,
      audioBase64,
    });
  } catch (error) {
    logger.error({ err: error }, "[Speech API] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/speech",
      operation: "speech",
      model: "gemini-2.5-flash-preview-tts",
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate speech" });
  }
});

// ============================================================================
// NEW: Vercel AI SDK Chat Endpoint (Feature Flag)
// ============================================================================
app.post("/api/chat", requireAuthWithAiRateLimit, async (req, res) => {
  // Feature flag: only enable if VITE_USE_VERCEL_AI_SDK=true
  if (process.env.VITE_USE_VERCEL_AI_SDK !== "true") {
    return res.status(404).json({ error: "Endpoint not available" });
  }

  return chatHandler(req, res);
});

// ============================================================================
// AI Assistant Streaming Endpoint (Legacy - will be deprecated)
// ============================================================================
app.post("/api/ai/assistant", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const { history, brandProfile } = req.body;

    if (!history) {
      return res.status(400).json({ error: "history is required" });
    }

    logger.info({}, "[Assistant API] Starting streaming conversation");

    const ai = getGeminiAi();
    const sanitizedHistory = history
      .map((message) => {
        const parts = (message.parts || []).filter(
          (part) => part.text || part.inlineData,
        );
        if (!parts.length) return null;
        return { ...message, parts };
      })
      .filter(Boolean);

    const assistantTools = {
      functionDeclarations: [
        {
          name: "create_image",
          description: "Gera uma nova imagem de marketing do zero.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: "Descrição técnica detalhada para a IA de imagem.",
              },
              aspect_ratio: {
                type: Type.STRING,
                enum: ["1:1", "9:16", "16:9"],
                description: "Proporção da imagem.",
              },
            },
            required: ["description"],
          },
        },
        {
          name: "edit_referenced_image",
          description: "Edita a imagem atualmente em foco.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              prompt: {
                type: Type.STRING,
                description: "Descrição exata da alteração desejada.",
              },
            },
            required: ["prompt"],
          },
        },
        {
          name: "create_brand_logo",
          description: "Cria um novo logo para a marca.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              prompt: { type: Type.STRING, description: "Descrição do logo." },
            },
            required: ["prompt"],
          },
        },
      ],
    };

    const systemInstruction = `Você é o Diretor de Criação Sênior da DirectorAi. Especialista em Branding e Design de alta performance.

SUAS CAPACIDADES CORE:
1. CRIAÇÃO E ITERAÇÃO: Crie imagens do zero e continue editando-as até o usuário aprovar.
2. REFERÊNCIAS: Use imagens de referência enviadas no chat para guiar o estilo das suas criações.
3. BRANDING: Você conhece a marca: ${JSON.stringify(brandProfile)}. Sempre use a paleta de cores e o tom de voz oficial.

Sempre descreva o seu raciocínio criativo antes de executar uma ferramenta.`;

    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await ai.models.generateContentStream({
      model: DEFAULT_ASSISTANT_MODEL,
      contents: sanitizedHistory,
      config: {
        systemInstruction,
        tools: [assistantTools],
        temperature: 0.5,
      },
    });

    for await (const chunk of stream) {
      const text = chunk.text || "";
      const functionCall = chunk.candidates?.[0]?.content?.parts?.find(
        (p) => p.functionCall,
      )?.functionCall;

      const data = { text };
      if (functionCall) {
        data.functionCall = functionCall;
      }

      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();

    logger.info({}, "[Assistant API] Streaming completed");

    // Log AI usage - estimate tokens based on history length
    const inputTokens = JSON.stringify(sanitizedHistory).length / 4;
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/assistant",
      operation: "text",
      model: DEFAULT_ASSISTANT_MODEL,
      inputTokens: Math.round(inputTokens),
      latencyMs: timer(),
      status: "success",
      metadata: { historyLength: sanitizedHistory.length },
    }).catch(() => {});
  } catch (error) {
    logger.error({ err: error }, "[Assistant API] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/assistant",
      operation: "text",
      model: DEFAULT_ASSISTANT_MODEL,
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ error: error.message || "Failed to run assistant" });
    }
    res.end();
  }
});

// ============================================================================
// AI VIDEO GENERATION API (Google Veo + FAL.ai fallback)
// Server-side video generation - tries Google API first, falls back to FAL.ai
// ============================================================================

const configureFal = () => {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error("FAL_KEY environment variable is not configured");
  }
  fal.config({ credentials: apiKey });
};

// Generate video using Google Veo API directly
// Nota: Google Veo SDK não suporta duration nem generateAudio
// lastFrameUrl enables first/last frame interpolation mode (requires durationSeconds: 8)
async function generateVideoWithGoogleVeo(
  prompt,
  aspectRatio,
  imageUrl,
  lastFrameUrl = null,
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const ai = new GoogleGenAI({ apiKey });
  const isHttpUrl = imageUrl && imageUrl.startsWith("http");
  const isDataUrl = imageUrl && imageUrl.startsWith("data:");
  const hasImage = isHttpUrl || isDataUrl;
  const hasLastFrame = lastFrameUrl && lastFrameUrl.startsWith("http");
  const mode = hasLastFrame
    ? "first-last-frame"
    : hasImage
      ? "image-to-video"
      : "text-to-video";

  logExternalAPI("Google Veo", `Veo 3.1 ${mode}`, `720p | ${aspectRatio}`);
  const startTime = Date.now();

  // Build request parameters according to SDK specs
  const generateParams = {
    model: "veo-3.1-fast-generate-preview",
    prompt,
    config: {
      numberOfVideos: 1,
      resolution: "720p",
      aspectRatio,
      // First/last frame interpolation requires 8 seconds duration
      ...(hasLastFrame && { durationSeconds: 8 }),
      // Required for person generation in interpolation mode
      ...(hasLastFrame && { personGeneration: "allow_adult" }),
    },
  };

  // Add first frame (image) for image-to-video or interpolation mode
  if (isHttpUrl) {
    const imageResponse = await fetch(imageUrl);
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");
    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";

    generateParams.image = {
      imageBytes: imageBase64,
      mimeType: contentType,
    };
  } else if (isDataUrl) {
    // Parse data URL: data:image/png;base64,<base64data>
    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      const [, mimeType, base64Data] = matches;
      generateParams.image = {
        imageBytes: base64Data,
        mimeType: mimeType,
      };
    }
  }

  // Add last frame for interpolation mode
  if (hasLastFrame) {
    const lastFrameResponse = await fetch(lastFrameUrl);
    const lastFrameArrayBuffer = await lastFrameResponse.arrayBuffer();
    const lastFrameBase64 =
      Buffer.from(lastFrameArrayBuffer).toString("base64");
    const lastFrameContentType =
      lastFrameResponse.headers.get("content-type") || "image/jpeg";

    generateParams.lastFrame = {
      imageBytes: lastFrameBase64,
      mimeType: lastFrameContentType,
    };
  }

  // Start video generation (async operation)
  let operation = await ai.models.generateVideos(generateParams);

  // Poll for completion (max 5 minutes)
  const maxWaitTime = 5 * 60 * 1000;
  const pollInterval = 10000;
  const startPoll = Date.now();

  while (!operation.done) {
    if (Date.now() - startPoll > maxWaitTime) {
      throw new Error("Video generation timed out after 5 minutes");
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  logExternalAPIResult("Google Veo", `Veo 3.1 ${mode}`, Date.now() - startTime);

  // Get video URL from response
  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
    throw new Error("No videos generated by Google Veo");
  }

  const videoUri = generatedVideos[0].video?.uri;
  if (!videoUri) {
    throw new Error("Invalid video response from Google Veo");
  }

  // Append API key to download the video
  const videoUrl = `${videoUri}&key=${apiKey}`;
  return videoUrl;
}

// Generate video using FAL.ai (fallback)
async function generateVideoWithFal(
  prompt,
  aspectRatio,
  model,
  imageUrl,
  sceneDuration,
  generateAudio = true,
) {
  configureFal();

  const isHttpUrl = imageUrl && imageUrl.startsWith("http");
  const mode = isHttpUrl ? "image-to-video" : "text-to-video";

  if (model === "sora-2") {
    // Sora 2 - always use 12 seconds for best quality
    const duration = 12;
    const endpoint = isHttpUrl
      ? "fal-ai/sora-2/image-to-video"
      : "fal-ai/sora-2/text-to-video";

    logExternalAPI("Fal.ai", `Sora 2 ${mode}`, `${duration}s | ${aspectRatio}`);
    const startTime = Date.now();

    let result;

    if (isHttpUrl) {
      result = await fal.subscribe(endpoint, {
        input: {
          prompt,
          image_url: imageUrl,
          resolution: "720p",
          aspect_ratio: aspectRatio,
          duration,
          delete_video: false,
        },
        logs: true,
      });
    } else {
      result = await fal.subscribe(endpoint, {
        input: {
          prompt,
          resolution: "720p",
          aspect_ratio: aspectRatio,
          duration,
          delete_video: false,
        },
        logs: true,
      });
    }

    logExternalAPIResult("Fal.ai", `Sora 2 ${mode}`, Date.now() - startTime);
    return result?.data?.video?.url || result?.video?.url || "";
  } else {
    // Veo 3.1 Fast via FAL.ai
    const duration =
      sceneDuration && sceneDuration <= 4
        ? "4s"
        : sceneDuration && sceneDuration <= 6
          ? "6s"
          : "8s";
    const endpoint = isHttpUrl
      ? "fal-ai/veo3.1/fast/image-to-video"
      : "fal-ai/veo3.1/fast";

    logExternalAPI("Fal.ai", `Veo 3.1 ${mode}`, `${duration} | ${aspectRatio}`);
    const startTime = Date.now();

    let result;

    if (isHttpUrl) {
      result = await fal.subscribe(endpoint, {
        input: {
          prompt,
          image_url: imageUrl,
          aspect_ratio: aspectRatio,
          duration,
          resolution: "720p",
          generate_audio: generateAudio,
        },
        logs: true,
      });
    } else {
      result = await fal.subscribe(endpoint, {
        input: {
          prompt,
          aspect_ratio: aspectRatio,
          duration,
          resolution: "720p",
          generate_audio: generateAudio,
          auto_fix: true,
        },
        logs: true,
      });
    }

    logExternalAPIResult("Fal.ai", `Veo 3.1 ${mode}`, Date.now() - startTime);
    return result?.data?.video?.url || result?.video?.url || "";
  }
}

app.post("/api/ai/video", async (req, res) => {
  const timer = createTimer();
  const auth = getAuth(req);
  const organizationId = auth?.orgId || null;
  const sql = getSql();

  try {
    const {
      prompt,
      aspectRatio,
      model,
      imageUrl,
      lastFrameUrl,
      sceneDuration,
      generateAudio = true,
      useInterpolation = false,
    } = req.body;

    if (!prompt || !aspectRatio || !model) {
      return res.status(400).json({
        error: "Missing required fields: prompt, aspectRatio, model",
      });
    }

    const isInterpolationMode = useInterpolation && lastFrameUrl;
    logger.info(
      {
        model,
        generateAudio,
        isInterpolation: isInterpolationMode,
      },
      "[Video API] Generating video",
    );

    let videoUrl;
    let usedProvider = "google";

    // For Veo 3.1, use Google API only (no fallback).
    if (model === "veo-3.1" || model === "veo-3.1-fast-generate-preview") {
      videoUrl = await generateVideoWithGoogleVeo(
        prompt,
        aspectRatio,
        imageUrl,
        isInterpolationMode ? lastFrameUrl : null,
      );
    } else {
      // For Sora-2 or other models, use FAL.ai directly.
      usedProvider = "fal.ai";
      videoUrl = await generateVideoWithFal(
        prompt,
        aspectRatio,
        model,
        imageUrl,
        sceneDuration,
        generateAudio,
      );
    }

    if (!videoUrl) {
      throw new Error("Failed to generate video - invalid response");
    }

    // Download video and upload to Vercel Blob for permanent storage
    logExternalAPI(
      "Vercel Blob",
      "Upload video",
      `${model} (via ${usedProvider})`,
    );
    const uploadStart = Date.now();

    const videoResponse = await fetch(videoUrl);
    const videoBlob = await videoResponse.blob();

    const filename = `${model}-video-${Date.now()}.mp4`;
    const blob = await put(filename, videoBlob, {
      access: "public",
      contentType: "video/mp4",
    });

    logExternalAPIResult(
      "Vercel Blob",
      "Upload video",
      Date.now() - uploadStart,
    );

    // Log AI usage - video is priced per second
    const durationSeconds = sceneDuration || 5; // Default 5 seconds
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/video",
      operation: "video",
      model: model.includes("veo") ? "veo-3.1-fast" : model,
      videoDurationSeconds: durationSeconds,
      latencyMs: timer(),
      status: "success",
      metadata: {
        aspectRatio,
        provider: usedProvider,
        hasImageUrl: !!imageUrl,
        isInterpolation: isInterpolationMode,
      },
    });

    return res.status(200).json({
      success: true,
      url: blob.url,
      model,
      provider: usedProvider,
    });
  } catch (error) {
    logError("Video API", error);
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/video",
      operation: "video",
      model: req.body?.model || "veo-3.1-fast",
      latencyMs: timer(),
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    }).catch(() => {});
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to generate video",
    });
  }
});

// ============================================================================
// INSTAGRAM ACCOUNTS API (Multi-tenant Rube MCP)
// ============================================================================

const RUBE_MCP_URL = "https://rube.app/mcp";

// Validate Rube token by calling Instagram API
async function validateRubeToken(rubeToken) {
  try {
    const request = {
      jsonrpc: "2.0",
      id: `validate_${Date.now()}`,
      method: "tools/call",
      params: {
        name: "RUBE_MULTI_EXECUTE_TOOL",
        arguments: {
          tools: [
            {
              tool_slug: "INSTAGRAM_GET_USER_INFO",
              arguments: { fields: "id,username" },
            },
          ],
          sync_response_to_workbench: false,
          memory: {},
          session_id: "validate",
          thought: "Validating Instagram connection",
        },
      },
    };

    logger.info({}, "[Instagram] Validating token with Rube MCP");
    const response = await fetch(RUBE_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${rubeToken}`,
      },
      body: JSON.stringify(request),
    });

    const text = await response.text();
    logger.debug(
      { status: response.status },
      "[Instagram] Rube response status",
    );
    logger.debug(
      { responsePreview: text.substring(0, 500) },
      "[Instagram] Rube response (first 500 chars)",
    );

    if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
      return {
        success: false,
        error: "Token inválido ou expirado. Gere um novo token no Rube.",
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: `Erro ao validar token (${response.status})`,
      };
    }

    // Parse SSE response
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const json = JSON.parse(line.substring(6));
          logger.debug(
            { data: JSON.stringify(json, null, 2).substring(0, 500) },
            "[Instagram] Parsed SSE data",
          );
          if (json?.error) {
            return {
              success: false,
              error: "Instagram não conectado no Rube.",
            };
          }
          const nestedData = json?.result?.content?.[0]?.text;
          if (nestedData) {
            const parsed = JSON.parse(nestedData);
            logger.debug(
              { nestedData: JSON.stringify(parsed, null, 2).substring(0, 500) },
              "[Instagram] Nested data",
            );
            if (parsed?.error || parsed?.data?.error) {
              return {
                success: false,
                error: "Instagram não conectado no Rube.",
              };
            }
            const results =
              parsed?.data?.data?.results || parsed?.data?.results;
            if (results && results.length > 0) {
              const userData = results[0]?.response?.data;
              if (userData?.id) {
                logger.debug(
                  { username: userData.username, id: userData.id },
                  "[Instagram] Found user",
                );
                return {
                  success: true,
                  instagramUserId: String(userData.id),
                  instagramUsername: userData.username || "unknown",
                };
              }
            }
          }
        } catch (e) {
          logger.error({ err: e }, "[Instagram] Parse error");
        }
      }
    }
    return { success: false, error: "Instagram não conectado no Rube." };
  } catch (error) {
    logger.error({ err: error }, "[Instagram] Validation error");
    return { success: false, error: error.message || "Erro ao validar token" };
  }
}

// GET - List Instagram accounts
app.get("/api/db/instagram-accounts", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, id } = req.query;

    if (id) {
      const result = await sql`
        SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
               is_active, connected_at, last_used_at, created_at, updated_at
        FROM instagram_accounts WHERE id = ${id}
      `;
      return res.json(result[0] || null);
    }

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // user_id can be either DB UUID or Clerk ID - try both
    let resolvedUserId = user_id;

    // Check if it's a Clerk ID (starts with 'user_')
    if (user_id.startsWith("user_")) {
      const userResult =
        await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
      resolvedUserId = userResult[0]?.id;
      if (!resolvedUserId) {
        logger.debug(
          { clerk_user_id: user_id },
          "[Instagram] User not found for Clerk ID",
        );
        return res.json([]);
      }
    } else {
      // Assume it's a DB UUID - verify it exists
      const userResult =
        await sql`SELECT id FROM users WHERE id = ${user_id} LIMIT 1`;
      if (userResult.length === 0) {
        logger.debug({ user_id }, "[Instagram] User not found for DB UUID");
        return res.json([]);
      }
    }
    logger.debug({ resolvedUserId }, "[Instagram] Resolved user ID");

    const result = organization_id
      ? await sql`
          SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                 is_active, connected_at, last_used_at, created_at, updated_at
          FROM instagram_accounts
          WHERE organization_id = ${organization_id} AND is_active = TRUE
          ORDER BY connected_at DESC
        `
      : await sql`
          SELECT id, user_id, organization_id, instagram_user_id, instagram_username,
                 is_active, connected_at, last_used_at, created_at, updated_at
          FROM instagram_accounts
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND is_active = TRUE
          ORDER BY connected_at DESC
        `;

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "[Instagram Accounts API] Error");
    res.status(500).json({ error: error.message });
  }
});

// POST - Connect new Instagram account
app.post("/api/db/instagram-accounts", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, rube_token } = req.body;

    logger.debug(
      {
        user_id,
        organization_id,
        hasToken: !!rube_token,
      },
      "[Instagram] POST request",
    );

    if (!user_id || !rube_token) {
      return res
        .status(400)
        .json({ error: "user_id and rube_token are required" });
    }

    // user_id can be either DB UUID or Clerk ID - try both
    let resolvedUserId = user_id;

    if (user_id.startsWith("user_")) {
      const userResult =
        await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
      resolvedUserId = userResult[0]?.id;
      if (!resolvedUserId) {
        logger.debug(
          { clerk_user_id: user_id },
          "[Instagram] User not found for Clerk ID",
        );
        return res.status(400).json({ error: "User not found" });
      }
    } else {
      const userResult =
        await sql`SELECT id FROM users WHERE id = ${user_id} LIMIT 1`;
      if (userResult.length === 0) {
        logger.debug({ user_id }, "[Instagram] User not found for DB UUID");
        return res.status(400).json({ error: "User not found" });
      }
    }
    logger.debug({ resolvedUserId }, "[Instagram] Resolved user ID");

    // Validate the Rube token
    const validation = await validateRubeToken(rube_token);
    logger.debug({ validation }, "[Instagram] Validation result");
    if (!validation.success) {
      return res
        .status(400)
        .json({ error: validation.error || "Token inválido" });
    }

    const { instagramUserId, instagramUsername } = validation;

    // Check if already connected
    const existing = await sql`
      SELECT id FROM instagram_accounts
      WHERE user_id = ${resolvedUserId} AND instagram_user_id = ${instagramUserId}
    `;

    if (existing.length > 0) {
      // Update existing
      const result = await sql`
        UPDATE instagram_accounts
        SET rube_token = ${rube_token}, instagram_username = ${instagramUsername},
            is_active = TRUE, connected_at = NOW(), updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                  is_active, connected_at, last_used_at, created_at, updated_at
      `;
      return res.json({
        success: true,
        account: result[0],
        message: "Conta reconectada!",
      });
    }

    // Create new
    const result = await sql`
      INSERT INTO instagram_accounts (user_id, organization_id, instagram_user_id, instagram_username, rube_token)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${instagramUserId}, ${instagramUsername}, ${rube_token})
      RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                is_active, connected_at, last_used_at, created_at, updated_at
    `;

    res.status(201).json({
      success: true,
      account: result[0],
      message: `Conta @${instagramUsername} conectada!`,
    });
  } catch (error) {
    logger.error({ err: error }, "[Instagram Accounts API] Error");
    res.status(500).json({ error: error.message });
  }
});

// PUT - Update Instagram account token
app.put("/api/db/instagram-accounts", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { rube_token } = req.body;

    if (!id || !rube_token) {
      return res.status(400).json({ error: "id and rube_token are required" });
    }

    const validation = await validateRubeToken(rube_token);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }

    const result = await sql`
      UPDATE instagram_accounts
      SET rube_token = ${rube_token}, instagram_username = ${validation.instagramUsername},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, user_id, organization_id, instagram_user_id, instagram_username,
                is_active, connected_at, last_used_at, created_at, updated_at
    `;

    res.json({
      success: true,
      account: result[0],
      message: "Token atualizado!",
    });
  } catch (error) {
    logger.error({ err: error }, "[Instagram Accounts API] Error");
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Disconnect Instagram account (soft delete)
app.delete("/api/db/instagram-accounts", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    await sql`UPDATE instagram_accounts SET is_active = FALSE, updated_at = NOW() WHERE id = ${id}`;
    res.json({ success: true, message: "Conta desconectada." });
  } catch (error) {
    logger.error({ err: error }, "[Instagram Accounts API] Error");
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// RUBE MCP PROXY - For Instagram Publishing (multi-tenant)
// ============================================================================

// RUBE_MCP_URL already defined above

app.post("/api/rube", async (req, res) => {
  try {
    const sql = getSql();
    const { instagram_account_id, user_id, organization_id, ...mcpRequest } =
      req.body;

    let token;
    let instagramUserId;

    // Multi-tenant mode: use user's token from database
    if (instagram_account_id && user_id) {
      logger.debug(
        { instagram_account_id, organization_id },
        "[Rube Proxy] Multi-tenant mode - fetching token for account",
      );

      // Resolve user_id: can be DB UUID or Clerk ID
      let resolvedUserId = user_id;
      if (user_id.startsWith("user_")) {
        const userResult =
          await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
        resolvedUserId = userResult[0]?.id;
        if (!resolvedUserId) {
          logger.debug(
            { clerk_user_id: user_id },
            "[Rube Proxy] User not found for Clerk ID",
          );
          return res.status(400).json({ error: "User not found" });
        }
        logger.debug(
          { resolvedUserId },
          "[Rube Proxy] Resolved Clerk ID to DB UUID",
        );
      }

      // Fetch account token and instagram_user_id
      // Check both personal accounts (user_id match) and organization accounts (org_id match)
      const accountResult = organization_id
        ? await sql`
            SELECT rube_token, instagram_user_id FROM instagram_accounts
            WHERE id = ${instagram_account_id}
              AND (
                (organization_id = ${organization_id} AND is_active = TRUE)
                OR (user_id = ${resolvedUserId} AND is_active = TRUE)
              )
            LIMIT 1
          `
        : await sql`
            SELECT rube_token, instagram_user_id FROM instagram_accounts
            WHERE id = ${instagram_account_id} AND user_id = ${resolvedUserId} AND is_active = TRUE
            LIMIT 1
          `;

      if (accountResult.length === 0) {
        logger.debug(
          {},
          "[Rube Proxy] Instagram account not found or not active for user/org",
        );
        return res
          .status(403)
          .json({ error: "Instagram account not found or inactive" });
      }

      token = accountResult[0].rube_token;
      instagramUserId = accountResult[0].instagram_user_id;
      logger.debug(
        { instagramUserId },
        "[Rube Proxy] Using token for Instagram user",
      );

      // Update last_used_at
      await sql`UPDATE instagram_accounts SET last_used_at = NOW() WHERE id = ${instagram_account_id}`;
    } else {
      // Fallback to global token (dev mode)
      token = process.env.RUBE_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "RUBE_TOKEN not configured" });
      }
      logger.debug({}, "[Rube Proxy] Using global RUBE_TOKEN (dev mode)");
    }

    // Inject ig_user_id into tool arguments if we have it
    if (instagramUserId && mcpRequest.params?.arguments) {
      // For RUBE_MULTI_EXECUTE_TOOL, inject into each tool's arguments
      if (
        mcpRequest.params.arguments.tools &&
        Array.isArray(mcpRequest.params.arguments.tools)
      ) {
        mcpRequest.params.arguments.tools.forEach((tool) => {
          if (tool.arguments) {
            tool.arguments.ig_user_id = instagramUserId;
          }
        });
        logger.debug(
          { toolsCount: mcpRequest.params.arguments.tools.length },
          "[Rube Proxy] Injected ig_user_id into tools",
        );
      } else {
        // For direct tool calls
        mcpRequest.params.arguments.ig_user_id = instagramUserId;
        logger.debug({}, "[Rube Proxy] Injected ig_user_id directly");
      }
    }

    logger.debug(
      { methodName: mcpRequest.params?.name },
      "[Rube Proxy] Calling Rube MCP",
    );

    const response = await fetch(RUBE_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(mcpRequest),
    });

    const text = await response.text();
    logger.debug({ status: response.status }, "[Rube Proxy] Response status");
    res.status(response.status).send(text);
  } catch (error) {
    logger.error({ err: error }, "[Rube Proxy] Error");
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// =============================================================================
// IMAGE PLAYGROUND ENDPOINTS
// =============================================================================

// Get all topics
app.get("/api/image-playground/topics", async (req, res) => {
  try {
    const { userId, orgId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const sql = getSql();
    const resolvedUserId = await resolveUserId(sql, userId);
    const topics = await getTopics(sql, resolvedUserId, orgId);

    res.json({ topics });
  } catch (error) {
    logger.error({ err: error }, "[ImagePlayground] Get topics error");
    res.status(500).json({ error: error.message });
  }
});

// Create topic
app.post("/api/image-playground/topics", async (req, res) => {
  try {
    const { userId, orgId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { title } = req.body;
    const sql = getSql();
    const resolvedUserId = await resolveUserId(sql, userId);
    const topic = await createTopic(sql, resolvedUserId, orgId, title);

    res.json({ success: true, topic });
  } catch (error) {
    logger.error({ err: error }, "[ImagePlayground] Create topic error");
    res.status(500).json({ error: error.message });
  }
});

// Update topic
app.patch("/api/image-playground/topics/:id", async (req, res) => {
  try {
    const { userId, orgId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { title, coverUrl } = req.body;
    const sql = getSql();
    const resolvedUserId = await resolveUserId(sql, userId);
    const topic = await updateTopic(
      sql,
      id,
      resolvedUserId,
      { title, coverUrl },
      orgId,
    );

    res.json({ success: true, topic });
  } catch (error) {
    logger.error({ err: error }, "[ImagePlayground] Update topic error");
    res.status(500).json({ error: error.message });
  }
});

// Delete topic
app.delete("/api/image-playground/topics/:id", async (req, res) => {
  try {
    const { userId, orgId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const sql = getSql();
    const resolvedUserId = await resolveUserId(sql, userId);
    await deleteTopic(sql, id, resolvedUserId, orgId);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[ImagePlayground] Delete topic error");
    res.status(500).json({ error: error.message });
  }
});

// Get batches for topic
app.get("/api/image-playground/batches", async (req, res) => {
  try {
    const { userId, orgId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { topicId } = req.query;
    if (!topicId) return res.status(400).json({ error: "topicId required" });

    const sql = getSql();
    const resolvedUserId = await resolveUserId(sql, userId);
    const batches = await getBatches(sql, topicId, resolvedUserId, orgId);

    res.json({ batches });
  } catch (error) {
    logger.error({ err: error }, "[ImagePlayground] Get batches error");
    res.status(500).json({ error: error.message });
  }
});

// Delete batch
app.delete("/api/image-playground/batches/:id", async (req, res) => {
  try {
    const { userId, orgId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const sql = getSql();
    const resolvedUserId = await resolveUserId(sql, userId);
    await deleteBatch(sql, id, resolvedUserId, orgId);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[ImagePlayground] Delete batch error");
    res.status(500).json({ error: error.message });
  }
});

// Create image generation
app.post("/api/image-playground/generate", async (req, res) => {
  try {
    const { userId, orgId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { topicId, provider, model, imageNum, params } = req.body;
    if (!topicId || !provider || !model || !params?.prompt) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const sql = getSql();
    const resolvedUserId = await resolveUserId(sql, userId);

    // Enhanced params to pass to helper
    let enhancedParams = { ...params };

    // If useBrandProfile is enabled, use SAME logic as /api/ai/image
    if (params.useBrandProfile) {
      const isOrgContext = !!orgId;
      const brandProfileResult = isOrgContext
        ? await sql`SELECT * FROM brand_profiles WHERE organization_id = ${orgId} AND deleted_at IS NULL LIMIT 1`
        : await sql`SELECT * FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`;

      const brandProfile = brandProfileResult[0];
      if (brandProfile) {
        // Map DB columns to expected format (same as /api/ai/image)
        const mappedBrandProfile = {
          name: brandProfile.name,
          description: brandProfile.description,
          logo: brandProfile.logo_url,
          primaryColor: brandProfile.primary_color,
          secondaryColor: brandProfile.secondary_color,
          toneOfVoice: brandProfile.tone_of_voice,
          toneTargets: brandProfile.settings?.toneTargets || [
            "campaigns",
            "posts",
            "images",
            "flyers",
          ],
        };

        // 1. Prepare productImages with logo (same as /api/ai/image)
        let productImages = [];
        if (
          mappedBrandProfile.logo &&
          mappedBrandProfile.logo.startsWith("http")
        ) {
          try {
            const logoBase64 = await urlToBase64(mappedBrandProfile.logo);
            if (logoBase64) {
              logger.debug(
                {},
                "[ImagePlayground] Including brand logo from HTTP URL",
              );
              const mimeType = mappedBrandProfile.logo.includes(".svg")
                ? "image/svg+xml"
                : mappedBrandProfile.logo.includes(".jpg") ||
                    mappedBrandProfile.logo.includes(".jpeg")
                  ? "image/jpeg"
                  : "image/png";
              productImages.push({ base64: logoBase64, mimeType });
            }
          } catch (err) {
            logger.warn(
              { err, brandProfileId: mappedBrandProfile.id },
              "Failed to include brand logo in image playground",
            );
          }
        }

        // 2. Convert prompt to JSON structured format (same as /api/ai/image)
        const jsonPrompt = await convertImagePromptToJson(
          params.prompt,
          params.aspectRatio || "1:1",
          orgId,
          sql,
        );

        // 3. Build full prompt using buildImagePrompt (same as /api/ai/image)
        const hasLogo = productImages.length > 0;
        const fullPrompt = buildImagePrompt(
          params.prompt,
          mappedBrandProfile,
          false, // hasStyleReference
          hasLogo,
          false, // hasPersonReference
          false, // hasProductImages (beyond logo)
          jsonPrompt,
        );

        logger.debug(
          { prompt: fullPrompt },
          "[ImagePlayground] Brand profile prompt",
        );

        // 4. Update enhanced params with full prompt and product images
        enhancedParams = {
          ...params,
          prompt: fullPrompt,
          productImages: productImages.length > 0 ? productImages : undefined,
          brandProfile: mappedBrandProfile,
        };

        logger.debug(
          { brandProfileName: mappedBrandProfile.name, hasLogo },
          "[ImagePlayground] Brand profile applied",
        );
      }
    }

    // Initialize Gemini
    const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const result = await createImageBatch(
      sql,
      {
        topicId,
        provider,
        model,
        imageNum: imageNum || 1,
        params: enhancedParams,
      },
      resolvedUserId,
      orgId,
      genai,
    );

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ err: error }, "[ImagePlayground] Generate error");
    res.status(500).json({ error: error.message });
  }
});

// Get generation status (for polling)
app.get("/api/image-playground/status/:generationId", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { generationId } = req.params;
    const { asyncTaskId } = req.query;

    const sql = getSql();
    const status = await getGenerationStatus(sql, generationId, asyncTaskId);

    res.json(status);
  } catch (error) {
    logger.error({ err: error }, "[ImagePlayground] Get status error");
    res.status(500).json({ error: error.message });
  }
});

// Delete generation
app.delete("/api/image-playground/generations/:id", async (req, res) => {
  try {
    const { userId, orgId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const sql = getSql();
    const resolvedUserId = await resolveUserId(sql, userId);
    await deleteGeneration(sql, id, resolvedUserId, orgId);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[ImagePlayground] Delete generation error");
    res.status(500).json({ error: error.message });
  }
});

// Generate topic title
app.post("/api/image-playground/generate-title", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { prompts } = req.body;
    if (!prompts || !Array.isArray(prompts)) {
      return res.status(400).json({ error: "prompts array required" });
    }

    const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const title = await generateTopicTitle(prompts, genai);

    res.json({ title });
  } catch (error) {
    logger.error({ err: error }, "[ImagePlayground] Generate title error");
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================
// CRITICAL: These must be registered LAST, after all routes

// 404 handler - catches undefined routes
app.use(notFoundHandler);

// Global error handler - catches all errors
app.use(errorHandler);

const startup = async () => {
  if (DATABASE_URL) {
    try {
      const sql = getSql();
      await ensureGallerySourceType(sql);
    } catch (error) {
      logger.error("Startup check failed");
    }
  }

  // Wait for Redis to connect before initializing workers
  const redisConnected = await waitForRedis(5000);

  if (redisConnected) {
    logger.info({}, "Redis connected");

    // NOTE: Image generation jobs were REMOVED (2026-01-25)
    // Images are now generated synchronously via /api/images endpoint
    // See docs/MIGRATION_DATA_URLS_TO_BLOB_2026-01-25.md for details

    // Initialize scheduled posts worker
    try {
      const worker = await initializeScheduledPostsChecker(
        checkAndPublishScheduledPosts,
        publishScheduledPostById,
      );
      if (worker) {
        logger.info({}, "Scheduled posts worker initialized");
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Failed to initialize scheduled posts worker",
      );
    }
  } else {
    logger.info({}, "Redis not available, workers disabled");
  }

  app.listen(PORT, () => {
    logger.info(
      { port: PORT, databaseConnected: !!DATABASE_URL },
      "API Server started",
    );
  });
};

startup();
