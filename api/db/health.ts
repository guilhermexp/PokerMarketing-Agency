/**
 * Vercel Serverless Function - Database Health Check
 * Checks if the Neon PostgreSQL database is connected and responsive
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!DATABASE_URL) {
      return res.status(503).json({
        status: 'error',
        message: 'DATABASE_URL not configured',
        configured: false,
      });
    }

    const sql = neon(DATABASE_URL);
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
      configured: !!DATABASE_URL,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
