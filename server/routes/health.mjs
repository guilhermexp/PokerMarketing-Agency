import { getSql } from "../lib/db.mjs";
import { userIdCache } from "../lib/user-resolver.mjs";
import { csrfProtection } from "../middleware/csrfProtection.mjs";
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

  // CSRF token endpoint
  // Returns the CSRF token for client-side usage
  // The csrfProtection middleware automatically generates and sets the token
  app.get("/api/csrf-token", csrfProtection, (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({ csrfToken: req.csrfToken });
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
