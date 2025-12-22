/**
 * Vercel Serverless Function - Tournaments API
 * CRUD operations for tournament events and week schedules
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const sql = getSql();

    // GET - Get current week schedule and events
    if (req.method === 'GET') {
      const { user_id, week_schedule_id } = req.query;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      // If week_schedule_id is provided, get events for that schedule
      if (week_schedule_id) {
        const events = await sql`
          SELECT * FROM tournament_events
          WHERE user_id = ${user_id as string}
            AND week_schedule_id = ${week_schedule_id as string}
          ORDER BY day_of_week, name
        `;
        return res.status(200).json({ events });
      }

      // Get the most recent week schedule
      const schedules = await sql`
        SELECT * FROM week_schedules
        WHERE user_id = ${user_id as string}
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (schedules.length === 0) {
        return res.status(200).json({ schedule: null, events: [] });
      }

      const schedule = schedules[0];

      // Get events for this schedule
      const events = await sql`
        SELECT * FROM tournament_events
        WHERE user_id = ${user_id as string}
          AND week_schedule_id = ${schedule.id}
        ORDER BY day_of_week, name
      `;

      return res.status(200).json({ schedule, events });
    }

    // POST - Create new week schedule with events
    if (req.method === 'POST') {
      const { user_id, start_date, end_date, filename, events } = req.body;

      if (!user_id || !start_date || !end_date) {
        return res.status(400).json({ error: 'user_id, start_date, and end_date are required' });
      }

      // Create week schedule
      const scheduleResult = await sql`
        INSERT INTO week_schedules (user_id, start_date, end_date, filename, original_filename)
        VALUES (${user_id}, ${start_date}, ${end_date}, ${filename || null}, ${filename || null})
        RETURNING *
      `;

      const schedule = scheduleResult[0];

      // Create events if provided - using batch insert for performance
      if (events && Array.isArray(events) && events.length > 0) {
        console.log(`[Tournaments API] Inserting ${events.length} events in parallel batches...`);

        // Process in batches - each batch runs concurrently, batches run sequentially
        const batchSize = 50; // 50 concurrent inserts per batch

        for (let i = 0; i < events.length; i += batchSize) {
          const batch = events.slice(i, i + batchSize);

          // Execute all inserts in this batch concurrently
          await Promise.all(
            batch.map((event: {
              day?: string;
              name?: string;
              game?: string;
              gtd?: string;
              buyIn?: string;
              rebuy?: string;
              addOn?: string;
              stack?: string;
              players?: string;
              lateReg?: string;
              minutes?: string;
              structure?: string;
              times?: Record<string, string>;
              eventDate?: string;
            }) =>
              sql`
                INSERT INTO tournament_events (
                  user_id, week_schedule_id, day_of_week, name, game, gtd, buy_in,
                  rebuy, add_on, stack, players, late_reg, minutes, structure, times, event_date
                )
                VALUES (
                  ${user_id}, ${schedule.id}, ${event.day || ''}, ${event.name || ''}, ${event.game || null},
                  ${event.gtd || null}, ${event.buyIn || null}, ${event.rebuy || null},
                  ${event.addOn || null}, ${event.stack || null}, ${event.players || null},
                  ${event.lateReg || null}, ${event.minutes || null}, ${event.structure || null},
                  ${JSON.stringify(event.times || {})}, ${event.eventDate || null}
                )
              `
            )
          );
        }
        console.log(`[Tournaments API] All ${events.length} events inserted successfully`);
      }

      // Return the created schedule with events count
      return res.status(201).json({
        schedule,
        eventsCount: events?.length || 0,
      });
    }

    // DELETE - Delete week schedule and its events
    if (req.method === 'DELETE') {
      const { id, user_id } = req.query;

      if (!id || !user_id) {
        return res.status(400).json({ error: 'id and user_id are required' });
      }

      // Delete events first (cascade should handle this, but being explicit)
      await sql`
        DELETE FROM tournament_events
        WHERE week_schedule_id = ${id as string}
          AND user_id = ${user_id as string}
      `;

      // Delete schedule
      await sql`
        DELETE FROM week_schedules
        WHERE id = ${id as string}
          AND user_id = ${user_id as string}
      `;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Tournaments API] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
