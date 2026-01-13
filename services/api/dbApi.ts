/**
 * Database API - Core data operations
 *
 * Handles User, Brand Profile, Gallery Images, Scheduled Posts,
 * and Initial Data loading.
 */

import { fetchApi, API_BASE } from './client';
import type { DbCampaign } from './campaignsApi';
import type { DbWeekSchedule, DbTournamentEvent, WeekScheduleWithCount } from './tournamentApi';

// =============================================================================
// Initial Data (Optimized Single Request)
// =============================================================================

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
  if (organizationId) params.append('organization_id', organizationId);

  console.log('[API] Loading all initial data in single request...');
  const start = Date.now();

  const result = await fetchApi<InitialData>(`/init?${params}`);

  console.log(
    `[API] ✅ Initial data loaded in ${Date.now() - start}ms (server: ${result._meta?.loadTime}ms)`,
  );

  return result;
}

// =============================================================================
// User API
// =============================================================================

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

// =============================================================================
// Brand Profile API
// =============================================================================

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
  if (organizationId) params.append('organization_id', organizationId);
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
  return fetchApi<DbBrandProfile>('/brand-profiles', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateBrandProfile(
  id: string,
  data: Partial<DbBrandProfile>,
): Promise<DbBrandProfile> {
  return fetchApi<DbBrandProfile>(`/brand-profiles?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// =============================================================================
// Gallery Images API
// =============================================================================

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
  if (organizationId) params.append('organization_id', organizationId);
  if (options?.source) params.append('source', options.source);
  if (options?.limit) params.append('limit', options.limit.toString());

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

export async function updateGalleryImage(
  id: string,
  data: { src_url?: string; published_at?: string },
): Promise<DbGalleryImage | null> {
  // Skip if it's a temporary ID (not yet saved to database)
  if (id.startsWith('temp-')) {
    console.log('[API] Skipping updateGalleryImage for temp ID:', id);
    return null;
  }

  return fetchApi<DbGalleryImage>(`/gallery?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function markGalleryImagePublished(
  id: string,
): Promise<DbGalleryImage | null> {
  return updateGalleryImage(id, { published_at: new Date().toISOString() });
}

// =============================================================================
// Scheduled Posts API
// =============================================================================

export interface DbScheduledPost {
  id: string;
  user_id: string;
  content_type: string;
  content_id: string | null;
  image_url: string;
  carousel_image_urls?: string[] | null;
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
  if (organizationId) params.append('organization_id', organizationId);
  if (options?.status) params.append('status', options.status);
  if (options?.startDate) params.append('start_date', options.startDate);
  if (options?.endDate) params.append('end_date', options.endDate);

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
  return fetchApi<DbScheduledPost>('/scheduled-posts', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateScheduledPost(
  id: string,
  data: Partial<DbScheduledPost>,
): Promise<DbScheduledPost> {
  return fetchApi<DbScheduledPost>(`/scheduled-posts?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteScheduledPost(id: string): Promise<void> {
  await fetchApi(`/scheduled-posts?id=${id}`, { method: 'DELETE' });
}

// =============================================================================
// Health Check
// =============================================================================

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}
