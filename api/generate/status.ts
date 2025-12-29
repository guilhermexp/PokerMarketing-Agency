/**
 * Generation Job Status API
 * Get status and results of generation jobs
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors, resolveUserId } from '../db/_helpers/index';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const { jobId, userId, status: filterStatus, limit = '50' } = req.query;

    // Single job query
    if (jobId) {
      const jobs = await sql`
        SELECT
          id,
          user_id,
          job_type,
          status,
          progress,
          result_url,
          result_gallery_id,
          error_message,
          created_at,
          started_at,
          completed_at,
          attempts
        FROM generation_jobs
        WHERE id = ${jobId as string}
        LIMIT 1
      `;

      if (jobs.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      return res.status(200).json(jobs[0]);
    }

    // List jobs for user
    if (userId) {
      // Resolve Clerk ID to DB UUID
      const resolvedUserId = await resolveUserId(sql, userId as string);
      if (!resolvedUserId) {
        return res.status(200).json({ jobs: [], total: 0 });
      }

      let jobs;
      const limitNum = parseInt(limit as string);

      if (filterStatus) {
        jobs = await sql`
          SELECT
            id,
            user_id,
            job_type,
            status,
            progress,
            result_url,
            result_gallery_id,
            error_message,
            created_at,
            started_at,
            completed_at
          FROM generation_jobs
          WHERE user_id = ${resolvedUserId}
            AND status = ${filterStatus as string}
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        jobs = await sql`
          SELECT
            id,
            user_id,
            job_type,
            status,
            progress,
            result_url,
            result_gallery_id,
            error_message,
            created_at,
            started_at,
            completed_at
          FROM generation_jobs
          WHERE user_id = ${resolvedUserId}
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }

      return res.status(200).json({
        jobs,
        total: jobs.length,
      });
    }

    return res.status(400).json({ error: 'jobId or userId is required' });
  } catch (error) {
    console.error('[Generate Status] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get status',
    });
  }
}
