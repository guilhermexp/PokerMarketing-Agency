import { fal } from "@fal-ai/client";
import type { FalVideoModel } from '../types';

// Configure fal client with API key from environment
fal.config({
  credentials: import.meta.env.VITE_FAL_KEY || process.env.FAL_KEY,
});


interface Sora2TextToVideoInput {
  prompt: string;
  resolution?: '720p' | 'auto';
  aspect_ratio?: '16:9' | '9:16' | 'auto';
  duration?: 4 | 8 | 12;
  delete_video?: boolean;
}

interface Sora2ImageToVideoInput {
  prompt: string;
  image_url: string;
  resolution?: '720p' | 'auto';
  aspect_ratio?: '16:9' | '9:16' | 'auto';
  duration?: 4 | 8 | 12;
  delete_video?: boolean;
}

// Response types
interface FalVideoResponse {
  video: {
    url: string;
  };
}

/**
 * Map scene duration to Sora 2 duration options (4, 8, or 12 seconds)
 * Uses the smallest duration that covers the scene to optimize costs
 */
const getSora2Duration = (sceneDuration: number): 4 | 8 | 12 => {
  if (sceneDuration <= 4) return 4;
  if (sceneDuration <= 8) return 8;
  return 12;
};

/**
 * Generate video using fal.ai models
 */
export const generateFalVideo = async (
  prompt: string,
  aspectRatio: '16:9' | '9:16',
  model: FalVideoModel,
  imageUrl?: string,
  sceneDuration?: number
): Promise<string> => {
  console.log(`[fal.ai] Generating video with model: ${model}`);

      case 'fal-ai/sora-2/text-to-video': {
        // Use image-to-video only if image is a valid HTTP URL (not data URL)
        const isHttpUrl = imageUrl && imageUrl.startsWith('http');

        // Calculate optimal Sora 2 duration based on scene duration
        const sora2Duration = sceneDuration ? getSora2Duration(sceneDuration) : 12;
        console.log(`[fal.ai] Scene duration: ${sceneDuration}s → Sora 2 duration: ${sora2Duration}s`);

        // Sora 2 response is wrapped in 'data' by fal.ai client
        interface Sora2Result {
          data: {
            video: { url: string };
            video_id: string;
          };
        }

        let soraResult: Sora2Result;

        if (isHttpUrl) {
          const input: Sora2ImageToVideoInput = {
            prompt,
            image_url: imageUrl,
            resolution: '720p',
            aspect_ratio: aspectRatio,
            duration: sora2Duration,
            delete_video: false,
          };

          console.log(`[fal.ai] Starting Sora 2 image-to-video (${sora2Duration}s)...`);
          soraResult = await fal.subscribe('fal-ai/sora-2/image-to-video', {
            input,
            logs: true,
            onQueueUpdate: (update) => {
              if (update.status === 'IN_PROGRESS') {
                console.log(`[fal.ai] Sora 2 (image-to-video) processing...`);
              }
            },
          }) as Sora2Result;
        } else {
          const input: Sora2TextToVideoInput = {
            prompt,
            resolution: '720p',
            aspect_ratio: aspectRatio,
            duration: sora2Duration,
            delete_video: false,
          };

          console.log(`[fal.ai] Starting Sora 2 text-to-video (${sora2Duration}s)...`);
          soraResult = await fal.subscribe(model, {
            input,
            logs: true,
            onQueueUpdate: (update) => {
              if (update.status === 'IN_PROGRESS') {
                console.log(`[fal.ai] Sora 2 (text-to-video) processing...`);
              }
            },
          }) as Sora2Result;
        }

        console.log(`[fal.ai] Sora 2 response:`, soraResult);

        // fal.ai client wraps response in 'data' property
        const videoUrl = soraResult?.data?.video?.url || soraResult?.video?.url;

        if (!videoUrl) {
          console.error('[fal.ai] Invalid Sora 2 response:', JSON.stringify(soraResult, null, 2));
          throw new Error('Falha ao gerar vídeo Sora 2 - resposta inválida');
        }

        console.log(`[fal.ai] Video URL from fal.ai: ${videoUrl}`);

        // Download video as blob to avoid COEP/CORS issues
        console.log(`[fal.ai] Downloading video as blob...`);
        const videoResponse = await fetch(videoUrl);
        const videoBlob = await videoResponse.blob();
        const blobUrl = URL.createObjectURL(videoBlob);

        console.log(`[fal.ai] Video blob URL created: ${blobUrl}`);
        return blobUrl;
      }

      default:
        throw new Error(`Modelo não suportado: ${model}`);
    }

    if (!result?.video?.url) {
      throw new Error('Falha ao gerar vídeo - resposta inválida');
    }

    console.log(`[fal.ai] Video generated: ${result.video.url}`);
    return result.video.url;

  } catch (error) {
    console.error('[fal.ai] Error generating video:', error);
    throw error;
  }
};

/**
 * Get display name for fal.ai model
 */
export const getFalModelDisplayName = (model: FalVideoModel): string => {
  const names: Record<FalVideoModel, string> = {
    'fal-ai/sora-2/text-to-video': 'Sora 2 (OpenAI)',
    
  };
  return names[model] || model;
};
