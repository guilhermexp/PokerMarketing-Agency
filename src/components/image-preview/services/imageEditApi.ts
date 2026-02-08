/**
 * imageEditApi
 * API calls para operações de edição de imagem
 */

import type { GalleryImage } from '../../../types';
import { getAuthToken } from '../../../services/authService';

interface EditOptions {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const imageEditApi = {
  /**
   * Apply edits to an image
   */
  applyEdits: async (
    imageUrl: string,
    options: EditOptions
  ): Promise<ApiResponse<{ editedUrl: string }>> => {
    try {
      const token = await getAuthToken();
      const response = await fetch('/api/ai/edit-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageUrl, ...options }),
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  /**
   * Enhance image with AI
   */
  enhanceImage: async (
    imageUrl: string,
    enhanceType: 'upscale' | 'restore' | 'background-remove'
  ): Promise<ApiResponse<{ enhancedUrl: string }>> => {
    try {
      const token = await getAuthToken();
      const response = await fetch('/api/ai/enhance-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageUrl, enhanceType }),
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  /**
   * Generate variations of an image
   */
  generateVariations: async (
    imageUrl: string,
    count: number = 4
  ): Promise<ApiResponse<{ variations: string[] }>> => {
    try {
      const token = await getAuthToken();
      const response = await fetch('/api/ai/generate-variations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageUrl, count }),
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  /**
   * Remove background from image
   */
  removeBackground: async (
    imageUrl: string
  ): Promise<ApiResponse<{ noBgUrl: string }>> => {
    try {
      const token = await getAuthToken();
      const response = await fetch('/api/ai/remove-background', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageUrl }),
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  /**
   * Upload and process image
   */
  uploadImage: async (
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ image: GalleryImage }>> => {
    return new Promise((resolve) => {
      getAuthToken()
        .then((token) => {
          const formData = new FormData();
          formData.append('file', file);

          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
              onProgress(Math.round((e.loaded / e.total) * 100));
            }
          });

          xhr.addEventListener('load', () => {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve({ success: true, data: response });
            } catch {
              resolve({ success: false, error: 'Invalid response' });
            }
          });

          xhr.addEventListener('error', () => {
            resolve({ success: false, error: 'Upload failed' });
          });

          xhr.open('POST', '/api/upload');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
          xhr.send(formData);
        })
        .catch(() => {
          resolve({ success: false, error: 'Failed to read authentication token' });
        });
    });
  },
};
