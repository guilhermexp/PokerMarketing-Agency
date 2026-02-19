/**
 * Resource access control middleware and helpers.
 *
 * Owns: RESOURCE_ACCESS_RULES
 * Exports: RESOURCE_ACCESS_RULES, getResourceOwner, resourceAccessMiddleware, setRLSContext
 */

import { getSql } from "./db.mjs";
import { resolveUserId } from "./user-resolver.mjs";
import logger from "./logger.mjs";

export const RESOURCE_ACCESS_RULES = [
  { methods: ["PUT"], path: "/api/db/brand-profiles", idKey: "id", table: "brand_profiles" },
  { methods: ["PATCH", "DELETE"], path: "/api/db/gallery", idKey: "id", table: "gallery_images" },
  { methods: ["PATCH"], path: "/api/db/posts", idKey: "id", table: "posts" },
  { methods: ["PATCH"], path: "/api/db/ad-creatives", idKey: "id", table: "ad_creatives" },
  { methods: ["PUT", "DELETE"], path: "/api/db/scheduled-posts", idKey: "id", table: "scheduled_posts" },
  { methods: ["DELETE"], path: "/api/db/campaigns", idKey: "id", table: "campaigns" },
  { methods: ["PATCH"], path: "/api/db/campaigns", idKey: "clip_id", table: "video_clip_scripts" },
  { methods: ["PATCH"], path: "/api/db/campaigns/scene", idKey: "clip_id", table: "video_clip_scripts" },
  { methods: ["PATCH"], path: "/api/db/carousels", idKey: "id", table: "carousel_scripts" },
  { methods: ["PATCH"], path: "/api/db/carousels/slide", idKey: "carousel_id", table: "carousel_scripts" },
  { methods: ["DELETE"], path: "/api/db/tournaments", idKey: "id", table: "week_schedules" },
  { methods: ["PATCH"], path: "/api/db/tournaments/event-flyer", idKey: "event_id", table: "tournament_events" },
  { methods: ["PATCH"], path: "/api/db/tournaments/daily-flyer", idKey: "schedule_id", table: "week_schedules" },
  { methods: ["PUT", "DELETE"], path: "/api/db/instagram-accounts", idKey: "id", table: "instagram_accounts" },
];

export async function getResourceOwner(sql, table, id) {
  switch (table) {
    case "brand_profiles":
      return (
        await sql`SELECT user_id, organization_id FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`
      )[0];
    case "gallery_images":
      return (
        await sql`SELECT user_id, organization_id FROM gallery_images WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`
      )[0];
    case "posts":
      return (await sql`SELECT user_id, organization_id FROM posts WHERE id = ${id} LIMIT 1`)[0];
    case "ad_creatives":
      return (
        await sql`SELECT user_id, organization_id FROM ad_creatives WHERE id = ${id} LIMIT 1`
      )[0];
    case "scheduled_posts":
      return (
        await sql`SELECT user_id, organization_id FROM scheduled_posts WHERE id = ${id} LIMIT 1`
      )[0];
    case "campaigns":
      return (
        await sql`SELECT user_id, organization_id FROM campaigns WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`
      )[0];
    case "video_clip_scripts":
      return (
        await sql`SELECT user_id, organization_id FROM video_clip_scripts WHERE id = ${id} LIMIT 1`
      )[0];
    case "carousel_scripts":
      return (
        await sql`SELECT user_id, organization_id FROM carousel_scripts WHERE id = ${id} LIMIT 1`
      )[0];
    case "week_schedules":
      return (
        await sql`SELECT user_id, organization_id FROM week_schedules WHERE id = ${id} LIMIT 1`
      )[0];
    case "tournament_events":
      return (
        await sql`SELECT user_id, organization_id FROM tournament_events WHERE id = ${id} LIMIT 1`
      )[0];
    case "instagram_accounts":
      return (
        await sql`SELECT user_id, organization_id FROM instagram_accounts WHERE id = ${id} LIMIT 1`
      )[0];
    default:
      return null;
  }
}

/**
 * Express middleware that enforces resource ownership on /api/db routes.
 */
export async function resourceAccessMiddleware(req, res, next) {
  try {
    const method = req.method.toUpperCase();
    const requestPath = `${req.baseUrl}${req.path}`;
    const matchingRules = RESOURCE_ACCESS_RULES.filter(
      (rule) => rule.path === requestPath && rule.methods.includes(method),
    );

    if (matchingRules.length === 0) {
      return next();
    }

    const rule = matchingRules.find((candidate) => req.query?.[candidate.idKey] !== undefined);
    if (!rule) {
      return next();
    }

    const id = String(req.query[rule.idKey]);
    if (!id) {
      return next();
    }

    const sql = getSql();
    const resolvedUserId = await resolveUserId(sql, req.authUserId);
    if (!resolvedUserId) {
      return res.status(401).json({ error: "Authenticated user not found in database" });
    }

    const owner = await getResourceOwner(sql, rule.table, id);
    if (!owner) {
      return res.status(404).json({ error: "Resource not found" });
    }

    if (owner.organization_id) {
      if (!req.authOrgId || req.authOrgId !== owner.organization_id) {
        return res.status(403).json({ error: "Forbidden resource access" });
      }
    } else if (owner.user_id && owner.user_id !== resolvedUserId) {
      return res.status(403).json({ error: "Forbidden resource access" });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Set RLS session variables for Row Level Security.
 * Must be called before queries protected by RLS.
 */
export async function setRLSContext(sql, userId, organizationId = null) {
  if (!userId) return;

  try {
    await sql`
      SELECT
        set_config('app.user_id', ${userId}, true),
        set_config('app.organization_id', ${organizationId || ""}, true)
    `;
  } catch (error) {
    logger.warn({ errorMessage: error.message }, "[RLS] Failed to set context");
  }
}
