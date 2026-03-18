import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteApp } from "./helpers/create-route-app";

function createNoopMiddleware() {
  return (_req: Request, _res: Response, next: NextFunction) => {
    next();
  };
}

describe("pending validation routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects invalid admin users query params", async () => {
    vi.doMock("../../server/lib/auth.js", () => ({
      requireSuperAdmin: createNoopMiddleware(),
      createRateLimitMiddleware: () => createNoopMiddleware(),
    }));
    vi.doMock("../../server/lib/db.js", () => ({
      getSql: vi.fn(() => {
        throw new Error("db should not be called");
      }),
    }));

    const { registerAdminRoutes } = await import("../../server/routes/admin.js");
    const app = createRouteApp(registerAdminRoutes);

    const response = await request(app).get("/api/admin/users").query({
      limit: "abc",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
  });

  it("rejects invalid agent studio content-search params", async () => {
    vi.doMock("../../server/lib/auth.js", () => ({
      getRequestAuthContext: vi.fn(() => ({ userId: "auth-user-1", orgId: null })),
    }));
    vi.doMock("../../server/lib/db.js", () => ({
      getSql: vi.fn(() => {
        throw new Error("db should not be called");
      }),
    }));

    const { registerAgentStudioRoutes } = await import("../../server/routes/agent-studio.js");
    const app = createRouteApp(registerAgentStudioRoutes);

    const response = await request(app).get("/api/agent/studio/content-search").query({
      type: "invalid",
      limit: "abc",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
  });

  it("rejects invalid ai assistant payloads before handler execution", async () => {
    vi.doMock("../../server/lib/auth.js", () => ({
      getRequestAuthContext: vi.fn(() => ({ userId: "auth-user-1", orgId: null })),
      requireAuthWithAiRateLimit: createNoopMiddleware(),
    }));

    const { registerAiAssistantRoutes } = await import("../../server/routes/ai-assistant.js");
    const app = createRouteApp(registerAiAssistantRoutes);

    const response = await request(app).post("/api/ai/assistant").send({
      history: "invalid",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
  });

  it("rejects invalid ai campaign payloads before generation", async () => {
    vi.doMock("../../server/lib/auth.js", () => ({
      getRequestAuthContext: vi.fn(() => ({ userId: "auth-user-1", orgId: null })),
    }));

    const { registerAiCampaignRoutes } = await import("../../server/routes/ai-campaign.js");
    const app = createRouteApp(registerAiCampaignRoutes);

    const response = await request(app).post("/api/ai/campaign").send({
      brandProfile: "invalid",
      transcript: 42,
      options: null,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
  });

  it("rejects invalid ai image async jobs query params", async () => {
    vi.doMock("../../server/lib/auth.js", () => ({
      getRequestAuthContext: vi.fn(() => ({ userId: "auth-user-1", orgId: null })),
    }));
    vi.doMock("../../server/lib/db.js", () => ({
      getSql: vi.fn(() => ({})),
    }));

    const { registerAiImageRoutes } = await import("../../server/routes/ai-image.js");
    const app = createRouteApp(registerAiImageRoutes);

    const response = await request(app).get("/api/ai/image/async/jobs").query({
      limit: "abc",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
  });

  it("rejects invalid ai text payloads before generation", async () => {
    vi.doMock("../../server/lib/auth.js", () => ({
      getRequestAuthContext: vi.fn(() => ({ userId: "auth-user-1", orgId: null })),
    }));

    const { registerAiTextRoutes } = await import("../../server/routes/ai-text.js");
    const app = createRouteApp(registerAiTextRoutes);

    const response = await request(app).post("/api/ai/text").send({
      brandProfile: "invalid",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
  });

  it("rejects invalid image playground batches query params", async () => {
    const { registerImagePlaygroundRoutes } = await import("../../server/routes/image-playground.js");
    const app = createRouteApp((expressApp) =>
      registerImagePlaygroundRoutes(expressApp, {
        getRequestAuthContext: () => ({ userId: "auth-user-1", orgId: null }),
        getSql: () => {
          throw new Error("db should not be called");
        },
        resolveUserId: async () => "user-1",
        logger: {
          error: vi.fn(),
          warn: vi.fn(),
          info: vi.fn(),
          debug: vi.fn(),
        } as never,
        buildImagePrompt: () => "",
      }),
    );

    const response = await request(app).get("/api/image-playground/batches").query({
      topicId: "topic-1",
      limit: "abc",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
  });

  it("rejects invalid video playground sessions query params", async () => {
    const { registerVideoPlaygroundRoutes } = await import("../../server/routes/video-playground.js");
    const app = createRouteApp((expressApp) =>
      registerVideoPlaygroundRoutes(expressApp, {
        getRequestAuthContext: () => ({ userId: "auth-user-1", orgId: null }),
        getSql: () => {
          throw new Error("db should not be called");
        },
        resolveUserId: async () => "user-1",
        logger: {
          error: vi.fn(),
          warn: vi.fn(),
          info: vi.fn(),
          debug: vi.fn(),
        } as never,
      }),
    );

    const response = await request(app).get("/api/video-playground/sessions").query({
      topicId: "",
      limit: "abc",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Validation failed");
  });
});
