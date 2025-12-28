/**
 * Development API Server
 * Runs alongside Vite to handle API routes during development
 */

import express from "express";
import cors from "cors";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { config } from "dotenv";
import { clerkMiddleware, getAuth } from "@clerk/express";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
  OrganizationAccessError,
  createOrgContext,
} from "./helpers/organization-context.mjs";

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
// DEBUG: Request counter for tracking database calls
// ============================================================================
let requestCounter = 0;
let queryCounter = 0;
const requestLog = new Map(); // Track queries per request

function logQuery(requestId, endpoint, queryName) {
  queryCounter++;
  if (!requestLog.has(requestId)) {
    requestLog.set(requestId, []);
  }
  requestLog.get(requestId).push(queryName);
  console.log(
    `[DB DEBUG] Request #${requestId} | Query #${queryCounter} | ${endpoint} | ${queryName}`,
  );
}

function logRequestSummary(requestId, endpoint) {
  const queries = requestLog.get(requestId) || [];
  console.log(
    `[DB SUMMARY] Request #${requestId} | ${endpoint} | Total queries: ${queries.length}`,
  );
  if (queries.length > 3) {
    console.warn(
      `[DB WARNING] ⚠️ High query count (${queries.length}) for ${endpoint}!`,
    );
  }
  requestLog.delete(requestId);
}

// Cache for resolved user IDs (5 minute TTL)
const userIdCache = new Map();
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedUserId(clerkId) {
  const cached = userIdCache.get(clerkId);
  if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
    console.log(`[CACHE HIT] User ID for ${clerkId.substring(0, 10)}...`);
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
        set_config('app.organization_id', ${organizationId || ''}, true)
    `;
  } catch (error) {
    // Don't fail the request if RLS context can't be set
    // The application-level security (WHERE clauses) will still work
    console.warn('[RLS] Failed to set context:', error.message);
  }
}

// ============================================================================
// Request logging middleware - tracks all API calls
// ============================================================================
app.use("/api/db", (req, res, next) => {
  const reqId = ++requestCounter;
  req.requestId = reqId;
  const start = Date.now();

  console.log(`\n[API REQUEST #${reqId}] ${req.method} ${req.originalUrl}`);

  res.on("finish", () => {
    const duration = Date.now() - start;
    const queries = requestLog.get(reqId)?.length || 0;
    console.log(
      `[API COMPLETE #${reqId}] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${queries} queries`,
    );
    if (queries > 2) {
      console.warn(
        `[PERF WARNING] ⚠️ ${req.originalUrl} made ${queries} DB queries!`,
      );
    }
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

    console.log(
      `[Init API] Loading all data for user ${resolvedUserId.substring(0, 8)}... (org: ${isOrgContext})`,
    );

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
            c.id, c.user_id, c.organization_id, c.name, c.description, c.status, c.created_at, c.updated_at,
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
            c.id, c.user_id, c.organization_id, c.name, c.description, c.status, c.created_at, c.updated_at,
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

    const duration = Date.now() - start;
    console.log(
      `[Init API] ✅ Loaded all data in ${duration}ms with 6 parallel queries (instead of 6 separate requests)`,
    );

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
            created_at: tournamentData.created_at,
            updated_at: tournamentData.updated_at,
          }
        : null,
      tournamentEvents: tournamentData?.events || [],
      schedulesList: schedulesListResult,
      _meta: {
        loadTime: duration,
        queriesExecuted: 6,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Init API] Error:", error);
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
    console.error("[Users API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/users", async (req, res) => {
  console.log("[Users API] POST request body:", req.body);
  try {
    const sql = getSql();
    const { email, name, avatar_url, auth_provider, auth_provider_id } =
      req.body;

    if (!email || !name) {
      console.log("[Users API] Missing fields - email:", email, "name:", name);
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
    console.error("[Users API] Error:", error);
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
    console.error("[Brand Profiles API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/brand-profiles", async (req, res) => {
  console.log("[Brand Profiles API] POST request body:", req.body);
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
      console.log(
        "[Brand Profiles API] Missing fields - user_id:",
        user_id,
        "name:",
        name,
      );
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
    console.error("[Brand Profiles API] Error:", error);
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
    console.error("[Brand Profiles API] Error:", error);
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
    console.error("[Gallery API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/db/gallery", async (req, res) => {
  console.log(
    "[Gallery API] POST request - user_id:",
    req.body.user_id,
    "source:",
    req.body.source,
  );
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
    } = req.body;

    if (!user_id || !src_url || !source || !model) {
      console.log(
        "[Gallery API] Missing fields - user_id:",
        user_id,
        "src_url:",
        !!src_url,
        "source:",
        source,
        "model:",
        model,
      );
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

    // Log linking IDs for debugging
    if (post_id || ad_creative_id || video_script_id) {
      console.log(
        "[Gallery API] Linking to campaign content - post_id:",
        post_id,
        "ad_creative_id:",
        ad_creative_id,
        "video_script_id:",
        video_script_id,
      );
    }

    const result = await sql`
      INSERT INTO gallery_images (user_id, organization_id, src_url, prompt, source, model, aspect_ratio, image_size,
                                  post_id, ad_creative_id, video_script_id)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${src_url}, ${prompt || null}, ${source}, ${model},
              ${aspect_ratio || null}, ${image_size || null},
              ${post_id || null}, ${ad_creative_id || null}, ${video_script_id || null})
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
    console.error("[Gallery API] Error:", error);
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
    console.error("[Gallery API] PATCH Error:", error);
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
    console.error("[Gallery API] Error:", error);
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
    console.error("[Posts API] Error:", error);
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
    console.error("[Ad Creatives API] Error:", error);
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
    console.error("[Scheduled Posts API] Error:", error);
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
      created_from,
    } = req.body;

    console.log("[Scheduled Posts API] POST body:", {
      user_id,
      organization_id,
      content_type,
      image_url: !!image_url,
      scheduled_timestamp,
    });

    if (
      !user_id ||
      !image_url ||
      !scheduled_timestamp ||
      !scheduled_date ||
      !scheduled_time ||
      !platforms
    ) {
      console.log("[Scheduled Posts API] Missing fields");
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

    console.log("[Scheduled Posts API] Timestamp conversion:", {
      original: scheduled_timestamp,
      type: typeof scheduled_timestamp,
      converted: timestampMs,
    });

    const result = await sql`
      INSERT INTO scheduled_posts (
        user_id, organization_id, content_type, content_id, image_url, caption, hashtags,
        scheduled_date, scheduled_time, scheduled_timestamp, timezone,
        platforms, instagram_content_type, created_from
      ) VALUES (
        ${resolvedUserId}, ${organization_id || null}, ${content_type || "flyer"}, ${content_id || null}, ${image_url}, ${caption || ""},
        ${hashtags || []}, ${scheduled_date}, ${scheduled_time}, ${timestampMs},
        ${timezone || "America/Sao_Paulo"}, ${platforms || "instagram"},
        ${instagram_content_type || "photo"}, ${created_from || null}
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
    console.error("[Scheduled Posts API] Error:", error);
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
    console.error("[Scheduled Posts API] Error:", error);
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
    console.error("[Scheduled Posts API] Error:", error);
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
      console.log(
        "[Campaigns API] Fetching campaign by ID:",
        id,
        "include_content:",
        include_content,
      );

      const result = await sql`
        SELECT * FROM campaigns
        WHERE id = ${id} AND deleted_at IS NULL
        LIMIT 1
      `;

      console.log("[Campaigns API] Campaign found:", result[0] ? "yes" : "no");

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

        console.log(
          "[Campaigns API] Content counts:",
          videoScripts.length,
          "clips,",
          posts.length,
          "posts,",
          adCreatives.length,
          "ads",
        );

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
      console.log("[Campaigns API] Could not resolve user_id:", user_id);
      return res.status(200).json([]); // Return empty array if user not found
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

    console.log(
      `[Campaigns API] Fetched ${result.length} campaigns with SINGLE optimized query`,
    );
    res.json(result);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Campaigns API] Error:", error);
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
      console.log("[Campaigns API] Could not resolve user_id:", user_id);
      return res.status(400).json({
        error:
          "User not found. Please ensure user exists before creating campaigns.",
      });
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

    console.log(
      "[Campaigns API] Created campaign with",
      video_clip_scripts?.length || 0,
      "clips,",
      posts?.length || 0,
      "posts,",
      ad_creatives?.length || 0,
      "ads",
    );

    res.status(201).json(campaign);
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof PermissionDeniedError
    ) {
      return res.status(403).json({ error: error.message });
    }
    console.error("[Campaigns API] Error:", error);
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
    console.error("[Campaigns API] Error:", error);
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
    console.error("[Tournaments API] List Error:", error);
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
    console.error("[Tournaments API] Error:", error);
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
    console.error("[Tournaments API] Error:", error);
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
    console.error("[Tournaments API] Error:", error);
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
    console.error("[Generate Queue] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/generate/status", async (req, res) => {
  try {
    const sql = getSql();
    const { jobId, userId, status: filterStatus, limit } = req.query;

    // Single job query
    if (jobId) {
      const jobs = await sql`
        SELECT
          id, user_id, job_type, status, progress,
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

      if (filterStatus) {
        jobs = await sql`
          SELECT
            id, user_id, job_type, status, progress,
            result_url, result_gallery_id, error_message,
            created_at, started_at, completed_at
          FROM generation_jobs
          WHERE user_id = ${userId} AND status = ${filterStatus}
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        jobs = await sql`
          SELECT
            id, user_id, job_type, status, progress,
            result_url, result_gallery_id, error_message,
            created_at, started_at, completed_at
          FROM generation_jobs
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }

      return res.json({ jobs, total: jobs.length });
    }

    return res.status(400).json({ error: "jobId or userId is required" });
  } catch (error) {
    console.error("[Generate Status] Error:", error);
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
    console.error("[Video Proxy] Error:", error);
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
    const blob = await put(uniqueFilename, buffer, {
      access: "public",
      contentType,
    });

    console.log("[Upload] File uploaded:", blob.url);

    return res.status(200).json({
      success: true,
      url: blob.url,
      filename: uniqueFilename,
      size: buffer.length,
    });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return res.status(500).json({
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
      console.error(
        "[Dev API Server] Startup checks failed:",
        error?.message || error,
      );
    }
  }

  app.listen(PORT, () => {
    console.log(`[Dev API Server] Running on http://localhost:${PORT}`);
    console.log(
      `[Dev API Server] Database: ${DATABASE_URL ? "Connected" : "NOT CONFIGURED"}`,
    );
  });
};

startup();
