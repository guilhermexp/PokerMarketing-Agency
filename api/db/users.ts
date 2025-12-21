/**
 * Vercel Serverless Function - Users API
 * CRUD operations for users in Neon PostgreSQL
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const sql = getSql();

    // GET - Get user by email or id
    if (req.method === 'GET') {
      const { email, id } = req.query;

      if (id) {
        const result = await sql`
          SELECT * FROM users
          WHERE id = ${id as string} AND deleted_at IS NULL
          LIMIT 1
        `;
        return res.status(200).json(result[0] || null);
      }

      if (email) {
        const result = await sql`
          SELECT * FROM users
          WHERE email = ${email as string} AND deleted_at IS NULL
          LIMIT 1
        `;
        return res.status(200).json(result[0] || null);
      }

      return res.status(400).json({ error: 'email or id is required' });
    }

    // POST - Create user or get existing
    if (req.method === 'POST') {
      const { email, name, avatar_url, auth_provider, auth_provider_id } = req.body;

      if (!email || !name) {
        return res.status(400).json({ error: 'email and name are required' });
      }

      // Check if user exists
      const existing = await sql`
        SELECT * FROM users
        WHERE email = ${email} AND deleted_at IS NULL
        LIMIT 1
      `;

      if (existing.length > 0) {
        // Update last login
        await sql`
          UPDATE users
          SET last_login_at = NOW()
          WHERE id = ${existing[0].id}
        `;
        return res.status(200).json(existing[0]);
      }

      // Create new user
      const result = await sql`
        INSERT INTO users (email, name, avatar_url, auth_provider, auth_provider_id)
        VALUES (${email}, ${name}, ${avatar_url || null},
                ${auth_provider || 'email'}, ${auth_provider_id || null})
        RETURNING *
      `;

      return res.status(201).json(result[0]);
    }

    // PUT - Update user
    if (req.method === 'PUT') {
      const { id } = req.query;
      const { name, avatar_url } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const result = await sql`
        UPDATE users
        SET name = COALESCE(${name || null}, name),
            avatar_url = COALESCE(${avatar_url || null}, avatar_url)
        WHERE id = ${id as string}
        RETURNING *
      `;

      return res.status(200).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Users API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
