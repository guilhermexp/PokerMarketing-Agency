import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAuthToken } from '../authService';

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).Clerk;
  });

  describe('getAuthToken', () => {
    it('should return null when Clerk is not available', async () => {
      const token = await getAuthToken();
      expect(token).toBeNull();
    });

    it('should return token when Clerk session is available', async () => {
      const mockToken = 'test-auth-token-123';
      (window as any).Clerk = {
        session: {
          getToken: vi.fn().mockResolvedValue(mockToken),
        },
      };

      const token = await getAuthToken();
      expect(token).toBe(mockToken);
      expect(window.Clerk?.session?.getToken).toHaveBeenCalled();
    });

    it('should return null when getToken throws an error', async () => {
      (window as any).Clerk = {
        session: {
          getToken: vi.fn().mockRejectedValue(new Error('Token error')),
        },
      };

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const token = await getAuthToken();
      
      expect(token).toBeNull();
      consoleWarnSpy.mockRestore();
    });
  });
});
