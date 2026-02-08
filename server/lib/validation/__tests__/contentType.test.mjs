import { describe, it, expect } from 'vitest';
import {
  validateContentType,
  ALLOWED_UPLOAD_CONTENT_TYPES,
} from '../contentType.mjs';

describe('contentType validation', () => {
  describe('ALLOWED_UPLOAD_CONTENT_TYPES', () => {
    it('should export allowed content types array', () => {
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).toBeDefined();
      expect(Array.isArray(ALLOWED_UPLOAD_CONTENT_TYPES)).toBe(true);
      expect(ALLOWED_UPLOAD_CONTENT_TYPES.length).toBeGreaterThan(0);
    });

    it('should include safe image types', () => {
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).toContain('image/jpeg');
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).toContain('image/png');
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).toContain('image/webp');
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).toContain('image/gif');
    });

    it('should include safe video types', () => {
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).toContain('video/mp4');
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).toContain('video/webm');
    });

    it('should not include dangerous types', () => {
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).not.toContain('text/html');
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).not.toContain('image/svg+xml');
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).not.toContain('text/javascript');
      expect(ALLOWED_UPLOAD_CONTENT_TYPES).not.toContain('application/javascript');
    });
  });

  describe('validateContentType', () => {
    describe('valid content types', () => {
      it('should accept image/jpeg', () => {
        expect(() => validateContentType('image/jpeg')).not.toThrow();
      });

      it('should accept image/png', () => {
        expect(() => validateContentType('image/png')).not.toThrow();
      });

      it('should accept image/webp', () => {
        expect(() => validateContentType('image/webp')).not.toThrow();
      });

      it('should accept image/heic', () => {
        expect(() => validateContentType('image/heic')).not.toThrow();
      });

      it('should accept image/heif', () => {
        expect(() => validateContentType('image/heif')).not.toThrow();
      });

      it('should accept image/gif', () => {
        expect(() => validateContentType('image/gif')).not.toThrow();
      });

      it('should accept video/mp4', () => {
        expect(() => validateContentType('video/mp4')).not.toThrow();
      });

      it('should accept video/webm', () => {
        expect(() => validateContentType('video/webm')).not.toThrow();
      });
    });

    describe('dangerous content types (XSS/code injection)', () => {
      it('should reject text/html (stored XSS)', () => {
        expect(() => validateContentType('text/html')).toThrow(
          'Invalid content type: text/html'
        );
      });

      it('should reject image/svg+xml (JavaScript in SVG)', () => {
        expect(() => validateContentType('image/svg+xml')).toThrow(
          'Invalid content type: image/svg+xml'
        );
      });

      it('should reject text/javascript (code injection)', () => {
        expect(() => validateContentType('text/javascript')).toThrow(
          'Invalid content type: text/javascript'
        );
      });

      it('should reject application/javascript (code injection)', () => {
        expect(() => validateContentType('application/javascript')).toThrow(
          'Invalid content type: application/javascript'
        );
      });

      it('should reject application/x-msdownload (executable)', () => {
        expect(() => validateContentType('application/x-msdownload')).toThrow(
          'Invalid content type: application/x-msdownload'
        );
      });

      it('should reject application/octet-stream (executable)', () => {
        expect(() => validateContentType('application/octet-stream')).toThrow(
          'Invalid content type: application/octet-stream'
        );
      });
    });

    describe('edge cases', () => {
      it('should reject null content type', () => {
        expect(() => validateContentType(null)).toThrow(
          'Content type is required'
        );
      });

      it('should reject undefined content type', () => {
        expect(() => validateContentType(undefined)).toThrow(
          'Content type is required'
        );
      });

      it('should reject empty string', () => {
        expect(() => validateContentType('')).toThrow(
          'Content type is required'
        );
      });

      it('should provide helpful error message with allowed types', () => {
        try {
          validateContentType('text/html');
        } catch (error) {
          expect(error.message).toContain('Invalid content type: text/html');
          expect(error.message).toContain('Allowed types:');
          expect(error.message).toContain('image/jpeg');
          expect(error.message).toContain('image/png');
        }
      });
    });

    describe('case sensitivity', () => {
      it('should reject uppercase MIME types', () => {
        expect(() => validateContentType('IMAGE/JPEG')).toThrow(
          'Invalid content type: IMAGE/JPEG'
        );
      });

      it('should reject mixed case MIME types', () => {
        expect(() => validateContentType('Image/Jpeg')).toThrow(
          'Invalid content type: Image/Jpeg'
        );
      });
    });

    describe('MIME type variations', () => {
      it('should reject MIME types with charset', () => {
        expect(() => validateContentType('image/jpeg; charset=utf-8')).toThrow(
          'Invalid content type: image/jpeg; charset=utf-8'
        );
      });

      it('should reject MIME types with parameters', () => {
        expect(() => validateContentType('image/png; name=test.png')).toThrow(
          'Invalid content type: image/png; name=test.png'
        );
      });
    });
  });
});
