import type { Express } from "express";
import { getSql } from "../lib/db.js";
import { userIdCache } from "../lib/user-resolver.js";
import { generateCsrfToken } from "../lib/csrf.js";
import { createRateLimitMiddleware, requireSuperAdmin } from "../lib/auth.js";
import { DatabaseError } from "../lib/errors/index.js";
import logger from "../lib/logger.js";

function toOriginalError(error: unknown): { code?: string; message: string } | null {
  if (error instanceof Error) {
    const maybeCode = "code" in error && typeof error.code === "string"
      ? { code: error.code, message: error.message }
      : { message: error.message };
    return maybeCode;
  }
  return null;
}

export function registerHealthRoutes(app: Express): void {
  const csrfTokenRateLimit = createRateLimitMiddleware(50, 60_000, "public:csrf-token");

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/db/health", async (_req, res) => {
    try {
      const sql = getSql();
      await sql`SELECT 1`;
      res.json({ status: "healthy", timestamp: new Date().toISOString() });
    } catch (error) {
      throw new DatabaseError("Database health check failed", toOriginalError(error));
    }
  });

  // CSRF token endpoint — the ONLY place new tokens are generated.
  // Protected-prefix GET requests no longer generate tokens to prevent
  // race conditions when parallel requests arrive without a cookie.
  app.get("/api/csrf-token", csrfTokenRateLimit, (req, res) => {
    const isProduction = process.env.NODE_ENV === "production";

    // Reuse existing cookie token if available, otherwise generate new one
    let token = req.cookies?.csrf_token || null;
    if (!token) {
      token = generateCsrfToken();
    }

    res.cookie("csrf_token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-CSRF-Token", token);
    res.json({ csrfToken: token });
  });

  // ============================================================================
  // DEBUG: Stats endpoint to monitor database usage (super admin only)
  // ============================================================================
  app.get("/api/db/stats", requireSuperAdmin, (_req, res) => {
    res.json({
      cachedUserIds: userIdCache.size,
      timestamp: new Date().toISOString(),
    });
  });

  // Reset stats (super admin only)
  app.post("/api/db/stats/reset", requireSuperAdmin, (_req, res) => {
    userIdCache.clear();
    logger.info({}, "[STATS] Cache reset");
    res.json({ success: true, message: "Stats reset" });
  });
}
