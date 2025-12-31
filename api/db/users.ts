/**
 * Vercel Serverless Function - Users API
 * CRUD operations for users in Neon PostgreSQL
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors } from './_helpers/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

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

      // Check if user exists by email or auth_provider_id
      let existing;
      if (auth_provider_id) {
        existing = await sql`
          SELECT * FROM users
          WHERE auth_provider_id = ${auth_provider_id} AND deleted_at IS NULL
          LIMIT 1
        `;
      }

      if (!existing || existing.length === 0) {
        existing = await sql`
          SELECT * FROM users
          WHERE email = ${email} AND deleted_at IS NULL
          LIMIT 1
        `;
      }

      if (existing && existing.length > 0) {
        // Update last login and auth_provider_id if needed
        await sql`
          UPDATE users
          SET last_login_at = NOW(),
              auth_provider_id = COALESCE(${auth_provider_id || null}, auth_provider_id)
          WHERE id = ${existing[0].id}
        `;
        return res.status(200).json(existing[0]);
      }

      // Create new user
      const result = await sql`
        INSERT INTO users (email, name, avatar_url, auth_provider, auth_provider_id)
        VALUES (${email}, ${name}, ${avatar_url || null},
                ${auth_provider || 'clerk'}, ${auth_provider_id || null})
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
            avatar_url = COALESCE(${avatar_url || null}, avatar_url),
            updated_at = NOW()
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
