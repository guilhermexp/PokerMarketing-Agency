/**
 * Vercel Serverless Function - Video Generation API
 * Generates videos using FAL.ai (Sora 2, Veo 3.1) server-side
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fal } from '@fal-ai/client';
import { put } from '@vercel/blob';
import { requireAuth, applyRateLimit, createRateLimitKey, setupCors } from '../db/_helpers';
import { trackAIOperation, createUsageContext } from './_helpers/index';

// Configure fal client
const configureFal = () => {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error('FAL_KEY environment variable is not configured');
  }
  fal.config({ credentials: apiKey });
};

interface FalVideoResponse {
  data?: {
    video: { url: string };
    video_id?: string;
  };
  video?: { url: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Require authentication
    const auth = await requireAuth(req);

    // Apply rate limiting
    const rateLimitKey = createRateLimitKey(auth.userId, auth.orgId);
    const rateLimitOk = await applyRateLimit('video', rateLimitKey, res);
    if (!rateLimitOk) return;

    configureFal();

    const { prompt, aspectRatio, model, imageUrl, sceneDuration } = req.body as {
      prompt: string;
      aspectRatio: '16:9' | '9:16';
      model: 'sora-2' | 'veo-3.1';
      imageUrl?: string;
      sceneDuration?: number;
    };

    if (!prompt || !aspectRatio || !model) {
      return res.status(400).json({
        error: 'Missing required fields: prompt, aspectRatio, model',
      });
    }

    console.log(`[Video API] Generating video with ${model}...`);

    const isHttpUrl = imageUrl && imageUrl.startsWith('http');

    // Determine the actual model ID for tracking
    const modelId = model === 'sora-2'
      ? (isHttpUrl ? 'fal-ai/sora-2/image-to-video' : 'fal-ai/sora-2/text-to-video')
      : (isHttpUrl ? 'fal-ai/veo3.1/fast/image-to-video' : 'fal-ai/veo3.1/fast');

    // Create usage context for tracking
    const usageContext = createUsageContext(
      auth.userId,
      auth.orgId,
      '/api/ai/video',
      'video'
    );

    // Calculate expected duration
    const videoDuration = model === 'sora-2' ? 12 : (sceneDuration && sceneDuration <= 4 ? 4 : sceneDuration && sceneDuration <= 6 ? 6 : 8);

    // Track the AI operation
    const blobUrl = await trackAIOperation(
      usageContext,
      'fal',
      modelId,
      async () => {
        let videoUrl: string;

        if (model === 'sora-2') {
          const duration: number = 12;
          let result: FalVideoResponse;

          if (isHttpUrl) {
            console.log(`[Video API] Sora 2 image-to-video (${duration}s)...`);
            result = (await fal.subscribe('fal-ai/sora-2/image-to-video', {
              input: {
                prompt,
                image_url: imageUrl,
                resolution: '720p',
                aspect_ratio: aspectRatio,
                duration: duration as any,
                delete_video: false,
              },
              logs: true,
            })) as FalVideoResponse;
          } else {
            console.log(`[Video API] Sora 2 text-to-video (${duration}s)...`);
            result = (await fal.subscribe('fal-ai/sora-2/text-to-video', {
              input: {
                prompt,
                resolution: '720p',
                aspect_ratio: aspectRatio,
                duration: duration as any,
                delete_video: false,
              },
              logs: true,
            })) as FalVideoResponse;
          }

          videoUrl = result?.data?.video?.url || result?.video?.url || '';
        } else {
          const duration = sceneDuration && sceneDuration <= 4 ? '4s' : sceneDuration && sceneDuration <= 6 ? '6s' : '8s';
          let result: FalVideoResponse;

          if (isHttpUrl) {
            console.log(`[Video API] Veo 3.1 image-to-video (${duration})...`);
            result = (await fal.subscribe('fal-ai/veo3.1/fast/image-to-video', {
              input: {
                prompt,
                image_url: imageUrl,
                aspect_ratio: aspectRatio,
                duration,
                resolution: '720p',
                generate_audio: true,
              },
              logs: true,
            })) as FalVideoResponse;
          } else {
            console.log(`[Video API] Veo 3.1 text-to-video (${duration})...`);
            result = (await fal.subscribe('fal-ai/veo3.1/fast', {
              input: {
                prompt,
                aspect_ratio: aspectRatio,
                duration,
                resolution: '720p',
                generate_audio: true,
                auto_fix: true,
              },
              logs: true,
            })) as FalVideoResponse;
          }

          videoUrl = result?.data?.video?.url || result?.video?.url || '';
        }

        if (!videoUrl) {
          throw new Error('Failed to generate video - invalid response');
        }

        console.log(`[Video API] Video generated: ${videoUrl}`);

        // Download video and upload to Vercel Blob for permanent storage
        console.log('[Video API] Uploading to Vercel Blob...');
        const videoResponse = await fetch(videoUrl);
        const videoBlob = await videoResponse.blob();

        const filename = `${model}-video-${Date.now()}.mp4`;
        const blob = await put(filename, videoBlob, {
          access: 'public',
          contentType: 'video/mp4',
        });

        console.log(`[Video API] Video stored: ${blob.url}`);
        return blob.url;
      },
      (_result, _latencyMs) => ({
        videoDurationSeconds: videoDuration,
        aspectRatio,
        metadata: {
          model,
          hasImageInput: !!isHttpUrl,
        },
      })
    );

    return res.status(200).json({
      success: true,
      url: blobUrl,
      model,
    });
  } catch (error: any) {
    console.error('[Video API] Error:', error);

    if (error.name === 'AuthenticationError') {
      return res.status(401).json({ error: error.message });
    }

    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate video',
    });
  }
}
