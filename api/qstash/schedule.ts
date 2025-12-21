/**
 * QStash Schedule API - Schedule a post for future publication
 * Called by frontend when user schedules a post
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@upstash/qstash';

// Get the base URL for callbacks
function getBaseUrl(req: VercelRequest): string {
  const host = req.headers.host || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
  if (!QSTASH_TOKEN) {
    return res.status(500).json({ error: 'QSTASH_TOKEN not configured' });
  }

  const client = new Client({ token: QSTASH_TOKEN });

  // POST - Schedule a new post
  if (req.method === 'POST') {
    const { postId, userId, scheduledTimestamp } = req.body;

    if (!postId || !userId || !scheduledTimestamp) {
      return res.status(400).json({ error: 'Missing postId, userId, or scheduledTimestamp' });
    }

    try {
      const now = Date.now();
      const targetTime = new Date(scheduledTimestamp).getTime();
      const delaySeconds = Math.max(0, Math.floor((targetTime - now) / 1000));

      // If in the past or very soon, publish immediately
      const shouldDelay = delaySeconds > 10;

      const baseUrl = getBaseUrl(req);
      const callbackUrl = `${baseUrl}/api/qstash/publish`;

      console.log(`[QStash] Scheduling post ${postId} for ${new Date(targetTime).toISOString()}`);
      console.log(`[QStash] Delay: ${delaySeconds}s, Callback: ${callbackUrl}`);

      const response = await client.publishJSON({
        url: callbackUrl,
        body: { postId, userId },
        delay: shouldDelay ? delaySeconds : undefined,
        retries: 3,
      });

      console.log(`[QStash] Scheduled! Message ID: ${response.messageId}`);

      return res.status(200).json({
        success: true,
        messageId: response.messageId,
        scheduledFor: new Date(targetTime).toISOString(),
        delaySeconds: shouldDelay ? delaySeconds : 0,
      });

    } catch (error) {
      console.error('[QStash] Schedule error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to schedule'
      });
    }
  }

  // DELETE - Cancel a scheduled post
  if (req.method === 'DELETE') {
    const { messageId } = req.query;

    if (!messageId) {
      return res.status(400).json({ error: 'Missing messageId' });
    }

    try {
      await client.messages.delete(messageId as string);

      return res.status(200).json({
        success: true,
        message: 'Schedule cancelled'
      });

    } catch (error) {
      console.error('[QStash] Cancel error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to cancel'
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
