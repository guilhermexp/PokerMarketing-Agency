import { del } from "@vercel/blob";
import { getSql } from "../lib/db.mjs";
import { resolveUserId } from "../lib/user-resolver.mjs";
import { resolveOrganizationContext } from "../lib/auth.mjs";
import {
  ValidationError,
  NotFoundError,
} from "../lib/errors/index.js";
import {
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
} from "../helpers/organization-context.mjs";
import logger from "../lib/logger.js";

export async function listGallery({
  user_id,
  organization_id,
  source,
  limit,
  offset,
  include_src,
}) {
  if (!user_id) {
    throw new ValidationError("user_id is required");
  }

  const sql = getSql();
  const resolvedUserId = await resolveUserId(sql, user_id);
  if (!resolvedUserId) {
    return [];
  }

  const limitNum = Number.parseInt(limit, 10) || 50;
  const offsetNum = Number.parseInt(offset, 10) || 0;

  if (organization_id) {
    await resolveOrganizationContext(sql, resolvedUserId, organization_id);

    if (source) {
      return include_src === "true"
        ? await sql`
            SELECT *
            FROM gallery_images
            WHERE organization_id = ${organization_id}
              AND source = ${source}
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT ${limitNum}
            OFFSET ${offsetNum}
          `
        : await sql`
            SELECT id, user_id, organization_id, source, src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period
            FROM gallery_images
            WHERE organization_id = ${organization_id}
              AND source = ${source}
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT ${limitNum}
            OFFSET ${offsetNum}
          `;
    }

    return include_src === "true"
      ? await sql`
          SELECT *
          FROM gallery_images
          WHERE organization_id = ${organization_id}
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
          OFFSET ${offsetNum}
        `
      : await sql`
          SELECT id, user_id, organization_id, source, src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period
          FROM gallery_images
          WHERE organization_id = ${organization_id}
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
          OFFSET ${offsetNum}
        `;
  }

  if (source) {
    return include_src === "true"
      ? await sql`
          SELECT *
          FROM gallery_images
          WHERE user_id = ${resolvedUserId}
            AND organization_id IS NULL
            AND source = ${source}
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
          OFFSET ${offsetNum}
        `
      : await sql`
          SELECT id, user_id, organization_id, source, src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period
          FROM gallery_images
          WHERE user_id = ${resolvedUserId}
            AND organization_id IS NULL
            AND source = ${source}
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
          OFFSET ${offsetNum}
        `;
  }

  return include_src === "true"
    ? await sql`
        SELECT *
        FROM gallery_images
        WHERE user_id = ${resolvedUserId}
          AND organization_id IS NULL
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${limitNum}
        OFFSET ${offsetNum}
      `
    : await sql`
        SELECT id, user_id, organization_id, source, src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period
        FROM gallery_images
        WHERE user_id = ${resolvedUserId}
          AND organization_id IS NULL
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${limitNum}
        OFFSET ${offsetNum}
      `;
}

export async function listDailyFlyers({
  user_id,
  organization_id,
  week_schedule_id,
}) {
  if (!user_id) {
    throw new ValidationError("user_id is required");
  }

  if (!week_schedule_id) {
    throw new ValidationError("week_schedule_id is required");
  }

  const sql = getSql();
  const resolvedUserId = await resolveUserId(sql, user_id);
  if (!resolvedUserId) {
    return { images: [], structured: {} };
  }

  if (organization_id) {
    await resolveOrganizationContext(sql, resolvedUserId, organization_id);
  }

  const images = organization_id
    ? await sql`
        SELECT id, user_id, organization_id, source, src_url, thumbnail_url, prompt, model, aspect_ratio, image_size, week_schedule_id, daily_flyer_day, daily_flyer_period, created_at, updated_at
        FROM gallery_images
        WHERE organization_id = ${organization_id}
          AND week_schedule_id = ${week_schedule_id}
          AND deleted_at IS NULL
        ORDER BY daily_flyer_day, daily_flyer_period, created_at DESC
      `
    : await sql`
        SELECT id, user_id, organization_id, source, src_url, thumbnail_url, prompt, model, aspect_ratio, image_size, week_schedule_id, daily_flyer_day, daily_flyer_period, created_at, updated_at
        FROM gallery_images
        WHERE user_id = ${resolvedUserId}
          AND organization_id IS NULL
          AND week_schedule_id = ${week_schedule_id}
          AND deleted_at IS NULL
        ORDER BY daily_flyer_day, daily_flyer_period, created_at DESC
      `;

  const structured = {};
  for (const image of images) {
    const day = image.daily_flyer_day || "UNKNOWN";
    const period = image.daily_flyer_period || "UNKNOWN";

    if (!structured[day]) {
      structured[day] = {};
    }

    if (!structured[day][period]) {
      structured[day][period] = [];
    }

    structured[day][period].push(image);
  }

  return { images, structured };
}

export async function createGalleryImage(payload) {
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
    week_schedule_id,
    daily_flyer_day,
    daily_flyer_period,
  } = payload;

  if (!user_id || !src_url || !source || !model) {
    throw new ValidationError("user_id, src_url, source, and model are required");
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
    if (!hasPermission(context.orgRole, PERMISSIONS.CREATE_FLYER)) {
      throw new PermissionDeniedError("create_flyer");
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

  return result[0];
}

export async function updateGalleryImageRecord(id, updates) {
  if (!id) {
    throw new ValidationError("id is required");
  }

  const sql = getSql();
  const current = await sql`SELECT * FROM gallery_images WHERE id = ${id}`;
  if (current.length === 0) {
    throw new NotFoundError("Gallery image");
  }

  const { published_at, is_style_reference, style_reference_name, src_url } =
    updates;

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

  return result[0];
}

export async function deleteGalleryImageRecord(id, userId) {
  if (!id) {
    throw new ValidationError("id is required");
  }

  const sql = getSql();
  const image = await sql`
    SELECT organization_id, src_url
    FROM gallery_images
    WHERE id = ${id}
      AND deleted_at IS NULL
  `;

  if (image.length === 0) {
    throw new NotFoundError("Image");
  }

  if (image[0].organization_id && userId) {
    const resolvedUserId = await resolveUserId(sql, userId);
    if (resolvedUserId) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        image[0].organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.DELETE_GALLERY)) {
        throw new PermissionDeniedError("delete_gallery");
      }
    }
  }

  const srcUrl = image[0].src_url;
  await sql`DELETE FROM gallery_images WHERE id = ${id}`;

  if (
    srcUrl &&
    (srcUrl.includes(".public.blob.vercel-storage.com/") ||
      srcUrl.includes(".blob.vercel-storage.com/"))
  ) {
    try {
      await del(srcUrl);
      logger.info({ url: srcUrl }, "[Gallery] Deleted file from Vercel Blob");
    } catch (error) {
      logger.error(
        { err: error, srcUrl },
        `[Gallery] Failed to delete file from Vercel Blob: ${srcUrl}`,
      );
    }
  }
}
