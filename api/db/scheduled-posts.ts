/**
 * Vercel Serverless Function - Scheduled Posts API
 * CRUD operations for scheduled posts in Neon PostgreSQL
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors, resolveUserId } from './_helpers/index';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  try {
    const sql = getSql();

    // GET - List scheduled posts
    if (req.method === 'GET') {
      const { user_id, organization_id, status, start_date, end_date, limit = '100' } = req.query;

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

      let result;

      if (isOrgContext) {
        if (status && start_date && end_date) {
          result = await sql`
            SELECT * FROM scheduled_posts
            WHERE organization_id = ${organization_id as string}
              AND status = ${status as string}
              AND scheduled_date >= ${start_date as string}
              AND scheduled_date <= ${end_date as string}
            ORDER BY scheduled_timestamp ASC
            LIMIT ${limitNum}
          `;
        } else if (start_date && end_date) {
          result = await sql`
            SELECT * FROM scheduled_posts
            WHERE organization_id = ${organization_id as string}
              AND scheduled_date >= ${start_date as string}
              AND scheduled_date <= ${end_date as string}
            ORDER BY scheduled_timestamp ASC
            LIMIT ${limitNum}
          `;
        } else if (status) {
          result = await sql`
            SELECT * FROM scheduled_posts
            WHERE organization_id = ${organization_id as string}
              AND status = ${status as string}
            ORDER BY scheduled_timestamp ASC
            LIMIT ${limitNum}
          `;
        } else {
          result = await sql`
            SELECT * FROM scheduled_posts
            WHERE organization_id = ${organization_id as string}
            ORDER BY scheduled_timestamp ASC
            LIMIT ${limitNum}
          `;
        }
      } else {
        if (status && start_date && end_date) {
          result = await sql`
            SELECT * FROM scheduled_posts
            WHERE user_id = ${resolvedUserId}
              AND organization_id IS NULL
              AND status = ${status as string}
              AND scheduled_date >= ${start_date as string}
              AND scheduled_date <= ${end_date as string}
            ORDER BY scheduled_timestamp ASC
            LIMIT ${limitNum}
          `;
        } else if (start_date && end_date) {
          result = await sql`
            SELECT * FROM scheduled_posts
            WHERE user_id = ${resolvedUserId}
              AND organization_id IS NULL
              AND scheduled_date >= ${start_date as string}
              AND scheduled_date <= ${end_date as string}
            ORDER BY scheduled_timestamp ASC
            LIMIT ${limitNum}
          `;
        } else if (status) {
          result = await sql`
            SELECT * FROM scheduled_posts
            WHERE user_id = ${resolvedUserId}
              AND organization_id IS NULL
              AND status = ${status as string}
            ORDER BY scheduled_timestamp ASC
            LIMIT ${limitNum}
          `;
        } else {
          result = await sql`
            SELECT * FROM scheduled_posts
            WHERE user_id = ${resolvedUserId}
              AND organization_id IS NULL
            ORDER BY scheduled_timestamp ASC
            LIMIT ${limitNum}
          `;
        }
      }

      return res.status(200).json(result);
    }

    // POST - Create scheduled post
    if (req.method === 'POST') {
      const {
        user_id,
        organization_id,
        content_type,
        content_id,
        image_url,
        caption,
        hashtags,
        scheduled_date,
        scheduled_time,
        scheduled_timestamp,
        timezone,
        platforms,
        instagram_content_type,
        created_from,
      } = req.body;

      if (
        !user_id ||
        !content_type ||
        !image_url ||
        !scheduled_date ||
        !scheduled_time ||
        !scheduled_timestamp ||
        !timezone ||
        !platforms
      ) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        return res.status(400).json({ error: 'User not found' });
      }

      // Convert scheduled_timestamp to bigint (milliseconds) if it's a string
      const timestampMs =
        typeof scheduled_timestamp === 'string'
          ? new Date(scheduled_timestamp).getTime()
          : scheduled_timestamp;

      const result = await sql`
        INSERT INTO scheduled_posts (
          user_id, organization_id, content_type, content_id, image_url,
          caption, hashtags, scheduled_date, scheduled_time, scheduled_timestamp,
          timezone, platforms, instagram_content_type, created_from
        )
        VALUES (
          ${resolvedUserId}, ${organization_id || null}, ${content_type},
          ${content_id || null}, ${image_url}, ${caption || ''}, ${hashtags || []},
          ${scheduled_date}, ${scheduled_time}, ${timestampMs}, ${timezone},
          ${platforms}, ${instagram_content_type || 'photo'}, ${created_from || null}
        )
        RETURNING *
      `;

      return res.status(201).json(result[0]);
    }

    // PUT - Update scheduled post
    if (req.method === 'PUT') {
      const { id } = req.query;
      const {
        status,
        published_at,
        error_message,
        instagram_media_id,
        instagram_container_id,
        publish_attempts,
        last_publish_attempt,
      } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const result = await sql`
        UPDATE scheduled_posts
        SET status = COALESCE(${status || null}, status),
            published_at = COALESCE(${published_at || null}, published_at),
            error_message = COALESCE(${error_message || null}, error_message),
            instagram_media_id = COALESCE(${instagram_media_id || null}, instagram_media_id),
            instagram_container_id = COALESCE(${instagram_container_id || null}, instagram_container_id),
            publish_attempts = COALESCE(${publish_attempts || null}, publish_attempts),
            last_publish_attempt = COALESCE(${last_publish_attempt || null}, last_publish_attempt),
            updated_at = NOW()
        WHERE id = ${id as string}
        RETURNING *
      `;

      return res.status(200).json(result[0]);
    }

    // DELETE - Delete scheduled post
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      await sql`
        DELETE FROM scheduled_posts
        WHERE id = ${id as string}
      `;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Scheduled Posts API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
