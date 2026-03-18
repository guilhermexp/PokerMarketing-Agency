import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

vi.mock("../logger.js", () => ({
  __esModule: true,
  default: loggerMock,
}));

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.info.mockReset();
    process.env.SUPER_ADMIN_EMAILS = "owner@example.com";
  });

  it("logs denied admin attempts with who, when and what", async () => {
    vi.resetModules();
    const { requireSuperAdmin } = await import("../auth.js");

    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = {
      id: "req-1",
      method: "GET",
      path: "/api/admin/stats",
      authSession: {
        user: {
          id: "user-12345678",
          email: "member@example.com",
        },
      },
    } as unknown as Request;
    const res = {
      status,
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await requireSuperAdmin(req, res, next);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        adminAction: "admin.access.denied",
        adminEmail: "member@example.com",
        adminUserId: "user-12345678",
        method: "GET",
        path: "/api/admin/stats",
        requestId: "req-1",
        happenedAt: expect.any(String),
      }),
      "[Admin] Access denied for super admin endpoint",
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Access denied. Super admin only." });
    expect(next).not.toHaveBeenCalled();
  });
});
