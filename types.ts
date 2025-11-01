import type { IconName } from './components/common/Icon';

export type ToneOfVoice = 'Profissional' | 'Espirituoso' | 'Casual' | 'Inspirador' | 'Técnico';

export interface BrandProfile {
  name: string;
  description: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  toneOfVoice: ToneOfVoice;
}

export interface ContentInput {
  transcript: string;
  productImages: { base64: string; mimeType: string }[] | null;
  inspirationImages: { base64: string; mimeType: string }[] | null;
}

export interface VideoClipScript {
  title: string;
  hook: string;
  scenes: {
    scene: number;
    visual: string;
    narration: string;
    duration_seconds: number;
  }[];
  image_prompt: string;
  audio_script: string;
}

export interface Post {
  platform: 'Instagram' | 'LinkedIn' | 'Twitter' | 'Facebook';
  content: string;
  hashtags: string[];
  image_prompt: string;
}

export interface AdCreative {
  platform: 'Facebook' | 'Google';
  headline: string;
  body: string;
  cta: string;
  image_prompt: string;
}

export interface MarketingCampaign {
  videoClipScripts: VideoClipScript[];
  posts: Post[];
  adCreatives: AdCreative[];
}

export interface ImageFile {
  base64: string;
  mimeType: string;
}

export type Theme = 'light' | 'dark';

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
}

export type ImageModel = 'gemini-2.5-flash-image' | 'imagen-4.0-generate-001';
export type VideoModel = 'veo-3.1-fast-generate-preview';


export interface GalleryImage {
  id: string;
  src: string;
  prompt: string;
  source: 'Post' | 'Anúncio' | 'Clipe' | 'Flyer' | 'Flyer Diário' | 'Logo' | 'Edição';
  model: ImageModel;
}

export interface ChatReferenceImage {
  id: string;
  src: string;
}

export interface ChatPart {
    text?: string;
    inlineData?: {
        data: string;
        mimeType: string;
    };
    functionCall?: any;
    functionResponse?: any;
}

export interface ChatMessage {
    role: 'user' | 'model' | 'tool';
    parts: ChatPart[];
}

export interface GenerationSetting {
    generate: boolean;
    count: number;
}

export interface GenerationOptions {
    videoClipScripts: GenerationSetting;
    posts: Record<'linkedin' | 'twitter' | 'instagram' | 'facebook', GenerationSetting>;
    adCreatives: Record<'facebook' | 'google', GenerationSetting>;
}

export { IconName };