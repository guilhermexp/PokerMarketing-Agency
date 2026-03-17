import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteApp } from "./helpers/create-route-app";

describe("init routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns bootstrap payload when init queries succeed", async () => {
    const resolveUserIdMock = vi.fn().mockResolvedValue("db-user-1");
    const queryResults = [
      [{ id: "brand-1", name: "Brand" }],
      [{ id: "gallery-1", src_url: "https://cdn.example.com/image.png" }],
      [{ id: "post-1", scheduled_timestamp: Date.now() }],
      [{ id: "campaign-1", name: "Campaign" }],
      [{ id: "schedule-1", name: "Week 1" }],
    ];
    const sqlMock = vi.fn(async () => queryResults.shift() ?? []);

    vi.doMock("../../server/lib/db.js", () => ({
      getSql: () => sqlMock,
    }));
    vi.doMock("../../server/lib/user-resolver.js", () => ({
      resolveUserId: resolveUserIdMock,
    }));
    vi.doMock("../../server/lib/logger.js", () => ({
      default: { debug: vi.fn() },
    }));

    const { registerInitRoutes } = await import("../../server/routes/init.mjs");
    const app = createRouteApp(registerInitRoutes);

    const response = await request(app).get("/api/db/init").query({
      user_id: "auth-user-1",
    });

    expect(response.status).toBe(200);
    expect(response.body.error).toBeNull();
    expect(response.body.data.brandProfile?.id).toBe("brand-1");
    expect(response.body.data.gallery).toHaveLength(1);
    expect(response.body.data.scheduledPosts).toHaveLength(1);
    expect(response.body.data.campaigns).toHaveLength(1);
    expect(response.body.data.schedulesList).toHaveLength(1);
    expect(response.body.data._meta.queriesExecuted).toBe(5);
  });

  it("returns empty bootstrap payload when user cannot be resolved", async () => {
    const resolveUserIdMock = vi.fn().mockResolvedValue(null);
    const sqlMock = vi.fn();

    vi.doMock("../../server/lib/db.js", () => ({
      getSql: () => sqlMock,
    }));
    vi.doMock("../../server/lib/user-resolver.js", () => ({
      resolveUserId: resolveUserIdMock,
    }));
    vi.doMock("../../server/lib/logger.js", () => ({
      default: { debug: vi.fn() },
    }));

    const { registerInitRoutes } = await import("../../server/routes/init.mjs");
    const app = createRouteApp(registerInitRoutes);

    const response = await request(app).get("/api/db/init").query({
      user_id: "missing-user",
    });

    expect(response.status).toBe(200);
    expect(response.body.error).toBeNull();
    expect(response.body.data.brandProfile).toBeNull();
    expect(response.body.data.gallery).toEqual([]);
    expect(response.body.data.scheduledPosts).toEqual([]);
    expect(response.body.data.campaigns).toEqual([]);
  });
});
