import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAuthToken } from '../authService';
import type { WindowWithClerk } from '../../__tests__/test-utils';
import { createMockClerk } from '../../__tests__/test-utils';

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as WindowWithClerk).Clerk;
  });

  describe('getAuthToken', () => {
    it('should return null when Clerk is not available', async () => {
      const token = await getAuthToken();
      expect(token).toBeNull();
    });

    it('should return token when Clerk session is available', async () => {
      const mockToken = 'test-auth-token-123';
      (window as WindowWithClerk).Clerk = createMockClerk(mockToken);

      const token = await getAuthToken();
      expect(token).toBe(mockToken);
      expect(window.Clerk?.session?.getToken).toHaveBeenCalled();
    });

    it('should return null when getToken throws an error', async () => {
      const mockClerk = createMockClerk();
      mockClerk.session!.getToken.mockRejectedValue(new Error('Token error'));
      (window as WindowWithClerk).Clerk = mockClerk;

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const token = await getAuthToken();

      expect(token).toBeNull();
      consoleWarnSpy.mockRestore();
    });
  });
});
