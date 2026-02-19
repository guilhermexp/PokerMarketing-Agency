import { getSql } from "../lib/db.mjs";
import { resolveUserId } from "../lib/user-resolver.mjs";
import { resolveOrganizationContext } from "../lib/auth.mjs";
import { logError } from "../lib/logging-helpers.mjs";
import {
  schedulePostForPublishing,
  cancelScheduledPost,
} from "../helpers/job-queue.mjs";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
  OrganizationAccessError,
} from "../helpers/organization-context.mjs";
import { ValidationError, DatabaseError } from "../lib/errors/index.mjs";
import logger from "../lib/logger.mjs";

export function registerScheduledPostRoutes(app) {
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
            { postId: id, reason: "status changed to cancelled" },
            "[API] Cancelled scheduled job for post",
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
          { postId: id, reason: "post deleted" },
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
}
