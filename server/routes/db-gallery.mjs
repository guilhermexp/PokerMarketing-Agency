import { put, del } from "@vercel/blob";
import { getSql } from "../lib/db.mjs";
import { resolveUserId } from "../lib/user-resolver.mjs";
import { logError } from "../lib/logging-helpers.mjs";
import { ValidationError, DatabaseError } from "../lib/errors/index.mjs";
import logger from "../lib/logger.mjs";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
  OrganizationAccessError,
} from "../helpers/organization-context.mjs";
import { resolveOrganizationContext } from "../lib/auth.mjs";

export function registerGalleryRoutes(app) {
  app.get("/api/db/gallery", async (req, res) => {
    try {
      const sql = getSql();
      const { user_id, organization_id, source, limit, offset, include_src } =
        req.query;

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
      const offsetNum = parseInt(offset) || 0;

      // OPTIMIZATION: Only include src (base64 image data) when explicitly requested
      // This dramatically reduces egress data transfer (50-250MB → 50KB per request)
      if (organization_id) {
        // Organization context - verify membership
        await resolveOrganizationContext(sql, resolvedUserId, organization_id);

        if (source) {
          query = include_src === "true"
            ? await sql`
                SELECT * FROM gallery_images
                WHERE organization_id = ${organization_id} AND source = ${source} AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ${limitNum}
                OFFSET ${offsetNum}
              `
            : await sql`
                SELECT id, user_id, organization_id, source, src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period FROM gallery_images
                WHERE organization_id = ${organization_id} AND source = ${source} AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ${limitNum}
                OFFSET ${offsetNum}
              `;
        } else {
          query = include_src === "true"
            ? await sql`
                SELECT * FROM gallery_images
                WHERE organization_id = ${organization_id} AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ${limitNum}
                OFFSET ${offsetNum}
              `
            : await sql`
                SELECT id, user_id, organization_id, source, src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period FROM gallery_images
                WHERE organization_id = ${organization_id} AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ${limitNum}
                OFFSET ${offsetNum}
              `;
        }
      } else {
        // Personal context
        if (source) {
          query = include_src === "true"
            ? await sql`
                SELECT * FROM gallery_images
                WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND source = ${source} AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ${limitNum}
                OFFSET ${offsetNum}
              `
            : await sql`
                SELECT id, user_id, organization_id, source, src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period FROM gallery_images
                WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND source = ${source} AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ${limitNum}
                OFFSET ${offsetNum}
              `;
        } else {
          query = include_src === "true"
            ? await sql`
                SELECT * FROM gallery_images
                WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ${limitNum}
                OFFSET ${offsetNum}
              `
            : await sql`
                SELECT id, user_id, organization_id, source, src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period FROM gallery_images
                WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ${limitNum}
                OFFSET ${offsetNum}
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

      let query;
      if (organization_id) {
        query = await sql`
          SELECT id, user_id, organization_id, source, src_url, thumbnail_url, prompt, model, aspect_ratio, image_size, week_schedule_id, daily_flyer_day, daily_flyer_period, created_at, updated_at FROM gallery_images
          WHERE organization_id = ${organization_id}
            AND week_schedule_id = ${week_schedule_id}
            AND deleted_at IS NULL
          ORDER BY daily_flyer_day, daily_flyer_period, created_at DESC
        `;
      } else {
        query = await sql`
          SELECT id, user_id, organization_id, source, src_url, thumbnail_url, prompt, model, aspect_ratio, image_size, week_schedule_id, daily_flyer_day, daily_flyer_period, created_at, updated_at FROM gallery_images
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
}
