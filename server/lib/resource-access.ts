/**
 * Resource access control middleware and helpers.
 *
 * Owns: RESOURCE_ACCESS_RULES
 * Exports: RESOURCE_ACCESS_RULES, getResourceOwner, resourceAccessMiddleware, setRLSContext
 */

import type { Request, Response, NextFunction } from "express";
import { getSql, type SqlClient } from "./db.js";
import { resolveUserId } from "./user-resolver.js";
import logger from "./logger.js";

export interface ResourceAccessRule {
  methods: string[];
  path: string;
  idKey: string;
  table: string;
}

export const RESOURCE_ACCESS_RULES: ResourceAccessRule[] = [
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

export interface ResourceOwner {
  user_id?: string | null;
  organization_id?: string | null;
}

export async function getResourceOwner(sql: SqlClient, table: string, id: string): Promise<ResourceOwner | null> {
  let result: Array<ResourceOwner>;

  switch (table) {
    case "brand_profiles":
      result = await sql`SELECT user_id, organization_id FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    case "gallery_images":
      result = await sql`SELECT user_id, organization_id FROM gallery_images WHERE id = ${id} AND deleted_at IS NULL LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    case "posts":
      result = await sql`SELECT user_id, organization_id FROM posts WHERE id = ${id} LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    case "ad_creatives":
      result = await sql`SELECT user_id, organization_id FROM ad_creatives WHERE id = ${id} LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    case "scheduled_posts":
      result = await sql`SELECT user_id, organization_id FROM scheduled_posts WHERE id = ${id} LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    case "campaigns":
      result = await sql`SELECT user_id, organization_id FROM campaigns WHERE id = ${id} AND deleted_at IS NULL LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    case "video_clip_scripts":
      result = await sql`SELECT user_id, organization_id FROM video_clip_scripts WHERE id = ${id} LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    case "carousel_scripts":
      result = await sql`SELECT user_id, organization_id FROM carousel_scripts WHERE id = ${id} LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    case "week_schedules":
      result = await sql`SELECT user_id, organization_id FROM week_schedules WHERE id = ${id} LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    case "tournament_events":
      result = await sql`SELECT user_id, organization_id FROM tournament_events WHERE id = ${id} LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    case "instagram_accounts":
      result = await sql`SELECT user_id, organization_id FROM instagram_accounts WHERE id = ${id} LIMIT 1` as Array<ResourceOwner>;
      return result[0] ?? null;
    default:
      return null;
  }
}

/**
 * Express middleware that enforces resource ownership on /api/db routes.
 */
export async function resourceAccessMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const method = req.method.toUpperCase();
    const requestPath = `${req.baseUrl}${req.path}`;
    const matchingRules = RESOURCE_ACCESS_RULES.filter(
      (rule) => rule.path === requestPath && rule.methods.includes(method),
    );

    if (matchingRules.length === 0) {
      next();
      return;
    }

    const query = req.query as Record<string, unknown>;
    const rule = matchingRules.find((candidate) => query[candidate.idKey] !== undefined);
    if (!rule) {
      next();
      return;
    }

    const id = String(query[rule.idKey]);
    if (!id) {
      next();
      return;
    }

    const sql = getSql();
    const resolvedUserId = await resolveUserId(sql, req.authUserId);
    if (!resolvedUserId) {
      res.status(401).json({ error: "Authenticated user not found in database" });
      return;
    }

    const owner = await getResourceOwner(sql, rule.table, id);
    if (!owner) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    if (owner.organization_id) {
      if (!req.authOrgId || req.authOrgId !== owner.organization_id) {
        res.status(403).json({ error: "Forbidden resource access" });
        return;
      }
    } else if (owner.user_id && owner.user_id !== resolvedUserId) {
      res.status(403).json({ error: "Forbidden resource access" });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Set RLS session variables for Row Level Security.
 * Must be called before queries protected by RLS.
 */
export async function setRLSContext(sql: SqlClient, userId: string, organizationId: string | null = null): Promise<void> {
  if (!userId) return;

  try {
    await sql`
      SELECT
        set_config('app.user_id', ${userId}, true),
        set_config('app.organization_id', ${organizationId || ""}, true)
    `;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn({ errorMessage }, "[RLS] Failed to set context");
  }
}
