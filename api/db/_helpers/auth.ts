/**
 * Authentication helpers for Vercel Serverless Functions
 * Validates Clerk JWT tokens and extracts user context
 */

import type { VercelRequest } from '@vercel/node';
import { verifyToken } from '@clerk/backend';

export interface AuthContext {
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
  isAuthenticated: boolean;
}

/**
 * Extract and verify the authentication context from a request
 * Returns userId, orgId, and orgRole from the Clerk JWT
 */
export async function getAuthContext(req: VercelRequest): Promise<AuthContext> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      userId: null,
      orgId: null,
      orgRole: null,
      isAuthenticated: false,
    };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      console.warn('[Auth] CLERK_SECRET_KEY not configured');
      return {
        userId: null,
        orgId: null,
        orgRole: null,
        isAuthenticated: false,
      };
    }

    const payload = await verifyToken(token, { secretKey });

    return {
      userId: payload.sub || null,
      orgId: (payload as any).org_id || null,
      orgRole: (payload as any).org_role || null,
      isAuthenticated: true,
    };
  } catch (error) {
    console.warn('[Auth] Token verification failed:', error);
    return {
      userId: null,
      orgId: null,
      orgRole: null,
      isAuthenticated: false,
    };
  }
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(req: VercelRequest): Promise<AuthContext> {
  const auth = await getAuthContext(req);

  if (!auth.isAuthenticated || !auth.userId) {
    throw new AuthenticationError('Authentication required');
  }

  return auth;
}

/**
 * Custom error class for authentication failures
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Custom error class for authorization failures
 */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}
