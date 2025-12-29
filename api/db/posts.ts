/**
 * Vercel Serverless Function - Posts API
 * Update operations for posts in Neon PostgreSQL
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors } from './_helpers/index';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  try {
    const sql = getSql();
    const { id } = req.query;

    // PATCH - Update post image_url
    if (req.method === 'PATCH') {
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const { image_url } = req.body;

      const result = await sql`
        UPDATE posts
        SET image_url = ${image_url || null},
            updated_at = NOW()
        WHERE id = ${id as string}
        RETURNING *
      `;

      if (!result[0]) {
        return res.status(404).json({ error: 'Post not found' });
      }

      return res.status(200).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Posts API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
