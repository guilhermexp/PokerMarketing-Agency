/**
 * Vercel Serverless Function - Tournaments List API
 * Lists all week schedules for a user
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors, resolveUserId } from '../_helpers/index';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const { user_id, organization_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Resolve Clerk ID to DB UUID
    const resolvedUserId = await resolveUserId(sql, user_id as string);
    if (!resolvedUserId) {
      return res.status(200).json({ schedules: [] });
    }

    const isOrgContext = !!organization_id;

    let schedules;

    if (isOrgContext) {
      schedules = await sql`
        SELECT
          ws.*,
          COUNT(te.id)::int as event_count
        FROM week_schedules ws
        LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
        WHERE ws.organization_id = ${organization_id as string}
        GROUP BY ws.id
        ORDER BY ws.start_date DESC
      `;
    } else {
      schedules = await sql`
        SELECT
          ws.*,
          COUNT(te.id)::int as event_count
        FROM week_schedules ws
        LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
        WHERE ws.user_id = ${resolvedUserId} AND ws.organization_id IS NULL
        GROUP BY ws.id
        ORDER BY ws.start_date DESC
      `;
    }

    return res.status(200).json({ schedules });
  } catch (error) {
    console.error('[Tournaments List API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
