/**
 * FAL.ai Client for Server-Side Video Generation
 * Uses FAL_KEY environment variable (NOT VITE_ prefix)
 */

import { fal } from '@fal-ai/client';

// Configure fal client
const configureFal = () => {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error('FAL_KEY environment variable is not configured');
  }
  fal.config({ credentials: apiKey });
};

// Response types
interface FalVideoResponse {
  data?: {
    video: { url: string };
    video_id?: string;
  };
  video?: { url: string };
}

/**
 * Generate video using Sora 2 (text-to-video or image-to-video)
 */
export const generateSora2Video = async (
  prompt: string,
  aspectRatio: '16:9' | '9:16',
  imageUrl?: string,
  duration: 4 | 8 | 12 = 12
): Promise<string> => {
  configureFal();

  const isHttpUrl = imageUrl && imageUrl.startsWith('http');
  console.log(`[fal.ai] Starting Sora 2 ${isHttpUrl ? 'image-to-video' : 'text-to-video'} (${duration}s)...`);

  let result: FalVideoResponse;

  if (isHttpUrl) {
    result = (await fal.subscribe('fal-ai/sora-2/image-to-video', {
      input: {
        prompt,
        image_url: imageUrl,
        resolution: '720p',
        aspect_ratio: aspectRatio,
        duration,
        delete_video: false,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('[fal.ai] Sora 2 (image-to-video) processing...');
        }
      },
    })) as FalVideoResponse;
  } else {
    result = (await fal.subscribe('fal-ai/sora-2/text-to-video', {
      input: {
        prompt,
        resolution: '720p',
        aspect_ratio: aspectRatio,
        duration,
        delete_video: false,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('[fal.ai] Sora 2 (text-to-video) processing...');
        }
      },
    })) as FalVideoResponse;
  }

  const videoUrl = result?.data?.video?.url || result?.video?.url;
  if (!videoUrl) {
    console.error('[fal.ai] Invalid Sora 2 response:', JSON.stringify(result, null, 2));
    throw new Error('Falha ao gerar vídeo Sora 2 - resposta inválida');
  }

  console.log(`[fal.ai] Sora 2 video URL: ${videoUrl}`);
  return videoUrl;
};

/**
 * Generate video using Veo 3.1 Fast
 */
export const generateVeo31Video = async (
  prompt: string,
  aspectRatio: '16:9' | '9:16',
  imageUrl?: string,
  sceneDuration?: number
): Promise<string> => {
  configureFal();

  const duration = sceneDuration && sceneDuration <= 4 ? '4s' : sceneDuration && sceneDuration <= 6 ? '6s' : '8s';
  const isHttpUrl = imageUrl && imageUrl.startsWith('http');

  console.log(`[fal.ai] Starting Veo 3.1 Fast ${isHttpUrl ? 'image-to-video' : 'text-to-video'} (${duration})...`);

  let result: FalVideoResponse;

  if (isHttpUrl) {
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
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('[fal.ai] Veo 3.1 (image-to-video) processing...');
        }
      },
    })) as FalVideoResponse;
  } else {
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
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log('[fal.ai] Veo 3.1 (text-to-video) processing...');
        }
      },
    })) as FalVideoResponse;
  }

  const videoUrl = result?.data?.video?.url || result?.video?.url;
  if (!videoUrl) {
    console.error('[fal.ai] Invalid Veo 3.1 response:', JSON.stringify(result, null, 2));
    throw new Error('Falha ao gerar vídeo Veo 3.1 - resposta inválida');
  }

  console.log(`[fal.ai] Veo 3.1 video URL: ${videoUrl}`);
  return videoUrl;
};

/**
 * Download video from URL and return as Blob
 */
export const downloadVideoAsBlob = async (url: string): Promise<Blob> => {
  const response = await fetch(url);
  return response.blob();
};

/**
 * Get display name for fal.ai model
 */
export const getFalModelDisplayName = (model: string): string => {
  const names: Record<string, string> = {
    'fal-ai/sora-2/text-to-video': 'Sora 2 (OpenAI)',
    'fal-ai/veo3.1/fast': 'Veo 3.1 Fast (fal.ai)',
  };
  return names[model] || model;
};
