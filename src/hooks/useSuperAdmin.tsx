/**
 * Super Admin Hook
 * Verifies if the current user is a super admin based on email
 */

import { useAuth, useUser } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';


export interface SuperAdminState {
  isSuperAdmin: boolean;
  isLoading: boolean;
  userEmail: string | null;
}

export function useSuperAdmin(): SuperAdminState {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [state, setState] = useState<SuperAdminState>({
    isSuperAdmin: false,
    isLoading: true,
    userEmail: null,
  });

  useEffect(() => {
    let cancelled = false;

    const verifySuperAdmin = async () => {
      if (!isLoaded) {
        return;
      }

      const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || null;

      if (!user) {
        if (!cancelled) {
          setState({ isSuperAdmin: false, isLoading: false, userEmail: null });
        }
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) {
            setState({ isSuperAdmin: false, isLoading: false, userEmail });
          }
          return;
        }

        const response = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!cancelled) {
          setState({
            isSuperAdmin: response.ok,
            isLoading: false,
            userEmail,
          });
        }
      } catch {
        if (!cancelled) {
          setState({ isSuperAdmin: false, isLoading: false, userEmail });
        }
      }
    };

    verifySuperAdmin();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, user]);

  return state;
}

export default useSuperAdmin;
