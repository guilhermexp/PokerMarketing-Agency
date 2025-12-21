/**
 * Vercel Blob Service
 * Upload images to Vercel Blob storage for public HTTP URLs
 */

import { put } from '@vercel/blob';

// Get token with fresh read pattern
const getToken = () => import.meta.env.VITE_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Check if Vercel Blob is configured
 */
export const isBlobConfigured = (): boolean => {
  return Boolean(getToken());
};

/**
 * Upload an image to Vercel Blob and get a public HTTP URL
 * @param base64Data - Base64 encoded image data (without data URL prefix)
 * @param mimeType - MIME type of the image (default: image/png)
 * @returns Public HTTP URL of the uploaded image
 */
export const uploadImageToBlob = async (
  base64Data: string,
  mimeType: string = 'image/png'
): Promise<string> => {
  const token = getToken();

  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN não configurado. Adicione ao arquivo .env.');
  }

  console.log('[Vercel Blob] Uploading image...');

  try {
    // Convert base64 to Blob
    const byteString = atob(base64Data);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([uint8Array], { type: mimeType });

    // Generate filename
    const extension = mimeType.split('/')[1] || 'png';
    const filename = `instagram-${Date.now()}.${extension}`;

    // Upload to Vercel Blob
    const { url } = await put(filename, blob, {
      access: 'public',
      token,
    });

    console.log(`[Vercel Blob] Image uploaded: ${url}`);
    return url;
  } catch (error) {
    console.error('[Vercel Blob] Upload error:', error);
    throw new Error(`Falha no upload: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
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
