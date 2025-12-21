/**
 * Vercel Serverless Function - Rube MCP Proxy
 * Bypasses CORS by proxying requests to rube.app/mcp
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const MCP_URL = 'https://rube.app/mcp';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.RUBE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'RUBE_TOKEN not configured' });
  }

  try {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Return the response
    res.status(response.status).send(text);
  } catch (error) {
    console.error('[Rube Proxy] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
