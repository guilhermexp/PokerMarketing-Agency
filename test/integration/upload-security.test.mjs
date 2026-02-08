import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Integration tests for /api/upload security - dangerous content-type rejection
 *
 * These tests verify that the /api/upload endpoint properly rejects dangerous
 * content types (HTML, SVG, JavaScript, executables) that could lead to XSS
 * or code injection attacks.
 *
 * Security context:
 * - Files uploaded to Vercel Blob have 'public' access
 * - Malicious files served from trusted domain enable sophisticated attacks
 * - HTML files can contain embedded JavaScript (stored XSS)
 * - SVG files can contain script payloads
 * - Executables pose direct security risk
 */

describe('/api/upload security', () => {
  const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001';
  const UPLOAD_ENDPOINT = `${API_BASE_URL}/api/upload`;

  // Helper to create base64 encoded test data
  const createTestData = (content = 'test') => {
    return Buffer.from(content).toString('base64');
  };

  // Helper to make upload request
  const uploadFile = async (filename, contentType, data = null) => {
    const response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename,
        contentType,
        data: data || createTestData(),
      }),
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  };

  describe('dangerous content-type rejection (XSS/code injection)', () => {
    it('should reject text/html (stored XSS risk)', async () => {
      const result = await uploadFile('malicious.html', 'text/html');

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      expect(result.body.error).toContain('Invalid content type: text/html');
      expect(result.body.error).toContain('Allowed types:');
    });

    it('should reject image/svg+xml (JavaScript in SVG)', async () => {
      const result = await uploadFile('malicious.svg', 'image/svg+xml');

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      expect(result.body.error).toContain('Invalid content type: image/svg+xml');
    });

    it('should reject text/javascript (code injection)', async () => {
      const result = await uploadFile('malicious.js', 'text/javascript');

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      expect(result.body.error).toContain('Invalid content type: text/javascript');
    });

    it('should reject application/javascript (code injection)', async () => {
      const result = await uploadFile('malicious.js', 'application/javascript');

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      expect(result.body.error).toContain('Invalid content type: application/javascript');
    });

    it('should reject application/x-msdownload (executable)', async () => {
      const result = await uploadFile('malicious.exe', 'application/x-msdownload');

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      expect(result.body.error).toContain('Invalid content type: application/x-msdownload');
    });

    it('should reject application/octet-stream (executable)', async () => {
      const result = await uploadFile('malicious.bin', 'application/octet-stream');

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      expect(result.body.error).toContain('Invalid content type: application/octet-stream');
    });

    it('should reject text/html with embedded XSS payload', async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      const data = createTestData(xssPayload);
      const result = await uploadFile('xss.html', 'text/html', data);

      expect(result.status).toBe(400);
      expect(result.body.error).toContain('Invalid content type: text/html');
    });

    it('should reject SVG with script element', async () => {
      const svgWithScript = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <script>alert('XSS')</script>
        </svg>
      `;
      const data = createTestData(svgWithScript);
      const result = await uploadFile('xss.svg', 'image/svg+xml', data);

      expect(result.status).toBe(400);
      expect(result.body.error).toContain('Invalid content type: image/svg+xml');
    });
  });

  describe('allowed content types (should pass validation)', () => {
    // Note: These tests verify validation passes, but may fail due to missing
    // authentication or database setup. The key is that validation succeeds
    // (no 400 error with "Invalid content type" message).

    it('should accept image/jpeg', async () => {
      const result = await uploadFile('test.jpg', 'image/jpeg');

      // Should not be validation error (400 with "Invalid content type")
      // May fail for other reasons (auth, storage), but validation should pass
      if (result.status === 400) {
        expect(result.body.error).not.toContain('Invalid content type: image/jpeg');
      }
    });

    it('should accept image/png', async () => {
      const result = await uploadFile('test.png', 'image/png');

      if (result.status === 400) {
        expect(result.body.error).not.toContain('Invalid content type: image/png');
      }
    });

    it('should accept image/webp', async () => {
      const result = await uploadFile('test.webp', 'image/webp');

      if (result.status === 400) {
        expect(result.body.error).not.toContain('Invalid content type: image/webp');
      }
    });

    it('should accept image/gif', async () => {
      const result = await uploadFile('test.gif', 'image/gif');

      if (result.status === 400) {
        expect(result.body.error).not.toContain('Invalid content type: image/gif');
      }
    });

    it('should accept video/mp4', async () => {
      const result = await uploadFile('test.mp4', 'video/mp4');

      if (result.status === 400) {
        expect(result.body.error).not.toContain('Invalid content type: video/mp4');
      }
    });

    it('should accept video/webm', async () => {
      const result = await uploadFile('test.webm', 'video/webm');

      if (result.status === 400) {
        expect(result.body.error).not.toContain('Invalid content type: video/webm');
      }
    });
  });

  describe('edge cases', () => {
    it('should reject missing content type', async () => {
      const response = await fetch(UPLOAD_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: 'test.jpg',
          data: createTestData(),
          // contentType is missing
        }),
      });

      const result = {
        status: response.status,
        body: await response.json(),
      };

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      expect(result.body.error).toContain('Missing required fields');
    });

    it('should reject empty content type', async () => {
      const result = await uploadFile('test.jpg', '');

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      // Either validation error or missing fields error
      expect(
        result.body.error.includes('Content type is required') ||
        result.body.error.includes('Missing required fields')
      ).toBe(true);
    });

    it('should reject case-variant content types (IMAGE/JPEG)', async () => {
      const result = await uploadFile('test.jpg', 'IMAGE/JPEG');

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      expect(result.body.error).toContain('Invalid content type: IMAGE/JPEG');
    });

    it('should reject content type with parameters', async () => {
      const result = await uploadFile('test.jpg', 'image/jpeg; charset=utf-8');

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      expect(result.body.error).toContain('Invalid content type');
    });
  });

  describe('error message quality', () => {
    it('should provide helpful error with list of allowed types', async () => {
      const result = await uploadFile('bad.html', 'text/html');

      expect(result.status).toBe(400);
      expect(result.body.error).toContain('Invalid content type: text/html');
      expect(result.body.error).toContain('Allowed types:');
      expect(result.body.error).toContain('image/jpeg');
      expect(result.body.error).toContain('image/png');
      expect(result.body.error).toContain('video/mp4');
    });
  });
});
