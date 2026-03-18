import type { Express } from "express";
import { getSql } from "../lib/db.js";
import { resolveUserId } from "../lib/user-resolver.js";
import { resolveOrganizationContext } from "../lib/auth.js";
import { logError } from "../lib/logging-helpers.js";
import { ValidationError, DatabaseError } from "../lib/errors/index.js";
import { OrganizationAccessError } from "../helpers/organization-context.js";
import logger from "../lib/logger.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type TournamentDailyFlyerBody,
  type TournamentDailyFlyerQuery,
  type TournamentEventFlyerBody,
  type TournamentEventFlyerQuery,
  type TournamentsCreateBody,
  type TournamentsDeleteQuery,
  type TournamentsListQuery,
  type TournamentsQuery,
  tournamentDailyFlyerBodySchema,
  tournamentDailyFlyerQuerySchema,
  tournamentEventFlyerBodySchema,
  tournamentEventFlyerQuerySchema,
  tournamentsCreateBodySchema,
  tournamentsDeleteQuerySchema,
  tournamentsListQuerySchema,
  tournamentsQuerySchema,
} from "../schemas/tournaments-schemas.js";

type ScheduleOrganizationRow = {
  organization_id: string | null;
};

type TournamentEventFlyerRow = {
  flyer_urls: string[] | null;
};

type WeekScheduleFlyerRow = {
  daily_flyer_urls: Record<string, string[] | Record<string, string[]>> | null;
};

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toDatabaseError(message: string, error: unknown): DatabaseError {
  if (error instanceof Error) {
    return new DatabaseError(message, error);
  }
  return new DatabaseError(message);
}

export function registerTournamentRoutes(app: Express): void {
app.get("/api/db/tournaments/list", validateRequest({ query: tournamentsListQuerySchema }), async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id } = req.query as TournamentsListQuery;

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ schedules: [] }); // No user found
    }

    let schedules;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      schedules = await sql`
        SELECT
          ws.*,
          COUNT(te.id)::int as event_count
        FROM week_schedules ws
        LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
        WHERE ws.organization_id = ${organization_id}
        GROUP BY ws.id
        ORDER BY ws.start_date DESC
      `;
    } else {
      // Personal context
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

    res.json({ schedules });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Tournaments API List", toError(error));
    res.status(500).json({ error: sanitizeErrorForClient(error) });
  }
});

// Tournaments API
app.get("/api/db/tournaments", validateRequest({ query: tournamentsQuerySchema }), async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, week_schedule_id } = req.query as TournamentsQuery;

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ schedule: null, events: [] }); // No user found
    }

    // If week_schedule_id is provided, get events for that schedule
    if (week_schedule_id) {
      const events = await sql`
        SELECT * FROM tournament_events
        WHERE week_schedule_id = ${week_schedule_id}
        ORDER BY day_of_week, name
      `;
      return res.json({ events });
    }

    let schedules;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      schedules = await sql`
        SELECT * FROM week_schedules
        WHERE organization_id = ${organization_id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    } else {
      // Personal context
      schedules = await sql`
        SELECT * FROM week_schedules
        WHERE user_id = ${resolvedUserId} AND organization_id IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
    }

    if (schedules.length === 0) {
      return res.json({ schedule: null, events: [] });
    }

    const schedule = schedules[0]!;

    // Get events for this schedule
    const events = await sql`
      SELECT * FROM tournament_events
      WHERE week_schedule_id = ${schedule.id}
      ORDER BY day_of_week, name
    `;

    res.json({ schedule, events });
  } catch (error) {
    if (
      error instanceof OrganizationAccessError ||
      error instanceof ValidationError
    ) {
      throw error;
    }
    throw toDatabaseError("Failed to fetch tournaments", error);
  }
});

app.post("/api/db/tournaments", validateRequest({ body: tournamentsCreateBodySchema }), async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, start_date, end_date, filename, events } =
      req.body as TournamentsCreateBody;

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    // Verify organization membership if organization_id provided
    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    }

    // Create week schedule
    const scheduleResult = await sql`
      INSERT INTO week_schedules (user_id, organization_id, start_date, end_date, filename, original_filename)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${start_date}, ${end_date}, ${filename || null}, ${filename || null})
      RETURNING *
    `;

    const schedule = scheduleResult[0]!;

    // Create events if provided - using parallel batch inserts for performance
    if (events && Array.isArray(events) && events.length > 0) {
      logger.info(
        { eventsCount: events.length },
        "[Tournaments API] Inserting events in parallel batches",
      );

      // Process in batches - each batch runs concurrently, batches run sequentially
      const batchSize = 50; // 50 concurrent inserts per batch
      const totalBatches = Math.ceil(events.length / batchSize);

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        logger.debug(
          { batchNum, totalBatches, batchSize: batch.length },
          "[Tournaments API] Processing batch",
        );

        // Execute all inserts in this batch concurrently
        await Promise.all(
          batch.map(
            (event) =>
              sql`
              INSERT INTO tournament_events (
                user_id, organization_id, week_schedule_id, day_of_week, name, game, gtd, buy_in,
                rebuy, add_on, stack, players, late_reg, minutes, structure, times, event_date
              )
              VALUES (
                ${resolvedUserId}, ${organization_id || null}, ${schedule.id}, ${event.day}, ${event.name}, ${event.game || null},
                ${event.gtd || null}, ${event.buyIn || null}, ${event.rebuy || null},
                ${event.addOn || null}, ${event.stack || null}, ${event.players || null},
                ${event.lateReg || null}, ${event.minutes || null}, ${event.structure || null},
                ${JSON.stringify(event.times || {})}, ${event.eventDate || null}
              )
            `,
          ),
        );
      }
      logger.info(
        { eventsCount: events.length },
        "[Tournaments API] All events inserted successfully",
      );
    }

    res.status(201).json({
      schedule,
      eventsCount: events?.length || 0,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Tournaments API", toError(error));
    res.status(500).json({ error: sanitizeErrorForClient(error) });
  }
});

app.delete("/api/db/tournaments", validateRequest({ query: tournamentsDeleteQuerySchema }), async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query as TournamentsDeleteQuery;

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    // Check if schedule belongs to an organization and verify membership
    const schedule =
      await sql`SELECT organization_id FROM week_schedules WHERE id = ${id}` as ScheduleOrganizationRow[];
    const existingSchedule = schedule[0];
    if (schedule.length > 0 && existingSchedule?.organization_id) {
      await resolveOrganizationContext(
        sql,
        resolvedUserId,
        existingSchedule.organization_id,
      );
    }

    // Delete events first
    await sql`
      DELETE FROM tournament_events
      WHERE week_schedule_id = ${id}
    `;

    // Delete schedule
    await sql`
      DELETE FROM week_schedules
      WHERE id = ${id}
    `;

    res.json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    logError("Tournaments API", toError(error));
    res.status(500).json({ error: sanitizeErrorForClient(error) });
  }
});

// Tournaments API - Update event flyer_urls
app.patch(
  "/api/db/tournaments/event-flyer",
  validateRequest({ query: tournamentEventFlyerQuerySchema, body: tournamentEventFlyerBodySchema }),
  async (req, res) => {
  try {
    const sql = getSql();
    const { event_id } = req.query as TournamentEventFlyerQuery;
    const { flyer_url, flyer_urls: requestedFlyerUrls, action } = req.body as TournamentEventFlyerBody;

    // Get current flyer_urls
    const [event] = await sql`
      SELECT flyer_urls FROM tournament_events WHERE id = ${event_id}
    ` as TournamentEventFlyerRow[];

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    let flyer_urls = event.flyer_urls || [];

    if (action === "add" && flyer_url) {
      // Add new flyer URL if not already present
      if (!flyer_urls.includes(flyer_url)) {
        flyer_urls = [...flyer_urls, flyer_url];
      }
    } else if (action === "remove" && flyer_url) {
      // Remove flyer URL
      flyer_urls = flyer_urls.filter((url) => url !== flyer_url);
    } else if (action === "set" && Array.isArray(requestedFlyerUrls)) {
      // Replace all flyer URLs
      flyer_urls = requestedFlyerUrls;
    }

    // Update database
    const result = await sql`
      UPDATE tournament_events
      SET flyer_urls = ${JSON.stringify(flyer_urls)}::jsonb,
          updated_at = NOW()
      WHERE id = ${event_id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    logError("Tournaments API (PATCH event-flyer)", toError(error));
    res.status(500).json({ error: sanitizeErrorForClient(error) });
  }
});

// Tournaments API - Update daily flyer_urls for week schedule
app.patch(
  "/api/db/tournaments/daily-flyer",
  validateRequest({ query: tournamentDailyFlyerQuerySchema, body: tournamentDailyFlyerBodySchema }),
  async (req, res) => {
  try {
    const sql = getSql();
    const { schedule_id, period, day } = req.query as TournamentDailyFlyerQuery;
    const { flyer_url, flyer_urls: requestedFlyerUrls, action } = req.body as TournamentDailyFlyerBody;

    // Get current daily_flyer_urls
    const [schedule] = await sql`
      SELECT daily_flyer_urls FROM week_schedules WHERE id = ${schedule_id}
    ` as WeekScheduleFlyerRow[];

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    const dailyFlyerUrls: Record<string, string[] | Record<string, string[]>> = schedule.daily_flyer_urls || {};

    // NEW STRUCTURE: Support day-based organization
    // Structure: { "MONDAY": { "MORNING": [...], "AFTERNOON": [...] }, "TUESDAY": {...}, ... }
    if (day) {
      // Ensure day object exists
      if (!dailyFlyerUrls[day]) {
        dailyFlyerUrls[day] = {};
      }

      const dayMap = dailyFlyerUrls[day];
      const dayPeriods = typeof dayMap === "object" && !Array.isArray(dayMap)
        ? dayMap
        : {};
      let periodUrls = dayPeriods[period] || [];

      if (action === "add" && flyer_url) {
        // Add new flyer URL if not already present
        if (!periodUrls.includes(flyer_url)) {
          periodUrls = [...periodUrls, flyer_url];
        }
      } else if (action === "remove" && flyer_url) {
        // Remove flyer URL
        periodUrls = periodUrls.filter((url) => url !== flyer_url);
      } else if (action === "set" && Array.isArray(requestedFlyerUrls)) {
        // Replace all flyer URLs for this period
        periodUrls = requestedFlyerUrls;
      }

      dailyFlyerUrls[day] = {
        ...dayPeriods,
        [period]: periodUrls,
      };
    } else {
      // OLD STRUCTURE (backward compatibility): { "MORNING": [...], "AFTERNOON": [...] }
      const existingPeriodUrls = dailyFlyerUrls[period];
      let periodUrls = Array.isArray(existingPeriodUrls) ? existingPeriodUrls : [];

      if (action === "add" && flyer_url) {
        // Add new flyer URL if not already present
        if (!periodUrls.includes(flyer_url)) {
          periodUrls = [...periodUrls, flyer_url];
        }
      } else if (action === "remove" && flyer_url) {
        // Remove flyer URL
        periodUrls = periodUrls.filter((url) => url !== flyer_url);
      } else if (action === "set" && Array.isArray(requestedFlyerUrls)) {
        // Replace all flyer URLs for this period
        periodUrls = requestedFlyerUrls;
      }

      dailyFlyerUrls[period] = periodUrls;
    }

    // Update database
    const result = await sql`
      UPDATE week_schedules
      SET daily_flyer_urls = ${JSON.stringify(dailyFlyerUrls)}::jsonb,
          updated_at = NOW()
      WHERE id = ${schedule_id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    logError("Tournaments API (PATCH daily-flyer)", toError(error));
    res.status(500).json({ error: sanitizeErrorForClient(error) });
  }
});
}
