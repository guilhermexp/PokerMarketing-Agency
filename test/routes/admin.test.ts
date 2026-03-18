import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResponseEnvelopeMiddleware } from "../../server/lib/response-middleware.js";
import { errorHandler } from "../../server/middleware/errorHandler.js";

function createAdminApp(
  registerRoutes: (app: Express) => void,
  email = "admin@example.com",
) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.authSession = {
      user: {
        id: "auth-admin-1",
        email,
      },
      session: {},
    };
    next();
  });
  app.use(createResponseEnvelopeMiddleware());

  registerRoutes(app);
  app.use(errorHandler);

  return app;
}

describe("admin routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SUPER_ADMIN_EMAILS = "admin@example.com";
  });

  it("logs denied admin access attempts for non-super-admin emails", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    vi.doMock("../../server/lib/logger.js", () => ({
      default: logger,
      rawLogger: logger,
    }));

    const { requireSuperAdmin } = await import("../../server/lib/auth.js");
    const app = express();
    app.use((req, _res, next) => {
      req.authSession = {
        user: {
          id: "user-2",
          email: "member@example.com",
        },
        session: {},
      };
      next();
    });
    app.use(createResponseEnvelopeMiddleware());
    app.get("/admin-probe", requireSuperAdmin, (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);

    const response = await request(app).get("/admin-probe");

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe("Access denied. Super admin only.");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-2...",
        userEmail: "***@example.com",
      }),
      "[Admin] Access denied for super admin endpoint",
    );
  });

  it("rate limits admin routes after 30 requests per minute per user", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const statsResults = [
      [{ count: "10" }],
      [{ count: "3" }],
      [{ count: "6" }],
      [{ count: "8", pending: "2" }],
      [{ count: "12" }],
      [{ total_cost: "99", total_requests: "14" }],
      [{ count: "1" }],
      [{ count: "4" }],
    ];
    let statsCallIndex = 0;
    const sqlMock = vi.fn(() =>
      Promise.resolve(statsResults[statsCallIndex++ % statsResults.length]),
    );

    vi.doMock("../../server/lib/logger.js", () => ({
      default: logger,
      rawLogger: logger,
    }));
    vi.doMock("../../server/lib/db.js", () => ({
      getSql: () => sqlMock,
    }));

    const { registerAdminRoutes } = await import("../../server/routes/admin.js");
    const app = createAdminApp(registerAdminRoutes);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await request(app).get("/api/admin/stats");
      expect(response.status).toBe(200);
    }

    const limitedResponse = await request(app).get("/api/admin/stats");

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body.error.message).toContain("Rate limit exceeded");
  });

  it("emits structured audit logs for successful admin actions", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const statsResults = [
      [{ count: "10" }],
      [{ count: "3" }],
      [{ count: "6" }],
      [{ count: "8", pending: "2" }],
      [{ count: "12" }],
      [{ total_cost: "99", total_requests: "14" }],
      [{ count: "1" }],
      [{ count: "4" }],
    ];
    let statsCallIndex = 0;
    const sqlMock = vi.fn(() =>
      Promise.resolve(statsResults[statsCallIndex++ % statsResults.length]),
    );

    vi.doMock("../../server/lib/logger.js", () => ({
      default: logger,
      rawLogger: logger,
    }));
    vi.doMock("../../server/lib/db.js", () => ({
      getSql: () => sqlMock,
    }));

    const { registerAdminRoutes } = await import("../../server/routes/admin.js");
    const app = createAdminApp(registerAdminRoutes);

    const response = await request(app).get("/api/admin/stats");

    expect(response.status).toBe(200);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        adminAction: "admin.stats.view",
        adminEmail: "admin@example.com",
        adminUserId: "auth-admin-1",
        method: "GET",
        path: "/api/admin/stats",
      }),
      "[Admin] Action completed",
    );
  });
});
