import { getSql } from "../lib/db.mjs";
import { resolveUserId } from "../lib/user-resolver.mjs";
import { logError } from "../lib/logging-helpers.mjs";
import logger from "../lib/logger.mjs";

export function registerInitRoutes(app) {
  app.get("/api/db/init", async (req, res) => {
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
      if (clerk_user_id) {
        // First check if it's a UUID (db user id)
        const uuidPattern =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidPattern.test(clerk_user_id)) {
          resolvedUserId = clerk_user_id;
        } else {
          // It's a Clerk ID - look up or create the user
          resolvedUserId = await resolveUserId(sql, clerk_user_id);
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
        resolvedUserId = await resolveUserId(sql, user_id);
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

      // Run ALL queries in parallel - this is the key optimization!
      // PERFORMANCE: Tournaments are now loaded lazily (only when user opens tournaments tab)
      const isOrgContext = !!organization_id;

      const [
        brandProfileResult,
        galleryResult,
        scheduledPostsResult,
        campaignsResult,
        schedulesListResult,
      ] = await Promise.all([
        // 1. Brand Profile
        // OPTIMIZATION: Don't return data URLs for logo_url - they can be 3MB each!
        isOrgContext
          ? sql`SELECT id, user_id, organization_id, name, description, CASE WHEN logo_url LIKE 'data:%' THEN '' ELSE logo_url END as logo_url, primary_color, secondary_color, tertiary_color, tone_of_voice, settings, created_at, updated_at, deleted_at FROM brand_profiles WHERE organization_id = ${organization_id} AND deleted_at IS NULL LIMIT 1`
          : sql`SELECT id, user_id, organization_id, name, description, CASE WHEN logo_url LIKE 'data:%' THEN '' ELSE logo_url END as logo_url, primary_color, secondary_color, tertiary_color, tone_of_voice, settings, created_at, updated_at, deleted_at FROM brand_profiles WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL LIMIT 1`,

        // 2. Gallery Images (limited to 100 most recent)
        // OPTIMIZATION: Don't return data URLs (base64) for gallery - they're 113MB+ total!
        // Use thumbnail_url if available for data URLs, otherwise return empty string
        // NOTE: Old images with data URLs won't appear until migrated to Blob
        isOrgContext
          ? sql`SELECT id, user_id, organization_id, source, CASE WHEN src_url LIKE 'data:%' THEN COALESCE(thumbnail_url, '') ELSE src_url END as src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period FROM gallery_images WHERE organization_id = ${organization_id} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`
          : sql`SELECT id, user_id, organization_id, source, CASE WHEN src_url LIKE 'data:%' THEN COALESCE(thumbnail_url, '') ELSE src_url END as src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period FROM gallery_images WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`,

        // 3. Scheduled Posts (SMART LOADING: last 7 days + next 60 days)
        // OPTIMIZATION: Don't return data URLs (base64) in image_url - they're huge (26MB+ total!)
        // Use CASE to return empty string for data URLs, full URL otherwise
        isOrgContext
          ? sql`
            SELECT id, user_id, organization_id, content_type, content_id,
              CASE WHEN image_url LIKE 'data:%' THEN '' ELSE image_url END as image_url,
              carousel_image_urls, caption, hashtags, scheduled_date, scheduled_time,
              scheduled_timestamp, timezone, platforms, instagram_content_type, status,
              published_at, error_message, created_from, created_at, updated_at
            FROM scheduled_posts
            WHERE organization_id = ${organization_id}
              AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000
              AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000
            ORDER BY scheduled_timestamp ASC
          `
          : sql`
            SELECT id, user_id, organization_id, content_type, content_id,
              CASE WHEN image_url LIKE 'data:%' THEN '' ELSE image_url END as image_url,
              carousel_image_urls, caption, hashtags, scheduled_date, scheduled_time,
              scheduled_timestamp, timezone, platforms, instagram_content_type, status,
              published_at, error_message, created_from, created_at, updated_at
            FROM scheduled_posts
            WHERE user_id = ${resolvedUserId}
              AND organization_id IS NULL
              AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000
              AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000
            ORDER BY scheduled_timestamp ASC
          `,

        // 4. Campaigns with counts (OPTIMIZED: simple subqueries for preview URLs)
        // Only fetch from main tables (posts/ads/clips), not from gallery_images
        isOrgContext
          ? sql`
            SELECT
              c.id, c.user_id, c.organization_id, c.name, c.description, c.input_transcript, c.status, c.created_at, c.updated_at,
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
            LIMIT 10
          `
          : sql`
            SELECT
              c.id, c.user_id, c.organization_id, c.name, c.description, c.input_transcript, c.status, c.created_at, c.updated_at,
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
            LIMIT 10
          `,

        // 5. Week schedules list (for flyers page - show saved spreadsheets)
        isOrgContext
          ? sql`
            SELECT
              ws.id,
              ws.user_id,
              ws.organization_id,
              ws.original_filename as name,
              ws.start_date,
              ws.end_date,
              ws.daily_flyer_urls,
              ws.created_at,
              ws.updated_at,
              COUNT(te.id)::int as event_count
            FROM week_schedules ws
            LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
            WHERE ws.organization_id = ${organization_id}
            GROUP BY ws.id, ws.original_filename, ws.daily_flyer_urls
            ORDER BY ws.created_at DESC
          `
          : sql`
            SELECT
              ws.id,
              ws.user_id,
              ws.organization_id,
              ws.original_filename as name,
              ws.start_date,
              ws.end_date,
              ws.daily_flyer_urls,
              ws.created_at,
              ws.updated_at,
              COUNT(te.id)::int as event_count
            FROM week_schedules ws
            LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
            WHERE ws.user_id = ${resolvedUserId} AND ws.organization_id IS NULL
            GROUP BY ws.id, ws.original_filename, ws.daily_flyer_urls
            ORDER BY ws.created_at DESC
          `,
      ]);

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
          loadTime: Date.now() - start,
          queriesExecuted: 5, // Reduced from 6 to 5
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logError("Init API", error);
      res.status(500).json({ error: error.message });
    }
  });
}
