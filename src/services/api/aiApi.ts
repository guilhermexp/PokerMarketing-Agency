/**
 * AI API - AI generation operations
 *
 * Handles AI-powered generation for images, flyers, text, speech,
 * campaigns, and video using server-side endpoints.
 */

import { fetchAiApi } from './client';

// =============================================================================
// Types
// =============================================================================

export interface AiBrandProfile {
  name: string;
  description: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  toneOfVoice: string;
  toneTargets?: Array<'campaigns' | 'posts' | 'images' | 'flyers'>;
  creativeModel?: string;
}

export interface AiImageFile {
  base64: string;
  mimeType: string;
}

export interface AiGenerationResult<T> {
  success: boolean;
  result?: T;
  imageUrl?: string;
  audioBase64?: string;
  campaign?: AiCampaign;
  model?: string;
}

export interface AiCampaign {
  videoClipScripts: Array<{
    title: string;
    hook: string;
    scenes: Array<{
      scene: number;
      visual: string;
      narration: string;
      duration_seconds: number;
    }>;
    image_prompt: string;
    audio_script: string;
  }>;
  posts: Array<{
    platform: string;
    content: string;
    hashtags: string[];
    image_prompt: string;
  }>;
  adCreatives: Array<{
    platform: string;
    headline: string;
    body: string;
    cta: string;
    image_prompt: string;
  }>;
}

export interface AiGenerationOptions {
  videoClipScripts: { generate: boolean; count: number };
  posts: {
    instagram: { generate: boolean; count: number };
    facebook: { generate: boolean; count: number };
    twitter: { generate: boolean; count: number };
    linkedin: { generate: boolean; count: number };
  };
  adCreatives: {
    facebook: { generate: boolean; count: number };
    google: { generate: boolean; count: number };
  };
}

export type ApiVideoModel = 'sora-2' | 'veo-3.1';

export interface VideoGenerationResult {
  success: boolean;
  url: string;
  model: ApiVideoModel;
}

// =============================================================================
// Image Generation
// =============================================================================

/**
 * Generate an image using AI (Gemini or Imagen)
 */
export async function generateAiImage(
  params: {
    prompt: string;
    brandProfile: AiBrandProfile;
    aspectRatio?: string;
    model?: 'gemini-3-pro-image-preview';
    imageSize?: '1K' | '2K' | '4K';
    productImages?: AiImageFile[];
    styleReferenceImage?: AiImageFile;
  },
  getToken?: () => Promise<string | null>,
): Promise<string> {
  const result = await fetchAiApi<AiGenerationResult<never>>(
    '/image',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    getToken,
  );
  return result.imageUrl!;
}

/**
 * Generate a flyer using AI
 */
export async function generateAiFlyer(
  params: {
    prompt: string;
    brandProfile: AiBrandProfile;
    logo?: AiImageFile | null;
    referenceImage?: AiImageFile | null;
    aspectRatio?: string;
    collabLogo?: AiImageFile | null;
    imageSize?: '1K' | '2K' | '4K';
    compositionAssets?: AiImageFile[];
  },
  getToken?: () => Promise<string | null>,
): Promise<string> {
  const result = await fetchAiApi<AiGenerationResult<never>>(
    '/flyer',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    getToken,
  );
  return result.imageUrl!;
}

/**
 * Edit an image using AI
 */
export async function editAiImage(
  params: {
    image: AiImageFile;
    prompt: string;
    mask?: AiImageFile;
    referenceImage?: AiImageFile;
  },
  getToken?: () => Promise<string | null>,
): Promise<string> {
  const result = await fetchAiApi<AiGenerationResult<never>>(
    '/edit-image',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    getToken,
  );
  return result.imageUrl!;
}

// =============================================================================
// Speech Generation
// =============================================================================

/**
 * Generate speech audio using AI TTS
 */
export async function generateAiSpeech(
  params: {
    script: string;
    voiceName?: string;
  },
  getToken?: () => Promise<string | null>,
): Promise<string> {
  const result = await fetchAiApi<AiGenerationResult<never>>(
    '/speech',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    getToken,
  );
  return result.audioBase64!;
}

// =============================================================================
// Text Generation
// =============================================================================

/**
 * Generate creative text using AI (quick post or custom)
 */
export async function generateAiText<T = Record<string, unknown>>(
  params: {
    type: 'quickPost' | 'custom';
    brandProfile: AiBrandProfile;
    context?: string;
    systemPrompt?: string;
    userPrompt?: string;
    image?: AiImageFile;
    temperature?: number;
    responseSchema?: Record<string, unknown>;
  },
  getToken?: () => Promise<string | null>,
): Promise<T> {
  const result = await fetchAiApi<AiGenerationResult<T>>(
    '/text',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    getToken,
  );
  return result.result!;
}

// =============================================================================
// Campaign Generation
// =============================================================================

/**
 * Generate a marketing campaign using AI
 */
export async function generateAiCampaign(
  params: {
    brandProfile: AiBrandProfile;
    transcript: string;
    options: AiGenerationOptions;
    productImages?: AiImageFile[];
  },
  getToken?: () => Promise<string | null>,
): Promise<AiCampaign> {
  const result = await fetchAiApi<AiGenerationResult<never>>(
    '/campaign',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    getToken,
  );
  return result.campaign!;
}

// =============================================================================
// Video Generation
// =============================================================================

/**
 * Generate video using FAL.ai models (server-side)
 * This avoids exposing FAL_KEY in the browser
 */
export async function generateVideo(params: {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  model: ApiVideoModel;
  imageUrl?: string;
  lastFrameUrl?: string;
  sceneDuration?: number;
  generateAudio?: boolean;
  useInterpolation?: boolean;
}): Promise<string> {
  const result = await fetchAiApi<VideoGenerationResult>('/video', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return result.url;
}
