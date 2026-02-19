/**
 * Video Playground API Client
 * API functions for video generation playground feature
 */

import { getAuthToken } from '../authService';
import { getCsrfToken, getCurrentCsrfToken, clearCsrfToken } from '../apiClient';
import type {
  VideoGenerationTopic,
  VideoSession,
  VideoGeneration,
} from '../../stores/videoPlaygroundStore';

const API_BASE = '/api/video-playground';

// =============================================================================
// Types
// =============================================================================

export interface CreateTopicResponse {
  success: boolean;
  topic: VideoGenerationTopic;
}

export interface UpdateTopicInput {
  title?: string;
  coverUrl?: string;
}

export interface CreateVideoInput {
  topicId: string;
  model: string;
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  resolution: '720p' | '1080p';
  useBrandProfile?: boolean;
  referenceImageUrl?: string;
}

export interface CreateVideoResponse {
  success: boolean;
  data: {
    session: VideoSession;
    generation: VideoGeneration;
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const method = (options.method || 'GET').toUpperCase();
  const requiresCsrf = method !== 'GET' && method !== 'HEAD';

  if (requiresCsrf && !getCurrentCsrfToken()) {
    await getCsrfToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.headers) {
    const existingHeaders = options.headers as Record<string, string>;
    Object.assign(headers, existingHeaders);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const csrfToken = getCurrentCsrfToken();
  if (requiresCsrf && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 403 && requiresCsrf) {
    clearCsrfToken();
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }

  return response;
}

// =============================================================================
// Topic API
// =============================================================================

/**
 * Get all topics for the current user
 */
export async function getTopics(): Promise<VideoGenerationTopic[]> {
  const response = await fetchWithAuth(`${API_BASE}/topics`);
  const data = await response.json();
  return data.topics || [];
}

/**
 * Create a new topic
 */
export async function createTopic(title?: string): Promise<CreateTopicResponse> {
  const response = await fetchWithAuth(`${API_BASE}/topics`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  return response.json();
}

/**
 * Update a topic
 */
export async function updateTopic(
  topicId: string,
  updates: UpdateTopicInput
): Promise<VideoGenerationTopic> {
  const response = await fetchWithAuth(`${API_BASE}/topics/${topicId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const data = await response.json();
  return data.topic;
}

/**
 * Delete a topic (cascades to sessions and generations)
 */
export async function deleteTopic(topicId: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/topics/${topicId}`, {
    method: 'DELETE',
  });
}

// =============================================================================
// Session API
// =============================================================================

/**
 * Get sessions for a topic
 */
export async function getSessions(topicId: string): Promise<VideoSession[]> {
  const safeTopicId = encodeURIComponent(topicId);
  const response = await fetchWithAuth(`${API_BASE}/sessions?topicId=${safeTopicId}&limit=100`);
  const data = await response.json();
  return data.sessions || [];
}

/**
 * Delete a session (cascades to generations)
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

// =============================================================================
// Generation API
// =============================================================================

/**
 * Create a new video generation
 */
export async function createVideo(input: CreateVideoInput): Promise<CreateVideoResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000); // 5 min timeout for video

  try {
    const response = await fetchWithAuth(`${API_BASE}/generate`, {
      method: 'POST',
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Delete a single generation
 */
export async function deleteGeneration(generationId: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/generations/${generationId}`, {
    method: 'DELETE',
  });
}

export interface UpdateGenerationInput {
  status?: 'pending' | 'generating' | 'success' | 'error';
  videoUrl?: string;
  duration?: number;
  errorMessage?: string;
}

/**
 * Update a generation (set status and video URL after generation completes)
 */
export async function updateGeneration(
  generationId: string,
  updates: UpdateGenerationInput
): Promise<VideoGeneration> {
  const response = await fetchWithAuth(`${API_BASE}/generations/${generationId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const data = await response.json();
  return data.generation;
}

// =============================================================================
// Utility API
// =============================================================================

/**
 * Generate topic title using AI
 */
export async function generateTopicTitle(prompts: string[]): Promise<string> {
  const response = await fetchWithAuth(`${API_BASE}/generate-title`, {
    method: 'POST',
    body: JSON.stringify({ prompts }),
  });
  const data = await response.json();
  return data.title;
}
