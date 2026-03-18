/**
 * Upload API - File upload operations
 *
 * Handles uploads to Vercel Blob storage for images, videos, and audio.
 */

import { getCsrfToken, getCurrentCsrfToken } from '../api-client/base';
import { getApiErrorMessage, parseApiResponse } from './response';

// =============================================================================
// Types
// =============================================================================

export interface UploadResult {
  success: boolean;
  url: string;
  filename: string;
  size: number;
}

// =============================================================================
// Upload Operations
// =============================================================================

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
    throw new Error('Cannot upload empty blob');
  }

  if (blob.size === 0) {
    throw new Error('Blob contains no data');
  }

  const normalizedContentType = contentType || blob.type || 'application/octet-stream';
  const formData = new FormData();
  formData.append(
    'file',
    new File([blob], filename, {
      type: normalizedContentType,
    }),
  );
  formData.append('filename', filename);
  formData.append('contentType', normalizedContentType);

  if (!getCurrentCsrfToken()) {
    await getCsrfToken();
  }
  const csrfToken = getCurrentCsrfToken();

  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(getApiErrorMessage(error, `HTTP ${response.status}`));
  }

  return parseApiResponse<UploadResult>(response);
}

/**
 * Upload a video blob to Vercel Blob storage
 * @param blob - The video blob
 * @param filename - Optional filename (defaults to video-{timestamp}.mp4)
 * @returns The URL of the uploaded video
 */
export async function uploadVideo(
  blob: Blob,
  filename?: string,
): Promise<string> {
  const name = filename || `video-${Date.now()}.mp4`;
  const result = await uploadToBlob(blob, name, 'video/mp4');
  return result.url;
}

/**
 * Upload an audio blob to Vercel Blob storage
 * @param blob - The audio blob
 * @param filename - Optional filename (defaults to audio-{timestamp}.wav)
 * @returns The URL of the uploaded audio
 */
export async function uploadAudio(
  blob: Blob,
  filename?: string,
): Promise<string> {
  const name = filename || `audio-${Date.now()}.wav`;
  const contentType = blob.type || 'audio/wav';
  const result = await uploadToBlob(blob, name, contentType);
  return result.url;
}

/**
 * Upload an image blob to Vercel Blob storage
 * @param blob - The image blob
 * @param filename - Optional filename (defaults to image-{timestamp}.png)
 * @returns The URL of the uploaded image
 */
export async function uploadImage(
  blob: Blob,
  filename?: string,
): Promise<string> {
  const name = filename || `image-${Date.now()}.png`;
  const contentType = blob.type || 'image/png';
  const result = await uploadToBlob(blob, name, contentType);
  return result.url;
}
