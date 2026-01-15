/**
 * API Client - Base HTTP client
 *
 * Provides core fetch functionality with retry logic, error handling,
 * and typed responses. Used by all domain-specific API modules.
 */

export const API_BASE = '/api/db';
export const AI_API_BASE = '/api/ai';

// =============================================================================
// Response Types
// =============================================================================

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// =============================================================================
// Core Fetch Function
// =============================================================================

/**
 * Generic fetch wrapper with retry logic for GET requests
 * @param endpoint - API endpoint (relative to API_BASE)
 * @param options - Fetch options
 * @returns Parsed JSON response
 */
export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const canRetry = method === 'GET';
  const maxAttempts = canRetry ? 2 : 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
      if (!canRetry || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw lastError;
}

/**
 * Fetch wrapper for AI API endpoints with optional auth token
 * @param endpoint - API endpoint (relative to AI_API_BASE)
 * @param options - Fetch options
 * @param getToken - Optional function to get auth token
 * @returns Parsed JSON response
 */
export async function fetchAiApi<T>(
  endpoint: string,
  options: RequestInit = {},
  getToken?: () => Promise<string | null>,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add auth token if available
  if (getToken) {
    const token = await getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${AI_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert a video URL to a display-safe URL
 * With COEP: credentialless, we can use the original URL directly
 */
export function getVideoDisplayUrl(url: string): string {
  return url;
}
