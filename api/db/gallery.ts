/**
 * Vercel Serverless Function - Gallery Images API
 * CRUD operations for gallery images in Neon PostgreSQL
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

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const sql = getSql();

    // GET - List gallery images
    if (req.method === 'GET') {
      const { user_id, source, limit = '100', offset = '0' } = req.query;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      let result;
      if (source) {
        result = await sql`
          SELECT * FROM gallery_images
          WHERE user_id = ${user_id as string} AND source = ${source as string} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${parseInt(limit as string)} OFFSET ${parseInt(offset as string)}
        `;
      } else {
        result = await sql`
          SELECT * FROM gallery_images
          WHERE user_id = ${user_id as string} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${parseInt(limit as string)} OFFSET ${parseInt(offset as string)}
        `;
      }

      return res.status(200).json(result);
    }

    // POST - Create gallery image
    if (req.method === 'POST') {
      const { user_id, src_url, prompt, source, model, aspect_ratio, image_size,
              post_id, ad_creative_id, video_script_id, is_style_reference, style_reference_name } = req.body;

      if (!user_id || !src_url || !source || !model) {
        return res.status(400).json({ error: 'user_id, src_url, source, and model are required' });
      }

      const result = await sql`
        INSERT INTO gallery_images (user_id, src_url, prompt, source, model, aspect_ratio, image_size,
                                    post_id, ad_creative_id, video_script_id, is_style_reference, style_reference_name)
        VALUES (${user_id}, ${src_url}, ${prompt || null}, ${source}, ${model},
                ${aspect_ratio || null}, ${image_size || null}, ${post_id || null},
                ${ad_creative_id || null}, ${video_script_id || null},
                ${is_style_reference || false}, ${style_reference_name || null})
        RETURNING *
      `;

      return res.status(201).json(result[0]);
    }

    // DELETE - Soft delete gallery image
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      await sql`
        UPDATE gallery_images
        SET deleted_at = NOW()
        WHERE id = ${id as string}
      `;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Gallery API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
