/**
 * Admin Authentication Middleware
 * Ensures only super admins can access admin endpoints
 */

import type { VercelRequest } from '@vercel/node';
import { requireAuth, getSql, type AuthContext } from '../../db/_helpers/index.js';

// Super admin emails from environment variable
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '').split(',').filter(Boolean);

export class SuperAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuperAdminError';
  }
}

export interface AdminContext extends AuthContext {
  email: string;
  isSuperAdmin: true;
}

/**
 * Check if an email is a super admin
 */
export function isSuperAdminEmail(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Require super admin access for an endpoint
 * Throws SuperAdminError if not authorized
 */
export async function requireSuperAdmin(req: VercelRequest): Promise<AdminContext> {
  // First, require normal authentication
  const auth = await requireAuth(req);

  // Get user email from database
  const sql = getSql();
  const users = await sql`
    SELECT email FROM users
    WHERE id = ${auth.userId}
    LIMIT 1
  `;

  if (!users[0]) {
    throw new SuperAdminError('User not found');
  }

  const email = users[0].email as string;

  // Check if email is in super admin list
  if (!isSuperAdminEmail(email)) {
    throw new SuperAdminError('Super admin access required');
  }

  return {
    ...auth,
    email,
    isSuperAdmin: true,
  };
}

/**
 * Helper to handle admin authentication errors
 */
export function handleAdminAuthError(error: unknown): { status: number; message: string } {
  if (error instanceof SuperAdminError) {
    return { status: 403, message: error.message };
  }

  if (error instanceof Error && error.name === 'AuthenticationError') {
    return { status: 401, message: error.message };
  }

  return { status: 500, message: 'Internal server error' };
}
