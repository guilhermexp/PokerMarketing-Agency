/**
 * Vercel Serverless Function - Database Health Check
 * Checks if the Neon PostgreSQL database is connected and responsive
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql, setupCors } from './_helpers/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const startTime = Date.now();

    // Simple query to test connection
    const result = await sql`SELECT NOW() as server_time, current_database() as database`;
    const latency = Date.now() - startTime;

    return res.status(200).json({
      status: 'healthy',
      configured: true,
      latency_ms: latency,
      server_time: result[0].server_time,
      database: result[0].database,
    });
  } catch (error) {
    console.error('[DB Health] Error:', error);
    return res.status(503).json({
      status: 'error',
      configured: !!process.env.DATABASE_URL,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
