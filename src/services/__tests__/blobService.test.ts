import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isBlobConfigured,
  uploadImageToBlob,
  uploadDataUrlToBlob,
} from '../blobService';

describe('blobService', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    vi.clearAllMocks();
  });

  describe('isBlobConfigured', () => {
    it('should always return true', () => {
      expect(isBlobConfigured()).toBe(true);
    });
  });

  describe('uploadImageToBlob', () => {
    it('should upload image successfully', async () => {
      const mockUrl = 'https://blob.vercel-storage.com/test-image.png';
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ url: mockUrl }),
      });

      const base64Data = 'iVBORw0KGgo=';
      const result = await uploadImageToBlob(base64Data, 'image/png');

      expect(result).toBe(mockUrl);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should throw error on failed upload', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'Upload failed' }),
      });

      await expect(uploadImageToBlob('test-data')).rejects.toThrow('Upload failed');
    });
  });

describe('uploadDataUrlToBlob', () => {
    it('should return URL unchanged if already HTTP URL', async () => {
      const httpUrl = 'https://example.com/image.png';
      const result = await uploadDataUrlToBlob(httpUrl);
      expect(result).toBe(httpUrl);
    });

    it('should upload data URL to blob', async () => {
      const mockUrl = 'https://blob.vercel-storage.com/uploaded.png';
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ url: mockUrl }),
      });

      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const result = await uploadDataUrlToBlob(dataUrl);

      expect(result).toBe(mockUrl);
    });
  });
});
