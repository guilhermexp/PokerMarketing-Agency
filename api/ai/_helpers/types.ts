/**
 * Type definitions for AI helpers
 * Subset of main types needed for server-side AI operations
 */

export type ToneTarget = 'campaigns' | 'posts' | 'images' | 'flyers';

export interface BrandProfile {
  id?: string;
  name: string;
  description: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  toneOfVoice: string;
  toneTargets?: ToneTarget[];
  creativeModel?: string;
  user_id?: string;
  organization_id?: string | null;
}

export interface ImageFile {
  base64: string;
  mimeType: string;
}

export type ImageModel = 'imagen-4.0-generate-001' | 'gemini-3-pro-image-preview';

export type ImageSize = '1K' | '2K' | '4K';

export type VideoModel = 'veo-3.0-generate-preview';

export type FalVideoModel = 'fal-ai/sora-2/text-to-video' | 'fal-ai/veo3.1/fast';

export type CreativeModel =
  | 'gemini-3-pro-preview'
  | 'openai/gpt-5.2'
  | 'x-ai/grok-4.1'
  | 'anthropic/claude-opus-4'
  | 'anthropic/claude-sonnet-4';

export interface GenerationOptions {
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

export interface Post {
  platform: string;
  content: string;
  hashtags: string[];
  image_prompt: string;
  image_url?: string;
}

export interface Scene {
  scene: number;
  visual: string;
  narration: string;
  duration_seconds: number;
}

export interface VideoClipScript {
  title: string;
  hook: string;
  scenes: Scene[];
  image_prompt: string;
  audio_script: string;
}

export interface AdCreative {
  platform: string;
  headline: string;
  body: string;
  cta: string;
  image_prompt: string;
  image_url?: string;
}

export interface MarketingCampaign {
  videoClipScripts: VideoClipScript[];
  posts: Post[];
  adCreatives: AdCreative[];
}
