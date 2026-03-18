import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteApp } from "./helpers/create-route-app";

describe("image playground routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns validation errors when batches query params are invalid", async () => {
    vi.doMock("../../server/helpers/image-playground.js", () => ({
      getTopics: vi.fn(),
      createTopic: vi.fn(),
      updateTopic: vi.fn(),
      deleteTopic: vi.fn(),
      getBatches: vi.fn().mockResolvedValue([]),
      deleteBatch: vi.fn(),
      deleteGeneration: vi.fn(),
      getGenerationStatus: vi.fn(),
      createImageBatch: vi.fn(),
      generateTopicTitle: vi.fn(),
    }));

    const { registerImagePlaygroundRoutes } = await import("../../server/routes/image-playground.js");
    const app = createRouteApp((expressApp) =>
      registerImagePlaygroundRoutes(expressApp, {
        getRequestAuthContext: () => ({ userId: "auth-user-1", orgId: null }) as never,
        getSql: () => ({}) as never,
        resolveUserId: vi.fn().mockResolvedValue("db-user-1"),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        } as never,
        buildImagePrompt: vi.fn().mockReturnValue("prompt"),
      }),
    );

    const response = await request(app).get("/api/image-playground/batches").query({
      topicId: "topic-1",
      limit: "abc",
    });

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe("Validation failed");
  });

  it("requires a non-empty prompts array for title generation", async () => {
    vi.doMock("../../server/helpers/image-playground.js", () => ({
      getTopics: vi.fn(),
      createTopic: vi.fn(),
      updateTopic: vi.fn(),
      deleteTopic: vi.fn(),
      getBatches: vi.fn(),
      deleteBatch: vi.fn(),
      deleteGeneration: vi.fn(),
      getGenerationStatus: vi.fn(),
      createImageBatch: vi.fn(),
      generateTopicTitle: vi.fn().mockResolvedValue("Titulo"),
    }));

    const { registerImagePlaygroundRoutes } = await import("../../server/routes/image-playground.js");
    const app = createRouteApp((expressApp) =>
      registerImagePlaygroundRoutes(expressApp, {
        getRequestAuthContext: () => ({ userId: "auth-user-1", orgId: null }) as never,
        getSql: () => ({}) as never,
        resolveUserId: vi.fn().mockResolvedValue("db-user-1"),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        } as never,
        buildImagePrompt: vi.fn().mockReturnValue("prompt"),
      }),
    );

    const response = await request(app)
      .post("/api/image-playground/generate-title")
      .send({ prompts: [] });

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe("Validation failed");
  });
});
