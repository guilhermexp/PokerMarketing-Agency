import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteApp } from "./helpers/create-route-app";

const sqlMock = vi.fn();
const getSqlMock = vi.fn(() => sqlMock);

vi.mock("../../server/lib/db.js", () => ({
  getSql: getSqlMock,
}));

describe("health routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockReset();
    getSqlMock.mockClear();
  });

  it("returns health payload for /health", async () => {
    const { registerHealthRoutes } = await import("../../server/routes/health.js");
    const app = createRouteApp(registerHealthRoutes);

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.error).toBeNull();
    expect(response.body.data.status).toBe("ok");
    expect(response.body.data.timestamp).toBeTypeOf("string");
  });

  it("returns database health error envelope when sql fails", async () => {
    sqlMock.mockRejectedValueOnce(new Error("db down"));

    const { registerHealthRoutes } = await import("../../server/routes/health.js");
    const app = createRouteApp(registerHealthRoutes);

    const response = await request(app).get("/api/db/health");

    expect(response.status).toBe(500);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe("Database health check failed");
  });

  it("rate limits csrf token requests after 50 requests per minute per IP", async () => {
    const { registerHealthRoutes } = await import("../../server/routes/health.js");
    const app = createRouteApp(registerHealthRoutes);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await request(app).get("/api/csrf-token");
      expect(response.status).toBe(200);
    }

    const limitedResponse = await request(app).get("/api/csrf-token");

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body.error.message).toContain("Rate limit exceeded");
  });
});
