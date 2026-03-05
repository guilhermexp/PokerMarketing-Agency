/**
 * Feedback API route
 *
 * Receives client feedback annotations, logs them, and forwards
 * to the Notes Capture API for persistent storage.
 */

import { Router } from 'express';
import logger from '../lib/logger.mjs';

const NOTES_API_URL = process.env.NOTES_API_URL || 'https://suna-api.claudedokploy.com';
const NOTES_API_KEY = process.env.NOTES_API_KEY;

const router = Router();

router.post('/api/feedback', async (req, res) => {
  try {
    if (!NOTES_API_KEY) {
      logger.error('[Feedback] Missing NOTES_API_KEY environment variable');
      return res.status(500).json({ error: 'Feedback service misconfigured' });
    }

    const { markdown, pageUrl, annotations } = req.body;

    if (!markdown) {
      return res.status(400).json({ error: 'Markdown content is required' });
    }

    const userId = req.internalAuth?.userId || req.authUserId || 'anonymous';
    const orgId = req.internalAuth?.orgId || req.authOrgId || null;

    logger.info(
      {
        userId,
        orgId,
        pageUrl,
        annotationsCount: annotations?.length || 0,
      },
      '[Feedback] Client feedback received'
    );

    // Forward to Notes Capture API
    const notesResponse = await fetch(NOTES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': NOTES_API_KEY,
      },
      body: JSON.stringify({
        content: markdown,
        title: `Feedback - ${new URL(pageUrl || 'https://site.com').pathname}`,
        source: 'client-feedback',
        metadata: {
          pageUrl,
          userId,
          orgId,
          annotationsCount: annotations?.length || 0,
          timestamp: new Date().toISOString(),
        },
      }),
    });

    if (!notesResponse.ok) {
      const errorText = await notesResponse.text();
      logger.error({ status: notesResponse.status, errorText }, '[Feedback] Notes API error');
      return res.status(notesResponse.status).json({ error: 'Failed to send feedback' });
    }

    const data = await notesResponse.json();

    return res.json({
      success: true,
      data,
      annotationsCount: annotations?.length || 0,
    });
  } catch (error) {
    logger.error({ err: error }, '[Feedback] Failed to process feedback');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export function registerFeedbackRoutes(app) {
  app.use(router);
}
