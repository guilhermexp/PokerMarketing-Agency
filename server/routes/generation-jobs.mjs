import { getSql } from "../lib/db.mjs";
import { resolveUserId } from "../lib/user-resolver.mjs";
import { logError } from "../lib/logging-helpers.mjs";
import { sanitizeErrorForClient } from "../lib/ai/retry.mjs";

export function registerGenerationJobRoutes(app) {
app.post("/api/generate/queue", async (req, res) => {
  return res.status(503).json({
    error:
      "Background job queue is disabled. Use synchronous image generation.",
    disabled: true,
  });
});

app.get("/api/generate/status", async (req, res) => {
  try {
    const sql = getSql();
    const {
      jobId,
      userId,
      organizationId,
      status: filterStatus,
      limit,
    } = req.query;

    // Single job query
    if (jobId) {
      const resolvedUserId = await resolveUserId(sql, req.authUserId);
      if (!resolvedUserId) {
        return res.status(401).json({ error: "User not found" });
      }

      const effectiveOrgId = req.authOrgId || null;
      const jobs = await sql`
        SELECT
          id, user_id, organization_id, job_type, status, progress,
          CASE WHEN result_url LIKE 'data:%' THEN '' ELSE result_url END as result_url, result_gallery_id, error_message,
          created_at, started_at, completed_at, attempts,
          config->>'_context' as context
        FROM generation_jobs
        WHERE id = ${jobId}
          AND (
            (${effectiveOrgId}::text IS NOT NULL AND organization_id = ${effectiveOrgId})
            OR (${effectiveOrgId}::text IS NULL AND user_id = ${resolvedUserId} AND organization_id IS NULL)
          )
        LIMIT 1
      `;

      if (jobs.length === 0) {
        return res.status(404).json({ error: "Job not found" });
      }

      return res.json(jobs[0]);
    }

    // List jobs for user
    if (userId) {
      let jobs;
      const resolvedUserId = await resolveUserId(sql, userId);
      if (!resolvedUserId) {
        return res.json({ jobs: [], total: 0 });
      }

      const limitNum = Math.min(parseInt(String(limit || "30"), 10) || 30, 50); // Max 50, default 30
      const cutoffDate = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString(); // 24 hours ago
      // For active jobs, only show recent ones (1 hour) to avoid showing stale queued jobs
      const activeCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

      // Filter by organization context
      if (organizationId) {
        // Organization context - show only org jobs
        if (filterStatus) {
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              CASE WHEN result_url LIKE 'data:%' THEN '' ELSE result_url END as result_url, result_gallery_id,
              CASE WHEN LENGTH(error_message) > 500 THEN LEFT(error_message, 500) || '...' ELSE error_message END as error_message,
              created_at, started_at, completed_at,
              config->>'_context' as context
            FROM generation_jobs
            WHERE organization_id = ${organizationId} AND status = ${filterStatus}
            ORDER BY created_at DESC
            LIMIT ${limitNum}
          `;
        } else {
          // Get recent active jobs + recent completed/failed jobs
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              CASE WHEN result_url LIKE 'data:%' THEN '' ELSE result_url END as result_url, result_gallery_id,
              CASE WHEN LENGTH(error_message) > 500 THEN LEFT(error_message, 500) || '...' ELSE error_message END as error_message,
              created_at, started_at, completed_at,
              config->>'_context' as context
            FROM generation_jobs
            WHERE organization_id = ${organizationId}
              AND (
                (status IN ('queued', 'processing') AND created_at > ${activeCutoff})
                OR created_at > ${cutoffDate}
              )
            ORDER BY created_at DESC
            LIMIT ${limitNum}
          `;
        }
      } else {
        // Personal context - show only personal jobs (no organization)
        if (filterStatus) {
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              CASE WHEN result_url LIKE 'data:%' THEN '' ELSE result_url END as result_url, result_gallery_id,
              CASE WHEN LENGTH(error_message) > 500 THEN LEFT(error_message, 500) || '...' ELSE error_message END as error_message,
              created_at, started_at, completed_at,
              config->>'_context' as context
            FROM generation_jobs
            WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND status = ${filterStatus}
            ORDER BY created_at DESC
            LIMIT ${limitNum}
          `;
        } else {
          // Get recent active jobs + recent completed/failed jobs
          jobs = await sql`
            SELECT
              id, user_id, organization_id, job_type, status, progress,
              CASE WHEN result_url LIKE 'data:%' THEN '' ELSE result_url END as result_url, result_gallery_id,
              CASE WHEN LENGTH(error_message) > 500 THEN LEFT(error_message, 500) || '...' ELSE error_message END as error_message,
              created_at, started_at, completed_at,
              config->>'_context' as context
            FROM generation_jobs
            WHERE user_id = ${resolvedUserId} AND organization_id IS NULL
              AND (
                (status IN ('queued', 'processing') AND created_at > ${activeCutoff})
                OR created_at > ${cutoffDate}
              )
            ORDER BY created_at DESC
            LIMIT ${limitNum}
          `;
        }
      }

      return res.json({ jobs, total: jobs.length });
    }

    return res.status(400).json({ error: "jobId or userId is required" });
  } catch (error) {
    logError("Generate Status", error);
    res.status(500).json({ error: sanitizeErrorForClient(error) });
  }
});

// Cancel all pending/queued jobs for a user
app.post("/api/generate/cancel-all", async (req, res) => {
  try {
    const sql = getSql();
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, userId);
    if (!resolvedUserId) {
      return res.status(400).json({ error: "User not found" });
    }

    // Delete all queued jobs (not started yet)
    const result = await sql`
      DELETE FROM generation_jobs
      WHERE user_id = ${resolvedUserId}
        AND status = 'queued'
      RETURNING id
    `;

    const cancelledCount = result.length;

    res.json({
      success: true,
      cancelledCount,
      message: `${cancelledCount} job(s) cancelled`,
    });
  } catch (error) {
    logError("Cancel All Jobs API", error);
    res.status(500).json({ error: sanitizeErrorForClient(error) });
  }
});
}
