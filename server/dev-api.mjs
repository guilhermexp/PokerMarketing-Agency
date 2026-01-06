/**
 * Development API Server
 * Runs alongside Vite to handle API routes during development
 */

import express from "express";
import cors from "cors";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { config } from "dotenv";
import { fal } from "@fal-ai/client";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { GoogleGenAI } from "@google/genai";
import { OpenRouter } from "@openrouter/sdk";
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

config();

const app = express();
const PORT = 3002;

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
  console.log(
    `${colors.magenta}[${service}]${colors.reset} ${colors.cyan}${action}${colors.reset}${details ? ` ${colors.dim}${details}${colors.reset}` : ""}`,
  );
}

function logExternalAPIResult(service, action, duration, success = true) {
  const status = success
    ? `${colors.green}✓${colors.reset}`
    : `${colors.red}✗${colors.reset}`;
  console.log(
    `${colors.magenta}[${service}]${colors.reset} ${status} ${action} ${colors.dim}${duration}ms${colors.reset}`,
  );
}

function logError(context, error) {
  console.error(`\n${colors.red}━━━ ERROR: ${context} ━━━${colors.reset}`);
  console.error(`${colors.red}Message:${colors.reset}`, error.message);
  if (error.stack) {
    console.error(`${colors.dim}${error.stack}${colors.reset}`);
  }
  if (error.response?.data) {
    console.error(
      `${colors.yellow}Response:${colors.reset}`,
      JSON.stringify(error.response.data, null, 2),
    );
  }
  console.error(`${colors.red}━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
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

function getSql() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL not configured");
  }
  return neon(DATABASE_URL);
}

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

    console.log(
      "[Dev API Server] Migrating gallery_images.source from enum to varchar...",
    );
    await sql`ALTER TABLE gallery_images ALTER COLUMN source TYPE VARCHAR(100) USING source::text`;
    await sql`DROP TYPE IF EXISTS image_source`;
    console.log("[Dev API Server] gallery_images.source migration complete");
  } catch (error) {
    console.error(
      "[Dev API Server] Failed to migrate gallery_images.source:",
      error?.message || error,
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
  console.log("[User Lookup] No user found for auth_provider_id:", userId);
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
    console.warn("[RLS] Failed to set context:", error.message);
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

    console.log(
      `${colors.cyan}${method}${colors.reset} /${endpoint} ${statusColor}${status}${colors.reset} ${durationColor}${duration}ms${colors.reset}`,
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
    res.status(500).json({ status: "unhealthy", error: error.message });
  }
});

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
  console.log("[STATS] Counters reset");
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
    const { user_id, organization_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // Resolve user_id once (with caching)
    const resolvedUserId = await resolveUserId(sql, user_id, reqId);
    if (!resolvedUserId) {
      console.log("[Init API] User not found, returning empty data");
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

    // Note: RLS context via session vars doesn't work with Neon serverless pooler
    // Security is enforced via WHERE clauses in each query (application-level)
    // RLS policies protect direct database access (psql, DB clients)

    // Run ALL queries in parallel - this is the key optimization!
    const isOrgContext = !!organization_id;

    const [
      brandProfileResult,
      galleryResult,
      scheduledPostsResult,
      campaignsResult,
      tournamentResult,
      schedulesListResult,
    ] = await Promise.all([
      // 1. Brand Profile
      isOrgContext
        ? sql`SELECT * FROM brand_profiles WHERE organization_id = ${organization_id} AND deleted_at IS NULL LIMIT 1`
        : sql`SELECT * FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`,

      // 2. Gallery Images (limited to 50 most recent)
      isOrgContext
        ? sql`SELECT * FROM gallery_images WHERE organization_id = ${organization_id} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`
        : sql`SELECT * FROM gallery_images WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,

      // 3. Scheduled Posts
      isOrgContext
        ? sql`SELECT * FROM scheduled_posts WHERE organization_id = ${organization_id} ORDER BY scheduled_timestamp ASC LIMIT 100`
        : sql`SELECT * FROM scheduled_posts WHERE user_id = ${resolvedUserId} AND organization_id IS NULL ORDER BY scheduled_timestamp ASC LIMIT 100`,

      // 4. Campaigns with counts (optimized single query)
      isOrgContext
        ? sql`
          SELECT
            c.id, c.user_id, c.organization_id, c.name, c.description, c.input_transcript, c.status, c.created_at, c.updated_at,
            COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
            COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
            COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
            (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
            (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
            (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url
          FROM campaigns c
          WHERE c.organization_id = ${organization_id} AND c.deleted_at IS NULL
          ORDER BY c.created_at DESC
          LIMIT 20
        `
        : sql`
          SELECT
            c.id, c.user_id, c.organization_id, c.name, c.description, c.input_transcript, c.status, c.created_at, c.updated_at,
            COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
            COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
            COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
            (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
            (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
            (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url
          FROM campaigns c
          WHERE c.user_id = ${resolvedUserId} AND c.organization_id IS NULL AND c.deleted_at IS NULL
          ORDER BY c.created_at DESC
          LIMIT 20
        `,

      // 5. Current tournament schedule + events (combined)
      isOrgContext
        ? sql`
          SELECT
            ws.*,
            COALESCE(
              (SELECT json_agg(te ORDER BY te.day_of_week, te.name)
               FROM tournament_events te
               WHERE te.week_schedule_id = ws.id),
              '[]'::json
            ) as events
          FROM week_schedules ws
          WHERE ws.organization_id = ${organization_id}
          ORDER BY ws.created_at DESC
          LIMIT 1
        `
        : sql`
          SELECT
            ws.*,
            COALESCE(
              (SELECT json_agg(te ORDER BY te.day_of_week, te.name)
               FROM tournament_events te
               WHERE te.week_schedule_id = ws.id),
              '[]'::json
            ) as events
          FROM week_schedules ws
          WHERE ws.user_id = ${resolvedUserId} AND ws.organization_id IS NULL
          ORDER BY ws.created_at DESC
          LIMIT 1
        `,

      // 6. All schedules list (for schedule selector)
      isOrgContext
        ? sql`
          SELECT ws.*, COUNT(te.id)::int as event_count
          FROM week_schedules ws
          LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
          WHERE ws.organization_id = ${organization_id}
          GROUP BY ws.id
          ORDER BY ws.start_date DESC
          LIMIT 10
        `
        : sql`
          SELECT ws.*, COUNT(te.id)::int as event_count
          FROM week_schedules ws
          LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
          WHERE ws.user_id = ${resolvedUserId} AND ws.organization_id IS NULL
          GROUP BY ws.id
          ORDER BY ws.start_date DESC
          LIMIT 10
        `,
    ]);

    // Extract tournament data
    const tournamentData = tournamentResult[0] || null;

    res.json({
      brandProfile: brandProfileResult[0] || null,
      gallery: galleryResult,
      scheduledPosts: scheduledPostsResult,
      campaigns: campaignsResult,
      tournamentSchedule: tournamentData
        ? {
            id: tournamentData.id,
            user_id: tournamentData.user_id,
            organization_id: tournamentData.organization_id,
            start_date: tournamentData.start_date,
            end_date: tournamentData.end_date,
            filename: tournamentData.filename,
            daily_flyer_urls: tournamentData.daily_flyer_urls || {},
            created_at: tournamentData.created_at,
            updated_at: tournamentData.updated_at,
          }
        : null,
      tournamentEvents: tournamentData?.events || [],
      schedulesList: schedulesListResult,
      _meta: {
        loadTime: Date.now() - start,
        queriesExecuted: 6,
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

    return res.status(400).json({ error: "email or id is required" });
  } catch (error) {
    logError("Users API", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/users", async (req, res) => {
  try {
    const sql = getSql();
    const { email, name, avatar_url, auth_provider, auth_provider_id } =
      req.body;

    if (!email || !name) {
      return res.status(400).json({ error: "email and name are required" });
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
    logError("Users API", error);
    res.status(500).json({ error: error.message });
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

    return res.status(400).json({ error: "user_id or id is required" });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Brand Profiles API", error);
    res.status(500).json({ error: error.message });
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
      return res.status(400).json({ error: "user_id and name are required" });
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
      if (!hasPermission(context.orgRole, PERMISSIONS.MANAGE_BRAND)) {
        return res
          .status(403)
          .json({ error: "Permission denied: manage_brand required" });
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
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    logError("Brand Profiles API", error);
    res.status(500).json({ error: error.message });
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
    const { user_id, organization_id, source, limit } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]); // No user found, return empty array
    }

    let query;
    const limitNum = parseInt(limit) || 50;

    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      if (source) {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE organization_id = ${organization_id} AND source = ${source} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE organization_id = ${organization_id} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }
    } else {
      // Personal context
      if (source) {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND source = ${source} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }
    }

    res.json(query);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Gallery API GET", error);
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
                                  media_type, duration)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${src_url}, ${prompt || null}, ${source}, ${model},
              ${aspect_ratio || null}, ${image_size || null},
              ${post_id || null}, ${ad_creative_id || null}, ${video_script_id || null},
              ${is_style_reference || false}, ${style_reference_name || null},
              ${media_type || "image"}, ${duration || null})
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

// Gallery PATCH - Update gallery image (e.g., mark as published)
app.patch("/api/db/gallery", async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { published_at } = req.body;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const result = await sql`
      UPDATE gallery_images
      SET published_at = ${published_at || null},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: "Gallery image not found" });
    }

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

    // Check if image belongs to an organization and verify permission
    const image =
      await sql`SELECT organization_id FROM gallery_images WHERE id = ${id} AND deleted_at IS NULL`;
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

    await sql`UPDATE gallery_images SET deleted_at = NOW() WHERE id = ${id}`;
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
      return res.status(400).json({ error: "user_id is required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]); // No user found, return empty array
    }

    let query;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      if (status) {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE organization_id = ${organization_id} AND status = ${status}
          ORDER BY scheduled_timestamp ASC
        `;
      } else {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE organization_id = ${organization_id}
          ORDER BY scheduled_timestamp ASC
        `;
      }
    } else {
      // Personal context
      if (status) {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND status = ${status}
          ORDER BY scheduled_timestamp ASC
        `;
      } else {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL
          ORDER BY scheduled_timestamp ASC
        `;
      }
    }

    res.json(query);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Scheduled Posts API", error);
    res.status(500).json({ error: error.message });
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

    const result = await sql`
      INSERT INTO scheduled_posts (
        user_id, organization_id, content_type, content_id, image_url, caption, hashtags,
        scheduled_date, scheduled_time, scheduled_timestamp, timezone,
        platforms, instagram_content_type, instagram_account_id, created_from
      ) VALUES (
        ${resolvedUserId}, ${organization_id || null}, ${content_type || "flyer"}, ${content_id || null}, ${image_url}, ${caption || ""},
        ${hashtags || []}, ${scheduled_date}, ${scheduled_time}, ${timestampMs},
        ${timezone || "America/Sao_Paulo"}, ${platforms || "instagram"},
        ${instagram_content_type || "photo"}, ${instagram_account_id || null}, ${created_from || null}
      )
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

    res.json(result[0]);
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
    const { user_id, organization_id, id, include_content } = req.query;

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

      // If include_content is true, also fetch video_clip_scripts, posts, and ad_creatives
      if (include_content === "true") {
        const campaign = result[0];

        const [videoScripts, posts, adCreatives] = await Promise.all([
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
        ]);

        return res.status(200).json({
          ...campaign,
          video_clip_scripts: videoScripts,
          posts: posts,
          ad_creatives: adCreatives,
        });
      }

      return res.status(200).json(result[0]);
    }

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(200).json([]);
    }

    // OPTIMIZED: Single query with all counts and previews using subqueries
    // This replaces the N+1 problem (was doing 6 queries PER campaign!)
    let result;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      result = await sql`
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
          (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
          (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
          (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url
        FROM campaigns c
        WHERE c.organization_id = ${organization_id} AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `;
    } else {
      // Personal context
      result = await sql`
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
          (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
          (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as post_preview_url,
          (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1) as ad_preview_url
        FROM campaigns c
        WHERE c.user_id = ${resolvedUserId} AND c.organization_id IS NULL AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Campaigns API", error);
    res.status(500).json({ error: error.message });
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
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
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
      if (!hasPermission(context.orgRole, PERMISSIONS.CREATE_CAMPAIGN)) {
        return res
          .status(403)
          .json({ error: "Permission denied: create_campaign required" });
      }
    }

    // Create campaign
    const result = await sql`
      INSERT INTO campaigns (user_id, organization_id, name, brand_profile_id, input_transcript, generation_options, status)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${name || null}, ${brand_profile_id || null}, ${input_transcript || null}, ${JSON.stringify(generation_options) || null}, ${status || "draft"})
      RETURNING *
    `;

    const campaign = result[0];

    // Create video clip scripts if provided
    if (video_clip_scripts && Array.isArray(video_clip_scripts)) {
      for (let i = 0; i < video_clip_scripts.length; i++) {
        const script = video_clip_scripts[i];
        await sql`
          INSERT INTO video_clip_scripts (campaign_id, user_id, organization_id, title, hook, image_prompt, audio_script, scenes, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${script.title}, ${script.hook}, ${script.image_prompt || null}, ${script.audio_script || null}, ${JSON.stringify(script.scenes || [])}, ${i})
        `;
      }
    }

    // Create posts if provided
    if (posts && Array.isArray(posts)) {
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        await sql`
          INSERT INTO posts (campaign_id, user_id, organization_id, platform, content, hashtags, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${post.platform}, ${post.content}, ${post.hashtags || []}, ${post.image_prompt || null}, ${i})
        `;
      }
    }

    // Create ad creatives if provided
    if (ad_creatives && Array.isArray(ad_creatives)) {
      for (let i = 0; i < ad_creatives.length; i++) {
        const ad = ad_creatives[i];
        await sql`
          INSERT INTO ad_creatives (campaign_id, user_id, organization_id, platform, headline, body, cta, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${ad.platform}, ${ad.headline}, ${ad.body}, ${ad.cta}, ${ad.image_prompt || null}, ${i})
        `;
      }
    }

    res.status(201).json(campaign);
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

    await sql`
      UPDATE campaigns
      SET deleted_at = NOW()
      WHERE id = ${id}
    `;

    res.status(200).json({ success: true });
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
      return res.status(400).json({ error: "user_id is required" });
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
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Tournaments API", error);
    res.status(500).json({ error: error.message });
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
      console.log(
        `[Tournaments API] Inserting ${events.length} events in parallel batches...`,
      );

      // Process in batches - each batch runs concurrently, batches run sequentially
      const batchSize = 50; // 50 concurrent inserts per batch
      const totalBatches = Math.ceil(events.length / batchSize);

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        console.log(
          `[Tournaments API] Processing batch ${batchNum}/${totalBatches} (${batch.length} events)...`,
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
      console.log(
        `[Tournaments API] All ${events.length} events inserted successfully`,
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

app.post("/api/generate/queue", async (req, res) => {
  try {
    const sql = getSql();
    const { userId, organizationId, jobType, prompt, config } = req.body;

    if (!userId || !jobType || !prompt || !config) {
      return res.status(400).json({
        error: "Missing required fields: userId, jobType, prompt, config",
      });
    }

    // Verify organization membership if organizationId provided
    if (organizationId) {
      const resolvedUserId = await resolveUserId(sql, userId);
      if (resolvedUserId) {
        await resolveOrganizationContext(sql, resolvedUserId, organizationId);
      }
    }

    // Create job in database
    const result = await sql`
      INSERT INTO generation_jobs (user_id, organization_id, job_type, prompt, config, status)
      VALUES (${userId}, ${organizationId || null}, ${jobType}, ${prompt}, ${JSON.stringify(config)}, 'queued')
      RETURNING id, created_at
    `;

    const job = result[0];
    console.log(`[Generate Queue] Created job ${job.id} for user ${userId}`);

    // In dev mode, we just return the job ID
    // QStash won't work locally, so jobs will stay in 'queued' status
    // For full testing, deploy to Vercel or use ngrok

    res.json({
      success: true,
      jobId: job.id,
      messageId: "dev-mode-no-qstash",
      status: "queued",
      note: "Dev mode: QStash disabled. Job created but won't process automatically. Deploy to Vercel for full functionality.",
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Generate Queue", error);
    res.status(500).json({ error: error.message });
  }
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
          created_at, started_at, completed_at, attempts
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
      const limitNum = parseInt(limit) || 50;

      // Filter by organization context
      if (organizationId) {
        // Organization context - show only org jobs
        if (filterStatus) {
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              result_url, result_gallery_id, error_message,
              created_at, started_at, completed_at
            FROM generation_jobs
            WHERE organization_id = ${organizationId} AND status = ${filterStatus}
            ORDER BY created_at DESC
            LIMIT ${limitNum}
          `;
        } else {
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              result_url, result_gallery_id, error_message,
              created_at, started_at, completed_at
            FROM generation_jobs
            WHERE organization_id = ${organizationId}
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
              result_url, result_gallery_id, error_message,
              created_at, started_at, completed_at
            FROM generation_jobs
            WHERE user_id = ${userId} AND organization_id IS NULL AND status = ${filterStatus}
            ORDER BY created_at DESC
            LIMIT ${limitNum}
          `;
        } else {
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              result_url, result_gallery_id, error_message,
              created_at, started_at, completed_at
            FROM generation_jobs
            WHERE user_id = ${userId} AND organization_id IS NULL
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

    console.log("[Video Proxy] Fetching:", url);

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
        console.log(
          `[Gemini] Retry ${attempt}/${maxRetries} after ${delayMs}ms...`,
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
  model = "gemini-3-pro-image-preview",
  imageSize = "1K",
  productImages,
  styleReferenceImage,
) => {
  const ai = getGeminiAi();
  const parts = [{ text: prompt }];

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

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Failed to generate image");
};

// Generate image with Imagen 4
const generateImagenImage = async (prompt, aspectRatio) => {
  const ai = getGeminiAi();

  const response = await withRetry(() =>
    ai.models.generateImages({
      model: "imagen-4.0-generate-001",
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/png",
        aspectRatio,
      },
    }),
  );

  return `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
};

// Generate structured content with Gemini
const generateStructuredContent = async (
  model,
  parts,
  responseSchema,
  temperature = 0.7,
) => {
  const ai = getGeminiAi();

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema,
      temperature,
    },
  });

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
      image_url: {
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
  const targets = brandProfile.toneTargets || [
    "campaigns",
    "posts",
    "images",
    "flyers",
  ];
  return targets.includes(target);
};

const getToneText = (brandProfile, target) => {
  return shouldUseTone(brandProfile, target) ? brandProfile.toneOfVoice : "";
};

const buildImagePrompt = (prompt, brandProfile, hasStyleReference = false) => {
  const toneText = getToneText(brandProfile, "images");
  let fullPrompt = `PROMPT TÉCNICO: ${prompt}
ESTILO VISUAL: ${toneText ? `${toneText}, ` : ""}Cores: ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}. Cinematográfico e Luxuoso.`;

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

const buildFlyerPrompt = (brandProfile) => {
  const toneText = getToneText(brandProfile, "flyers");

  return `
**PERSONA:** Você é Diretor de Arte Sênior de uma agência de publicidade internacional de elite.

**MISSÃO CRÍTICA:**
Crie materiais visuais de alta qualidade que representem fielmente a marca e comuniquem a mensagem de forma impactante.
Se houver valores ou informações importantes no conteúdo, destaque-os visualmente (fonte negrito, cor vibrante ou tamanho maior).

**REGRAS DE CONTEÚDO:**
1. Destaque informações importantes (valores, datas, horários) de forma clara e legível.
2. Use a marca ${brandProfile.name}.
3. Siga a identidade visual da marca em todos os elementos.

**IDENTIDADE DA MARCA - ${brandProfile.name}:**
${brandProfile.description ? `- Descrição: ${brandProfile.description}` : ""}
${toneText ? `- Tom de Comunicação: ${toneText}` : ""}
- Cor Primária (dominante): ${brandProfile.primaryColor}
- Cor de Acento (destaques, CTAs): ${brandProfile.secondaryColor}

**PRINCÍPIOS DE DESIGN PROFISSIONAL:**

1. HARMONIA CROMÁTICA:
   - Use APENAS as cores da marca: ${brandProfile.primaryColor} (primária) e ${brandProfile.secondaryColor} (acento)
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

  return `
Você é Social Media Manager de elite. Crie um post de INSTAGRAM de alta performance.

**CONTEXTO:**
${context}

**MARCA:** ${brandProfile.name}${brandProfile.description ? ` - ${brandProfile.description}` : ""}${toneText ? ` | **TOM:** ${toneText}` : ""}

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
  },
  required: ["videoClipScripts", "posts", "adCreatives"],
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
  try {
    const { brandProfile, transcript, options, productImages } = req.body;

    if (!brandProfile || !transcript || !options) {
      return res.status(400).json({
        error: "brandProfile, transcript, and options are required",
      });
    }

    console.log("[Campaign API] Generating campaign...");

    // Model selection - config in config/ai-models.ts
    // OpenRouter models have "/" in their ID (e.g., "openai/gpt-5.2")
    const model = brandProfile.creativeModel || "gemini-3-pro-preview";
    const isOpenRouter = model.includes("/");

    const quantityInstructions = buildQuantityInstructions(options, "dev");
    const prompt = buildCampaignPrompt(
      brandProfile,
      transcript,
      quantityInstructions,
      getToneText(brandProfile, "campaigns"),
    );

    let result;

    if (isOpenRouter) {
      // Add explicit JSON schema for OpenRouter models
      const jsonSchemaPrompt = `${prompt}

**FORMATO JSON OBRIGATÓRIO (siga EXATAMENTE esta estrutura):**
\`\`\`json
{
  "videoClipScripts": [
    {
      "title": "Título do vídeo",
      "hook": "Gancho inicial do vídeo",
      "scenes": [
        {"scene": 1, "visual": "descrição visual", "narration": "narração", "duration_seconds": 5}
      ],
      "image_prompt": "prompt para thumbnail",
      "audio_script": "script de áudio completo"
    }
  ],
  "posts": [
    {
      "platform": "Instagram|Facebook|Twitter|LinkedIn",
      "content": "texto do post",
      "hashtags": ["tag1", "tag2"],
      "image_prompt": "descrição da imagem"
    }
  ],
  "adCreatives": [
    {
      "platform": "Facebook|Google",
      "headline": "título do anúncio",
      "body": "corpo do anúncio",
      "cta": "call to action",
      "image_prompt": "descrição da imagem"
    }
  ]
}
\`\`\`
Responda APENAS com o JSON válido, sem texto adicional.`;

      const textParts = [jsonSchemaPrompt];
      const imageParts = productImages || [];

      if (imageParts.length > 0) {
        result = await generateTextWithOpenRouterVision(
          model,
          textParts,
          imageParts,
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

      if (productImages) {
        productImages.forEach((img) => {
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

    // Debug: log structure for troubleshooting
    console.log("[Campaign API] Campaign structure:", {
      hasPosts: !!campaign.posts,
      postsIsArray: Array.isArray(campaign.posts),
      postsCount: campaign.posts?.length,
      hasAdCreatives: !!campaign.adCreatives,
      adCreativesCount: campaign.adCreatives?.length,
      hasVideoScripts: !!campaign.videoClipScripts,
      videoScriptsCount: campaign.videoClipScripts?.length,
    });

    console.log("[Campaign API] Campaign generated successfully");

    res.json({
      success: true,
      campaign,
      model,
    });
  } catch (error) {
    console.error("[Campaign API] Error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate campaign" });
  }
});

// AI Flyer Generation
app.post("/api/ai/flyer", async (req, res) => {
  try {
    const {
      prompt,
      brandProfile,
      logo,
      referenceImage,
      aspectRatio = "9:16",
      collabLogo,
      imageSize = "1K",
      compositionAssets,
    } = req.body;

    if (!prompt || !brandProfile) {
      return res
        .status(400)
        .json({ error: "prompt and brandProfile are required" });
    }

    console.log(`[Flyer API] Generating flyer, aspect ratio: ${aspectRatio}`);

    const ai = getGeminiAi();
    const brandingInstruction = buildFlyerPrompt(brandProfile);

    const parts = [
      { text: brandingInstruction },
      { text: `DADOS DO FLYER PARA INSERIR NA ARTE:\n${prompt}` },
    ];

    if (logo) {
      parts.push({
        inlineData: { data: logo.base64, mimeType: logo.mimeType },
      });
    }

    if (collabLogo) {
      parts.push({
        inlineData: { data: collabLogo.base64, mimeType: collabLogo.mimeType },
      });
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

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: mapAspectRatio(aspectRatio),
          imageSize,
        },
      },
    });

    let imageDataUrl = null;
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!imageDataUrl) {
      throw new Error("A IA falhou em produzir o Flyer.");
    }

    console.log("[Flyer API] Flyer generated successfully");

    res.json({
      success: true,
      imageUrl: imageDataUrl,
    });
  } catch (error) {
    console.error("[Flyer API] Error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate flyer" });
  }
});

// AI Image Generation
app.post("/api/ai/image", async (req, res) => {
  try {
    const {
      prompt,
      brandProfile,
      aspectRatio = "1:1",
      model = "gemini-3-pro-image-preview",
      imageSize = "1K",
      productImages,
      styleReferenceImage,
    } = req.body;

    if (!prompt || !brandProfile) {
      return res
        .status(400)
        .json({ error: "prompt and brandProfile are required" });
    }

    console.log(
      `[Image API] Generating image with ${model}, aspect ratio: ${aspectRatio}`,
    );

    let imageDataUrl;

    if (model === "imagen-4.0-generate-001") {
      const fullPrompt = buildImagePrompt(
        prompt,
        brandProfile,
        !!styleReferenceImage,
      );
      imageDataUrl = await generateImagenImage(fullPrompt, aspectRatio);
    } else {
      const fullPrompt = buildImagePrompt(
        prompt,
        brandProfile,
        !!styleReferenceImage,
      );
      imageDataUrl = await generateGeminiImage(
        fullPrompt,
        aspectRatio,
        model,
        imageSize,
        productImages,
        styleReferenceImage,
      );
    }

    console.log("[Image API] Image generated successfully");

    res.json({
      success: true,
      imageUrl: imageDataUrl,
      model,
    });
  } catch (error) {
    console.error("[Image API] Error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate image" });
  }
});

// Convert generic prompt to structured JSON for video generation
app.post("/api/ai/convert-prompt", async (req, res) => {
  try {
    const { prompt, duration = 5, aspectRatio = "16:9" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    console.log(
      `[Convert Prompt API] Converting prompt to JSON, duration: ${duration}s`,
    );

    const ai = getGeminiAi();
    const systemPrompt = getVideoPromptSystemPrompt(duration, aspectRatio);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
    });

    const text = response.text?.trim() || "";

    // Try to parse as JSON
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      // If not valid JSON, return as-is
      result = text;
    }

    console.log("[Convert Prompt API] Conversion successful");

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[Convert Prompt API] Error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to convert prompt" });
  }
});

// AI Text Generation
app.post("/api/ai/text", async (req, res) => {
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

    console.log(`[Text API] Generating ${type} text...`);

    const model = brandProfile.creativeModel || "gemini-3-pro-preview";
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

    console.log("[Text API] Text generated successfully");

    res.json({
      success: true,
      result: JSON.parse(result),
      model,
    });
  } catch (error) {
    console.error("[Text API] Error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate text" });
  }
});

// AI Edit Image
app.post("/api/ai/edit-image", async (req, res) => {
  try {
    const { image, prompt, mask, referenceImage } = req.body;

    if (!image || !prompt) {
      return res.status(400).json({ error: "image and prompt are required" });
    }

    console.log("[Edit Image API] Editing image...");

    const ai = getGeminiAi();
    const instructionPrompt = `DESIGNER SÊNIOR: Execute alteração profissional: ${prompt}. Texto original e logos são SAGRADOS, preserve informações importantes visíveis.`;

    const parts = [
      { text: instructionPrompt },
      { inlineData: { data: image.base64, mimeType: image.mimeType } },
    ];

    if (mask) {
      parts.push({
        inlineData: { data: mask.base64, mimeType: mask.mimeType },
      });
    }
    if (referenceImage) {
      parts.push({
        inlineData: {
          data: referenceImage.base64,
          mimeType: referenceImage.mimeType,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: { parts },
      config: { imageConfig: { imageSize: "1K" } },
    });

    let imageDataUrl = null;
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (!imageDataUrl) {
      throw new Error("Failed to edit image");
    }

    console.log("[Edit Image API] Image edited successfully");

    res.json({
      success: true,
      imageUrl: imageDataUrl,
    });
  } catch (error) {
    console.error("[Edit Image API] Error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to edit image" });
  }
});

// AI Extract Colors from Logo
app.post("/api/ai/extract-colors", async (req, res) => {
  try {
    const { logo } = req.body;

    if (!logo) {
      return res.status(400).json({ error: "logo is required" });
    }

    console.log("[Extract Colors API] Analyzing logo...");

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

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
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
    });

    const colors = JSON.parse(response.text.trim());

    console.log("[Extract Colors API] Colors extracted:", colors);

    res.json(colors);
  } catch (error) {
    console.error("[Extract Colors API] Error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to extract colors" });
  }
});

// AI Speech Generation (TTS)
app.post("/api/ai/speech", async (req, res) => {
  try {
    const { script, voiceName = "Orus" } = req.body;

    if (!script) {
      return res.status(400).json({ error: "script is required" });
    }

    console.log("[Speech API] Generating speech...");

    const ai = getGeminiAi();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: script }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
      },
    });

    const audioBase64 =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";

    if (!audioBase64) {
      throw new Error("Failed to generate speech");
    }

    console.log("[Speech API] Speech generated successfully");

    res.json({
      success: true,
      audioBase64,
    });
  } catch (error) {
    console.error("[Speech API] Error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to generate speech" });
  }
});

// AI Assistant Streaming Endpoint
app.post("/api/ai/assistant", async (req, res) => {
  try {
    const { history, brandProfile } = req.body;

    if (!history) {
      return res.status(400).json({ error: "history is required" });
    }

    console.log("[Assistant API] Starting streaming conversation...");

    const ai = getGeminiAi();

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
      model: "gemini-3-pro-preview",
      contents: history,
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

    console.log("[Assistant API] Streaming completed");
  } catch (error) {
    console.error("[Assistant API] Error:", error);
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
async function generateVideoWithGoogleVeo(prompt, aspectRatio, imageUrl) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const ai = new GoogleGenAI({ apiKey });
  const isHttpUrl = imageUrl && imageUrl.startsWith("http");
  const mode = isHttpUrl ? "image-to-video" : "text-to-video";

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
    },
  };

  // Add image for image-to-video mode
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
  try {
    const {
      prompt,
      aspectRatio,
      model,
      imageUrl,
      sceneDuration,
      generateAudio = true,
    } = req.body;

    if (!prompt || !aspectRatio || !model) {
      return res.status(400).json({
        error: "Missing required fields: prompt, aspectRatio, model",
      });
    }

    console.log(
      `[Video API] Generating video with ${model}, audio: ${generateAudio}`,
    );

    let videoUrl;
    let usedProvider = "google";

    // For Veo 3.1, try Google API first, then fallback to FAL.ai
    if (model === "veo-3.1" || model === "veo-3.1-fast-generate-preview") {
      try {
        // Try Google Veo API first
        videoUrl = await generateVideoWithGoogleVeo(
          prompt,
          aspectRatio,
          imageUrl,
          sceneDuration,
          generateAudio,
        );
      } catch (googleError) {
        // Log the Google API error and fallback to FAL.ai
        console.log(`[Video API] Google Veo failed: ${googleError.message}`);
        console.log("[Video API] Falling back to FAL.ai...");
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
    } else {
      // For Sora-2 or other models, use FAL.ai directly
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

    return res.status(200).json({
      success: true,
      url: blob.url,
      model,
      provider: usedProvider,
    });
  } catch (error) {
    logError("Video API", error);
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

    console.log("[Instagram] Validating token with Rube MCP...");
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
    console.log("[Instagram] Rube response status:", response.status);
    console.log(
      "[Instagram] Rube response (first 500 chars):",
      text.substring(0, 500),
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
          console.log(
            "[Instagram] Parsed SSE data:",
            JSON.stringify(json, null, 2).substring(0, 500),
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
            console.log(
              "[Instagram] Nested data:",
              JSON.stringify(parsed, null, 2).substring(0, 500),
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
                console.log(
                  "[Instagram] Found user:",
                  userData.username,
                  userData.id,
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
          console.error("[Instagram] Parse error:", e);
        }
      }
    }
    return { success: false, error: "Instagram não conectado no Rube." };
  } catch (error) {
    console.error("[Instagram] Validation error:", error);
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
        console.log("[Instagram] User not found for Clerk ID:", user_id);
        return res.json([]);
      }
    } else {
      // Assume it's a DB UUID - verify it exists
      const userResult =
        await sql`SELECT id FROM users WHERE id = ${user_id} LIMIT 1`;
      if (userResult.length === 0) {
        console.log("[Instagram] User not found for DB UUID:", user_id);
        return res.json([]);
      }
    }
    console.log("[Instagram] Resolved user ID:", resolvedUserId);

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
    console.error("[Instagram Accounts API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Connect new Instagram account
app.post("/api/db/instagram-accounts", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, rube_token } = req.body;

    console.log("[Instagram] POST request:", {
      user_id,
      organization_id,
      hasToken: !!rube_token,
    });

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
        console.log("[Instagram] User not found for Clerk ID:", user_id);
        return res.status(400).json({ error: "User not found" });
      }
    } else {
      const userResult =
        await sql`SELECT id FROM users WHERE id = ${user_id} LIMIT 1`;
      if (userResult.length === 0) {
        console.log("[Instagram] User not found for DB UUID:", user_id);
        return res.status(400).json({ error: "User not found" });
      }
    }
    console.log("[Instagram] Resolved user ID:", resolvedUserId);

    // Validate the Rube token
    const validation = await validateRubeToken(rube_token);
    console.log("[Instagram] Validation result:", validation);
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
    console.error("[Instagram Accounts API] Error:", error);
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
    console.error("[Instagram Accounts API] Error:", error);
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
    console.error("[Instagram Accounts API] Error:", error);
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
    const { instagram_account_id, user_id, ...mcpRequest } = req.body;

    let token;
    let instagramUserId;

    // Multi-tenant mode: use user's token from database
    if (instagram_account_id && user_id) {
      console.log(
        "[Rube Proxy] Multi-tenant mode - fetching token for account:",
        instagram_account_id,
      );

      // Resolve user_id: can be DB UUID or Clerk ID
      let resolvedUserId = user_id;
      if (user_id.startsWith("user_")) {
        const userResult =
          await sql`SELECT id FROM users WHERE auth_provider_id = ${user_id} AND auth_provider = 'clerk' LIMIT 1`;
        resolvedUserId = userResult[0]?.id;
        if (!resolvedUserId) {
          console.log("[Rube Proxy] User not found for Clerk ID:", user_id);
          return res.status(400).json({ error: "User not found" });
        }
        console.log(
          "[Rube Proxy] Resolved Clerk ID to DB UUID:",
          resolvedUserId,
        );
      }

      // Fetch account token and instagram_user_id
      const accountResult = await sql`
        SELECT rube_token, instagram_user_id FROM instagram_accounts
        WHERE id = ${instagram_account_id} AND user_id = ${resolvedUserId} AND is_active = TRUE
        LIMIT 1
      `;

      if (accountResult.length === 0) {
        console.log("[Rube Proxy] Instagram account not found or not active");
        return res
          .status(403)
          .json({ error: "Instagram account not found or inactive" });
      }

      token = accountResult[0].rube_token;
      instagramUserId = accountResult[0].instagram_user_id;
      console.log(
        "[Rube Proxy] Using token for Instagram user:",
        instagramUserId,
      );

      // Update last_used_at
      await sql`UPDATE instagram_accounts SET last_used_at = NOW() WHERE id = ${instagram_account_id}`;
    } else {
      // Fallback to global token (dev mode)
      token = process.env.RUBE_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "RUBE_TOKEN not configured" });
      }
      console.log("[Rube Proxy] Using global RUBE_TOKEN (dev mode)");
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
        console.log(
          "[Rube Proxy] Injected ig_user_id into",
          mcpRequest.params.arguments.tools.length,
          "tools",
        );
      } else {
        // For direct tool calls
        mcpRequest.params.arguments.ig_user_id = instagramUserId;
        console.log("[Rube Proxy] Injected ig_user_id directly");
      }
    }

    console.log("[Rube Proxy] Calling Rube MCP:", mcpRequest.params?.name);

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
    console.log("[Rube Proxy] Response status:", response.status);
    res.status(response.status).send(text);
  } catch (error) {
    console.error("[Rube Proxy] Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

const startup = async () => {
  if (DATABASE_URL) {
    try {
      const sql = getSql();
      await ensureGallerySourceType(sql);
    } catch (error) {
      console.error(`${colors.red}✗ Startup check failed${colors.reset}`);
    }
  }

  app.listen(PORT, () => {
    console.log("");
    console.log(
      `${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
    );
    console.log(
      `${colors.green}  API Server${colors.reset}  http://localhost:${PORT}`,
    );
    console.log(
      `${colors.green}  Database${colors.reset}    ${DATABASE_URL ? `${colors.green}Connected${colors.reset}` : `${colors.red}NOT CONFIGURED${colors.reset}`}`,
    );
    console.log(
      `${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
    );
    console.log("");
  });
};

startup();
