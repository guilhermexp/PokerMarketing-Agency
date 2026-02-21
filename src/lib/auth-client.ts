/**
 * Better Auth Client
 *
 * Client-side auth with React hooks and organization support.
 * Replaces @clerk/clerk-react.
 */

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.DEV ? "http://localhost:3002" : window.location.origin,
  plugins: [organizationClient()],
});

export type Session = typeof authClient.$Infer.Session;
