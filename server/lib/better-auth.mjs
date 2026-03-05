/**
 * Better Auth Configuration
 *
 * Central auth config: email/password + organizations plugin.
 * Replaces Clerk for authentication and organization management.
 */

import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import pg from "pg";

const { Pool } = pg;
const AUTH_BASE_URL =
  process.env.BETTER_AUTH_BASE_URL ||
  process.env.BETTER_AUTH_URL ||
  process.env.APP_URL ||
  "http://localhost:3002";

const TRUSTED_ORIGINS = [
  "http://localhost:3010",
  "http://localhost:3002",
  "https://sociallab.pro",
  process.env.APP_URL,
  ...(process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()),
].filter(Boolean);

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  baseURL: AUTH_BASE_URL,
  emailAndPassword: { enabled: true },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    // Avoid stale activeOrganizationId after org switch/login auto-activation.
    // We need org context on protected API routes to be immediately consistent.
    cookieCache: { enabled: false },
  },
  trustedOrigins: [...new Set(TRUSTED_ORIGINS)],
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
    }),
  ],
});
