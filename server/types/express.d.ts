import type { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      // Better Auth session (set by session extraction middleware)
      authSession: {
        session: {
          id: string;
          userId: string;
          expiresAt: Date;
          activeOrganizationId?: string | null;
        };
        user: {
          id: string;
          email: string;
          name: string | null;
          image?: string | null;
        };
      } | null;

      // Resolved auth context (set by requireAuthenticatedRequest)
      authUserId?: string;
      authOrgId?: string | null;

      // Internal API auth (server-to-server)
      internalAuth?: {
        userId: string;
        orgId: string | null;
      };

      // CSRF token (set by csrfProtection middleware)
      csrfToken?: string;
      skipCsrfProtection?: boolean;

      // Request ID (set by requestLogger middleware)
      id?: string;

      // Pino child logger (set by pino-http)
      log?: Logger;

      // Admin email (set by requireSuperAdmin middleware)
      adminEmail?: string;
    }
  }
}

export {};
