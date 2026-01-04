/**
 * Speech Generation Endpoint
 * POST /api/ai/speech
 *
 * Generates text-to-speech audio using Gemini TTS
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  setupCors,
  requireAuth,
  applyRateLimit,
  createRateLimitKey,
} from '../db/_helpers';
import {
  generateGeminiSpeech,
  trackAIOperation,
  createUsageContext,
} from './_helpers/index';

interface SpeechGenerationRequest {
  script: string;
  voiceName?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Require authentication
    const auth = await requireAuth(req);

    // Apply rate limiting
    const rateLimitKey = createRateLimitKey(auth.userId, auth.orgId);
    const rateLimitOk = await applyRateLimit('speech', rateLimitKey, res);
    if (!rateLimitOk) return;

    const body: SpeechGenerationRequest = req.body;

    if (!body.script) {
      return res.status(400).json({ error: 'script is required' });
    }

    const { script, voiceName = 'Orus' } = body;

    console.log(`[Speech API] Generating speech with voice: ${voiceName}`);

    // Create usage context for tracking
    const usageContext = createUsageContext(
      auth.userId,
      auth.orgId,
      '/api/ai/speech',
      'speech'
    );

    // Track the AI operation
    const audioBase64 = await trackAIOperation(
      usageContext,
      'google',
      'gemini-2.5-flash-preview-tts',
      async () => {
        const result = await generateGeminiSpeech(script, voiceName);
        if (!result) {
          throw new Error('Failed to generate speech audio');
        }
        return result;
      },
      (_result, _latencyMs) => ({
        characterCount: script.length,
        metadata: {
          voiceName,
        },
      })
    );

    console.log('[Speech API] Speech generated successfully');

    res.json({
      success: true,
      audioBase64,
      voiceName,
    });
  } catch (error: any) {
    console.error('[Speech API] Error:', error);

    if (error.name === 'AuthenticationError') {
      return res.status(401).json({ error: error.message });
    }

    return res.status(500).json({ error: error.message || 'Failed to generate speech' });
  }
}
