import { del } from "@vercel/blob";
import { getSql } from "../lib/db.mjs";
import { resolveUserId } from "../lib/user-resolver.mjs";
import { resolveOrganizationContext } from "../lib/auth.mjs";
import { logError } from "../lib/logging-helpers.mjs";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
  OrganizationAccessError,
} from "../helpers/organization-context.mjs";
import {
  ValidationError,
  NotFoundError,
  DatabaseError,
} from "../lib/errors/index.mjs";
import logger from "../lib/logger.mjs";

export function registerCampaignRoutes(app) {
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

      logger.debug(
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

      logger.debug(
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
      logger.debug({}, "[Campaign Delete] Deleting database records");

      // Delete gallery images (already have the IDs)
      if (campaignImages.length > 0) {
        const imageIds = campaignImages.map((img) => img.id);
        await sql`DELETE FROM gallery_images WHERE id = ANY(${imageIds})`;
        logger.debug(
          { count: imageIds.length },
          "[Campaign Delete] Deleted gallery images from DB",
        );
      }

      // Delete posts
      await sql`DELETE FROM posts WHERE campaign_id = ${id}`;
      logger.debug({}, "[Campaign Delete] Deleted posts from DB");

      // Delete ad creatives
      await sql`DELETE FROM ad_creatives WHERE campaign_id = ${id}`;
      logger.debug({}, "[Campaign Delete] Deleted ad creatives from DB");

      // Delete video clip scripts
      await sql`DELETE FROM video_clip_scripts WHERE campaign_id = ${id}`;
      logger.debug({}, "[Campaign Delete] Deleted video clips from DB");

      // Finally, delete the campaign itself
      await sql`DELETE FROM campaigns WHERE id = ${id}`;
      logger.debug({}, "[Campaign Delete] Deleted campaign from DB");

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

  // Carousels API - List all user carousels
  app.get("/api/db/carousels", async (req, res) => {
    try {
      const sql = getSql();
      const { user_id, organization_id } = req.query;

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
            cs.id,
            cs.campaign_id,
            c.name AS campaign_name,
            cs.title,
            cs.hook,
            cs.cover_prompt,
            cs.cover_url,
            cs.caption,
            cs.slides,
            (
              SELECT COALESCE(
                json_agg(gi.src_url ORDER BY gi.created_at ASC),
                '[]'::json
              )
              FROM gallery_images gi
              WHERE gi.carousel_script_id = cs.id
                AND gi.deleted_at IS NULL
            ) AS gallery_images,
            jsonb_array_length(COALESCE(cs.slides, '[]'::jsonb))::int AS slides_count,
            cs.created_at,
            cs.updated_at
          FROM carousel_scripts cs
          LEFT JOIN campaigns c ON c.id = cs.campaign_id
          WHERE cs.organization_id = ${organization_id}
            AND c.deleted_at IS NULL
          ORDER BY cs.created_at DESC
        `;
      } else {
        result = await sql`
          SELECT
            cs.id,
            cs.campaign_id,
            c.name AS campaign_name,
            cs.title,
            cs.hook,
            cs.cover_prompt,
            cs.cover_url,
            cs.caption,
            cs.slides,
            (
              SELECT COALESCE(
                json_agg(gi.src_url ORDER BY gi.created_at ASC),
                '[]'::json
              )
              FROM gallery_images gi
              WHERE gi.carousel_script_id = cs.id
                AND gi.deleted_at IS NULL
            ) AS gallery_images,
            jsonb_array_length(COALESCE(cs.slides, '[]'::jsonb))::int AS slides_count,
            cs.created_at,
            cs.updated_at
          FROM carousel_scripts cs
          LEFT JOIN campaigns c ON c.id = cs.campaign_id
          WHERE cs.user_id = ${resolvedUserId}
            AND cs.organization_id IS NULL
            AND c.deleted_at IS NULL
          ORDER BY cs.created_at DESC
        `;
      }

      res.json(result);
    } catch (error) {
      logError("Carousels API (GET)", error);
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
}
