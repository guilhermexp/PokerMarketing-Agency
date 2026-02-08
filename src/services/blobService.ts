/**
 * Blob Service - Upload images via server API
 * Uses /api/upload endpoint to keep tokens secure on server
 */

import { getAuthToken } from "./authService";

/**
 * Check if Blob upload is available (always true, server handles token)
 */
export const isBlobConfigured = (): boolean => {
  return true;
};

/**
 * Upload an image to Vercel Blob via server API
 * @param base64Data - Base64 encoded image data (without data URL prefix)
 * @param mimeType - MIME type of the image (default: image/png)
 * @returns Public HTTP URL of the uploaded image
 */
export const uploadImageToBlob = async (
  base64Data: string,
  mimeType: string = 'image/png'
): Promise<string> => {
  console.debug('[Blob Service] Uploading image via API...');

  const extension = mimeType.split('/')[1] || 'png';
  const filename = `upload-${Date.now()}.${extension}`;

  const token = await getAuthToken();
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      filename,
      contentType: mimeType,
      data: base64Data,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Upload failed: ${response.status}`);
  }

  const result = await response.json();
  console.debug(`[Blob Service] Image uploaded: ${result.url}`);
  return result.url;
};

/**
 * Upload from data URL (data:image/png;base64,...)
 */
export const uploadDataUrlToBlob = async (dataUrl: string): Promise<string> => {
  // Check if already an HTTP URL
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
    return dataUrl;
  }

  // Extract base64 and mime type from data URL
  const [header, base64] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';

  return uploadImageToBlob(base64, mimeType);
};
