export interface AiBrandProfile {
  name: string;
  description: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  toneOfVoice: string;
  toneTargets?: Array<"campaigns" | "posts" | "images" | "flyers">;
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
    scenes: Array<{ scene: number; visual: string; narration: string; duration_seconds: number }>;
    image_prompt: string;
    audio_script: string;
  }>;
  posts: Array<{ platform: string; content: string; hashtags: string[]; image_prompt: string }>;
  adCreatives: Array<{ platform: string; headline: string; body: string; cta: string; image_prompt: string }>;
}

export interface AiGenerationOptions {
  videoClipScripts: { generate: boolean; count: number };
  carousels: { generate: boolean; count: number };
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

export type ApiVideoModel = "sora-2" | "veo-3.1";

export interface VideoGenerationResult {
  success: boolean;
  url: string;
  model: ApiVideoModel;
}
