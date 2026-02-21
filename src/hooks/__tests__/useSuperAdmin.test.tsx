import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSuperAdmin } from '../useSuperAdmin';

const mockUseSession = vi.fn();
vi.mock('../../lib/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
  },
}));

describe('useSuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should return loading state when session is pending', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    const { result } = renderHook(() => useSuperAdmin());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isSuperAdmin).toBe(false);
  });

  it('should identify super admin by backend validation', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
    } as Response);

    mockUseSession.mockReturnValue({
      data: { user: { id: 'user1', email: 'admin@example.com', name: 'Admin' } },
      isPending: false,
    });

    const { result } = renderHook(() => useSuperAdmin());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSuperAdmin).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/stats', {
      credentials: 'include',
    });
  });

  it('should not identify regular user as admin', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: false,
    } as Response);

    mockUseSession.mockReturnValue({
      data: { user: { id: 'user2', email: 'regular@example.com', name: 'Regular' } },
      isPending: false,
    });

    const { result } = renderHook(() => useSuperAdmin());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isSuperAdmin).toBe(false);
  });
});
