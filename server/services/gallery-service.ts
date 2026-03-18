import { del } from "@vercel/blob";
import { getSql } from "../lib/db.js";
import { resolveUserId } from "../lib/user-resolver.js";
import { resolveOrganizationContext } from "../lib/auth.js";
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

export interface GalleryImage {
  id: string;
  user_id: string;
  organization_id: string | null;
  source: string;
  src_url: string;
  thumbnail_url: string | null;
  prompt: string | null;
  model: string | null;
  aspect_ratio: string | null;
  image_size: string | null;
  post_id: string | null;
  ad_creative_id: string | null;
  video_script_id: string | null;
  carousel_script_id: string | null;
  is_style_reference: boolean;
  style_reference_name: string | null;
  media_type: string;
  duration: number | null;
  week_schedule_id: string | null;
  daily_flyer_day: string | null;
  daily_flyer_period: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface ListGalleryParams {
  user_id?: string;
  organization_id?: string | null;
  source?: string;
  limit?: string | number;
  offset?: string | number;
  include_src?: string | boolean;
}

export async function listGallery({
  user_id,
  organization_id,
  source,
  limit,
  offset,
  include_src,
}: ListGalleryParams): Promise<GalleryImage[]> {
  if (!user_id) {
    throw new ValidationError("user_id is required");
  }

  const sql = getSql();
  const resolvedUserId = await resolveUserId(sql, user_id);
  if (!resolvedUserId) {
    return [];
  }

  const limitNum = Number.parseInt(String(limit ?? "50"), 10) || 50;
  const offsetNum = Number.parseInt(String(offset ?? "0"), 10) || 0;
  const includeSrc = include_src === true || include_src === "true";
  const selectedColumns = includeSrc
    ? "*"
    : "id, user_id, organization_id, source, src_url, thumbnail_url, created_at, updated_at, deleted_at, is_style_reference, style_reference_name, week_schedule_id, daily_flyer_period";
  const queryConditions: string[] = ["deleted_at IS NULL"];
  const queryParams: Array<string | number> = [];

  if (organization_id) {
    await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    queryParams.push(organization_id);
    queryConditions.push(`organization_id = $${queryParams.length}`);
  } else {
    queryParams.push(resolvedUserId);
    queryConditions.push(`user_id = $${queryParams.length}`);
    queryConditions.push("organization_id IS NULL");
  }

  if (source) {
    queryParams.push(source);
    queryConditions.push(`source = $${queryParams.length}`);
  }

  queryParams.push(limitNum, offsetNum);

  return (await sql.query(
    `
      SELECT ${selectedColumns}
      FROM gallery_images
      WHERE ${queryConditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${queryParams.length - 1}
      OFFSET $${queryParams.length}
    `,
    queryParams,
  )) as GalleryImage[];
}

export interface ListDailyFlyersParams {
  user_id?: string;
  organization_id?: string | null;
  week_schedule_id?: string;
}

export interface DailyFlyersResult {
  images: GalleryImage[];
  structured: Record<string, Record<string, GalleryImage[]>>;
}

export async function listDailyFlyers({
  user_id,
  organization_id,
  week_schedule_id,
}: ListDailyFlyersParams): Promise<DailyFlyersResult> {
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

  const images = (organization_id
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
      `) as GalleryImage[];

  const structured: Record<string, Record<string, GalleryImage[]>> = {};
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

export interface CreateGalleryImageParams {
  user_id?: string;
  organization_id?: string | null;
  src_url?: string;
  prompt?: string | null;
  source?: string;
  model?: string;
  aspect_ratio?: string | null;
  image_size?: string | null;
  post_id?: string | null;
  ad_creative_id?: string | null;
  video_script_id?: string | null;
  is_style_reference?: boolean;
  style_reference_name?: string | null;
  media_type?: string;
  duration?: number | null;
  week_schedule_id?: string | null;
  daily_flyer_day?: string | null;
  daily_flyer_period?: string | null;
}

export async function createGalleryImage(payload: CreateGalleryImageParams): Promise<GalleryImage> {
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

  const result = (await sql`
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
  `) as GalleryImage[];

  return result[0]!;
}

export interface UpdateGalleryImageParams {
  published_at?: Date | null;
  is_style_reference?: boolean;
  style_reference_name?: string | null;
  src_url?: string;
}

export async function updateGalleryImageRecord(id: string, updates: UpdateGalleryImageParams): Promise<GalleryImage> {
  if (!id) {
    throw new ValidationError("id is required");
  }

  const sql = getSql();
  const current = (await sql`SELECT * FROM gallery_images WHERE id = ${id}`) as GalleryImage[];
  if (current.length === 0) {
    throw new NotFoundError("Gallery image");
  }

  const { published_at, is_style_reference, style_reference_name, src_url } =
    updates;

  const currentImage = current[0]!;
  const result = (await sql`
    UPDATE gallery_images
    SET
      published_at = ${published_at !== undefined ? published_at || null : currentImage.published_at},
      is_style_reference = ${is_style_reference !== undefined ? is_style_reference : currentImage.is_style_reference},
      style_reference_name = ${style_reference_name !== undefined ? style_reference_name || null : currentImage.style_reference_name},
      src_url = ${src_url !== undefined ? src_url : currentImage.src_url},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as GalleryImage[];

  return result[0]!;
}

export async function deleteGalleryImageRecord(id: string, userId?: string): Promise<void> {
  if (!id) {
    throw new ValidationError("id is required");
  }

  const sql = getSql();
  const image = (await sql`
    SELECT organization_id, src_url
    FROM gallery_images
    WHERE id = ${id}
      AND deleted_at IS NULL
  `) as Array<{ organization_id: string | null; src_url: string | null }>;

  if (image.length === 0) {
    throw new NotFoundError("Image");
  }

  const imageRecord = image[0]!;
  if (imageRecord.organization_id && userId) {
    const resolvedUserId = await resolveUserId(sql, userId);
    if (resolvedUserId) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        imageRecord.organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.DELETE_GALLERY)) {
        throw new PermissionDeniedError("delete_gallery");
      }
    }
  }

  const srcUrl = imageRecord.src_url;
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
