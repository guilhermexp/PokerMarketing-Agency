/**
 * API Client for Neon Database operations
 * Provides typed methods for all database entities
 */

const API_BASE = '/api/db';

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
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
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
  return fetchApi<DbUser>('/users', {
    method: 'POST',
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
  tone_of_voice: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export async function getBrandProfile(userId: string, organizationId?: string | null): Promise<DbBrandProfile | null> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<DbBrandProfile | null>(`/brand-profiles?${params}`);
}

export async function createBrandProfile(userId: string, data: {
  name: string;
  description?: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  tone_of_voice: string;
  organization_id?: string | null;
}): Promise<DbBrandProfile> {
  return fetchApi<DbBrandProfile>('/brand-profiles', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateBrandProfile(id: string, data: Partial<DbBrandProfile>): Promise<DbBrandProfile> {
  return fetchApi<DbBrandProfile>(`/brand-profiles?id=${id}`, {
    method: 'PUT',
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
}

export async function getGalleryImages(userId: string, organizationId?: string | null, options?: {
  source?: string;
  limit?: number;
}): Promise<DbGalleryImage[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  if (options?.source) params.append('source', options.source);
  if (options?.limit) params.append('limit', options.limit.toString());

  return fetchApi<DbGalleryImage[]>(`/gallery?${params}`);
}

export async function createGalleryImage(userId: string, data: {
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
}): Promise<DbGalleryImage> {
  return fetchApi<DbGalleryImage>('/gallery', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function deleteGalleryImage(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/gallery?id=${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to delete image: HTTP ${response.status}`);
  }
}

export async function markGalleryImagePublished(id: string): Promise<DbGalleryImage> {
  return fetchApi<DbGalleryImage>(`/gallery?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ published_at: new Date().toISOString() }),
  });
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

export async function getScheduledPosts(userId: string, organizationId?: string | null, options?: {
  status?: string;
  startDate?: string;
  endDate?: string;
}): Promise<DbScheduledPost[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  if (options?.status) params.append('status', options.status);
  if (options?.startDate) params.append('start_date', options.startDate);
  if (options?.endDate) params.append('end_date', options.endDate);

  return fetchApi<DbScheduledPost[]>(`/scheduled-posts?${params}`);
}

export async function createScheduledPost(userId: string, data: {
  content_type: string;
  content_id?: string;
  image_url: string;
  caption: string;
  hashtags: string[];
  scheduled_date: string;
  scheduled_time: string;
  scheduled_timestamp: string;
  timezone: string;
  platforms: string;
  instagram_content_type?: string;
  created_from?: string;
  organization_id?: string | null;
}): Promise<DbScheduledPost> {
  return fetchApi<DbScheduledPost>('/scheduled-posts', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateScheduledPost(id: string, data: Partial<DbScheduledPost>): Promise<DbScheduledPost> {
  return fetchApi<DbScheduledPost>(`/scheduled-posts?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteScheduledPost(id: string): Promise<void> {
  await fetchApi(`/scheduled-posts?id=${id}`, { method: 'DELETE' });
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
  // Counts and previews from list query
  clips_count?: number;
  posts_count?: number;
  ads_count?: number;
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
}

export async function getCampaigns(userId: string, organizationId?: string | null): Promise<DbCampaign[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<DbCampaign[]>(`/campaigns?${params}`);
}

export async function getCampaignById(id: string, userId: string, organizationId?: string | null): Promise<DbCampaignFull | null> {
  const params = new URLSearchParams({ id, user_id: userId, include_content: 'true' });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<DbCampaignFull | null>(`/campaigns?${params}`);
}

export async function createCampaign(userId: string, data: {
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
}): Promise<DbCampaign> {
  return fetchApi<DbCampaign>('/campaigns', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateCampaign(id: string, data: Partial<DbCampaign>): Promise<DbCampaign> {
  return fetchApi<DbCampaign>(`/campaigns?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCampaign(id: string): Promise<void> {
  await fetchApi(`/campaigns?id=${id}`, { method: 'DELETE' });
}

// ============================================================================
// Posts & Ad Creatives Updates
// ============================================================================

export async function updatePostImage(postId: string, imageUrl: string): Promise<DbPost> {
  return fetchApi<DbPost>(`/posts?id=${postId}`, {
    method: 'PATCH',
    body: JSON.stringify({ image_url: imageUrl }),
  });
}

export async function updateAdCreativeImage(adId: string, imageUrl: string): Promise<DbAdCreative> {
  return fetchApi<DbAdCreative>(`/ad-creatives?id=${adId}`, {
    method: 'PATCH',
    body: JSON.stringify({ image_url: imageUrl }),
  });
}

// ============================================================================
// Health Check
// ============================================================================

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    return data.status === 'healthy';
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
  contentType: string
): Promise<UploadResult> {
  // Convert blob to base64
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename,
      contentType,
      data: base64,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Upload a video blob to Vercel Blob storage
 */
export async function uploadVideo(blob: Blob, filename?: string): Promise<string> {
  const name = filename || `video-${Date.now()}.mp4`;
  const result = await uploadToBlob(blob, name, 'video/mp4');
  return result.url;
}

/**
 * Upload an audio blob to Vercel Blob storage
 */
export async function uploadAudio(blob: Blob, filename?: string): Promise<string> {
  const name = filename || `audio-${Date.now()}.wav`;
  const contentType = blob.type || 'audio/wav';
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
export async function getTournamentData(userId: string, organizationId?: string | null): Promise<TournamentData> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<TournamentData>(`/tournaments?${params}`);
}

/**
 * Get all week schedules for a user
 */
export interface WeekScheduleWithCount extends DbWeekSchedule {
  event_count: number;
}

export async function getWeekSchedulesList(userId: string, organizationId?: string | null): Promise<{ schedules: WeekScheduleWithCount[] }> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<{ schedules: WeekScheduleWithCount[] }>(`/tournaments/list?${params}`);
}

/**
 * Load events for a specific schedule
 */
export async function getScheduleEvents(userId: string, scheduleId: string, organizationId?: string | null): Promise<{ events: DbTournamentEvent[] }> {
  const params = new URLSearchParams({ user_id: userId, week_schedule_id: scheduleId });
  if (organizationId) params.append('organization_id', organizationId);
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
  }
): Promise<{ schedule: DbWeekSchedule; eventsCount: number }> {
  return fetchApi<{ schedule: DbWeekSchedule; eventsCount: number }>('/tournaments', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

/**
 * Delete week schedule and its events
 */
export async function deleteWeekSchedule(userId: string, scheduleId: string, organizationId?: string | null): Promise<void> {
  const params = new URLSearchParams({ id: scheduleId, user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  await fetchApi(`/tournaments?${params}`, { method: 'DELETE' });
}

// ============================================================================
// QStash Scheduling API
// ============================================================================

export interface QStashScheduleResult {
  success: boolean;
  messageId: string;
  scheduledFor: string;
  delaySeconds: number;
}

/**
 * Schedule a post for publication via QStash
 * This will trigger automatic publication at the scheduled time
 */
export async function schedulePostWithQStash(
  postId: string,
  userId: string,
  scheduledTimestamp: number | string
): Promise<QStashScheduleResult> {
  const response = await fetch('/api/qstash/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId, userId, scheduledTimestamp }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Cancel a scheduled post in QStash
 */
export async function cancelQStashSchedule(messageId: string): Promise<void> {
  const response = await fetch(`/api/qstash/schedule?messageId=${messageId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
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
  job_type: 'flyer' | 'flyer_daily' | 'post' | 'ad';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  result_url: string | null;
  result_gallery_id: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  attempts: number;
}

export interface QueueJobResult {
  success: boolean;
  jobId: string;
  messageId: string;
  status: string;
}

/**
 * Queue a new image generation job for background processing
 * Returns immediately, job runs in background via QStash
 */
export async function queueGenerationJob(
  userId: string,
  jobType: 'flyer' | 'flyer_daily' | 'post' | 'ad',
  prompt: string,
  config: GenerationJobConfig
): Promise<QueueJobResult> {
  const response = await fetch('/api/generate/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, jobType, prompt, config }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get status of a generation job
 */
export async function getGenerationJobStatus(jobId: string): Promise<GenerationJob> {
  const response = await fetch(`/api/generate/status?jobId=${jobId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get all generation jobs for a user
 */
export async function getGenerationJobs(
  userId: string,
  options?: { status?: string; limit?: number }
): Promise<{ jobs: GenerationJob[]; total: number }> {
  const params = new URLSearchParams({ userId });
  if (options?.status) params.append('status', options.status);
  if (options?.limit) params.append('limit', options.limit.toString());

  const response = await fetch(`/api/generate/status?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
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
  timeout = 300000
): Promise<GenerationJob> {
  const startTime = Date.now();

  while (true) {
    const job = await getGenerationJobStatus(jobId);
    onProgress?.(job);

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    if (Date.now() - startTime > timeout) {
      throw new Error('Generation job timed out');
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}
