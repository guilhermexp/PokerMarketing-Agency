/**
 * Campaigns API - Marketing campaign operations
 *
 * Handles Campaigns, Video Clip Scripts, Posts, Ad Creatives,
 * and Carousel Scripts.
 */

import { fetchApi } from './client';

// =============================================================================
// Types
// =============================================================================

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
  slides: Array<{
    slide: number;
    visual: string;
    text: string;
    image_url?: string;
  }>;
  sort_order: number;
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
  // Creator info (from list query with JOIN)
  creator_name?: string | null;
  // Counts and previews from list query
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

// =============================================================================
// Campaigns CRUD
// =============================================================================

export async function getCampaigns(
  userId: string,
  organizationId?: string | null,
): Promise<DbCampaign[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<DbCampaign[]>(`/campaigns?${params}`);
}

export async function getCampaignById(
  id: string,
  userId: string,
  organizationId?: string | null,
): Promise<DbCampaignFull | null> {
  const params = new URLSearchParams({
    id,
    user_id: userId,
    include_content: 'true',
  });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<DbCampaignFull | null>(`/campaigns?${params}`);
}

export async function createCampaign(
  userId: string,
  data: {
    name?: string;
    description?: string;
    brand_profile_id?: string;
    input_transcript?: string;
    generation_options?: Record<string, unknown>;
    status?: string;
    organization_id?: string | null;
    video_clip_scripts?: Array<{
      title: string;
      hook: string;
      image_prompt?: string;
      audio_script?: string;
      scenes: Array<{
        scene: number;
        visual: string;
        narration: string;
        duration_seconds: number;
      }>;
    }>;
    posts?: Array<{
      platform: string;
      content: string;
      hashtags: string[];
      image_prompt?: string;
    }>;
    ad_creatives?: Array<{
      platform: string;
      headline: string;
      body: string;
      cta: string;
      image_prompt?: string;
    }>;
    carousel_scripts?: Array<{
      title: string;
      hook: string;
      cover_prompt?: string;
      caption?: string;
      slides: Array<{
        slide: number;
        visual: string;
        text: string;
      }>;
    }>;
  },
): Promise<DbCampaignFull> {
  return fetchApi<DbCampaignFull>('/campaigns', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateCampaign(
  id: string,
  data: Partial<DbCampaign>,
): Promise<DbCampaign> {
  return fetchApi<DbCampaign>(`/campaigns?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCampaign(id: string): Promise<void> {
  await fetchApi(`/campaigns?id=${id}`, { method: 'DELETE' });
}

// =============================================================================
// Posts & Ad Creatives Updates
// =============================================================================

export async function updatePostImage(
  postId: string,
  imageUrl: string,
): Promise<DbPost> {
  return fetchApi<DbPost>(`/posts?id=${postId}`, {
    method: 'PATCH',
    body: JSON.stringify({ image_url: imageUrl }),
  });
}

export async function updateAdCreativeImage(
  adId: string,
  imageUrl: string,
): Promise<DbAdCreative> {
  return fetchApi<DbAdCreative>(`/ad-creatives?id=${adId}`, {
    method: 'PATCH',
    body: JSON.stringify({ image_url: imageUrl }),
  });
}

export async function updateClipThumbnail(
  clipId: string,
  thumbnailUrl: string,
): Promise<DbVideoClipScript> {
  return fetchApi<DbVideoClipScript>(`/campaigns?clip_id=${clipId}`, {
    method: 'PATCH',
    body: JSON.stringify({ thumbnail_url: thumbnailUrl }),
  });
}

export async function updateSceneImage(
  clipId: string,
  sceneNumber: number,
  imageUrl: string,
): Promise<DbVideoClipScript> {
  return fetchApi<DbVideoClipScript>(
    `/campaigns/scene?clip_id=${clipId}&scene_number=${sceneNumber}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ image_url: imageUrl }),
    },
  );
}

// =============================================================================
// Carousel Scripts Updates
// =============================================================================

export async function updateCarouselCover(
  carouselId: string,
  coverUrl: string,
): Promise<DbCarouselScript> {
  return fetchApi<DbCarouselScript>(`/carousels?id=${carouselId}`, {
    method: 'PATCH',
    body: JSON.stringify({ cover_url: coverUrl }),
  });
}

export async function updateCarouselSlideImage(
  carouselId: string,
  slideNumber: number,
  imageUrl: string,
): Promise<DbCarouselScript> {
  return fetchApi<DbCarouselScript>(
    `/carousels/slide?carousel_id=${carouselId}&slide_number=${slideNumber}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ image_url: imageUrl }),
    },
  );
}

export async function updateCarouselCaption(
  carouselId: string,
  caption: string,
): Promise<DbCarouselScript> {
  return fetchApi<DbCarouselScript>(`/carousels?id=${carouselId}`, {
    method: 'PATCH',
    body: JSON.stringify({ caption }),
  });
}
