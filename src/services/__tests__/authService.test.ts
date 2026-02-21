import { describe, it, expect } from 'vitest';
import { getAuthToken } from '../authService';

describe('authService', () => {
  describe('getAuthToken', () => {
    it('should always return null (cookie-based auth via Better Auth)', async () => {
      const token = await getAuthToken();
      expect(token).toBeNull();
    });
  });
});
