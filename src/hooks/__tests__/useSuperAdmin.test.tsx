import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSuperAdmin } from '../useSuperAdmin';

const mockUseUser = vi.fn();
const mockGetAuthToken = vi.fn();

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => mockUseUser(),
}));

vi.mock('../../services/authService', () => ({
  getAuthToken: () => mockGetAuthToken(),
}));

describe('useSuperAdmin', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return loading state when user not loaded', () => {
    mockUseUser.mockReturnValue({ user: null, isLoaded: false });
    const { result } = renderHook(() => useSuperAdmin());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isSuperAdmin).toBe(false);
  });

  it('should return not admin when no user', async () => {
    mockUseUser.mockReturnValue({ user: null, isLoaded: true });
    const { result } = renderHook(() => useSuperAdmin());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSuperAdmin).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should identify super admin via API', async () => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'admin@example.com' } },
      isLoaded: true,
    });
    mockGetAuthToken.mockResolvedValue('mock-token');
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ isSuperAdmin: true }),
    });

    const { result } = renderHook(() => useSuperAdmin());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSuperAdmin).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/check-super-admin', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-token',
      },
    });
  });

  it('should identify regular user via API', async () => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'regular@example.com' } },
      isLoaded: true,
    });
    mockGetAuthToken.mockResolvedValue('mock-token');
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ isSuperAdmin: false }),
    });

    const { result } = renderHook(() => useSuperAdmin());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSuperAdmin).toBe(false);
  });

  it('should handle API failure gracefully', async () => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'admin@example.com' } },
      isLoaded: true,
    });
    mockGetAuthToken.mockResolvedValue('mock-token');
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useSuperAdmin());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSuperAdmin).toBe(false);
  });

  it('should handle fetch exception gracefully', async () => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'admin@example.com' } },
      isLoaded: true,
    });
    mockGetAuthToken.mockResolvedValue('mock-token');
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSuperAdmin());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSuperAdmin).toBe(false);
  });

  it('should include authorization header when token is available', async () => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'admin@example.com' } },
      isLoaded: true,
    });
    mockGetAuthToken.mockResolvedValue('mock-token');
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ isSuperAdmin: true }),
    });

    renderHook(() => useSuperAdmin());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/check-super-admin', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
      });
    });
  });

  it('should handle missing token gracefully', async () => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'admin@example.com' } },
      isLoaded: true,
    });
    mockGetAuthToken.mockResolvedValue(null);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ isSuperAdmin: false }),
    });

    renderHook(() => useSuperAdmin());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/check-super-admin', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  });
});
