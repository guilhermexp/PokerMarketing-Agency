/**
 * Unified Initial Data Endpoint
 * Loads ALL user data in a SINGLE request instead of 6 separate requests
 * This dramatically reduces network latency and connection overhead
 *
 * GET /api/db/init
 *
 * Returns:
 * - brandProfile: User's brand profile
 * - gallery: Recent gallery images (max 50)
 * - scheduledPosts: Scheduled posts (max 100)
 * - campaigns: Recent campaigns with counts (max 20)
 * - tournamentSchedule: Current tournament schedule
 * - tournamentEvents: Events for current schedule
 * - schedulesList: All schedules for selector (max 10)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getSql,
  resolveUserId,
  setupCors,
  requireAuth,
  applyRateLimit,
  createRateLimitKey,
  getCachedUserId,
  cacheUserId,
} from './_helpers/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const start = Date.now();

  try {
    // Require authentication
    const auth = await requireAuth(req);

    // Apply rate limiting
    const rateLimitKey = createRateLimitKey(auth.userId, auth.orgId);
    const rateLimitOk = await applyRateLimit('standard', rateLimitKey, res);
    if (!rateLimitOk) return;

    const sql = getSql();

    // Use userId from JWT token (more secure than query param)
    const clerkUserId = auth.userId!;
    const organizationId = auth.orgId;

    // Check cache first for user ID resolution
    let resolvedUserId = await getCachedUserId(clerkUserId);
    if (!resolvedUserId) {
      resolvedUserId = await resolveUserId(sql, clerkUserId);
      if (resolvedUserId) {
        await cacheUserId(clerkUserId, resolvedUserId);
      }
    }

    if (!resolvedUserId) {
      console.log('[Init API] User not found, returning empty data');
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

    // Run ALL queries in parallel - this is the key optimization!
    const isOrgContext = !!organizationId;

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
        ? sql`SELECT * FROM brand_profiles WHERE organization_id = ${organizationId} AND deleted_at IS NULL LIMIT 1`
        : sql`SELECT * FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`,

      // 2. Gallery Images (limited to 50 most recent)
      isOrgContext
        ? sql`SELECT * FROM gallery_images WHERE organization_id = ${organizationId} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`
        : sql`SELECT * FROM gallery_images WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`,

      // 3. Scheduled Posts
      isOrgContext
        ? sql`SELECT * FROM scheduled_posts WHERE organization_id = ${organizationId} ORDER BY scheduled_timestamp ASC LIMIT 100`
        : sql`SELECT * FROM scheduled_posts WHERE user_id = ${resolvedUserId} AND organization_id IS NULL ORDER BY scheduled_timestamp ASC LIMIT 100`,

      // 4. Campaigns with counts (optimized single query)
      // Preview URLs: first try entity tables, then fallback to gallery_images
      isOrgContext
        ? sql`
          SELECT
            c.id, c.user_id, c.organization_id, c.name, c.description, c.status, c.created_at, c.updated_at,
            COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
            COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
            COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
            COALESCE(
              (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1),
              (SELECT gi.src_url FROM gallery_images gi
               INNER JOIN video_clip_scripts vcs ON gi.video_script_id = vcs.id
               WHERE vcs.campaign_id = c.id AND gi.deleted_at IS NULL AND gi.src_url NOT LIKE 'data:%' AND gi.src_url NOT LIKE 'blob:%'
               ORDER BY gi.created_at DESC LIMIT 1)
            ) as clip_preview_url,
            COALESCE(
              (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1),
              (SELECT gi.src_url FROM gallery_images gi
               INNER JOIN posts p ON gi.post_id = p.id
               WHERE p.campaign_id = c.id AND gi.deleted_at IS NULL AND gi.src_url NOT LIKE 'data:%' AND gi.src_url NOT LIKE 'blob:%'
               ORDER BY gi.created_at DESC LIMIT 1)
            ) as post_preview_url,
            COALESCE(
              (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1),
              (SELECT gi.src_url FROM gallery_images gi
               INNER JOIN ad_creatives ac ON gi.ad_creative_id = ac.id
               WHERE ac.campaign_id = c.id AND gi.deleted_at IS NULL AND gi.src_url NOT LIKE 'data:%' AND gi.src_url NOT LIKE 'blob:%'
               ORDER BY gi.created_at DESC LIMIT 1)
            ) as ad_preview_url
          FROM campaigns c
          WHERE c.organization_id = ${organizationId} AND c.deleted_at IS NULL
          ORDER BY c.created_at DESC
          LIMIT 20
        `
        : sql`
          SELECT
            c.id, c.user_id, c.organization_id, c.name, c.description, c.status, c.created_at, c.updated_at,
            COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
            COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
            COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
            COALESCE(
              (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1),
              (SELECT gi.src_url FROM gallery_images gi
               INNER JOIN video_clip_scripts vcs ON gi.video_script_id = vcs.id
               WHERE vcs.campaign_id = c.id AND gi.deleted_at IS NULL AND gi.src_url NOT LIKE 'data:%' AND gi.src_url NOT LIKE 'blob:%'
               ORDER BY gi.created_at DESC LIMIT 1)
            ) as clip_preview_url,
            COALESCE(
              (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1),
              (SELECT gi.src_url FROM gallery_images gi
               INNER JOIN posts p ON gi.post_id = p.id
               WHERE p.campaign_id = c.id AND gi.deleted_at IS NULL AND gi.src_url NOT LIKE 'data:%' AND gi.src_url NOT LIKE 'blob:%'
               ORDER BY gi.created_at DESC LIMIT 1)
            ) as post_preview_url,
            COALESCE(
              (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL AND image_url NOT LIKE 'data:%' LIMIT 1),
              (SELECT gi.src_url FROM gallery_images gi
               INNER JOIN ad_creatives ac ON gi.ad_creative_id = ac.id
               WHERE ac.campaign_id = c.id AND gi.deleted_at IS NULL AND gi.src_url NOT LIKE 'data:%' AND gi.src_url NOT LIKE 'blob:%'
               ORDER BY gi.created_at DESC LIMIT 1)
            ) as ad_preview_url
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
          WHERE ws.organization_id = ${organizationId}
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
          WHERE ws.organization_id = ${organizationId}
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
  } catch (error: any) {
    console.error('[Init API] Error:', error);

    // Handle authentication errors
    if (error.name === 'AuthenticationError') {
      return res.status(401).json({ error: error.message });
    }

    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
