/**
 * Vercel Serverless Function - Campaigns API
 * CRUD operations for marketing campaigns in Neon PostgreSQL
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

function getSql() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  return neon(DATABASE_URL);
}

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const sql = getSql();

    // GET - List campaigns or get single campaign
    if (req.method === 'GET') {
      const { user_id, id, status, limit = '50', offset = '0', include_content } = req.query;

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
            `
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

      // Query with counts and preview images
      // Preview images come from gallery_images linked via post_id, ad_creative_id, video_script_id
      // OR from the entity tables themselves if image_url/thumbnail_url is set
      const baseQuery = `
        SELECT
          c.*,
          COALESCE(clips.count, 0) as clips_count,
          COALESCE(posts.count, 0) as posts_count,
          COALESCE(ads.count, 0) as ads_count,
          COALESCE(clips.preview_url, clip_gallery.preview_url) as clip_preview_url,
          COALESCE(posts.preview_url, post_gallery.preview_url) as post_preview_url,
          COALESCE(ads.preview_url, ad_gallery.preview_url) as ad_preview_url,
          posts.breakdown as posts_breakdown,
          ads.breakdown as ads_breakdown
        FROM campaigns c
        LEFT JOIN (
          SELECT
            campaign_id,
            COUNT(*) as count,
            (SELECT thumbnail_url FROM video_clip_scripts WHERE campaign_id = v.campaign_id AND thumbnail_url IS NOT NULL LIMIT 1) as preview_url
          FROM video_clip_scripts v
          GROUP BY campaign_id
        ) clips ON clips.campaign_id = c.id
        LEFT JOIN (
          SELECT
            campaign_id,
            COUNT(*) as count,
            (SELECT image_url FROM posts WHERE campaign_id = p.campaign_id AND image_url IS NOT NULL LIMIT 1) as preview_url,
            jsonb_object_agg(platform, platform_count) as breakdown
          FROM (
            SELECT campaign_id, platform, COUNT(*) as platform_count
            FROM posts
            GROUP BY campaign_id, platform
          ) p
          GROUP BY campaign_id
        ) posts ON posts.campaign_id = c.id
        LEFT JOIN (
          SELECT
            campaign_id,
            COUNT(*) as count,
            (SELECT image_url FROM ad_creatives WHERE campaign_id = a.campaign_id AND image_url IS NOT NULL LIMIT 1) as preview_url,
            jsonb_object_agg(platform, platform_count) as breakdown
          FROM (
            SELECT campaign_id, platform, COUNT(*) as platform_count
            FROM ad_creatives
            GROUP BY campaign_id, platform
          ) a
          GROUP BY campaign_id
        ) ads ON ads.campaign_id = c.id
        -- Fallback: get preview from gallery_images linked to entities
        LEFT JOIN LATERAL (
          SELECT gi.src_url as preview_url
          FROM gallery_images gi
          INNER JOIN video_clip_scripts vcs ON gi.video_script_id = vcs.id
          WHERE vcs.campaign_id = c.id AND gi.deleted_at IS NULL
          ORDER BY gi.created_at DESC
          LIMIT 1
        ) clip_gallery ON true
        LEFT JOIN LATERAL (
          SELECT gi.src_url as preview_url
          FROM gallery_images gi
          INNER JOIN posts p ON gi.post_id = p.id
          WHERE p.campaign_id = c.id AND gi.deleted_at IS NULL
          ORDER BY gi.created_at DESC
          LIMIT 1
        ) post_gallery ON true
        LEFT JOIN LATERAL (
          SELECT gi.src_url as preview_url
          FROM gallery_images gi
          INNER JOIN ad_creatives ac ON gi.ad_creative_id = ac.id
          WHERE ac.campaign_id = c.id AND gi.deleted_at IS NULL
          ORDER BY gi.created_at DESC
          LIMIT 1
        ) ad_gallery ON true
        WHERE c.user_id = $1 AND c.deleted_at IS NULL
      `;

      let result;
      if (status) {
        result = await sql(
          baseQuery + ` AND c.status = $2 ORDER BY c.created_at DESC LIMIT $3 OFFSET $4`,
          [user_id as string, status as string, parseInt(limit as string), parseInt(offset as string)]
        );
      } else {
        result = await sql(
          baseQuery + ` ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`,
          [user_id as string, parseInt(limit as string), parseInt(offset as string)]
        );
      }

      return res.status(200).json(result);
    }

    // POST - Create campaign with related content
    if (req.method === 'POST') {
      const { user_id, brand_profile_id, name, description, input_transcript,
              input_product_images, input_inspiration_images, generation_options,
              status, video_clip_scripts, posts, ad_creatives } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      // Create campaign
      const campaignResult = await sql`
        INSERT INTO campaigns (user_id, brand_profile_id, name, description, input_transcript,
                               input_product_images, input_inspiration_images, generation_options, status)
        VALUES (${user_id}, ${brand_profile_id || null}, ${name || null}, ${description || null},
                ${input_transcript || null}, ${JSON.stringify(input_product_images || null)},
                ${JSON.stringify(input_inspiration_images || null)}, ${JSON.stringify(generation_options || null)},
                ${status || 'draft'})
        RETURNING *
      `;

      const campaign = campaignResult[0];

      // Create video clip scripts if provided
      if (video_clip_scripts && Array.isArray(video_clip_scripts)) {
        for (let i = 0; i < video_clip_scripts.length; i++) {
          const script = video_clip_scripts[i];
          await sql`
            INSERT INTO video_clip_scripts (campaign_id, user_id, title, hook, image_prompt,
                                            audio_script, scenes, sort_order)
            VALUES (${campaign.id}, ${user_id}, ${script.title}, ${script.hook},
                    ${script.image_prompt || null}, ${script.audio_script || null},
                    ${JSON.stringify(script.scenes || [])}, ${i})
          `;
        }
      }

      // Create posts if provided
      if (posts && Array.isArray(posts)) {
        for (let i = 0; i < posts.length; i++) {
          const post = posts[i];
          await sql`
            INSERT INTO posts (campaign_id, user_id, platform, content, hashtags, image_prompt, sort_order)
            VALUES (${campaign.id}, ${user_id}, ${post.platform}, ${post.content},
                    ${post.hashtags || []}, ${post.image_prompt || null}, ${i})
          `;
        }
      }

      // Create ad creatives if provided
      if (ad_creatives && Array.isArray(ad_creatives)) {
        for (let i = 0; i < ad_creatives.length; i++) {
          const ad = ad_creatives[i];
          await sql`
            INSERT INTO ad_creatives (campaign_id, user_id, platform, headline, body, cta, image_prompt, sort_order)
            VALUES (${campaign.id}, ${user_id}, ${ad.platform}, ${ad.headline},
                    ${ad.body}, ${ad.cta}, ${ad.image_prompt || null}, ${i})
          `;
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
            status = COALESCE(${status || null}, status)
        WHERE id = ${id as string}
        RETURNING *
      `;

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
