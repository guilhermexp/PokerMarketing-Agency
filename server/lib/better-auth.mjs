/**
 * Better Auth Configuration
 *
 * Central auth config: email/password + organizations plugin.
 * Replaces Clerk for authentication and organization management.
 */

import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import IORedis from "ioredis";
import pg from "pg";
import logger from "./logger.mjs";

const { Pool } = pg;
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || null;
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

const authDatabase = new Pool({ connectionString: process.env.DATABASE_URL });

function createRedisSecondaryStorage() {
  if (!REDIS_URL) {
    return undefined;
  }

  const redis = new IORedis(REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
  });

  redis.on("error", (error) => {
    logger.warn({ err: error }, "[Better Auth] Redis secondary storage error");
  });

  const ensureConnection = async () => {
    if (redis.status === "wait") {
      await redis.connect();
    }
  };

  return {
    async get(key) {
      await ensureConnection();
      return redis.get(key);
    },
    async set(key, value, ttl) {
      await ensureConnection();
      if (ttl && ttl > 0) {
        return redis.set(key, value, "EX", ttl);
      }
      return redis.set(key, value);
    },
    async delete(key) {
      await ensureConnection();
      return redis.del(key);
    },
  };
}

const secondaryStorage = createRedisSecondaryStorage();

export const auth = betterAuth({
  database: authDatabase,
  baseURL: AUTH_BASE_URL,
  emailAndPassword: { enabled: true },
  secondaryStorage,
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
