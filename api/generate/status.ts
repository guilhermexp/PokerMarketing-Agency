/**
 * Generation Job Status API
 * Get status and results of generation jobs
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

function getSql() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');
  return neon(DATABASE_URL);
}

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!DATABASE_URL) {
    return res.status(500).json({ error: 'Server configuration missing' });
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
      let jobs;

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
          WHERE user_id = ${userId as string}
            AND status = ${filterStatus as string}
          ORDER BY created_at DESC
          LIMIT ${parseInt(limit as string)}
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
          WHERE user_id = ${userId as string}
          ORDER BY created_at DESC
          LIMIT ${parseInt(limit as string)}
        `;
      }

      return res.status(200).json({
        jobs,
        total: jobs.length
      });
    }

    return res.status(400).json({ error: 'jobId or userId is required' });

  } catch (error) {
    console.error('[Generate Status] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get status'
    });
  }
}
