/**
 * API Client for Neon Database operations
 * Provides typed methods for all database entities
 */

const API_BASE = '/api/db';

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

export async function getBrandProfile(userId: string): Promise<DbBrandProfile | null> {
  return fetchApi<DbBrandProfile | null>(`/brand-profiles?user_id=${userId}`);
}

export async function createBrandProfile(userId: string, data: {
  name: string;
  description?: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  tone_of_voice: string;
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

export async function getGalleryImages(userId: string, options?: {
  source?: string;
  limit?: number;
}): Promise<DbGalleryImage[]> {
  const params = new URLSearchParams({ user_id: userId });
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

export async function getScheduledPosts(userId: string, options?: {
  status?: string;
  startDate?: string;
  endDate?: string;
}): Promise<DbScheduledPost[]> {
  const params = new URLSearchParams({ user_id: userId });
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
}

export interface DbCampaignFull extends DbCampaign {
  video_clip_scripts: DbVideoClipScript[];
  posts: DbPost[];
  ad_creatives: DbAdCreative[];
}

export async function getCampaigns(userId: string): Promise<DbCampaign[]> {
  return fetchApi<DbCampaign[]>(`/campaigns?user_id=${userId}`);
}

export async function getCampaignById(id: string, userId: string): Promise<DbCampaignFull | null> {
  return fetchApi<DbCampaignFull | null>(`/campaigns?id=${id}&user_id=${userId}&include_content=true`);
}

export async function createCampaign(userId: string, data: {
  name?: string;
  description?: string;
  brand_profile_id?: string;
  input_transcript?: string;
  generation_options?: Record<string, unknown>;
  status?: string;
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
export async function getTournamentData(userId: string): Promise<TournamentData> {
  return fetchApi<TournamentData>(`/tournaments?user_id=${userId}`);
}

/**
 * Get all week schedules for a user
 */
export interface WeekScheduleWithCount extends DbWeekSchedule {
  event_count: number;
}

export async function getWeekSchedulesList(userId: string): Promise<{ schedules: WeekScheduleWithCount[] }> {
  return fetchApi<{ schedules: WeekScheduleWithCount[] }>(`/tournaments/list?user_id=${userId}`);
}

/**
 * Load events for a specific schedule
 */
export async function getScheduleEvents(userId: string, scheduleId: string): Promise<{ events: DbTournamentEvent[] }> {
  return fetchApi<{ events: DbTournamentEvent[] }>(`/tournaments?user_id=${userId}&week_schedule_id=${scheduleId}`);
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
export async function deleteWeekSchedule(userId: string, scheduleId: string): Promise<void> {
  await fetchApi(`/tournaments?id=${scheduleId}&user_id=${userId}`, { method: 'DELETE' });
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

// ============================================================================
// Organizations API
// ============================================================================

export interface DbOrganization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  created_at: string;
  member_status?: string;
  role_name?: string;
  permissions?: string[];
  member_count?: number;
}

export interface DbOrganizationRole {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  permissions: string[];
  member_count?: number;
}

export interface DbOrganizationMember {
  id: string;
  user_id: string;
  organization_id: string;
  role_id: string;
  status: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role_name: string;
  permissions: string[];
  is_system_role: boolean;
  invited_by_name: string | null;
  invited_at: string;
  joined_at: string | null;
}

export interface DbOrganizationInvite {
  id: string;
  organization_id: string;
  email: string;
  role_id: string;
  token: string;
  expires_at: string;
  status: string;
  invited_by: string;
  created_at: string;
  role_name?: string;
  invited_by_name?: string;
  organization_name?: string;
  organization_logo?: string;
}

// Get organizations for user
export async function getOrganizations(userId: string): Promise<DbOrganization[]> {
  return fetchApi<DbOrganization[]>(`/organizations?user_id=${userId}`);
}

// Create organization
export async function createOrganization(userId: string, data: {
  name: string;
  description?: string;
  logo_url?: string;
}): Promise<DbOrganization> {
  return fetchApi<DbOrganization>('/organizations', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

// Update organization
export async function updateOrganization(id: string, userId: string, data: {
  name?: string;
  description?: string;
  logo_url?: string;
}): Promise<DbOrganization> {
  return fetchApi<DbOrganization>(`/organizations?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

// Delete organization
export async function deleteOrganization(id: string, userId: string): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/organizations?id=${id}&user_id=${userId}`, {
    method: 'DELETE',
  });
}

// Get organization members
export async function getOrganizationMembers(organizationId: string, userId: string): Promise<DbOrganizationMember[]> {
  return fetchApi<DbOrganizationMember[]>(`/organizations/members?organization_id=${organizationId}&user_id=${userId}`);
}

// Update member role
export async function updateOrganizationMember(id: string, data: {
  user_id: string;
  organization_id: string;
  role_id?: string;
  status?: string;
}): Promise<DbOrganizationMember> {
  return fetchApi<DbOrganizationMember>(`/organizations/members?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Remove member
export async function removeOrganizationMember(id: string, userId: string, organizationId: string): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/organizations/members?id=${id}&user_id=${userId}&organization_id=${organizationId}`, {
    method: 'DELETE',
  });
}

// Get organization roles
export async function getOrganizationRoles(organizationId: string, userId: string): Promise<DbOrganizationRole[]> {
  return fetchApi<DbOrganizationRole[]>(`/organizations/roles?organization_id=${organizationId}&user_id=${userId}`);
}

// Create role
export async function createOrganizationRole(data: {
  user_id: string;
  organization_id: string;
  name: string;
  description?: string;
  permissions: string[];
}): Promise<DbOrganizationRole> {
  return fetchApi<DbOrganizationRole>('/organizations/roles', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Update role
export async function updateOrganizationRole(id: string, data: {
  user_id: string;
  organization_id: string;
  name?: string;
  description?: string;
  permissions?: string[];
}): Promise<DbOrganizationRole> {
  return fetchApi<DbOrganizationRole>(`/organizations/roles?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Delete role
export async function deleteOrganizationRole(id: string, userId: string, organizationId: string): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/organizations/roles?id=${id}&user_id=${userId}&organization_id=${organizationId}`, {
    method: 'DELETE',
  });
}

// Get organization invites
export async function getOrganizationInvites(organizationId: string, userId: string): Promise<DbOrganizationInvite[]> {
  return fetchApi<DbOrganizationInvite[]>(`/organizations/invites?organization_id=${organizationId}&user_id=${userId}`);
}

// Create invite
export async function createOrganizationInvite(data: {
  user_id: string;
  organization_id: string;
  email: string;
  role_id: string;
  expires_in_days?: number;
}): Promise<DbOrganizationInvite> {
  return fetchApi<DbOrganizationInvite>('/organizations/invites', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Cancel invite
export async function cancelOrganizationInvite(id: string, userId: string, organizationId: string): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/organizations/invites?id=${id}&user_id=${userId}&organization_id=${organizationId}`, {
    method: 'DELETE',
  });
}

// Get user's pending invites
export async function getUserInvites(userId: string): Promise<DbOrganizationInvite[]> {
  return fetchApi<DbOrganizationInvite[]>(`/user/invites?user_id=${userId}`);
}

// Accept invite
export async function acceptOrganizationInvite(userId: string, token: string): Promise<{ success: boolean; organization: DbOrganization }> {
  return fetchApi<{ success: boolean; organization: DbOrganization }>('/organizations/invites/accept', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, token }),
  });
}

// Decline invite
export async function declineOrganizationInvite(userId: string, token: string): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>('/organizations/invites/decline', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, token }),
  });
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
