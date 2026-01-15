import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSuperAdmin } from '../useSuperAdmin';

const mockUseUser = vi.fn();
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => mockUseUser(),
}));

describe('useSuperAdmin', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPER_ADMIN_EMAILS', 'admin@example.com,superuser@test.com');
  });

  it('should return loading state when user not loaded', () => {
    mockUseUser.mockReturnValue({ user: null, isLoaded: false });
    const { result } = renderHook(() => useSuperAdmin());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isSuperAdmin).toBe(false);
  });

  it('should identify super admin by email', () => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'admin@example.com' } },
      isLoaded: true,
    });

    const { result } = renderHook(() => useSuperAdmin());
    expect(result.current.isSuperAdmin).toBe(true);
  });

  it('should not identify regular user as admin', () => {
    mockUseUser.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'regular@example.com' } },
      isLoaded: true,
    });

    const { result } = renderHook(() => useSuperAdmin());
    expect(result.current.isSuperAdmin).toBe(false);
  });
});
