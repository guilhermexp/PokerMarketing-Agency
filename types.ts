
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

export interface WeekScheduleInfo {
  startDate: string;
  endDate: string;
  filename: string;
}

export type ImageModel = 'gemini-3-pro-image-preview' | 'imagen-4.0-generate-001';
export type ImageSize = '1K' | '2K' | '4K';

// Video Models
export type VeoVideoModel = 'veo-3.1-fast-generate-preview';
export type FalVideoModel =
  | 'fal-ai/sora-2/text-to-video'         // OpenAI Sora 2 - state of the art

export type VideoModel = VeoVideoModel | FalVideoModel;

// Helper to check if model is from fal.ai
export const isFalModel = (model: VideoModel): model is FalVideoModel =>
  model.startsWith('fal-ai/');


export interface GalleryImage {
  id: string;
  src: string;
  prompt: string;
  source: 'Post' | 'Anúncio' | 'Clipe' | 'Flyer' | 'Flyer Diário' | 'Logo' | 'Edição';
  model: ImageModel;
  aspectRatio?: string;
  imageSize?: ImageSize;
}

export interface StyleReference {
  id: string;
  src: string;
  name: string;
  createdAt: number;
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

export interface GroundingChunk {
    web?: {
        uri: string;
        title: string;
    };
}

export interface ChatMessage {
    role: 'user' | 'model';
    parts: ChatPart[];
    groundingMetadata?: {
        groundingChunks: GroundingChunk[];
    };
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

// Calendar & Scheduling Types
export type SchedulingPlatform = 'instagram' | 'facebook' | 'both';
export type PublicationStatus = 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
export type CalendarViewType = 'monthly' | 'weekly';

export interface ScheduledPost {
  id: string;
  type: 'flyer' | 'campaign_post' | 'ad_creative';
  contentId: string;
  imageUrl: string;
  caption: string;
  hashtags: string[];
  scheduledDate: string;     // YYYY-MM-DD
  scheduledTime: string;     // HH:mm
  scheduledTimestamp: number;
  timezone: string;
  platforms: SchedulingPlatform;
  status: PublicationStatus;
  publishedAt?: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  createdFrom: 'gallery' | 'campaign' | 'flyer_generator';
}

export interface CalendarDay {
  date: string;
  dayOfWeek: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  scheduledPosts: ScheduledPost[];
}

export { IconName };
