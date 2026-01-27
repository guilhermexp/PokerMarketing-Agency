import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isBlobConfigured,
  uploadImageToBlob,
  uploadDataUrlToBlob,
} from '../blobService';
import type { MockFetch } from '../../__tests__/test-utils';
import { createMockFetchResponse } from '../../__tests__/test-utils';

describe('blobService', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as MockFetch;
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
      const mockResponse = createMockFetchResponse({ url: mockUrl });
      (global.fetch as MockFetch).mockResolvedValue(mockResponse);

      const base64Data = 'iVBORw0KGgo=';
      const result = await uploadImageToBlob(base64Data, 'image/png');

      expect(result).toBe(mockUrl);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should throw error on failed upload', async () => {
      const mockResponse = createMockFetchResponse({ error: 'Upload failed' }, false, 500);
      (global.fetch as MockFetch).mockResolvedValue(mockResponse);

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
      const mockResponse = createMockFetchResponse({ url: mockUrl });
      (global.fetch as MockFetch).mockResolvedValue(mockResponse);

      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const result = await uploadDataUrlToBlob(dataUrl);

      expect(result).toBe(mockUrl);
    });
  });
});
