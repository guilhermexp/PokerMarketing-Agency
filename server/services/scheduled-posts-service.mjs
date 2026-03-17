import { getSql } from "../lib/db.js";
import { resolveUserId } from "../lib/user-resolver.js";
import { resolveOrganizationContext } from "../lib/auth.js";
import {
  schedulePostForPublishing,
  cancelScheduledPost,
} from "../helpers/job-queue.mjs";
import {
  ValidationError,
  NotFoundError,
} from "../lib/errors/index.js";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
} from "../helpers/organization-context.js";
import logger from "../lib/logger.js";

export async function listScheduledPosts({
  user_id,
  organization_id,
  status,
}) {
  if (!user_id) {
    throw new ValidationError("user_id is required");
  }

  const sql = getSql();
  const resolvedUserId = await resolveUserId(sql, user_id);
  if (!resolvedUserId) {
    return [];
  }

  if (organization_id) {
    await resolveOrganizationContext(sql, resolvedUserId, organization_id);

    if (status) {
      return await sql`
        SELECT *
        FROM scheduled_posts
        WHERE organization_id = ${organization_id}
          AND status = ${status}
          AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000
          AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000
        ORDER BY scheduled_timestamp ASC
      `;
    }

    return await sql`
      SELECT *
      FROM scheduled_posts
      WHERE organization_id = ${organization_id}
        AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000
        AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000
      ORDER BY scheduled_timestamp ASC
    `;
  }

  if (status) {
    return await sql`
      SELECT *
      FROM scheduled_posts
      WHERE user_id = ${resolvedUserId}
        AND organization_id IS NULL
        AND status = ${status}
        AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000
        AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000
      ORDER BY scheduled_timestamp ASC
    `;
  }

  return await sql`
    SELECT *
    FROM scheduled_posts
    WHERE user_id = ${resolvedUserId}
      AND organization_id IS NULL
      AND scheduled_timestamp >= EXTRACT(EPOCH FROM (NOW() - INTERVAL '7 days')) * 1000
      AND scheduled_timestamp <= EXTRACT(EPOCH FROM (NOW() + INTERVAL '60 days')) * 1000
    ORDER BY scheduled_timestamp ASC
  `;
}

export async function createScheduledPost(payload) {
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
  } = payload;

  if (
    !user_id ||
    !image_url ||
    !scheduled_timestamp ||
    !scheduled_date ||
    !scheduled_time ||
    !platforms
  ) {
    throw new ValidationError("Missing required fields");
  }

  const sql = getSql();
  const resolvedUserId = await resolveUserId(sql, user_id);
  if (!resolvedUserId) {
    throw new ValidationError("User not found");
  }

  if (organization_id) {
    const context = await resolveOrganizationContext(
      sql,
      resolvedUserId,
      organization_id,
    );
    if (!hasPermission(context.orgRole, PERMISSIONS.SCHEDULE_POST)) {
      throw new PermissionDeniedError("schedule_post");
    }
  }

  const timestampMs =
    typeof scheduled_timestamp === "string"
      ? new Date(scheduled_timestamp).getTime()
      : scheduled_timestamp;

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
  }

  return newPost;
}

export async function updateScheduledPost(id, updates) {
  if (!id) {
    throw new ValidationError("id is required");
  }

  const sql = getSql();
  const post = await sql`
    SELECT organization_id
    FROM scheduled_posts
    WHERE id = ${id}
  `;

  if (post.length === 0) {
    throw new NotFoundError("Scheduled post");
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
        throw new PermissionDeniedError("schedule_post");
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

  const updatedPost = result[0];
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

  return updatedPost;
}

export async function deleteScheduledPost(id, userId) {
  if (!id) {
    throw new ValidationError("id is required");
  }

  const sql = getSql();
  const post = await sql`
    SELECT organization_id
    FROM scheduled_posts
    WHERE id = ${id}
  `;

  if (post.length === 0) {
    throw new NotFoundError("Scheduled post");
  }

  if (post[0].organization_id && userId) {
    const resolvedUserId = await resolveUserId(sql, userId);
    if (resolvedUserId) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        post[0].organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.SCHEDULE_POST)) {
        throw new PermissionDeniedError("schedule_post");
      }
    }
  }

  await sql`DELETE FROM scheduled_posts WHERE id = ${id}`;

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
  }
}

export async function retryScheduledPost(id, userId) {
  if (!id || !userId) {
    throw new ValidationError("id and user_id are required");
  }

  const sql = getSql();
  const resolvedUserId = await resolveUserId(sql, userId);
  if (!resolvedUserId) {
    throw new ValidationError("User not found");
  }

  const posts = await sql`
    SELECT *
    FROM scheduled_posts
    WHERE id = ${id}
    LIMIT 1
  `;
  if (posts.length === 0) {
    throw new NotFoundError("Scheduled post");
  }

  const post = posts[0];
  if (post.status !== "failed") {
    throw new ValidationError("Only failed posts can be retried");
  }

  if (post.organization_id) {
    const context = await resolveOrganizationContext(
      sql,
      resolvedUserId,
      post.organization_id,
    );
    if (!hasPermission(context.orgRole, PERMISSIONS.SCHEDULE_POST)) {
      throw new PermissionDeniedError("schedule_post");
    }
  }

  let instagramAccountId = post.instagram_account_id;
  if (!instagramAccountId) {
    const orgFilter = post.organization_id
      ? sql`AND organization_id = ${post.organization_id}`
      : sql`AND (organization_id IS NULL OR organization_id = '')`;

    const accounts = await sql`
      SELECT id
      FROM instagram_accounts
      WHERE is_active = TRUE
        ${orgFilter}
      ORDER BY connected_at DESC
      LIMIT 1
    `;

    if (accounts.length > 0) {
      instagramAccountId = accounts[0].id;
    }
  }

  if (!instagramAccountId) {
    throw new ValidationError(
      "Nenhuma conta do Instagram conectada. Conecte em Configurações → Integrações.",
    );
  }

  const newTimestamp = Date.now() + 60_000;
  const result = await sql`
    UPDATE scheduled_posts
    SET status = 'scheduled',
        error_message = NULL,
        publish_attempts = 0,
        last_publish_attempt = NULL,
        instagram_account_id = ${instagramAccountId},
        scheduled_timestamp = ${newTimestamp}
    WHERE id = ${id}
    RETURNING *
  `;

  const updatedPost = result[0];

  try {
    await schedulePostForPublishing(
      updatedPost.id,
      resolvedUserId,
      newTimestamp,
    );
    logger.info(
      {
        postId: updatedPost.id,
        instagramAccountId,
        scheduledAt: new Date(newTimestamp).toISOString(),
      },
      "[API] Retried failed post - rescheduled with active instagram account",
    );
  } catch (error) {
    logger.error(
      { err: error, postId: updatedPost.id },
      `[API] Failed to schedule retry job for post ${updatedPost.id}`,
    );
  }

  return updatedPost;
}
