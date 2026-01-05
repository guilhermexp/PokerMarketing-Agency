/**
 * Vercel Serverless Function - Tournament Event Flyer API
 * PATCH endpoint for updating event flyer_urls
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors } from '../_helpers/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  try {
    const sql = getSql();

    // PATCH - Update event flyer_urls
    if (req.method === 'PATCH') {
      const { event_id } = req.query;
      const { flyer_url, action, flyer_urls } = req.body;

      if (!event_id) {
        return res.status(400).json({ error: 'event_id is required' });
      }

      // Get current flyer_urls
      const [event] = await sql`
        SELECT flyer_urls FROM tournament_events WHERE id = ${event_id as string}
      `;

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      let updatedFlyerUrls = event.flyer_urls || [];

      if (action === 'add' && flyer_url) {
        // Add new flyer URL if not already present
        if (!updatedFlyerUrls.includes(flyer_url)) {
          updatedFlyerUrls = [...updatedFlyerUrls, flyer_url];
        }
      } else if (action === 'remove' && flyer_url) {
        // Remove flyer URL
        updatedFlyerUrls = updatedFlyerUrls.filter((url: string) => url !== flyer_url);
      } else if (action === 'set' && Array.isArray(flyer_urls)) {
        // Replace all flyer URLs
        updatedFlyerUrls = flyer_urls;
      }

      // Update database
      const result = await sql`
        UPDATE tournament_events
        SET flyer_urls = ${JSON.stringify(updatedFlyerUrls)}::jsonb,
            updated_at = NOW()
        WHERE id = ${event_id as string}
        RETURNING *
      `;

      return res.status(200).json(result[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Tournament Event Flyer API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
