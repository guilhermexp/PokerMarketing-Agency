/**
 * Auth Service - Authentication token management
 *
 * Better Auth uses cookie-based authentication.
 * Tokens are sent automatically via cookies with credentials: "include".
 * This module returns null for backward compatibility with code that calls getAuthToken().
 */

/**
 * Get authentication token
 * Returns null — Better Auth uses cookies (sent automatically with credentials: "include")
 */
export async function getAuthToken(): Promise<string | null> {
  return null;
}
