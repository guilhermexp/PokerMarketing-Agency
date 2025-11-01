import type { IconName as CommonIconName } from './components/common/Icon';

export type ToneOfVoice = 'Profissional' | 'Espirituoso' | 'Casual' | 'Inspirador' | 'Técnico';
export type IconName = CommonIconName;
export type Theme = 'light' | 'dark';
export type ImageModel = 'gemini-imagen' | 'bytedance-seedream' | 'gemini-flash-image-preview';

export interface BrandProfile {
  name: string;
  description: string;
  logo: string | null; // Base64 string
  primaryColor: string;
  secondaryColor: string;
  toneOfVoice: ToneOfVoice;
}

export interface ContentInput {
  transcript: string;
  productImages: {
    base64: string;
    mimeType: string;
  }[] | null;
  inspirationImages: {
    base64: string;
    mimeType: string;
  }[] | null;
}

export interface VideoClipScript {
  title: string;
  duration: number; // in seconds
  script: string; // Detailed script with scenes and voiceover
  thumbnail: {
    title: string;
    image_prompt: string;
  } | null;
}

export interface Post {
  platform: string;
  content: string;
  hashtags: string[];
  image_prompt: string | null; // Prompt for generating an accompanying image
}

export interface AdCreative {
  platform: string;
  headline: string;
  body: string;
  cta: string;
  image_prompt: string; // Prompt for generating the ad visual
}

export interface MarketingCampaign {
  videoClipScripts: VideoClipScript[];
  posts: Post[];
  adCreatives: AdCreative[];
}

export type GenerationMode = 'full' | 'clips' | 'posts' | 'ads';

export interface GenerationSetting {
    generate: boolean;
    count: number;
}

export interface GenerationOptions {
  videoClipScripts: GenerationSetting;
  posts: {
    linkedin: GenerationSetting;
    twitter: GenerationSetting;
    instagram: GenerationSetting;
    facebook: GenerationSetting;
  };
  adCreatives: {
    facebook: GenerationSetting;
    google: GenerationSetting;
  };
}


// --- Assistant Types ---

export type ChatRole = "user" | "model" | "tool";

export interface ChatMessage {
    role: ChatRole;
    parts: ChatPart[];
}

export interface ChatPart {
    text?: string;
    functionCall?: any;
    functionResponse?: any;
    inlineData?: {
      data: string;
      mimeType: string;
    }
}

export interface ChatReferenceImage {
  id: string; // The ID from the gallery
  src: string; // The data URL for display and sending
}


// --- Flyer Generator Types ---

export interface TournamentEvent {
  id: string;
  day: string;
  name: string;
  game: string;
  gtd: string;
  buyIn: string;
  rebuy: string;
  addOn: string;
  stack: string;
  players: string;
  lateReg: string;
  minutes: string;
  structure: string;
  times: Record<string, string>;
  [key: string]: any; // Allow other properties
}

export interface ImageFile {
    base64: string;
    mimeType: string;
    preview: string;
}

// --- Gallery Types ---
export interface GalleryImage {
  id: string;
  src: string;
  prompt: string;
  source: 'Thumbnail' | 'Post' | 'Anúncio' | 'Flyer' | 'Flyer Diário' | 'Logo';
  model?: ImageModel;
}