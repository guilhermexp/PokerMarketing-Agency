/**
 * Super Admin Hook
 * Verifies if the current user is a super admin based on email
 */

import { authClient } from '../lib/auth-client';
import { useEffect, useState } from 'react';


export interface SuperAdminState {
  isSuperAdmin: boolean;
  isLoading: boolean;
  userEmail: string | null;
}

export function useSuperAdmin(): SuperAdminState {
  const { data: sessionData, isPending } = authClient.useSession();
  const [state, setState] = useState<SuperAdminState>({
    isSuperAdmin: false,
    isLoading: true,
    userEmail: null,
  });

  useEffect(() => {
    let cancelled = false;

    const verifySuperAdmin = async () => {
      if (isPending) {
        return;
      }

      const user = sessionData?.user;
      const userEmail = user?.email?.toLowerCase() || null;

      if (!user) {
        if (!cancelled) {
          setState({ isSuperAdmin: false, isLoading: false, userEmail: null });
        }
        return;
      }

      try {
        // Better Auth uses cookies — no explicit token needed
        const response = await fetch('/api/admin/stats', {
          credentials: 'include',
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
  }, [isPending, sessionData]);

  return state;
}

export default useSuperAdmin;
