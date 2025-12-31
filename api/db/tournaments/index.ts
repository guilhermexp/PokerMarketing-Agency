/**
 * Vercel Serverless Function - Tournaments API
 * CRUD operations for tournament events and week schedules
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors, resolveUserId } from '../_helpers/index';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  try {
    const sql = getSql();

    // GET - Get current week schedule and events
    if (req.method === 'GET') {
      const { user_id, organization_id, week_schedule_id } = req.query;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id as string);
      if (!resolvedUserId) {
        return res.status(200).json({ schedule: null, events: [] });
      }

      const isOrgContext = !!organization_id;

      // If week_schedule_id is provided, get events for that schedule
      if (week_schedule_id) {
        const events = isOrgContext
          ? await sql`
              SELECT * FROM tournament_events
              WHERE organization_id = ${organization_id as string}
                AND week_schedule_id = ${week_schedule_id as string}
              ORDER BY day_of_week, name
            `
          : await sql`
              SELECT * FROM tournament_events
              WHERE user_id = ${resolvedUserId}
                AND organization_id IS NULL
                AND week_schedule_id = ${week_schedule_id as string}
              ORDER BY day_of_week, name
            `;
        return res.status(200).json({ events });
      }

      // Get the most relevant week schedule
      let schedules;

      if (isOrgContext) {
        // First try to find a valid (non-expired) schedule
        schedules = await sql`
          SELECT * FROM week_schedules
          WHERE organization_id = ${organization_id as string}
            AND end_date >= CURRENT_DATE
          ORDER BY start_date ASC
          LIMIT 1
        `;

        // If no valid schedule, get the most recent one (even if expired)
        if (schedules.length === 0) {
          schedules = await sql`
            SELECT * FROM week_schedules
            WHERE organization_id = ${organization_id as string}
            ORDER BY end_date DESC
            LIMIT 1
          `;
        }
      } else {
        schedules = await sql`
          SELECT * FROM week_schedules
          WHERE user_id = ${resolvedUserId}
            AND organization_id IS NULL
            AND end_date >= CURRENT_DATE
          ORDER BY start_date ASC
          LIMIT 1
        `;

        if (schedules.length === 0) {
          schedules = await sql`
            SELECT * FROM week_schedules
            WHERE user_id = ${resolvedUserId}
              AND organization_id IS NULL
            ORDER BY end_date DESC
            LIMIT 1
          `;
        }
      }

      if (schedules.length === 0) {
        return res.status(200).json({ schedule: null, events: [] });
      }

      const schedule = schedules[0];

      // Get events for this schedule
      const events = isOrgContext
        ? await sql`
            SELECT * FROM tournament_events
            WHERE organization_id = ${organization_id as string}
              AND week_schedule_id = ${schedule.id}
            ORDER BY day_of_week, name
          `
        : await sql`
            SELECT * FROM tournament_events
            WHERE user_id = ${resolvedUserId}
              AND organization_id IS NULL
              AND week_schedule_id = ${schedule.id}
            ORDER BY day_of_week, name
          `;

      return res.status(200).json({ schedule, events });
    }

    // POST - Create new week schedule with events
    if (req.method === 'POST') {
      const { user_id, organization_id, start_date, end_date, filename, events } = req.body;

      if (!user_id || !start_date || !end_date) {
        return res.status(400).json({
          error: 'user_id, start_date, and end_date are required',
        });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        return res.status(400).json({ error: 'User not found' });
      }

      // Create week schedule
      const scheduleResult = await sql`
        INSERT INTO week_schedules (
          user_id, organization_id, start_date, end_date, filename, original_filename
        )
        VALUES (
          ${resolvedUserId}, ${organization_id || null}, ${start_date},
          ${end_date}, ${filename || null}, ${filename || null}
        )
        RETURNING *
      `;

      const schedule = scheduleResult[0];

      // Create events if provided - using batch insert for performance
      if (events && Array.isArray(events) && events.length > 0) {
        console.log(`[Tournaments API] Inserting ${events.length} events in parallel batches...`);

        // Process in batches - each batch runs concurrently
        const batchSize = 50;

        for (let i = 0; i < events.length; i += batchSize) {
          const batch = events.slice(i, i + batchSize);

          await Promise.all(
            batch.map(
              (event: {
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
                    user_id, organization_id, week_schedule_id, day_of_week, name,
                    game, gtd, buy_in, rebuy, add_on, stack, players, late_reg,
                    minutes, structure, times, event_date
                  )
                  VALUES (
                    ${resolvedUserId}, ${organization_id || null}, ${schedule.id},
                    ${event.day || ''}, ${event.name || ''}, ${event.game || null},
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

      return res.status(201).json({
        schedule,
        eventsCount: events?.length || 0,
      });
    }

    // DELETE - Delete week schedule and its events
    if (req.method === 'DELETE') {
      const { id, user_id, organization_id } = req.query;

      if (!id || !user_id) {
        return res.status(400).json({ error: 'id and user_id are required' });
      }

      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, user_id as string);
      if (!resolvedUserId) {
        return res.status(400).json({ error: 'User not found' });
      }

      const isOrgContext = !!organization_id;

      // Delete events first
      if (isOrgContext) {
        await sql`
          DELETE FROM tournament_events
          WHERE week_schedule_id = ${id as string}
            AND organization_id = ${organization_id as string}
        `;

        await sql`
          DELETE FROM week_schedules
          WHERE id = ${id as string}
            AND organization_id = ${organization_id as string}
        `;
      } else {
        await sql`
          DELETE FROM tournament_events
          WHERE week_schedule_id = ${id as string}
            AND user_id = ${resolvedUserId}
            AND organization_id IS NULL
        `;

        await sql`
          DELETE FROM week_schedules
          WHERE id = ${id as string}
            AND user_id = ${resolvedUserId}
            AND organization_id IS NULL
        `;
      }

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
