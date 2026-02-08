import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSuperAdmin } from '../useSuperAdmin';

const mockUseUser = vi.fn();
const mockUseAuth = vi.fn();
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => mockUseUser(),
  useAuth: () => mockUseAuth(),
}));

describe('useSuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    mockUseAuth.mockReturnValue({ getToken: vi.fn().mockResolvedValue('test-token') });
  });

  it('should return loading state when user not loaded', () => {
    mockUseUser.mockReturnValue({ user: null, isLoaded: false });
    const { result } = renderHook(() => useSuperAdmin());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isSuperAdmin).toBe(false);
  });

  it('should identify super admin by backend validation', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
    } as Response);

    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'admin@example.com' } },
      isLoaded: true,
    });

    const { result } = renderHook(() => useSuperAdmin());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isSuperAdmin).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/stats', {
      headers: { Authorization: 'Bearer test-token' },
    });
  });

  it('should not identify regular user as admin', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: false,
    } as Response);

    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'regular@example.com' } },
      isLoaded: true,
    });

    const { result } = renderHook(() => useSuperAdmin());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isSuperAdmin).toBe(false);
  });
});
