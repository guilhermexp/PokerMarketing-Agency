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
      const { user_id, id, status, limit = '50', offset = '0' } = req.query;

      // Get single campaign by ID
      if (id) {
        const result = await sql`
          SELECT * FROM campaigns
          WHERE id = ${id as string} AND deleted_at IS NULL
          LIMIT 1
        `;
        return res.status(200).json(result[0] || null);
      }

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      let result;
      if (status) {
        result = await sql`
          SELECT * FROM campaigns
          WHERE user_id = ${user_id as string} AND status = ${status as string} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${parseInt(limit as string)} OFFSET ${parseInt(offset as string)}
        `;
      } else {
        result = await sql`
          SELECT * FROM campaigns
          WHERE user_id = ${user_id as string} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${parseInt(limit as string)} OFFSET ${parseInt(offset as string)}
        `;
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
