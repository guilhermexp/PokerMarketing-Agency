import { describe, it, expect, beforeEach, vi } from 'vitest';
import { urlToDataUrl, urlToBase64 } from '../imageHelpers';

describe('imageHelpers', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    vi.clearAllMocks();
  });

  describe('urlToDataUrl', () => {
    it('should return null for empty string', async () => {
      const result = await urlToDataUrl('');
      expect(result).toBeNull();
    });

    it('should return same data URL if already data URL', async () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const result = await urlToDataUrl(dataUrl);
      expect(result).toBe(dataUrl);
    });
  });

  describe('urlToBase64', () => {
    it('should return null for empty string', async () => {
      const result = await urlToBase64('');
      expect(result).toBeNull();
    });

    it('should parse data URL correctly', async () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const result = await urlToBase64(dataUrl);

      expect(result).toEqual({
        base64: 'iVBORw0KGgo=',
        mimeType: 'image/png',
      });
    });
  });
});
