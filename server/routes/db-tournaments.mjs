import { getSql } from "../lib/db.mjs";
import { resolveUserId } from "../lib/user-resolver.mjs";
import { resolveOrganizationContext } from "../lib/auth.mjs";
import { logError } from "../lib/logging-helpers.mjs";
import { ValidationError, DatabaseError } from "../lib/errors/index.mjs";
import { OrganizationAccessError } from "../helpers/organization-context.mjs";
import logger from "../lib/logger.mjs";

export function registerTournamentRoutes(app) {
app.get("/api/db/tournaments/list", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

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
    logError("Tournaments API List", error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API
app.get("/api/db/tournaments", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, week_schedule_id } = req.query;

    if (!user_id) {
      throw new ValidationError("user_id is required");
    }

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

    const schedule = schedules[0];

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
    throw new DatabaseError("Failed to fetch tournaments", error);
  }
});

app.post("/api/db/tournaments", async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, start_date, end_date, filename, events } =
      req.body;

    if (!user_id || !start_date || !end_date) {
      return res
        .status(400)
        .json({ error: "user_id, start_date, and end_date are required" });
    }

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

    const schedule = scheduleResult[0];

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
    logError("Tournaments API", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/db/tournaments", async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id || !user_id) {
      return res.status(400).json({ error: "id and user_id are required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    // Check if schedule belongs to an organization and verify membership
    const schedule =
      await sql`SELECT organization_id FROM week_schedules WHERE id = ${id}`;
    if (schedule.length > 0 && schedule[0].organization_id) {
      await resolveOrganizationContext(
        sql,
        resolvedUserId,
        schedule[0].organization_id,
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
    logError("Tournaments API", error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API - Update event flyer_urls
app.patch("/api/db/tournaments/event-flyer", async (req, res) => {
  try {
    const sql = getSql();
    const { event_id } = req.query;
    const { flyer_url, action } = req.body; // action: 'add' or 'remove'

    if (!event_id) {
      return res.status(400).json({ error: "event_id is required" });
    }

    // Get current flyer_urls
    const [event] = await sql`
      SELECT flyer_urls FROM tournament_events WHERE id = ${event_id}
    `;

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
    } else if (action === "set" && Array.isArray(req.body.flyer_urls)) {
      // Replace all flyer URLs
      flyer_urls = req.body.flyer_urls;
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
    logError("Tournaments API (PATCH event-flyer)", error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API - Update daily flyer_urls for week schedule
app.patch("/api/db/tournaments/daily-flyer", async (req, res) => {
  try {
    const sql = getSql();
    const { schedule_id, period, day } = req.query; // period: 'MORNING', 'AFTERNOON', 'NIGHT', 'HIGHLIGHTS'; day: 'MONDAY', 'TUESDAY', etc.
    const { flyer_url, action } = req.body; // action: 'add' or 'remove'

    if (!schedule_id || !period) {
      return res
        .status(400)
        .json({ error: "schedule_id and period are required" });
    }

    // Get current daily_flyer_urls
    const [schedule] = await sql`
      SELECT daily_flyer_urls FROM week_schedules WHERE id = ${schedule_id}
    `;

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    let daily_flyer_urls = schedule.daily_flyer_urls || {};

    // NEW STRUCTURE: Support day-based organization
    // Structure: { "MONDAY": { "MORNING": [...], "AFTERNOON": [...] }, "TUESDAY": {...}, ... }
    if (day) {
      // Ensure day object exists
      if (!daily_flyer_urls[day]) {
        daily_flyer_urls[day] = {};
      }

      let periodUrls = daily_flyer_urls[day][period] || [];

      if (action === "add" && flyer_url) {
        // Add new flyer URL if not already present
        if (!periodUrls.includes(flyer_url)) {
          periodUrls = [...periodUrls, flyer_url];
        }
      } else if (action === "remove" && flyer_url) {
        // Remove flyer URL
        periodUrls = periodUrls.filter((url) => url !== flyer_url);
      } else if (action === "set" && Array.isArray(req.body.flyer_urls)) {
        // Replace all flyer URLs for this period
        periodUrls = req.body.flyer_urls;
      }

      daily_flyer_urls[day][period] = periodUrls;
    } else {
      // OLD STRUCTURE (backward compatibility): { "MORNING": [...], "AFTERNOON": [...] }
      let periodUrls = daily_flyer_urls[period] || [];

      if (action === "add" && flyer_url) {
        // Add new flyer URL if not already present
        if (!periodUrls.includes(flyer_url)) {
          periodUrls = [...periodUrls, flyer_url];
        }
      } else if (action === "remove" && flyer_url) {
        // Remove flyer URL
        periodUrls = periodUrls.filter((url) => url !== flyer_url);
      } else if (action === "set" && Array.isArray(req.body.flyer_urls)) {
        // Replace all flyer URLs for this period
        periodUrls = req.body.flyer_urls;
      }

      daily_flyer_urls[period] = periodUrls;
    }

    // Update database
    const result = await sql`
      UPDATE week_schedules
      SET daily_flyer_urls = ${JSON.stringify(daily_flyer_urls)}::jsonb,
          updated_at = NOW()
      WHERE id = ${schedule_id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    logError("Tournaments API (PATCH daily-flyer)", error);
    res.status(500).json({ error: error.message });
  }
});
}
