/**
 * Vercel Serverless Function - Campaigns API
 * CRUD operations for marketing campaigns in Neon PostgreSQL
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors, resolveUserId } from './_helpers/index';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  try {
    const sql = getSql();

    // GET - List campaigns or get single campaign
    if (req.method === 'GET') {
      const {
        user_id,
        organization_id,
        id,
        status,
        limit = '50',
        offset = '0',
        include_content,
      } = req.query;

      // Get single campaign by ID
      if (id) {
        const result = await sql`
          SELECT * FROM campaigns
          WHERE id = ${id as string} AND deleted_at IS NULL
          LIMIT 1
        `;

        if (!result[0]) {
          return res.status(200).json(null);
        }

        // If include_content is true, also fetch video_clip_scripts, posts, and ad_creatives
        if (include_content === 'true') {
          const campaign = result[0];

          const [videoScripts, posts, adCreatives] = await Promise.all([
            sql`
              SELECT * FROM video_clip_scripts
              WHERE campaign_id = ${id as string}
              ORDER BY sort_order ASC
            `,
            sql`
              SELECT * FROM posts
              WHERE campaign_id = ${id as string}
              ORDER BY sort_order ASC
            `,
            sql`
              SELECT * FROM ad_creatives
              WHERE campaign_id = ${id as string}
              ORDER BY sort_order ASC
            `,
          ]);

          return res.status(200).json({
            ...campaign,
            video_clip_scripts: videoScripts,
            posts: posts,
            ad_creatives: adCreatives,
          });
        }

        return res.status(200).json(result[0]);
      }

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id as string);
      if (!resolvedUserId) {
        return res.status(200).json([]);
      }

      const isOrgContext = !!organization_id;
      const limitNum = parseInt(limit as string);
      const offsetNum = parseInt(offset as string);

      // Query with counts and preview images using template literals
      let result;

      if (isOrgContext) {
        if (status) {
          result = await sql`
            SELECT
              c.*,
              COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
              COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
              COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
              (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
              (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL LIMIT 1) as post_preview_url,
              (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL LIMIT 1) as ad_preview_url
            FROM campaigns c
            WHERE c.organization_id = ${organization_id as string} AND c.deleted_at IS NULL AND c.status = ${status as string}
            ORDER BY c.created_at DESC
            LIMIT ${limitNum} OFFSET ${offsetNum}
          `;
        } else {
          result = await sql`
            SELECT
              c.*,
              COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
              COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
              COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
              (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
              (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL LIMIT 1) as post_preview_url,
              (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL LIMIT 1) as ad_preview_url
            FROM campaigns c
            WHERE c.organization_id = ${organization_id as string} AND c.deleted_at IS NULL
            ORDER BY c.created_at DESC
            LIMIT ${limitNum} OFFSET ${offsetNum}
          `;
        }
      } else {
        if (status) {
          result = await sql`
            SELECT
              c.*,
              COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
              COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
              COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
              (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
              (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL LIMIT 1) as post_preview_url,
              (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL LIMIT 1) as ad_preview_url
            FROM campaigns c
            WHERE c.user_id = ${resolvedUserId} AND c.organization_id IS NULL AND c.deleted_at IS NULL AND c.status = ${status as string}
            ORDER BY c.created_at DESC
            LIMIT ${limitNum} OFFSET ${offsetNum}
          `;
        } else {
          result = await sql`
            SELECT
              c.*,
              COALESCE((SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id), 0)::int as clips_count,
              COALESCE((SELECT COUNT(*) FROM posts WHERE campaign_id = c.id), 0)::int as posts_count,
              COALESCE((SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id), 0)::int as ads_count,
              (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = c.id AND thumbnail_url IS NOT NULL LIMIT 1) as clip_preview_url,
              (SELECT image_url FROM posts WHERE campaign_id = c.id AND image_url IS NOT NULL LIMIT 1) as post_preview_url,
              (SELECT image_url FROM ad_creatives WHERE campaign_id = c.id AND image_url IS NOT NULL LIMIT 1) as ad_preview_url
            FROM campaigns c
            WHERE c.user_id = ${resolvedUserId} AND c.organization_id IS NULL AND c.deleted_at IS NULL
            ORDER BY c.created_at DESC
            LIMIT ${limitNum} OFFSET ${offsetNum}
          `;
        }
      }

      return res.status(200).json(result);
    }

    // POST - Create campaign with related content
    if (req.method === 'POST') {
      const {
        user_id,
        organization_id,
        brand_profile_id,
        name,
        description,
        input_transcript,
        input_product_images,
        input_inspiration_images,
        generation_options,
        status,
        video_clip_scripts,
        posts,
        ad_creatives,
      } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        return res.status(400).json({ error: 'User not found' });
      }

      // Create campaign
      const campaignResult = await sql`
        INSERT INTO campaigns (
          user_id, organization_id, brand_profile_id, name, description, input_transcript,
          input_product_images, input_inspiration_images, generation_options, status
        )
        VALUES (
          ${resolvedUserId}, ${organization_id || null}, ${brand_profile_id || null},
          ${name || null}, ${description || null}, ${input_transcript || null},
          ${JSON.stringify(input_product_images || null)},
          ${JSON.stringify(input_inspiration_images || null)},
          ${JSON.stringify(generation_options || null)},
          ${status || 'draft'}
        )
        RETURNING *
      `;

      const campaign = campaignResult[0];

      // Create video clip scripts if provided - batch insert for performance
      if (video_clip_scripts && Array.isArray(video_clip_scripts) && video_clip_scripts.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < video_clip_scripts.length; i += batchSize) {
          const batch = video_clip_scripts.slice(i, i + batchSize);
          await Promise.all(
            batch.map((script: Record<string, unknown>, idx: number) =>
              sql`
                INSERT INTO video_clip_scripts (
                  campaign_id, user_id, organization_id, title, hook,
                  image_prompt, audio_script, scenes, sort_order
                )
                VALUES (
                  ${campaign.id}, ${resolvedUserId}, ${organization_id || null},
                  ${(script.title as string) || ''}, ${(script.hook as string) || ''},
                  ${(script.image_prompt as string) || null}, ${(script.audio_script as string) || null},
                  ${JSON.stringify(script.scenes || [])}, ${i + idx}
                )
              `
            )
          );
        }
      }

      // Create posts if provided - batch insert for performance
      if (posts && Array.isArray(posts) && posts.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < posts.length; i += batchSize) {
          const batch = posts.slice(i, i + batchSize);
          await Promise.all(
            batch.map((post: Record<string, unknown>, idx: number) =>
              sql`
                INSERT INTO posts (
                  campaign_id, user_id, organization_id, platform, content,
                  hashtags, image_prompt, sort_order
                )
                VALUES (
                  ${campaign.id}, ${resolvedUserId}, ${organization_id || null},
                  ${(post.platform as string) || ''}, ${(post.content as string) || ''},
                  ${(post.hashtags as string[]) || []}, ${(post.image_prompt as string) || null}, ${i + idx}
                )
              `
            )
          );
        }
      }

      // Create ad creatives if provided - batch insert for performance
      if (ad_creatives && Array.isArray(ad_creatives) && ad_creatives.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < ad_creatives.length; i += batchSize) {
          const batch = ad_creatives.slice(i, i + batchSize);
          await Promise.all(
            batch.map((ad: Record<string, unknown>, idx: number) =>
              sql`
                INSERT INTO ad_creatives (
                  campaign_id, user_id, organization_id, platform, headline,
                  body, cta, image_prompt, sort_order
                )
                VALUES (
                  ${campaign.id}, ${resolvedUserId}, ${organization_id || null},
                  ${(ad.platform as string) || ''}, ${(ad.headline as string) || ''},
                  ${(ad.body as string) || ''}, ${(ad.cta as string) || ''},
                  ${(ad.image_prompt as string) || null}, ${i + idx}
                )
              `
            )
          );
        }
      }

      return res.status(201).json(campaign);
    }

    // PUT - Update campaign
    if (req.method === 'PUT') {
      const { id } = req.query;
      const { name, description, status } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const result = await sql`
        UPDATE campaigns
        SET name = COALESCE(${name || null}, name),
            description = COALESCE(${description || null}, description),
            status = COALESCE(${status || null}, status),
            updated_at = NOW()
        WHERE id = ${id as string}
        RETURNING *
      `;

      if (!result[0]) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      return res.status(200).json(result[0]);
    }

    // PATCH - Update clip thumbnail_url
    if (req.method === 'PATCH') {
      const { clip_id } = req.query;
      const { thumbnail_url } = req.body;

      if (!clip_id) {
        return res.status(400).json({ error: 'clip_id is required' });
      }

      const result = await sql`
        UPDATE video_clip_scripts
        SET thumbnail_url = ${thumbnail_url || null},
            updated_at = NOW()
        WHERE id = ${clip_id as string}
        RETURNING *
      `;

      if (!result[0]) {
        return res.status(404).json({ error: 'Clip not found' });
      }

      return res.status(200).json(result[0]);
    }

    // DELETE - Soft delete campaign
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      await sql`
        UPDATE campaigns
        SET deleted_at = NOW()
        WHERE id = ${id as string}
      `;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Campaigns API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
