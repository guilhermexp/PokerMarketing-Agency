import { getSql } from "../lib/db.mjs";
import { userIdCache } from "../lib/user-resolver.mjs";
import { generateCsrfToken } from "../lib/csrf.mjs";
import { requireSuperAdmin } from "../lib/auth.mjs";
import { DatabaseError } from "../lib/errors/index.mjs";
import logger from "../lib/logger.mjs";

export function registerHealthRoutes(app) {
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/db/health", async (req, res) => {
    try {
      const sql = getSql();
      await sql`SELECT 1`;
      res.json({ status: "healthy", timestamp: new Date().toISOString() });
    } catch (error) {
      throw new DatabaseError("Database health check failed", error);
    }
  });

  // CSRF token endpoint — the ONLY place new tokens are generated.
  // Protected-prefix GET requests no longer generate tokens to prevent
  // race conditions when parallel requests arrive without a cookie.
  app.get("/api/csrf-token", (req, res) => {
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
  app.get("/api/db/stats", requireSuperAdmin, (req, res) => {
    res.json({
      cachedUserIds: userIdCache.size,
      timestamp: new Date().toISOString(),
    });
  });

  // Reset stats (super admin only)
  app.post("/api/db/stats/reset", requireSuperAdmin, (req, res) => {
    userIdCache.clear();
    logger.info({}, "[STATS] Cache reset");
    res.json({ success: true, message: "Stats reset" });
  });
}
