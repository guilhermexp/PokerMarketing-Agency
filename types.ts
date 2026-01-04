
import type { IconName } from './components/common/Icon';

export type ToneOfVoice = 'Profissional' | 'Espirituoso' | 'Casual' | 'Inspirador' | 'Técnico';

export type ToneTarget = 'campaigns' | 'posts' | 'images' | 'flyers' | 'videos';

// Modelos criativos para geração de texto (campanhas, posts, prompts)
export type CreativeModel = 'gemini-3-pro-preview' | 'gemini-3-flash-preview' | 'openai/gpt-5.2' | 'x-ai/grok-4.1-fast';

export interface BrandProfile {
  name: string;
  description: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  toneOfVoice: ToneOfVoice;
  toneTargets?: ToneTarget[]; // Onde aplicar o tom (default: todos exceto videos)
  creativeModel?: CreativeModel; // Modelo para geração criativa (default: gemini-3-pro)
}

export interface ContentInput {
  transcript: string;
  productImages: { base64: string; mimeType: string }[] | null;
  inspirationImages: { base64: string; mimeType: string }[] | null;
}

export interface VideoClipScript {
  id?: string;  // Database ID (for linking gallery images)
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
  thumbnail_url?: string | null;  // Generated thumbnail URL (from database)
}

export interface Post {
  id?: string;  // Database ID (for updating image_url)
  platform: 'Instagram' | 'LinkedIn' | 'Twitter' | 'Facebook';
  content: string;
  hashtags: string[];
  image_prompt: string;
  image_url?: string | null;  // Generated image URL (from database)
}

export interface AdCreative {
  id?: string;  // Database ID (for updating image_url)
  platform: 'Facebook' | 'Google';
  headline: string;
  body: string;
  cta: string;
  image_prompt: string;
  image_url?: string | null;  // Generated image URL (from database)
}

export interface MarketingCampaign {
  id?: string;                    // Database ID (optional for new campaigns)
  name?: string;                  // Campaign name
  inputTranscript?: string;       // Original transcript used to generate
  videoClipScripts: VideoClipScript[];
  posts: Post[];
  adCreatives: AdCreative[];
  createdAt?: string;             // ISO timestamp
  updatedAt?: string;             // ISO timestamp
}

// Summary for campaigns list
export interface CampaignSummary {
  id: string;
  name: string | null;
  status: string;
  createdAt: string;
  videoCount?: number;
  postCount?: number;
  adCount?: number;
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
  | 'fal-ai/veo3.1/fast'                  // Google Veo 3.1 via fal.ai (fallback)

export type VideoModel = VeoVideoModel | FalVideoModel;

// Helper to check if model is from fal.ai
export const isFalModel = (model: VideoModel): model is FalVideoModel =>
  model.startsWith('fal-ai/');


// Gallery can contain images, videos and audio
export type GalleryMediaType = 'image' | 'video' | 'audio';

export interface GalleryImage {
  id: string;
  src: string;
  prompt?: string;
  source: string;
  model: ImageModel | 'video-export' | 'tts-generation';  // Extended for videos and audio
  aspectRatio?: string;
  imageSize?: ImageSize;
  mediaType?: GalleryMediaType;  // 'image' by default
  duration?: number;  // For videos and audio, duration in seconds
  // Database linking for campaign previews
  post_id?: string;
  ad_creative_id?: string;
  video_script_id?: string;
  // Publishing status
  published_at?: string;  // ISO timestamp when published to Instagram
  // Timestamps
  created_at?: string;  // ISO timestamp when created
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
export type InstagramContentType = 'photo' | 'video' | 'reel' | 'story' | 'carousel';

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
  // Instagram publishing metadata
  instagramContentType?: InstagramContentType; // photo, video, reel, story, carousel
  instagramMediaId?: string;
  instagramContainerId?: string;
  instagramAccountId?: string; // Multi-tenant: which account to publish to
  publishAttempts?: number;
  lastPublishAttempt?: number;
}

// Instagram Publishing Types (Rube MCP)
export type InstagramPublishStep =
  | 'idle'
  | 'uploading_image'
  | 'creating_container'
  | 'checking_status'
  | 'publishing'
  | 'completed'
  | 'failed';

export interface InstagramPublishState {
  step: InstagramPublishStep;
  message: string;
  progress: number;
  postId?: string;
}

// Instagram Account (Multi-tenant Rube MCP)
export interface InstagramAccount {
  id: string;
  user_id: string;
  organization_id: string | null;
  instagram_user_id: string;
  instagram_username: string;
  is_active: boolean;
  connected_at: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

// Context for multi-tenant Instagram operations
export interface InstagramContext {
  instagramAccountId: string;
  userId: string;
}

export interface ScheduleNotification {
  postId: string;
  scheduledTime: number;
  shown: boolean;
}

export interface CalendarDay {
  date: string;
  dayOfWeek: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  scheduledPosts: ScheduledPost[];
}

export { IconName };
