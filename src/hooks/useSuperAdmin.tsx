/**
 * Super Admin Hook
 * Verifies if the current user is a super admin via API
 */

import { useUser } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { getAuthToken } from '../services/authService';

export interface SuperAdminState {
  isSuperAdmin: boolean;
  isLoading: boolean;
  userEmail: string | null;
}

interface SuperAdminCheckResponse {
  isSuperAdmin: boolean;
}

export function useSuperAdmin(): SuperAdminState {
  const { user, isLoaded } = useUser();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function checkSuperAdmin() {
      // Wait for Clerk to load
      if (!isLoaded) {
        return;
      }

      // If no user, not a super admin
      if (!user) {
        if (isMounted) {
          setIsSuperAdmin(false);
          setIsLoading(false);
        }
        return;
      }

      try {
        // Get authentication token
        const token = await getAuthToken();

        // Call the API endpoint
        const response = await fetch('/api/auth/check-super-admin', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: SuperAdminCheckResponse = await response.json();

        if (isMounted) {
          setIsSuperAdmin(data.isSuperAdmin);
          setIsLoading(false);
        }
      } catch (error) {
        // On error, treat as not super admin
        if (isMounted) {
          setIsSuperAdmin(false);
          setIsLoading(false);
        }
      }
    }

    checkSuperAdmin();

    return () => {
      isMounted = false;
    };
  }, [user, isLoaded]);

  return {
    isSuperAdmin,
    isLoading,
    userEmail: user?.primaryEmailAddress?.emailAddress?.toLowerCase() || null,
  };
}

export default useSuperAdmin;
