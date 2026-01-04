/**
 * Super Admin Hook
 * Verifies if the current user is a super admin based on email
 */

import { useUser } from '@clerk/clerk-react';
import { useMemo } from 'react';

const SUPER_ADMIN_EMAILS = (import.meta.env.VITE_SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);

export interface SuperAdminState {
  isSuperAdmin: boolean;
  isLoading: boolean;
  userEmail: string | null;
}

export function useSuperAdmin(): SuperAdminState {
  const { user, isLoaded } = useUser();

  const state = useMemo(() => {
    if (!isLoaded) {
      return {
        isSuperAdmin: false,
        isLoading: true,
        userEmail: null,
      };
    }

    const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || null;
    const isSuperAdmin = userEmail !== null && SUPER_ADMIN_EMAILS.includes(userEmail);

    return {
      isSuperAdmin,
      isLoading: false,
      userEmail,
    };
  }, [user, isLoaded]);

  return state;
}

export default useSuperAdmin;
