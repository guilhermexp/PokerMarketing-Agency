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
  await fetchApi(`/gallery?id=${id}`, { method: 'DELETE' });
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

export interface DbCampaign {
  id: string;
  user_id: string;
  name: string | null;
  status: string;
  created_at: string;
}

export async function getCampaigns(userId: string): Promise<DbCampaign[]> {
  return fetchApi<DbCampaign[]>(`/campaigns?user_id=${userId}`);
}

export async function createCampaign(userId: string, data: {
  name?: string;
  brand_profile_id?: string;
  input_transcript?: string;
  generation_options?: Record<string, unknown>;
  video_clip_scripts?: unknown[];
  posts?: unknown[];
  ad_creatives?: unknown[];
}): Promise<DbCampaign> {
  return fetchApi<DbCampaign>('/campaigns', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...data }),
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
