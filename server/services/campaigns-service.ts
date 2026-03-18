import { randomUUID } from "node:crypto";
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

function isBlobUrl(url: string | null | undefined): url is string {
  return Boolean(
    url &&
      (url.includes(".public.blob.vercel-storage.com/") ||
        url.includes(".blob.vercel-storage.com/")),
  );
}

function buildCampaignListQuery(options: {
  ownerId: string;
  organizationId: string | null;
  hasLimit: boolean;
  limit: number;
  offset: number;
}): { query: string; params: unknown[] } {
  const { ownerId, organizationId, hasLimit, limit, offset } = options;
  const params: unknown[] = [ownerId];
  const ownershipFilter = organizationId
    ? "c.organization_id = $1"
    : "c.user_id = $1 AND c.organization_id IS NULL";
  let paginationClause = "";

  if (hasLimit) {
    params.push(limit);
    paginationClause += ` LIMIT $${params.length}`;
    params.push(offset);
    paginationClause += ` OFFSET $${params.length}`;
  }

  return {
    query: `
      WITH video_stats AS (
        SELECT
          campaign_id,
          COUNT(*)::int AS clips_count,
          (ARRAY_AGG(thumbnail_url ORDER BY sort_order ASC, id ASC)
            FILTER (WHERE thumbnail_url IS NOT NULL))[1] AS clip_preview_url
        FROM video_clip_scripts
        GROUP BY campaign_id
      ),
      post_stats AS (
        SELECT
          campaign_id,
          COUNT(*)::int AS posts_count,
          (ARRAY_AGG(image_url ORDER BY sort_order ASC, id ASC)
            FILTER (WHERE image_url IS NOT NULL AND image_url NOT LIKE 'data:%'))[1] AS post_preview_url
        FROM posts
        GROUP BY campaign_id
      ),
      ad_stats AS (
        SELECT
          campaign_id,
          COUNT(*)::int AS ads_count,
          (ARRAY_AGG(image_url ORDER BY sort_order ASC, id ASC)
            FILTER (WHERE image_url IS NOT NULL AND image_url NOT LIKE 'data:%'))[1] AS ad_preview_url
        FROM ad_creatives
        GROUP BY campaign_id
      ),
      carousel_stats AS (
        SELECT
          campaign_id,
          COUNT(*)::int AS carousels_count,
          (ARRAY_AGG(cover_url ORDER BY sort_order ASC, id ASC)
            FILTER (WHERE cover_url IS NOT NULL))[1] AS carousel_preview_url
        FROM carousel_scripts
        GROUP BY campaign_id
      )
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
        COALESCE(video_stats.clips_count, 0)::int AS clips_count,
        COALESCE(post_stats.posts_count, 0)::int AS posts_count,
        COALESCE(ad_stats.ads_count, 0)::int AS ads_count,
        COALESCE(carousel_stats.carousels_count, 0)::int AS carousels_count,
        video_stats.clip_preview_url,
        post_stats.post_preview_url,
        ad_stats.ad_preview_url,
        carousel_stats.carousel_preview_url
      FROM campaigns c
      LEFT JOIN video_stats ON video_stats.campaign_id = c.id
      LEFT JOIN post_stats ON post_stats.campaign_id = c.id
      LEFT JOIN ad_stats ON ad_stats.campaign_id = c.id
      LEFT JOIN carousel_stats ON carousel_stats.campaign_id = c.id
      WHERE ${ownershipFilter}
        AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC
      ${paginationClause}
    `,
    params,
  };
}

function buildMultiRowInsertQuery(
  table: string,
  columns: string[],
  rows: unknown[][],
): { query: string; params: unknown[] } {
  const params: unknown[] = [];
  let parameterIndex = 1;

  const valuesClause = rows
    .map((row) => {
      const placeholders = row.map((value) => {
        params.push(value);
        const placeholder = `$${parameterIndex}`;
        parameterIndex += 1;
        return placeholder;
      });

      return `(${placeholders.join(", ")})`;
    })
    .join(", ");

  return {
    query: `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valuesClause} RETURNING *`,
    params,
  };
}

export interface Campaign {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string | null;
  description: string | null;
  brand_profile_id: string | null;
  input_transcript: string | null;
  generation_options: Record<string, unknown> | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CampaignWithCounts extends Campaign {
  clips_count: number;
  posts_count: number;
  ads_count: number;
  carousels_count: number;
  clip_preview_url: string | null;
  post_preview_url: string | null;
  ad_preview_url: string | null;
  carousel_preview_url: string | null;
}

export interface VideoClipScript {
  id: string;
  campaign_id: string;
  user_id: string;
  organization_id: string | null;
  title: string;
  hook: string;
  image_prompt: string | null;
  audio_script: string | null;
  scenes: Scene[];
  thumbnail_url: string | null;
  video_url: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface Scene {
  scene: number;
  visual: string;
  narration: string;
  image_url?: string | null;
}

export interface Post {
  id: string;
  campaign_id: string;
  user_id: string;
  organization_id: string | null;
  platform: string;
  content: string;
  hashtags: string[];
  image_prompt: string | null;
  image_url: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface AdCreative {
  id: string;
  campaign_id: string;
  user_id: string;
  organization_id: string | null;
  platform: string;
  headline: string;
  body: string;
  cta: string;
  image_prompt: string | null;
  image_url: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CarouselSlide {
  slide: number;
  title: string;
  content: string;
  image_prompt?: string | null;
  image_url?: string | null;
}

export interface CarouselScript {
  id: string;
  campaign_id: string;
  user_id: string;
  organization_id: string | null;
  title: string;
  hook: string;
  cover_prompt: string | null;
  cover_url: string | null;
  caption: string | null;
  slides: CarouselSlide[];
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CampaignWithContent extends Campaign {
  video_clip_scripts: VideoClipScript[];
  posts: Post[];
  ad_creatives: AdCreative[];
  carousel_scripts: CarouselScript[];
}

export interface GetCampaignsParams {
  user_id?: string;
  organization_id?: string | null;
  id?: string;
  include_content?: string;
  limit?: string | number;
  offset?: string | number;
}

export async function getCampaigns({
  user_id,
  organization_id,
  id,
  include_content,
  limit,
  offset,
}: GetCampaignsParams): Promise<Campaign | CampaignWithContent | CampaignWithCounts[] | null> {
  const sql = getSql();

  if (id) {
    const result = (await sql`
      SELECT *
      FROM campaigns
      WHERE id = ${id}
        AND deleted_at IS NULL
      LIMIT 1
    `) as Campaign[];

    if (!result[0]) {
      return null;
    }

    if (include_content === "true") {
      const campaign = result[0];
      const [videoScripts, posts, adCreatives, carouselScripts] =
        await Promise.all([
          sql`
            SELECT *
            FROM video_clip_scripts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `.then(rows => rows as unknown as VideoClipScript[]),
          sql`
            SELECT *
            FROM posts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `.then(rows => rows as unknown as Post[]),
          sql`
            SELECT *
            FROM ad_creatives
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `.then(rows => rows as unknown as AdCreative[]),
          sql`
            SELECT *
            FROM carousel_scripts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `.then(rows => rows as unknown as CarouselScript[]),
        ]);

      return {
        ...campaign,
        video_clip_scripts: videoScripts,
        posts,
        ad_creatives: adCreatives,
        carousel_scripts: carouselScripts,
      };
    }

    return result[0];
  }

  if (!user_id) {
    throw new ValidationError("user_id is required");
  }

  const resolvedUserId = await resolveUserId(sql, user_id);
  if (!resolvedUserId) {
    return [];
  }

  const parsedLimit = Number.parseInt(String(limit ?? ""), 10);
  const parsedOffset = Number.parseInt(String(offset ?? ""), 10);
  const hasLimit = Number.isFinite(parsedLimit) && parsedLimit > 0;
  const safeOffset =
    Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  if (organization_id) {
    await resolveOrganizationContext(sql, resolvedUserId, organization_id);

    const { query, params } = buildCampaignListQuery({
      ownerId: organization_id,
      organizationId: organization_id,
      hasLimit,
      limit: parsedLimit,
      offset: safeOffset,
    });

    return (await sql.query(query, params)) as CampaignWithCounts[];
  }

  const { query, params } = buildCampaignListQuery({
    ownerId: resolvedUserId,
    organizationId: null,
    hasLimit,
    limit: parsedLimit,
    offset: safeOffset,
  });

  return (await sql.query(query, params)) as CampaignWithCounts[];
}

export interface CreateCampaignParams {
  user_id?: string;
  organization_id?: string | null;
  name?: string | null;
  brand_profile_id?: string | null;
  input_transcript?: string | null;
  generation_options?: Record<string, unknown> | null;
  status?: string;
  video_clip_scripts?: Array<{
    title: string;
    hook: string;
    image_prompt?: string | null;
    audio_script?: string | null;
    scenes?: Scene[];
  }>;
  posts?: Array<{
    platform: string;
    content: string;
    hashtags?: string[];
    image_prompt?: string | null;
  }>;
  ad_creatives?: Array<{
    platform: string;
    headline: string;
    body: string;
    cta: string;
    image_prompt?: string | null;
  }>;
  carousel_scripts?: Array<{
    title: string;
    hook: string;
    cover_prompt?: string | null;
    cover_url?: string | null;
    caption?: string | null;
    slides?: CarouselSlide[];
  }>;
}

export async function createCampaign(payload: CreateCampaignParams): Promise<CampaignWithContent> {
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
  } = payload;

  if (!user_id) {
    throw new ValidationError("user_id is required");
  }

  const sql = getSql();
  const resolvedUserId = await resolveUserId(sql, user_id);
  if (!resolvedUserId) {
    throw new NotFoundError("User", user_id);
  }

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
  const campaignId = randomUUID();
  const transactionQueries = [
    sql.query(
      `
        INSERT INTO campaigns (id, user_id, organization_id, name, brand_profile_id, input_transcript, generation_options, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [
        campaignId,
        resolvedUserId,
        organization_id || null,
        name || null,
        brand_profile_id || null,
        input_transcript || null,
        generation_options == null ? null : JSON.stringify(generation_options),
        status || "draft",
      ],
    ),
  ];

  const hasVideoScripts = Array.isArray(video_clip_scripts) && video_clip_scripts.length > 0;
  if (hasVideoScripts) {
    const { query, params } = buildMultiRowInsertQuery(
      "video_clip_scripts",
      [
        "campaign_id",
        "user_id",
        "organization_id",
        "title",
        "hook",
        "image_prompt",
        "audio_script",
        "scenes",
        "sort_order",
      ],
      video_clip_scripts.map((script, index) => [
        campaignId,
        resolvedUserId,
        organization_id || null,
        script.title,
        script.hook,
        script.image_prompt || null,
        script.audio_script || null,
        JSON.stringify(script.scenes || []),
        index,
      ]),
    );
    transactionQueries.push(sql.query(query, params));
  }

  const hasPosts = Array.isArray(posts) && posts.length > 0;
  if (hasPosts) {
    const { query, params } = buildMultiRowInsertQuery(
      "posts",
      [
        "campaign_id",
        "user_id",
        "organization_id",
        "platform",
        "content",
        "hashtags",
        "image_prompt",
        "sort_order",
      ],
      posts.map((post, index) => [
        campaignId,
        resolvedUserId,
        organization_id || null,
        post.platform,
        post.content,
        post.hashtags || [],
        post.image_prompt || null,
        index,
      ]),
    );
    transactionQueries.push(sql.query(query, params));
  }

  const hasAdCreatives = Array.isArray(ad_creatives) && ad_creatives.length > 0;
  if (hasAdCreatives) {
    const { query, params } = buildMultiRowInsertQuery(
      "ad_creatives",
      [
        "campaign_id",
        "user_id",
        "organization_id",
        "platform",
        "headline",
        "body",
        "cta",
        "image_prompt",
        "sort_order",
      ],
      ad_creatives.map((ad, index) => [
        campaignId,
        resolvedUserId,
        organization_id || null,
        ad.platform,
        ad.headline,
        ad.body,
        ad.cta,
        ad.image_prompt || null,
        index,
      ]),
    );
    transactionQueries.push(sql.query(query, params));
  }

  const hasCarouselScripts =
    Array.isArray(carousel_scripts) && carousel_scripts.length > 0;
  if (hasCarouselScripts) {
    const { query, params } = buildMultiRowInsertQuery(
      "carousel_scripts",
      [
        "campaign_id",
        "user_id",
        "organization_id",
        "title",
        "hook",
        "cover_prompt",
        "cover_url",
        "caption",
        "slides",
        "sort_order",
      ],
      carousel_scripts.map((carousel, index) => [
        campaignId,
        resolvedUserId,
        organization_id || null,
        carousel.title,
        carousel.hook,
        carousel.cover_prompt || null,
        carousel.cover_url || null,
        carousel.caption || null,
        JSON.stringify(carousel.slides || []),
        index,
      ]),
    );
    transactionQueries.push(sql.query(query, params));
  }

  const transactionResults = await sql.transaction(transactionQueries);
  let resultIndex = 0;

  const campaign = (transactionResults[resultIndex++] as Campaign[])[0]!;
  const createdVideoClipScripts = hasVideoScripts
    ? (transactionResults[resultIndex++] as VideoClipScript[])
    : [];
  const createdPosts = hasPosts
    ? (transactionResults[resultIndex++] as Post[])
    : [];
  const createdAdCreatives = hasAdCreatives
    ? (transactionResults[resultIndex++] as AdCreative[])
    : [];
  const createdCarouselScripts = hasCarouselScripts
    ? (transactionResults[resultIndex++] as CarouselScript[])
    : [];

  return {
    ...campaign,
    video_clip_scripts: createdVideoClipScripts,
    posts: createdPosts,
    ad_creatives: createdAdCreatives,
    carousel_scripts: createdCarouselScripts,
  };
}

export interface DeleteCampaignResult {
  success: boolean;
  deleted: {
    campaign: number;
    posts: number;
    ads: number;
    clips: number;
    galleryImages: number;
    files: number;
  };
}

export async function deleteCampaign(id: string, userId?: string): Promise<DeleteCampaignResult> {
  if (!id) {
    throw new ValidationError("id is required");
  }

  const sql = getSql();
  const campaign = (await sql`
    SELECT organization_id
    FROM campaigns
    WHERE id = ${id}
      AND deleted_at IS NULL
  `) as Array<{ organization_id: string | null }>;

  if (campaign.length === 0) {
    throw new NotFoundError("Campaign");
  }

  const campaignRecord = campaign[0]!;
  if (campaignRecord.organization_id && userId) {
    const resolvedUserId = await resolveUserId(sql, userId);
    if (resolvedUserId) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        campaignRecord.organization_id,
      );
      if (!hasPermission(context.orgRole, PERMISSIONS.DELETE_CAMPAIGN)) {
        throw new PermissionDeniedError("delete_campaign");
      }
    }
  }

  logger.info(
    { campaignId: id },
    "[Campaign Delete] Starting cascade delete for campaign",
  );

  const campaignImages = (await sql`
    SELECT id, src_url
    FROM gallery_images
    WHERE (
      post_id IN (SELECT id FROM posts WHERE campaign_id = ${id})
      OR ad_creative_id IN (SELECT id FROM ad_creatives WHERE campaign_id = ${id})
      OR video_script_id IN (SELECT id FROM video_clip_scripts WHERE campaign_id = ${id})
    )
      AND deleted_at IS NULL
  `) as Array<{ id: string; src_url: string | null }>;

  const posts = (await sql`
    SELECT id, image_url
    FROM posts
    WHERE campaign_id = ${id}
  `) as Array<{ id: string; image_url: string | null }>;
  const ads = (await sql`
    SELECT id, image_url
    FROM ad_creatives
    WHERE campaign_id = ${id}
  `) as Array<{ id: string; image_url: string | null }>;
  const clips = (await sql`
    SELECT id, thumbnail_url, video_url
    FROM video_clip_scripts
    WHERE campaign_id = ${id}
  `) as Array<{ id: string; thumbnail_url: string | null; video_url: string | null }>;

  const urlsToDelete = [
    ...campaignImages.map((image) => image.src_url).filter(isBlobUrl),
    ...posts.map((post) => post.image_url).filter(isBlobUrl),
    ...ads.map((ad) => ad.image_url).filter(isBlobUrl),
    ...clips.flatMap((clip) => [clip.thumbnail_url, clip.video_url]).filter(isBlobUrl),
  ];

  await Promise.allSettled(
    urlsToDelete.map(async (url) => {
      try {
        await del(url);
        logger.debug({ url }, "[Campaign Delete] Deleted file");
      } catch (error) {
        logger.error(
          { err: error, url },
          `[Campaign Delete] Failed to delete file: ${url}`,
        );
      }
    }),
  );

  const deleteQueries = [];
  if (campaignImages.length > 0) {
    const imageIds = campaignImages.map((image) => image.id);
    deleteQueries.push(sql`DELETE FROM gallery_images WHERE id = ANY(${imageIds})`);
  }
  deleteQueries.push(sql`DELETE FROM posts WHERE campaign_id = ${id}`);
  deleteQueries.push(sql`DELETE FROM ad_creatives WHERE campaign_id = ${id}`);
  deleteQueries.push(sql`DELETE FROM video_clip_scripts WHERE campaign_id = ${id}`);
  deleteQueries.push(sql`DELETE FROM campaigns WHERE id = ${id}`);

  await sql.transaction(deleteQueries);

  return {
    success: true,
    deleted: {
      campaign: 1,
      posts: posts.length,
      ads: ads.length,
      clips: clips.length,
      galleryImages: campaignImages.length,
      files: urlsToDelete.length,
    },
  };
}

export async function updateCampaignClipThumbnail(clipId: string, thumbnailUrl: string | null): Promise<VideoClipScript> {
  if (!clipId) {
    throw new ValidationError("clip_id is required");
  }

  const sql = getSql();
  const result = (await sql`
    UPDATE video_clip_scripts
    SET thumbnail_url = ${thumbnailUrl || null},
        updated_at = NOW()
    WHERE id = ${clipId}
    RETURNING *
  `) as VideoClipScript[];

  if (result.length === 0) {
    throw new NotFoundError("Clip");
  }

  return result[0]!;
}

export async function updateCampaignSceneImage(clipId: string, sceneNumber: number | string, imageUrl: string | null): Promise<VideoClipScript> {
  if (!clipId || sceneNumber === undefined) {
    throw new ValidationError("clip_id and scene_number are required");
  }

  const sql = getSql();
  const sceneNum = typeof sceneNumber === "string" ? Number.parseInt(sceneNumber, 10) : sceneNumber;
  const clips = (await sql`
    SELECT scenes
    FROM video_clip_scripts
    WHERE id = ${clipId}
  `) as Array<{ scenes: Scene[] }>;

  const clip = clips[0];
  if (!clip) {
    throw new NotFoundError("Clip");
  }

  const updatedScenes = (clip.scenes || []).map((scene: Scene) =>
    scene.scene === sceneNum ? { ...scene, image_url: imageUrl || null } : scene,
  );

  const result = (await sql`
    UPDATE video_clip_scripts
    SET scenes = ${JSON.stringify(updatedScenes)}::jsonb,
        updated_at = NOW()
    WHERE id = ${clipId}
    RETURNING *
  `) as VideoClipScript[];

  return result[0]!;
}

export interface GetCarouselsParams {
  user_id?: string;
  organization_id?: string | null;
}

export interface CarouselWithDetails extends CarouselScript {
  campaign_name: string | null;
  gallery_images: string[];
  slides_count: number;
}

export async function getCarousels({ user_id, organization_id }: GetCarouselsParams): Promise<CarouselWithDetails[]> {
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
    return (await sql`
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
    `) as CarouselWithDetails[];
  }

  return (await sql`
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
  `) as CarouselWithDetails[];
}

export interface UpdateCarouselParams {
  cover_url?: string | null;
  caption?: string | null;
}

export async function updateCarousel(id: string, { cover_url, caption }: UpdateCarouselParams): Promise<CarouselScript> {
  if (!id) {
    throw new ValidationError("id is required");
  }

  if (cover_url === undefined && caption === undefined) {
    throw new ValidationError("No fields to update");
  }

  const sql = getSql();
  const result = (await sql`
    UPDATE carousel_scripts
    SET cover_url = COALESCE(${cover_url ?? null}, cover_url),
        caption = COALESCE(${caption ?? null}, caption),
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as CarouselScript[];

  if (result.length === 0) {
    throw new NotFoundError("Carousel");
  }

  return result[0]!;
}

export async function updateCarouselSlideImage(carouselId: string, slideNumber: number | string, imageUrl: string | null): Promise<CarouselScript> {
  if (!carouselId || slideNumber === undefined) {
    throw new ValidationError("carousel_id and slide_number are required");
  }

  const sql = getSql();
  const slideNum = typeof slideNumber === "string" ? Number.parseInt(slideNumber, 10) : slideNumber;
  const carousels = (await sql`
    SELECT slides
    FROM carousel_scripts
    WHERE id = ${carouselId}
  `) as Array<{ slides: CarouselSlide[] }>;

  const carousel = carousels[0];
  if (!carousel) {
    throw new NotFoundError("Carousel");
  }

  const updatedSlides = (carousel.slides || []).map((slide: CarouselSlide) =>
    slide.slide === slideNum ? { ...slide, image_url: imageUrl || null } : slide,
  );

  const result = (await sql`
    UPDATE carousel_scripts
    SET slides = ${JSON.stringify(updatedSlides)}::jsonb,
        updated_at = NOW()
    WHERE id = ${carouselId}
    RETURNING *
  `) as CarouselScript[];

  return result[0]!;
}
