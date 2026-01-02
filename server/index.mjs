/**
 * Production Server for Railway
 * Serves both the static frontend and API routes
 */

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { config } from "dotenv";
import { fal } from "@fal-ai/client";
import { clerkMiddleware, getAuth } from "@clerk/express";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
  OrganizationAccessError,
  createOrgContext,
} from "./helpers/organization-context.mjs";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Railway provides PORT environment variable
const PORT = process.env.PORT || 8080;

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json({ limit: "50mb" }));

// Clerk authentication middleware
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
async function resolveOrganizationContext(sql, userId, organizationId) {
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

const DATABASE_URL = process.env.DATABASE_URL;

// Cache for resolved user IDs (5 minute TTL)
const userIdCache = new Map();
const USER_CACHE_TTL = 5 * 60 * 1000;

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

// Helper to resolve user ID (handles both Clerk IDs and UUIDs)
async function resolveUserId(sql, userId) {
  if (!userId) return null;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(userId)) {
    return userId;
  }

  const cachedId = getCachedUserId(userId);
  if (cachedId) {
    return cachedId;
  }

  const result = await sql`
    SELECT id FROM users
    WHERE auth_provider_id = ${userId}
    AND deleted_at IS NULL
    LIMIT 1
  `;

  if (result.length > 0) {
    const resolvedId = result[0].id;
    setCachedUserId(userId, resolvedId);
    return resolvedId;
  }

  console.log("[User Lookup] No user found for auth_provider_id:", userId);
  return null;
}

// ============================================================================
// API ROUTES
// ============================================================================

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

// Unified initial data endpoint
app.get("/api/db/init", async (req, res) => {
  const start = Date.now();

  try {
    const sql = getSql();
    const { user_id, organization_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
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

    const isOrgContext = !!organization_id;

    const [
      brandProfileResult,
      galleryResult,
      scheduledPostsResult,
      campaignsResult,
      tournamentResult,
      schedulesListResult,
    ] = await Promise.all([
      isOrgContext
        ? sql`SELECT * FROM brand_profiles WHERE organization_id = ${organization_id} AND deleted_at IS NULL LIMIT 1`
        : sql`SELECT * FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`,

      isOrgContext
        ? sql`SELECT * FROM gallery_images WHERE organization_id = ${organization_id} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`
        : sql`SELECT * FROM gallery_images WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,

      isOrgContext
        ? sql`SELECT * FROM scheduled_posts WHERE organization_id = ${organization_id} ORDER BY scheduled_timestamp ASC LIMIT 100`
        : sql`SELECT * FROM scheduled_posts WHERE user_id = ${resolvedUserId} AND organization_id IS NULL ORDER BY scheduled_timestamp ASC LIMIT 100`,

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
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        return res.json(null);
      }

      let result;
      if (organization_id) {
        await resolveOrganizationContext(sql, resolvedUserId, organization_id);
        result = await sql`
          SELECT * FROM brand_profiles
          WHERE organization_id = ${organization_id} AND deleted_at IS NULL
          LIMIT 1
        `;
      } else {
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

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

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

    const existing =
      await sql`SELECT organization_id FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL`;
    if (existing.length === 0) {
      return res.status(404).json({ error: "Brand profile not found" });
    }

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

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]);
    }

    let query;
    const limitNum = parseInt(limit) || 50;

    if (organization_id) {
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

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

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
              ${media_type || 'image'}, ${duration || null})
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

// Posts API
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

// Ad Creatives API
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
    const { user_id, organization_id, status } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]);
    }

    let query;
    if (organization_id) {
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

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

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

    const timestampMs =
      typeof scheduled_timestamp === "string"
        ? new Date(scheduled_timestamp).getTime()
        : scheduled_timestamp;

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

    if (id) {
      const result = await sql`
        SELECT * FROM campaigns
        WHERE id = ${id} AND deleted_at IS NULL
        LIMIT 1
      `;

      if (!result[0]) {
        return res.status(200).json(null);
      }

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

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(200).json([]);
    }

    let result;
    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      result = await sql`
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
      `;
    } else {
      result = await sql`
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
      `;
    }

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

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({
        error:
          "User not found. Please ensure user exists before creating campaigns.",
      });
    }

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

    const result = await sql`
      INSERT INTO campaigns (user_id, organization_id, name, brand_profile_id, input_transcript, generation_options, status)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${name || null}, ${brand_profile_id || null}, ${input_transcript || null}, ${JSON.stringify(generation_options) || null}, ${status || "draft"})
      RETURNING *
    `;

    const campaign = result[0];

    if (video_clip_scripts && Array.isArray(video_clip_scripts)) {
      for (let i = 0; i < video_clip_scripts.length; i++) {
        const script = video_clip_scripts[i];
        await sql`
          INSERT INTO video_clip_scripts (campaign_id, user_id, organization_id, title, hook, image_prompt, audio_script, scenes, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${script.title}, ${script.hook}, ${script.image_prompt || null}, ${script.audio_script || null}, ${JSON.stringify(script.scenes || [])}, ${i})
        `;
      }
    }

    if (posts && Array.isArray(posts)) {
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        await sql`
          INSERT INTO posts (campaign_id, user_id, organization_id, platform, content, hashtags, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${post.platform}, ${post.content}, ${post.hashtags || []}, ${post.image_prompt || null}, ${i})
        `;
      }
    }

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

// Tournaments API
app.get("/api/db/tournaments/list", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ schedules: [] });
    }

    let schedules;
    if (organization_id) {
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

app.get("/api/db/tournaments", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, week_schedule_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ schedule: null, events: [] });
    }

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
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      schedules = await sql`
        SELECT * FROM week_schedules
        WHERE organization_id = ${organization_id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    } else {
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

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    }

    const scheduleResult = await sql`
      INSERT INTO week_schedules (user_id, organization_id, start_date, end_date, filename, original_filename)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${start_date}, ${end_date}, ${filename || null}, ${filename || null})
      RETURNING *
    `;

    const schedule = scheduleResult[0];

    if (events && Array.isArray(events) && events.length > 0) {
      const batchSize = 50;

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);

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

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    const schedule =
      await sql`SELECT organization_id FROM week_schedules WHERE id = ${id}`;
    if (schedule.length > 0 && schedule[0].organization_id) {
      await resolveOrganizationContext(
        sql,
        resolvedUserId,
        schedule[0].organization_id,
      );
    }

    await sql`
      DELETE FROM tournament_events
      WHERE week_schedule_id = ${id}
    `;

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

// Generation Jobs API
app.post("/api/generate/queue", async (req, res) => {
  try {
    const sql = getSql();
    const { userId, organizationId, jobType, prompt, config } = req.body;

    if (!userId || !jobType || !prompt || !config) {
      return res.status(400).json({
        error: "Missing required fields: userId, jobType, prompt, config",
      });
    }

    if (organizationId) {
      const resolvedUserId = await resolveUserId(sql, userId);
      if (resolvedUserId) {
        await resolveOrganizationContext(sql, resolvedUserId, organizationId);
      }
    }

    const result = await sql`
      INSERT INTO generation_jobs (user_id, organization_id, job_type, prompt, config, status)
      VALUES (${userId}, ${organizationId || null}, ${jobType}, ${prompt}, ${JSON.stringify(config)}, 'queued')
      RETURNING id, created_at
    `;

    const job = result[0];

    res.json({
      success: true,
      jobId: job.id,
      status: "queued",
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

// Video Proxy API
app.get("/api/proxy-video", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "url parameter is required" });
    }

    if (
      !url.includes(".public.blob.vercel-storage.com/") &&
      !url.includes(".blob.vercel-storage.com/")
    ) {
      return res
        .status(403)
        .json({ error: "Only Vercel Blob URLs are allowed" });
    }

    const response = await fetch(url);

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Failed to fetch video: ${response.statusText}` });
    }

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

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("[Video Proxy] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// File Upload API
const MAX_FILE_SIZE = 100 * 1024 * 1024;

app.post("/api/upload", async (req, res) => {
  try {
    const { filename, contentType, data } = req.body;

    if (!filename || !contentType || !data) {
      return res.status(400).json({
        error: "Missing required fields: filename, contentType, data",
      });
    }

    const buffer = Buffer.from(data, "base64");

    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }

    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;

    const blob = await put(uniqueFilename, buffer, {
      access: "public",
      contentType,
    });

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

// AI Video Generation API
const configureFal = () => {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error('FAL_KEY environment variable is not configured');
  }
  fal.config({ credentials: apiKey });
};

app.post("/api/ai/video", async (req, res) => {
  try {
    configureFal();

    const { prompt, aspectRatio, model, imageUrl, sceneDuration } = req.body;

    if (!prompt || !aspectRatio || !model) {
      return res.status(400).json({
        error: 'Missing required fields: prompt, aspectRatio, model',
      });
    }

    console.log(`[Video API] Generating video with ${model}...`);

    let videoUrl;
    const isHttpUrl = imageUrl && imageUrl.startsWith('http');

    if (model === 'sora-2') {
      const duration = 12;

      let result;

      if (isHttpUrl) {
        result = await fal.subscribe('fal-ai/sora-2/image-to-video', {
          input: {
            prompt,
            image_url: imageUrl,
            resolution: '720p',
            aspect_ratio: aspectRatio,
            duration,
            delete_video: false,
          },
          logs: true,
        });
      } else {
        result = await fal.subscribe('fal-ai/sora-2/text-to-video', {
          input: {
            prompt,
            resolution: '720p',
            aspect_ratio: aspectRatio,
            duration,
            delete_video: false,
          },
          logs: true,
        });
      }

      videoUrl = result?.data?.video?.url || result?.video?.url || '';
    } else {
      const duration = sceneDuration && sceneDuration <= 4 ? '4s' : sceneDuration && sceneDuration <= 6 ? '6s' : '8s';

      let result;

      if (isHttpUrl) {
        result = await fal.subscribe('fal-ai/veo3.1/fast/image-to-video', {
          input: {
            prompt,
            image_url: imageUrl,
            aspect_ratio: aspectRatio,
            duration,
            resolution: '720p',
            generate_audio: true,
          },
          logs: true,
        });
      } else {
        result = await fal.subscribe('fal-ai/veo3.1/fast', {
          input: {
            prompt,
            aspect_ratio: aspectRatio,
            duration,
            resolution: '720p',
            generate_audio: true,
            auto_fix: true,
          },
          logs: true,
        });
      }

      videoUrl = result?.data?.video?.url || result?.video?.url || '';
    }

    if (!videoUrl) {
      throw new Error('Failed to generate video - invalid response');
    }

    console.log(`[Video API] Video generated: ${videoUrl}`);

    console.log('[Video API] Uploading to Vercel Blob...');
    const videoResponse = await fetch(videoUrl);
    const videoBlob = await videoResponse.blob();

    const filename = `${model}-video-${Date.now()}.mp4`;
    const blob = await put(filename, videoBlob, {
      access: 'public',
      contentType: 'video/mp4',
    });

    console.log(`[Video API] Video stored: ${blob.url}`);

    return res.status(200).json({
      success: true,
      url: blob.url,
      model,
    });
  } catch (error) {
    console.error('[Video API] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate video',
    });
  }
});

// ============================================================================
// STATIC FILES - Serve frontend in production
// ============================================================================

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, "../dist"), {
  setHeaders: (res, filePath) => {
    // Set COEP headers for WASM support
    if (filePath.endsWith('.html')) {
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
  }
}));

// SPA fallback - serve index.html for all non-API routes
app.use((req, res, next) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }

  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`[Production Server] Running on port ${PORT}`);
  console.log(`[Production Server] Database: ${DATABASE_URL ? "Connected" : "NOT CONFIGURED"}`);
  console.log(`[Production Server] Environment: ${process.env.NODE_ENV || "development"}`);
});
