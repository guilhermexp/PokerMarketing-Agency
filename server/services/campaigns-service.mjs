import { del } from "@vercel/blob";
import { getSql } from "../lib/db.js";
import { resolveUserId } from "../lib/user-resolver.js";
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

function isBlobUrl(url) {
  return Boolean(
    url &&
      (url.includes(".public.blob.vercel-storage.com/") ||
        url.includes(".blob.vercel-storage.com/")),
  );
}

export async function getCampaigns({
  user_id,
  organization_id,
  id,
  include_content,
  limit,
  offset,
}) {
  const sql = getSql();

  if (id) {
    const result = await sql`
      SELECT *
      FROM campaigns
      WHERE id = ${id}
        AND deleted_at IS NULL
      LIMIT 1
    `;

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
          `,
          sql`
            SELECT *
            FROM posts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
          sql`
            SELECT *
            FROM ad_creatives
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
          sql`
            SELECT *
            FROM carousel_scripts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
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

  const parsedLimit = Number.parseInt(limit, 10);
  const parsedOffset = Number.parseInt(offset, 10);
  const hasLimit = Number.isFinite(parsedLimit) && parsedLimit > 0;
  const safeOffset =
    Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  if (organization_id) {
    await resolveOrganizationContext(sql, resolvedUserId, organization_id);

    return hasLimit
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
          WHERE c.organization_id = ${organization_id}
            AND c.deleted_at IS NULL
          ORDER BY c.created_at DESC
          LIMIT ${parsedLimit}
          OFFSET ${safeOffset}
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
          WHERE c.organization_id = ${organization_id}
            AND c.deleted_at IS NULL
          ORDER BY c.created_at DESC
        `;
  }

  return hasLimit
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
        WHERE c.user_id = ${resolvedUserId}
          AND c.organization_id IS NULL
          AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
        LIMIT ${parsedLimit}
        OFFSET ${safeOffset}
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
        WHERE c.user_id = ${resolvedUserId}
          AND c.organization_id IS NULL
          AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `;
}

export async function createCampaign(payload) {
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

  const result = await sql`
    INSERT INTO campaigns (user_id, organization_id, name, brand_profile_id, input_transcript, generation_options, status)
    VALUES (${resolvedUserId}, ${organization_id || null}, ${name || null}, ${brand_profile_id || null}, ${input_transcript || null}, ${JSON.stringify(generation_options) || null}, ${status || "draft"})
    RETURNING *
  `;

  const campaign = result[0];
  const createdVideoClipScripts = [];
  if (Array.isArray(video_clip_scripts)) {
    for (const [index, script] of video_clip_scripts.entries()) {
      const row = await sql`
        INSERT INTO video_clip_scripts (campaign_id, user_id, organization_id, title, hook, image_prompt, audio_script, scenes, sort_order)
        VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${script.title}, ${script.hook}, ${script.image_prompt || null}, ${script.audio_script || null}, ${JSON.stringify(script.scenes || [])}, ${index})
        RETURNING *
      `;
      createdVideoClipScripts.push(row[0]);
    }
  }

  const createdPosts = [];
  if (Array.isArray(posts)) {
    for (const [index, post] of posts.entries()) {
      const row = await sql`
        INSERT INTO posts (campaign_id, user_id, organization_id, platform, content, hashtags, image_prompt, sort_order)
        VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${post.platform}, ${post.content}, ${post.hashtags || []}, ${post.image_prompt || null}, ${index})
        RETURNING *
      `;
      createdPosts.push(row[0]);
    }
  }

  const createdAdCreatives = [];
  if (Array.isArray(ad_creatives)) {
    for (const [index, ad] of ad_creatives.entries()) {
      const row = await sql`
        INSERT INTO ad_creatives (campaign_id, user_id, organization_id, platform, headline, body, cta, image_prompt, sort_order)
        VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${ad.platform}, ${ad.headline}, ${ad.body}, ${ad.cta}, ${ad.image_prompt || null}, ${index})
        RETURNING *
      `;
      createdAdCreatives.push(row[0]);
    }
  }

  const createdCarouselScripts = [];
  if (Array.isArray(carousel_scripts)) {
    for (const [index, carousel] of carousel_scripts.entries()) {
      const row = await sql`
        INSERT INTO carousel_scripts (campaign_id, user_id, organization_id, title, hook, cover_prompt, cover_url, caption, slides, sort_order)
        VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${carousel.title}, ${carousel.hook}, ${carousel.cover_prompt || null}, ${carousel.cover_url || null}, ${carousel.caption || null}, ${JSON.stringify(carousel.slides || [])}, ${index})
        RETURNING *
      `;
      createdCarouselScripts.push(row[0]);
    }
  }

  return {
    ...campaign,
    video_clip_scripts: createdVideoClipScripts,
    posts: createdPosts,
    ad_creatives: createdAdCreatives,
    carousel_scripts: createdCarouselScripts,
  };
}

export async function deleteCampaign(id, userId) {
  if (!id) {
    throw new ValidationError("id is required");
  }

  const sql = getSql();
  const campaign = await sql`
    SELECT organization_id
    FROM campaigns
    WHERE id = ${id}
      AND deleted_at IS NULL
  `;

  if (campaign.length === 0) {
    throw new NotFoundError("Campaign");
  }

  if (campaign[0].organization_id && userId) {
    const resolvedUserId = await resolveUserId(sql, userId);
    if (resolvedUserId) {
      const context = await resolveOrganizationContext(
        sql,
        resolvedUserId,
        campaign[0].organization_id,
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

  const campaignImages = await sql`
    SELECT id, src_url
    FROM gallery_images
    WHERE (
      post_id IN (SELECT id FROM posts WHERE campaign_id = ${id})
      OR ad_creative_id IN (SELECT id FROM ad_creatives WHERE campaign_id = ${id})
      OR video_script_id IN (SELECT id FROM video_clip_scripts WHERE campaign_id = ${id})
    )
      AND deleted_at IS NULL
  `;

  const posts = await sql`
    SELECT id, image_url
    FROM posts
    WHERE campaign_id = ${id}
  `;
  const ads = await sql`
    SELECT id, image_url
    FROM ad_creatives
    WHERE campaign_id = ${id}
  `;
  const clips = await sql`
    SELECT id, thumbnail_url, video_url
    FROM video_clip_scripts
    WHERE campaign_id = ${id}
  `;

  const urlsToDelete = [
    ...campaignImages.map((image) => image.src_url).filter(isBlobUrl),
    ...posts.map((post) => post.image_url).filter(isBlobUrl),
    ...ads.map((ad) => ad.image_url).filter(isBlobUrl),
    ...clips.flatMap((clip) => [clip.thumbnail_url, clip.video_url]).filter(isBlobUrl),
  ];

  for (const url of urlsToDelete) {
    try {
      await del(url);
      logger.debug({ url }, "[Campaign Delete] Deleted file");
    } catch (error) {
      logger.error(
        { err: error, url },
        `[Campaign Delete] Failed to delete file: ${url}`,
      );
    }
  }

  if (campaignImages.length > 0) {
    const imageIds = campaignImages.map((image) => image.id);
    await sql`DELETE FROM gallery_images WHERE id = ANY(${imageIds})`;
  }

  await sql`DELETE FROM posts WHERE campaign_id = ${id}`;
  await sql`DELETE FROM ad_creatives WHERE campaign_id = ${id}`;
  await sql`DELETE FROM video_clip_scripts WHERE campaign_id = ${id}`;
  await sql`DELETE FROM campaigns WHERE id = ${id}`;

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

export async function updateCampaignClipThumbnail(clipId, thumbnailUrl) {
  if (!clipId) {
    throw new ValidationError("clip_id is required");
  }

  const sql = getSql();
  const result = await sql`
    UPDATE video_clip_scripts
    SET thumbnail_url = ${thumbnailUrl || null},
        updated_at = NOW()
    WHERE id = ${clipId}
    RETURNING *
  `;

  if (result.length === 0) {
    throw new NotFoundError("Clip");
  }

  return result[0];
}

export async function updateCampaignSceneImage(clipId, sceneNumber, imageUrl) {
  if (!clipId || sceneNumber === undefined) {
    throw new ValidationError("clip_id and scene_number are required");
  }

  const sql = getSql();
  const sceneNum = Number.parseInt(sceneNumber, 10);
  const [clip] = await sql`
    SELECT scenes
    FROM video_clip_scripts
    WHERE id = ${clipId}
  `;

  if (!clip) {
    throw new NotFoundError("Clip");
  }

  const updatedScenes = (clip.scenes || []).map((scene) =>
    scene.scene === sceneNum ? { ...scene, image_url: imageUrl || null } : scene,
  );

  const result = await sql`
    UPDATE video_clip_scripts
    SET scenes = ${JSON.stringify(updatedScenes)}::jsonb,
        updated_at = NOW()
    WHERE id = ${clipId}
    RETURNING *
  `;

  return result[0];
}

export async function getCarousels({ user_id, organization_id }) {
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
    return await sql`
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
  }

  return await sql`
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

export async function updateCarousel(id, { cover_url, caption }) {
  if (!id) {
    throw new ValidationError("id is required");
  }

  if (cover_url === undefined && caption === undefined) {
    throw new ValidationError("No fields to update");
  }

  const sql = getSql();
  const result = await sql`
    UPDATE carousel_scripts
    SET cover_url = COALESCE(${cover_url}, cover_url),
        caption = COALESCE(${caption}, caption),
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  if (result.length === 0) {
    throw new NotFoundError("Carousel");
  }

  return result[0];
}

export async function updateCarouselSlideImage(carouselId, slideNumber, imageUrl) {
  if (!carouselId || slideNumber === undefined) {
    throw new ValidationError("carousel_id and slide_number are required");
  }

  const sql = getSql();
  const slideNum = Number.parseInt(slideNumber, 10);
  const [carousel] = await sql`
    SELECT slides
    FROM carousel_scripts
    WHERE id = ${carouselId}
  `;

  if (!carousel) {
    throw new NotFoundError("Carousel");
  }

  const updatedSlides = (carousel.slides || []).map((slide) =>
    slide.slide === slideNum ? { ...slide, image_url: imageUrl || null } : slide,
  );

  const result = await sql`
    UPDATE carousel_scripts
    SET slides = ${JSON.stringify(updatedSlides)}::jsonb,
        updated_at = NOW()
    WHERE id = ${carouselId}
    RETURNING *
  `;

  return result[0];
}
