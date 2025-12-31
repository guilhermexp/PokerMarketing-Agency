/**
 * Vercel Serverless Function - Brand Profiles API
 * CRUD operations for brand profiles in Neon PostgreSQL
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors, resolveUserId } from './_helpers/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  try {
    const sql = getSql();

    // GET - Get brand profile for user
    if (req.method === 'GET') {
      const { user_id, organization_id } = req.query;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id as string);
      if (!resolvedUserId) {
        return res.status(200).json(null);
      }

      const isOrgContext = !!organization_id;

      const result = isOrgContext
        ? await sql`
            SELECT * FROM brand_profiles
            WHERE organization_id = ${organization_id as string} AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
          `
        : await sql`
            SELECT * FROM brand_profiles
            WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
          `;

      return res.status(200).json(result[0] || null);
    }

    // POST - Create brand profile
    if (req.method === 'POST') {
      const {
        user_id,
        organization_id,
        name,
        description,
        logo_url,
        primary_color,
        secondary_color,
        tertiary_color,
        tone_of_voice,
        settings,
      } = req.body;

      if (!user_id || !name || !primary_color || !secondary_color || !tone_of_voice) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        return res.status(400).json({ error: 'User not found' });
      }

      const result = await sql`
        INSERT INTO brand_profiles (
          user_id, organization_id, name, description, logo_url,
          primary_color, secondary_color, tertiary_color, tone_of_voice, settings
        )
        VALUES (
          ${resolvedUserId}, ${organization_id || null}, ${name},
          ${description || null}, ${logo_url || null}, ${primary_color},
          ${secondary_color}, ${tertiary_color || '#F59E0B'}, ${tone_of_voice}, ${JSON.stringify(settings || {})}
        )
        RETURNING *
      `;

      return res.status(201).json(result[0]);
    }

    // PUT - Update brand profile
    if (req.method === 'PUT') {
      const { id } = req.query;
      const {
        name,
        description,
        logo_url,
        primary_color,
        secondary_color,
        tertiary_color,
        tone_of_voice,
        settings,
      } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const result = await sql`
        UPDATE brand_profiles
        SET name = COALESCE(${name || null}, name),
            description = COALESCE(${description || null}, description),
            logo_url = COALESCE(${logo_url || null}, logo_url),
            primary_color = COALESCE(${primary_color || null}, primary_color),
            secondary_color = COALESCE(${secondary_color || null}, secondary_color),
            tertiary_color = COALESCE(${tertiary_color || null}, tertiary_color),
            tone_of_voice = COALESCE(${tone_of_voice || null}, tone_of_voice),
            settings = COALESCE(${settings ? JSON.stringify(settings) : null}, settings),
            updated_at = NOW()
        WHERE id = ${id as string}
        RETURNING *
      `;

      return res.status(200).json(result[0]);
    }

    // DELETE - Soft delete brand profile
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      await sql`
        UPDATE brand_profiles
        SET deleted_at = NOW()
        WHERE id = ${id as string}
      `;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Brand Profiles API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
