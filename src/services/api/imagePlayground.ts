/**
 * Image Playground API Client
 * API functions for image generation playground feature
 */

import { getAuthToken } from '../authService';
import type {
  ImageGenerationTopic,
  GenerationBatch,
  Generation,
  AsyncTaskStatus,
  AsyncTaskError,
} from '../../stores/imagePlaygroundStore';

const API_BASE = '/api/image-playground';

// =============================================================================
// Types
// =============================================================================

export interface CreateTopicResponse {
  success: boolean;
  topic: ImageGenerationTopic;
}

export interface UpdateTopicInput {
  title?: string;
  coverUrl?: string;
}

export interface CreateImageInput {
  topicId: string;
  provider: string;
  model: string;
  imageNum: number;
  params: {
    prompt: string;
    width?: number;
    height?: number;
    seed?: number;
    quality?: string;
    aspectRatio?: string;
    imageUrl?: string;
    [key: string]: unknown;
  };
}

export interface CreateImageResponse {
  success: boolean;
  data: {
    batch: GenerationBatch;
    generations: Generation[];
  };
}

export interface GenerationStatusResponse {
  status: AsyncTaskStatus;
  generation?: Generation;
  error?: AsyncTaskError;
}

// =============================================================================
// Helper Functions
// =============================================================================

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Merge existing headers
  if (options.headers) {
    const existingHeaders = options.headers as Record<string, string>;
    Object.assign(headers, existingHeaders);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

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
export async function getTopics(): Promise<ImageGenerationTopic[]> {
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
): Promise<ImageGenerationTopic> {
  const response = await fetchWithAuth(`${API_BASE}/topics/${topicId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  const data = await response.json();
  return data.topic;
}

/**
 * Delete a topic (cascades to batches and generations)
 */
export async function deleteTopic(topicId: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/topics/${topicId}`, {
    method: 'DELETE',
  });
}

// =============================================================================
// Batch API
// =============================================================================

/**
 * Get batches for a topic
 */
export async function getBatches(topicId: string): Promise<GenerationBatch[]> {
  const response = await fetchWithAuth(`${API_BASE}/batches?topicId=${topicId}`);
  const data = await response.json();
  return data.batches || [];
}

/**
 * Delete a batch (cascades to generations)
 */
export async function deleteBatch(batchId: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/batches/${batchId}`, {
    method: 'DELETE',
  });
}

// =============================================================================
// Generation API
// =============================================================================

/**
 * Create a new image generation batch
 */
export async function createImage(input: CreateImageInput): Promise<CreateImageResponse> {
  const response = await fetchWithAuth(`${API_BASE}/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.json();
}

/**
 * Get generation status (for polling)
 */
export async function getGenerationStatus(
  generationId: string,
  asyncTaskId: string
): Promise<GenerationStatusResponse> {
  const response = await fetchWithAuth(
    `${API_BASE}/status/${generationId}?asyncTaskId=${asyncTaskId}`
  );
  return response.json();
}

/**
 * Delete a single generation
 */
export async function deleteGeneration(generationId: string): Promise<void> {
  await fetchWithAuth(`${API_BASE}/generations/${generationId}`, {
    method: 'DELETE',
  });
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
