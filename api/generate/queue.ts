/**
 * Queue Generation Job API
 * Receives generation request, saves to DB, queues in QStash for background processing
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@upstash/qstash';
import { getSql, setupCors, resolveUserId } from '../db/_helpers/index';

const QSTASH_TOKEN = process.env.QSTASH_TOKEN;

function getBaseUrl(req: VercelRequest): string {
  const host = req.headers.host || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

export interface GenerationJobConfig {
  // Brand profile
  brandName: string;
  brandDescription?: string;
  brandToneOfVoice: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;

  // Image options
  aspectRatio: string;
  model: string;
  imageSize?: string;

  // Assets (base64)
  logo?: string;
  collabLogo?: string;
  styleReference?: string;
  compositionAssets?: string[];

  // Source info for gallery
  source: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!QSTASH_TOKEN) {
    return res.status(500).json({ error: 'QStash not configured' });
  }

  try {
    const sql = getSql();
    const { userId, organizationId, jobType, prompt, config } = req.body as {
      userId: string;
      organizationId?: string;
      jobType: 'flyer' | 'flyer_daily' | 'post' | 'ad';
      prompt: string;
      config: GenerationJobConfig;
    };

    if (!userId || !jobType || !prompt || !config) {
      return res.status(400).json({
        error: 'Missing required fields: userId, jobType, prompt, config',
      });
    }

    // Resolve Clerk ID to DB UUID
    const resolvedUserId = await resolveUserId(sql, userId);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Create job in database
    const result = await sql`
      INSERT INTO generation_jobs (user_id, organization_id, job_type, prompt, config, status)
      VALUES (${resolvedUserId}, ${organizationId || null}, ${jobType}, ${prompt}, ${JSON.stringify(config)}, 'queued')
      RETURNING id, created_at
    `;

    const job = result[0];
    console.log(`[Generate Queue] Created job ${job.id} for user ${resolvedUserId}`);

    // Queue in QStash for immediate processing
    const client = new Client({ token: QSTASH_TOKEN });
    const baseUrl = getBaseUrl(req);
    const callbackUrl = `${baseUrl}/api/generate/process`;

    const qstashResponse = await client.publishJSON({
      url: callbackUrl,
      body: { jobId: job.id },
      retries: 3,
    });

    // Update job with QStash message ID
    await sql`
      UPDATE generation_jobs
      SET qstash_message_id = ${qstashResponse.messageId}
      WHERE id = ${job.id}
    `;

    console.log(`[Generate Queue] Queued job ${job.id} in QStash: ${qstashResponse.messageId}`);

    return res.status(200).json({
      success: true,
      jobId: job.id,
      messageId: qstashResponse.messageId,
      status: 'queued',
    });
  } catch (error) {
    console.error('[Generate Queue] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to queue generation',
    });
  }
}
