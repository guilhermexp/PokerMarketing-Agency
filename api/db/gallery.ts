/**
 * Vercel Serverless Function - Gallery Images API
 * CRUD operations for gallery images in Neon PostgreSQL
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors, resolveUserId } from './_helpers/index';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  try {
    const sql = getSql();

    // GET - List gallery images
    if (req.method === 'GET') {
      const { user_id, organization_id, source, limit = '100', offset = '0' } = req.query;

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

      let result;
      if (isOrgContext) {
        if (source) {
          result = await sql`
            SELECT * FROM gallery_images
            WHERE organization_id = ${organization_id as string}
              AND source = ${source as string}
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT ${limitNum} OFFSET ${offsetNum}
          `;
        } else {
          result = await sql`
            SELECT * FROM gallery_images
            WHERE organization_id = ${organization_id as string}
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT ${limitNum} OFFSET ${offsetNum}
          `;
        }
      } else {
        if (source) {
          result = await sql`
            SELECT * FROM gallery_images
            WHERE user_id = ${resolvedUserId}
              AND organization_id IS NULL
              AND source = ${source as string}
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT ${limitNum} OFFSET ${offsetNum}
          `;
        } else {
          result = await sql`
            SELECT * FROM gallery_images
            WHERE user_id = ${resolvedUserId}
              AND organization_id IS NULL
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT ${limitNum} OFFSET ${offsetNum}
          `;
        }
      }

      return res.status(200).json(result);
    }

    // POST - Create gallery image
    if (req.method === 'POST') {
      const {
        user_id,
        organization_id,
        src_url,
        prompt,
        source,
        model,
        aspect_ratio,
        image_size,
        post_id,
        ad_creative_id,
        video_script_id,
        is_style_reference,
        style_reference_name,
        media_type,
        duration,
      } = req.body;

      if (!user_id || !src_url || !source || !model) {
        return res.status(400).json({
          error: 'user_id, src_url, source, and model are required',
        });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        return res.status(400).json({ error: 'User not found' });
      }

      const result = await sql`
        INSERT INTO gallery_images (
          user_id, organization_id, src_url, prompt, source, model,
          aspect_ratio, image_size, post_id, ad_creative_id, video_script_id,
          is_style_reference, style_reference_name, media_type, duration
        )
        VALUES (
          ${resolvedUserId}, ${organization_id || null}, ${src_url},
          ${prompt || null}, ${source}, ${model}, ${aspect_ratio || null},
          ${image_size || null}, ${post_id || null}, ${ad_creative_id || null},
          ${video_script_id || null}, ${is_style_reference || false},
          ${style_reference_name || null}, ${media_type || 'image'},
          ${duration || null}
        )
        RETURNING *
      `;

      return res.status(201).json(result[0]);
    }

    // PATCH - Update gallery image (e.g., mark as published, update src_url)
    if (req.method === 'PATCH') {
      const { id } = req.query;
      const { published_at, src_url } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const result = await sql`
        UPDATE gallery_images
        SET published_at = COALESCE(${published_at || null}, published_at),
            src_url = COALESCE(${src_url || null}, src_url),
            updated_at = NOW()
        WHERE id = ${id as string}
        RETURNING *
      `;

      if (!result[0]) {
        return res.status(404).json({ error: 'Gallery image not found' });
      }

      return res.status(200).json(result[0]);
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
