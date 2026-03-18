/**
 * Shared types for Image Playground stores
 */

export interface ReferenceImage {
  id: string;        // UUID for unique identification
  dataUrl: string;   // data:image/...;base64,... (kept for local preview)
  mimeType: string;  // image/png, image/jpeg, etc.
  blobUrl?: string;  // Vercel Blob URL after upload (preferred over dataUrl for API calls)
}

export interface ImageGenerationTopic {
  id: string;
  userId: string;
  organizationId?: string | null;
  title: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationAsset {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface Generation {
  id: string;
  batchId: string;
  userId: string;
  asyncTaskId: string | null;
  seed: number | null;
  asset: GenerationAsset | null;
  createdAt: string;
}

export interface GenerationBatch {
  id: string;
  topicId: string;
  userId: string;
  organizationId?: string | null;
  provider: string;
  model: string;
  prompt: string;
  config: Record<string, unknown>;
  width: number | null;
  height: number | null;
  createdAt: string;
  userEmail?: string | null;
  generations: Generation[];
}

export interface RuntimeImageGenParams {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  quality?: string;
  aspectRatio?: string;
  imageSize?: '1K' | '2K' | '4K';
  imageUrl?: string; // DEPRECATED - kept for backwards compatibility
  referenceImages?: ReferenceImage[]; // NEW - array of up to 14 reference images
  [key: string]: unknown;
}

export type AsyncTaskStatus = 'pending' | 'processing' | 'success' | 'error';

export interface AsyncTaskError {
  code: string;
  message: string;
  details?: unknown;
}
