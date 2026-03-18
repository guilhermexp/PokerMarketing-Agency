import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteApp } from "./helpers/create-route-app";

describe("video playground routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns validation errors when sessions query params are invalid", async () => {
    vi.doMock("../../server/helpers/video-playground.js", () => ({
      getTopics: vi.fn(),
      createTopic: vi.fn(),
      updateTopic: vi.fn(),
      deleteTopic: vi.fn(),
      getSessions: vi.fn().mockResolvedValue([]),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteGeneration: vi.fn(),
      updateGeneration: vi.fn(),
      generateTopicTitle: vi.fn(),
    }));

    const { registerVideoPlaygroundRoutes } = await import("../../server/routes/video-playground.js");
    const app = createRouteApp((expressApp) =>
      registerVideoPlaygroundRoutes(expressApp, {
        getRequestAuthContext: () => ({ userId: "auth-user-1", orgId: null }) as never,
        getSql: () => ({}) as never,
        resolveUserId: vi.fn().mockResolvedValue("db-user-1"),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        } as never,
      }),
    );

    const response = await request(app).get("/api/video-playground/sessions").query({
      topicId: "topic-1",
      limit: "abc",
    });

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe("Validation failed");
  });

  it("requires a non-empty prompts array for video title generation", async () => {
    vi.doMock("../../server/helpers/video-playground.js", () => ({
      getTopics: vi.fn(),
      createTopic: vi.fn(),
      updateTopic: vi.fn(),
      deleteTopic: vi.fn(),
      getSessions: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
      deleteGeneration: vi.fn(),
      updateGeneration: vi.fn(),
      generateTopicTitle: vi.fn().mockResolvedValue("Titulo"),
    }));

    const { registerVideoPlaygroundRoutes } = await import("../../server/routes/video-playground.js");
    const app = createRouteApp((expressApp) =>
      registerVideoPlaygroundRoutes(expressApp, {
        getRequestAuthContext: () => ({ userId: "auth-user-1", orgId: null }) as never,
        getSql: () => ({}) as never,
        resolveUserId: vi.fn().mockResolvedValue("db-user-1"),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        } as never,
      }),
    );

    const response = await request(app)
      .post("/api/video-playground/generate-title")
      .send({ prompts: [] });

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe("Validation failed");
  });
});
