/**
 * Vercel Serverless Function - Ad Creatives API
 * Update operations for ad creatives in Neon PostgreSQL
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const sql = getSql();
    const { id } = req.query;

    // PATCH - Update ad creative image_url
    if (req.method === 'PATCH') {
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const { image_url } = req.body;

      const result = await sql`
        UPDATE ad_creatives
        SET image_url = ${image_url || null},
            updated_at = NOW()
        WHERE id = ${id as string}
        RETURNING *
      `;

      if (!result[0]) {
        return res.status(404).json({ error: 'Ad creative not found' });
      }

      return res.status(200).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Ad Creatives API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
