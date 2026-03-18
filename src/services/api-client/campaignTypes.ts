export interface DbVideoClipScript {
  id: string;
  campaign_id: string;
  title: string;
  hook: string;
  image_prompt: string | null;
  audio_script: string | null;
  scenes: Array<{
    scene: number;
    visual: string;
    narration: string;
    duration_seconds: number;
  }>;
  thumbnail_url: string | null;
  video_url: string | null;
  audio_url: string | null;
  sort_order: number;
}

export interface DbPost {
  id: string;
  campaign_id: string | null;
  platform: string;
  content: string;
  hashtags: string[];
  image_prompt: string | null;
  image_url: string | null;
  sort_order: number;
}

export interface DbAdCreative {
  id: string;
  campaign_id: string | null;
  platform: string;
  headline: string;
  body: string;
  cta: string;
  image_prompt: string | null;
  image_url: string | null;
  sort_order: number;
}

export interface DbCarouselScript {
  id: string;
  campaign_id: string;
  title: string;
  hook: string;
  cover_prompt: string | null;
  cover_url: string | null;
  caption: string | null;
  slides: Array<{ slide: number; visual: string; text: string; image_url?: string }>;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface DbCarouselListItem {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  title: string;
  hook: string;
  cover_prompt: string | null;
  cover_url: string | null;
  caption: string | null;
  gallery_images: string[];
  slides: Array<{ slide: number; visual: string; text: string; image_url?: string }>;
  slides_count: number;
  created_at: string;
  updated_at: string;
}

export interface DbCampaign {
  id: string;
  user_id: string;
  name: string | null;
  description: string | null;
  input_transcript: string | null;
  generation_options: Record<string, unknown> | null;
  status: string;
  created_at: string;
  updated_at: string;
  creator_name?: string | null;
  clips_count?: number;
  posts_count?: number;
  ads_count?: number;
  carousels_count?: number;
  clip_preview_url?: string | null;
  post_preview_url?: string | null;
  ad_preview_url?: string | null;
  carousel_preview_url?: string | null;
  posts_breakdown?: Record<string, number>;
  ads_breakdown?: Record<string, number>;
}

export interface DbCampaignFull extends DbCampaign {
  video_clip_scripts: DbVideoClipScript[];
  posts: DbPost[];
  ad_creatives: DbAdCreative[];
  carousel_scripts: DbCarouselScript[];
}
