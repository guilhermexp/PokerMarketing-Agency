/**
 * Vercel Serverless Function - Daily Flyer API
 * PATCH endpoint for updating daily_flyer_urls on week_schedules
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors } from '../_helpers/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  try {
    const sql = getSql();

    // PATCH - Update daily flyer_urls for a schedule
    if (req.method === 'PATCH') {
      const { schedule_id, period } = req.query;
      const { flyer_url, action, flyer_urls } = req.body;

      if (!schedule_id || !period) {
        return res.status(400).json({ error: 'schedule_id and period are required' });
      }

      // Get current daily_flyer_urls
      const [schedule] = await sql`
        SELECT daily_flyer_urls FROM week_schedules WHERE id = ${schedule_id as string}
      `;

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      const daily_flyer_urls = schedule.daily_flyer_urls || {};
      let periodUrls = daily_flyer_urls[period as string] || [];

      if (action === 'add' && flyer_url) {
        // Add new flyer URL if not already present
        if (!periodUrls.includes(flyer_url)) {
          periodUrls = [...periodUrls, flyer_url];
        }
      } else if (action === 'remove' && flyer_url) {
        // Remove flyer URL
        periodUrls = periodUrls.filter((url: string) => url !== flyer_url);
      } else if (action === 'set' && Array.isArray(flyer_urls)) {
        // Replace all flyer URLs for this period
        periodUrls = flyer_urls;
      }

      daily_flyer_urls[period as string] = periodUrls;

      // Update database
      const result = await sql`
        UPDATE week_schedules
        SET daily_flyer_urls = ${JSON.stringify(daily_flyer_urls)}::jsonb,
            updated_at = NOW()
        WHERE id = ${schedule_id as string}
        RETURNING *
      `;

      return res.status(200).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Daily Flyer API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
