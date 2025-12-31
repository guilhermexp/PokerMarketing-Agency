/**
 * Simple test endpoint - no dependencies
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasDatabase: !!process.env.DATABASE_URL,
      hasClerk: !!process.env.CLERK_SECRET_KEY,
      hasGemini: !!process.env.GEMINI_API_KEY,
    }
  });
}
