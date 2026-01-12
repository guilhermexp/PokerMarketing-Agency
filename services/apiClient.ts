/**
 * API Client for Neon Database operations
 * Provides typed methods for all database entities
 */

const API_BASE = "/api/db";

// ============================================================================
// OPTIMIZED: Unified Initial Data Load
// Loads ALL user data in a SINGLE request instead of 6 separate requests
// ============================================================================

export interface InitialData {
  brandProfile: DbBrandProfile | null;
  gallery: DbGalleryImage[];
  scheduledPosts: DbScheduledPost[];
  campaigns: DbCampaign[];
  tournamentSchedule: DbWeekSchedule | null;
  tournamentEvents: DbTournamentEvent[];
  schedulesList: WeekScheduleWithCount[];
  _meta?: {
    loadTime: number;
    queriesExecuted: number;
    timestamp: string;
  };
}

/**
 * Load ALL initial data in a single request
 * This replaces 6 separate API calls with 1, dramatically reducing network overhead
 */
export async function getInitialData(
  userId: string,
  organizationId?: string | null,
): Promise<InitialData> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);

  console.log("[API] Loading all initial data in single request...");
  const start = Date.now();

  const result = await fetchApi<InitialData>(`/init?${params}`);

  console.log(
    `[API] ✅ Initial data loaded in ${Date.now() - start}ms (server: ${result._meta?.loadTime}ms)`,
  );

  return result;
}

/**
 * Convert a video URL to a display-safe URL
 * With COEP: credentialless, we can use the original URL directly
 */
export function getVideoDisplayUrl(url: string): string {
  // With COEP: credentialless, we don't need to proxy anymore
  return url;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const canRetry = method === "GET";
  const maxAttempts = canRetry ? 2 : 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
      if (!canRetry || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw lastError;
}

// ============================================================================
// User API
// ============================================================================

export interface DbUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
}

export async function getOrCreateUser(data: {
  email: string;
  name: string;
  avatar_url?: string;
  auth_provider?: string;
  auth_provider_id?: string;
}): Promise<DbUser> {
  return fetchApi<DbUser>("/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  return fetchApi<DbUser | null>(`/users?email=${encodeURIComponent(email)}`);
}

// ============================================================================
// Brand Profile API
// ============================================================================

export interface DbBrandProfile {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  tertiary_color: string;
  tone_of_voice: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export async function getBrandProfile(
  userId: string,
  organizationId?: string | null,
): Promise<DbBrandProfile | null> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);
  return fetchApi<DbBrandProfile | null>(`/brand-profiles?${params}`);
}

export async function createBrandProfile(
  userId: string,
  data: {
    name: string;
    description?: string;
    logo_url?: string;
    primary_color: string;
    secondary_color: string;
    tertiary_color: string;
    tone_of_voice: string;
    organization_id?: string | null;
  },
): Promise<DbBrandProfile> {
  return fetchApi<DbBrandProfile>("/brand-profiles", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateBrandProfile(
  id: string,
  data: Partial<DbBrandProfile>,
): Promise<DbBrandProfile> {
  return fetchApi<DbBrandProfile>(`/brand-profiles?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ============================================================================
// Gallery Images API
// ============================================================================

export interface DbGalleryImage {
  id: string;
  user_id: string;
  src_url: string;
  prompt: string | null;
  source: string;
  model: string;
  aspect_ratio: string | null;
  image_size: string | null;
  created_at: string;
  published_at?: string | null;
  media_type?: string | null;
  duration?: number | null;
  post_id?: string | null;
  ad_creative_id?: string | null;
  video_script_id?: string | null;
}

export async function getGalleryImages(
  userId: string,
  organizationId?: string | null,
  options?: {
    source?: string;
    limit?: number;
  },
): Promise<DbGalleryImage[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);
  if (options?.source) params.append("source", options.source);
  if (options?.limit) params.append("limit", options.limit.toString());

  return fetchApi<DbGalleryImage[]>(`/gallery?${params}`);
}

export async function createGalleryImage(
  userId: string,
  data: {
    src_url: string;
    prompt?: string;
    source: string;
    model: string;
    aspect_ratio?: string;
    image_size?: string;
    post_id?: string;
    ad_creative_id?: string;
    video_script_id?: string;
    organization_id?: string | null;
    media_type?: string;
    duration?: number;
  },
): Promise<DbGalleryImage> {
  return fetchApi<DbGalleryImage>("/gallery", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function deleteGalleryImage(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/gallery?id=${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to delete image: HTTP ${response.status}`);
  }
}

export async function updateGalleryImage(
  id: string,
  data: { src_url?: string; published_at?: string },
): Promise<DbGalleryImage | null> {
  // Skip if it's a temporary ID (not yet saved to database)
  if (id.startsWith("temp-")) {
    console.log("[API] Skipping updateGalleryImage for temp ID:", id);
    return null;
  }

  return fetchApi<DbGalleryImage>(`/gallery?id=${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function markGalleryImagePublished(
  id: string,
): Promise<DbGalleryImage | null> {
  return updateGalleryImage(id, { published_at: new Date().toISOString() });
}

// ============================================================================
// Scheduled Posts API
// ============================================================================

export interface DbScheduledPost {
  id: string;
  user_id: string;
  content_type: string;
  content_id: string | null;
  image_url: string;
  carousel_image_urls?: string[] | null;  // Array of URLs for carousel posts
  caption: string;
  hashtags: string[];
  scheduled_date: string;
  scheduled_time: string;
  scheduled_timestamp: string;
  timezone: string;
  platforms: string;
  instagram_content_type: string | null;
  status: string;
  published_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at?: string;
  created_from?: string;
  instagram_media_id?: string;
  instagram_container_id?: string;
  publish_attempts?: number;
  last_publish_attempt?: string;
}

export async function getScheduledPosts(
  userId: string,
  organizationId?: string | null,
  options?: {
    status?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<DbScheduledPost[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);
  if (options?.status) params.append("status", options.status);
  if (options?.startDate) params.append("start_date", options.startDate);
  if (options?.endDate) params.append("end_date", options.endDate);

  return fetchApi<DbScheduledPost[]>(`/scheduled-posts?${params}`);
}

export async function createScheduledPost(
  userId: string,
  data: {
    content_type: string;
    content_id?: string;
    image_url: string;
    carousel_image_urls?: string[];
    caption: string;
    hashtags: string[];
    scheduled_date: string;
    scheduled_time: string;
    scheduled_timestamp: string;
    timezone: string;
    platforms: string;
    instagram_content_type?: string;
    instagram_account_id?: string;
    created_from?: string;
    organization_id?: string | null;
  },
): Promise<DbScheduledPost> {
  return fetchApi<DbScheduledPost>("/scheduled-posts", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateScheduledPost(
  id: string,
  data: Partial<DbScheduledPost>,
): Promise<DbScheduledPost> {
  return fetchApi<DbScheduledPost>(`/scheduled-posts?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteScheduledPost(id: string): Promise<void> {
  await fetchApi(`/scheduled-posts?id=${id}`, { method: "DELETE" });
}

// ============================================================================
// Campaigns API
// ============================================================================

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
  posts_breakdown?: Record<string, number>;
  ads_breakdown?: Record<string, number>;
}

export interface DbCampaignFull extends DbCampaign {
  video_clip_scripts: DbVideoClipScript[];
  posts: DbPost[];
  ad_creatives: DbAdCreative[];
  carousel_scripts: DbCarouselScript[];
}

export async function getCampaigns(
  userId: string,
  organizationId?: string | null,
): Promise<DbCampaign[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);
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
    include_content: "true",
  });
  if (organizationId) params.append("organization_id", organizationId);
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
  return fetchApi<DbCampaignFull>("/campaigns", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateCampaign(
  id: string,
  data: Partial<DbCampaign>,
): Promise<DbCampaign> {
  return fetchApi<DbCampaign>(`/campaigns?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteCampaign(id: string): Promise<void> {
  await fetchApi(`/campaigns?id=${id}`, { method: "DELETE" });
}

// ============================================================================
// Posts & Ad Creatives Updates
// ============================================================================

export async function updatePostImage(
  postId: string,
  imageUrl: string,
): Promise<DbPost> {
  return fetchApi<DbPost>(`/posts?id=${postId}`, {
    method: "PATCH",
    body: JSON.stringify({ image_url: imageUrl }),
  });
}

export async function updateAdCreativeImage(
  adId: string,
  imageUrl: string,
): Promise<DbAdCreative> {
  return fetchApi<DbAdCreative>(`/ad-creatives?id=${adId}`, {
    method: "PATCH",
    body: JSON.stringify({ image_url: imageUrl }),
  });
}

export async function updateClipThumbnail(
  clipId: string,
  thumbnailUrl: string,
): Promise<DbVideoClipScript> {
  return fetchApi<DbVideoClipScript>(`/campaigns?clip_id=${clipId}`, {
    method: "PATCH",
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
      method: "PATCH",
      body: JSON.stringify({ image_url: imageUrl }),
    },
  );
}

// ============================================================================
// Carousel Scripts Updates
// ============================================================================

export async function updateCarouselCover(
  carouselId: string,
  coverUrl: string,
): Promise<DbCarouselScript> {
  return fetchApi<DbCarouselScript>(`/carousels?id=${carouselId}`, {
    method: "PATCH",
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
      method: "PATCH",
      body: JSON.stringify({ image_url: imageUrl }),
    },
  );
}

export async function updateCarouselCaption(
  carouselId: string,
  caption: string,
): Promise<DbCarouselScript> {
  return fetchApi<DbCarouselScript>(`/carousels?id=${carouselId}`, {
    method: "PATCH",
    body: JSON.stringify({ caption }),
  });
}

// ============================================================================
// Tournament Flyer API
// ============================================================================

export async function addEventFlyer(
  eventId: string,
  flyerUrl: string,
): Promise<any> {
  return fetchApi(`/tournaments/event-flyer?event_id=${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({ flyer_url: flyerUrl, action: "add" }),
  });
}

export async function removeEventFlyer(
  eventId: string,
  flyerUrl: string,
): Promise<any> {
  return fetchApi(`/tournaments/event-flyer?event_id=${eventId}`, {
    method: "PATCH",
    body: JSON.stringify({ flyer_url: flyerUrl, action: "remove" }),
  });
}

export async function addDailyFlyer(
  scheduleId: string,
  period: string,
  flyerUrl: string,
): Promise<any> {
  return fetchApi(
    `/tournaments/daily-flyer?schedule_id=${scheduleId}&period=${period}`,
    {
      method: "PATCH",
      body: JSON.stringify({ flyer_url: flyerUrl, action: "add" }),
    },
  );
}

export async function removeDailyFlyer(
  scheduleId: string,
  period: string,
  flyerUrl: string,
): Promise<any> {
  return fetchApi(
    `/tournaments/daily-flyer?schedule_id=${scheduleId}&period=${period}`,
    {
      method: "PATCH",
      body: JSON.stringify({ flyer_url: flyerUrl, action: "remove" }),
    },
  );
}

// ============================================================================
// Health Check
// ============================================================================

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    return data.status === "healthy";
  } catch {
    return false;
  }
}

// ============================================================================
// File Upload API (Vercel Blob)
// ============================================================================

export interface UploadResult {
  success: boolean;
  url: string;
  filename: string;
  size: number;
}

/**
 * Upload a blob to Vercel Blob storage
 * @param blob - The blob to upload
 * @param filename - The filename to use
 * @param contentType - The MIME type of the file
 */
export async function uploadToBlob(
  blob: Blob,
  filename: string,
  contentType: string,
): Promise<UploadResult> {
  // Validate blob before uploading
  if (!blob || blob.size === 0) {
    throw new Error("Cannot upload empty blob");
  }

  // Convert blob to base64
  const arrayBuffer = await blob.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error("Blob contains no data");
  }

  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      "",
    ),
  );

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename,
      contentType,
      data: base64,
    }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Upload a video blob to Vercel Blob storage
 */
export async function uploadVideo(
  blob: Blob,
  filename?: string,
): Promise<string> {
  const name = filename || `video-${Date.now()}.mp4`;
  const result = await uploadToBlob(blob, name, "video/mp4");
  return result.url;
}

/**
 * Upload an audio blob to Vercel Blob storage
 */
export async function uploadAudio(
  blob: Blob,
  filename?: string,
): Promise<string> {
  const name = filename || `audio-${Date.now()}.wav`;
  const contentType = blob.type || "audio/wav";
  const result = await uploadToBlob(blob, name, contentType);
  return result.url;
}

// ============================================================================
// Tournament Events API
// ============================================================================

export interface DbWeekSchedule {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  filename: string | null;
  original_filename: string | null;
  daily_flyer_urls?: Record<string, string[]>;
  created_at: string;
  updated_at: string;
}

export interface DbTournamentEvent {
  id: string;
  user_id: string;
  week_schedule_id: string | null;
  day_of_week: string;
  name: string;
  game: string | null;
  gtd: string | null;
  buy_in: string | null;
  rebuy: string | null;
  add_on: string | null;
  stack: string | null;
  players: string | null;
  late_reg: string | null;
  minutes: string | null;
  structure: string | null;
  times: Record<string, string>;
  event_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TournamentData {
  schedule: DbWeekSchedule | null;
  events: DbTournamentEvent[];
}

/**
 * Get current week schedule and events
 */
export async function getTournamentData(
  userId: string,
  organizationId?: string | null,
): Promise<TournamentData> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);
  return fetchApi<TournamentData>(`/tournaments?${params}`);
}

/**
 * Get all week schedules for a user
 */
export interface WeekScheduleWithCount extends DbWeekSchedule {
  event_count: number;
}

export async function getWeekSchedulesList(
  userId: string,
  organizationId?: string | null,
): Promise<{ schedules: WeekScheduleWithCount[] }> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);
  return fetchApi<{ schedules: WeekScheduleWithCount[] }>(
    `/tournaments/list?${params}`,
  );
}

/**
 * Load events for a specific schedule
 */
export async function getScheduleEvents(
  userId: string,
  scheduleId: string,
  organizationId?: string | null,
): Promise<{ events: DbTournamentEvent[] }> {
  const params = new URLSearchParams({
    user_id: userId,
    week_schedule_id: scheduleId,
  });
  if (organizationId) params.append("organization_id", organizationId);
  return fetchApi<{ events: DbTournamentEvent[] }>(`/tournaments?${params}`);
}

/**
 * Create new week schedule with events
 */
export async function createWeekSchedule(
  userId: string,
  data: {
    start_date: string;
    end_date: string;
    filename?: string;
    organization_id?: string | null;
    events: Array<{
      day: string;
      name: string;
      game?: string;
      gtd?: string;
      buyIn?: string;
      rebuy?: string;
      addOn?: string;
      stack?: string;
      players?: string;
      lateReg?: string;
      minutes?: string;
      structure?: string;
      times?: Record<string, string>;
      eventDate?: string;
    }>;
  },
): Promise<{ schedule: DbWeekSchedule; eventsCount: number }> {
  return fetchApi<{ schedule: DbWeekSchedule; eventsCount: number }>(
    "/tournaments",
    {
      method: "POST",
      body: JSON.stringify({ user_id: userId, ...data }),
    },
  );
}

/**
 * Delete week schedule and its events
 */
export async function deleteWeekSchedule(
  userId: string,
  scheduleId: string,
  organizationId?: string | null,
): Promise<void> {
  const params = new URLSearchParams({ id: scheduleId, user_id: userId });
  if (organizationId) params.append("organization_id", organizationId);
  await fetchApi(`/tournaments?${params}`, { method: "DELETE" });
}

// ============================================================================
// Background Generation API
// ============================================================================

export interface GenerationJobConfig {
  brandName: string;
  brandDescription?: string;
  brandToneOfVoice: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  aspectRatio: string;
  model: string;
  imageSize?: string;
  logo?: string;
  collabLogo?: string;
  styleReference?: string;
  compositionAssets?: string[];
  source: string;
}

export interface GenerationJob {
  id: string;
  user_id: string;
  job_type: "flyer" | "flyer_daily" | "post" | "ad" | "clip" | "video" | "image";
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  result_url: string | null;
  result_gallery_id: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  attempts: number;
  context?: string; // Used to match job with UI component (e.g., "flyer-period-ALL", "video-scene-0")
}

export interface VideoJobConfig {
  model: "veo-3.1" | "sora-2";
  aspectRatio: string;
  imageUrl?: string;
  lastFrameUrl?: string;
  sceneDuration?: number;
  useInterpolation?: boolean;
}

export interface QueueJobResult {
  success: boolean;
  jobId: string;
  messageId: string;
  status: string;
}

/**
 * Queue a new image generation job for background processing
 * Returns immediately, job runs in background via BullMQ
 */
export async function queueGenerationJob(
  userId: string,
  jobType: "flyer" | "flyer_daily" | "post" | "ad" | "clip" | "video" | "image",
  prompt: string,
  config: GenerationJobConfig | VideoJobConfig | ImageJobConfig,
  context?: string,
  organizationId?: string | null,
): Promise<QueueJobResult> {
  const response = await fetch("/api/generate/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      organizationId,
      jobType,
      prompt,
      config,
      context,
    }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Queue a video generation job for background processing
 * Returns immediately, job runs in background via BullMQ
 */
export async function queueVideoJob(
  userId: string,
  prompt: string,
  config: VideoJobConfig,
  context: string,
  organizationId?: string | null,
): Promise<QueueJobResult> {
  return queueGenerationJob(
    userId,
    "video",
    prompt,
    config,
    context,
    organizationId,
  );
}

/**
 * Configuration for image generation jobs
 */
export interface ImageJobConfig {
  model?: string;
  aspectRatio?: string;
  imageSize?: string;
  style?: string;
  mood?: string;
  source?: string;
  referenceImage?: string;
  sourceImage?: string; // For image editing
  systemPrompt?: string;
}

/**
 * Queue an image generation job for background processing
 * Returns immediately, job runs in background via BullMQ
 */
export async function queueImageJob(
  userId: string,
  prompt: string,
  config: ImageJobConfig,
  context: string,
  organizationId?: string | null,
): Promise<QueueJobResult> {
  return queueGenerationJob(
    userId,
    "image",
    prompt,
    config as GenerationJobConfig,
    context,
    organizationId,
  );
}

/**
 * Get status of a generation job
 */
export async function getGenerationJobStatus(
  jobId: string,
): Promise<GenerationJob> {
  const response = await fetch(`/api/generate/status?jobId=${jobId}`);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get all generation jobs for a user
 */
export async function getGenerationJobs(
  userId: string,
  options?: { status?: string; limit?: number; organizationId?: string | null },
): Promise<{ jobs: GenerationJob[]; total: number }> {
  const params = new URLSearchParams({ userId });
  if (options?.organizationId)
    params.append("organizationId", options.organizationId);
  if (options?.status) params.append("status", options.status);
  if (options?.limit) params.append("limit", options.limit.toString());

  const response = await fetch(`/api/generate/status?${params}`);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Poll a generation job until completion
 * @param jobId - The job ID to poll
 * @param onProgress - Callback for progress updates
 * @param pollInterval - How often to poll in ms (default 2000)
 * @param timeout - Max time to wait in ms (default 300000 = 5 min)
 */
export async function pollGenerationJob(
  jobId: string,
  onProgress?: (job: GenerationJob) => void,
  pollInterval = 2000,
  timeout = 300000,
): Promise<GenerationJob> {
  const startTime = Date.now();

  while (true) {
    const job = await getGenerationJobStatus(jobId);
    onProgress?.(job);

    if (job.status === "completed" || job.status === "failed") {
      return job;
    }

    if (Date.now() - startTime > timeout) {
      throw new Error("Generation job timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

/**
 * Cancel a specific generation job
 */
export async function cancelGenerationJob(jobId: string): Promise<void> {
  const response = await fetch(`/api/generate/job/${jobId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
}

/**
 * Cancel all pending jobs for a user
 */
export async function cancelAllGenerationJobs(userId: string): Promise<number> {
  const response = await fetch("/api/generate/cancel-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const result = await response.json();
  return result.cancelledCount;
}

// ============================================================================
// AI Generation API (Server-side)
// These endpoints run on Vercel Serverless with rate limiting
// ============================================================================

const AI_API_BASE = "/api/ai";

/**
 * Helper to make authenticated AI API calls
 */
async function fetchAiApi<T>(
  endpoint: string,
  options: RequestInit = {},
  getToken?: () => Promise<string | null>,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add auth token if available
  if (getToken) {
    const token = await getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${AI_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// AI Types
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

/**
 * Generate an image using AI (Gemini or Imagen)
 */
export async function generateAiImage(
  params: {
    prompt: string;
    brandProfile: AiBrandProfile;
    aspectRatio?: string;
    model?: "gemini-3-pro-image-preview";
    imageSize?: "1K" | "2K" | "4K";
    productImages?: AiImageFile[];
    styleReferenceImage?: AiImageFile;
  },
  getToken?: () => Promise<string | null>,
): Promise<string> {
  const result = await fetchAiApi<AiGenerationResult<never>>(
    "/image",
    {
      method: "POST",
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
    imageSize?: "1K" | "2K" | "4K";
    compositionAssets?: AiImageFile[];
  },
  getToken?: () => Promise<string | null>,
): Promise<string> {
  const result = await fetchAiApi<AiGenerationResult<never>>(
    "/flyer",
    {
      method: "POST",
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
    "/edit-image",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
    getToken,
  );
  return result.imageUrl!;
}

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
    "/speech",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
    getToken,
  );
  return result.audioBase64!;
}

/**
 * Generate creative text using AI (quick post or custom)
 */
export async function generateAiText<T = Record<string, unknown>>(
  params: {
    type: "quickPost" | "custom";
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
    "/text",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
    getToken,
  );
  return result.result!;
}

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
    "/campaign",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
    getToken,
  );
  return result.campaign!;
}

// ============================================================================
// Video Generation API (Server-side FAL.ai)
// ============================================================================

export type ApiVideoModel = "sora-2" | "veo-3.1";

export interface VideoGenerationResult {
  success: boolean;
  url: string;
  model: ApiVideoModel;
}

/**
 * Generate video using FAL.ai models (server-side)
 * This avoids exposing FAL_KEY in the browser
 */
export async function generateVideo(params: {
  prompt: string;
  aspectRatio: "16:9" | "9:16";
  model: ApiVideoModel;
  imageUrl?: string;
  lastFrameUrl?: string;
  sceneDuration?: number;
  generateAudio?: boolean;
  useInterpolation?: boolean;
}): Promise<string> {
  const response = await fetch("/api/ai/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      error.error || `Video generation failed: HTTP ${response.status}`,
    );
  }

  const result: VideoGenerationResult = await response.json();
  return result.url;
}
