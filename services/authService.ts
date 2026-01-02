/**
 * Auth Service - Get authentication tokens from Clerk
 */

// Clerk exposes __clerk_frontend_api on the window for getting tokens
declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: () => Promise<string | null>;
      };
    };
  }
}

/**
 * Get authentication token from Clerk
 * Returns null if not authenticated
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    // Try to get token from Clerk
    if (typeof window !== "undefined" && window.Clerk?.session) {
      const token = await window.Clerk.session.getToken();
      return token;
    }
    return null;
  } catch (error) {
    console.warn("[Auth] Failed to get token:", error);
    return null;
  }
}
