/**
 * CORS helpers for Vercel Serverless Functions
 * Provides consistent CORS headers across all endpoints
 */

import type { VercelResponse } from '@vercel/node';

/**
 * Set CORS headers on the response
 * Allows all origins in development, restrict in production if needed
 */
export function setCorsHeaders(res: VercelResponse): void {
  // In production, you may want to restrict this to your domain
  const allowedOrigins = process.env.ALLOWED_ORIGINS || '*';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigins);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours cache for preflight
}

/**
 * Handle CORS preflight request
 * Returns true if the request was a preflight and has been handled
 */
export function handleCorsPreflightIfNeeded(
  method: string | undefined,
  res: VercelResponse
): boolean {
  if (method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * Wrapper to set CORS and handle preflight in one call
 */
export function setupCors(
  method: string | undefined,
  res: VercelResponse
): boolean {
  setCorsHeaders(res);
  return handleCorsPreflightIfNeeded(method, res);
}
