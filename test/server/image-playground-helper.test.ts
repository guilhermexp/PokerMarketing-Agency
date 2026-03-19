import { beforeEach, describe, expect, it, vi } from "vitest";

describe("image playground helper", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("persiste a nova url da geracao editada sem perder os metadados do asset", async () => {
    const sqlTagMock = vi.fn((strings: TemplateStringsArray) => {
      const query = strings.join(" ").replace(/\s+/g, " ").trim();

      if (query.includes("UPDATE image_generations")) {
        return Promise.resolve([
          {
            id: "gen-1",
            batch_id: "batch-1",
            user_id: "db-user-1",
            async_task_id: null,
            seed: 123,
            asset: {
              url: "https://cdn.example.com/edited.png",
              width: 1792,
              height: 768,
              provider: "google",
              model: "gemini-3-pro-image-preview",
            },
            created_at: "2026-03-19T19:00:00.000Z",
          },
        ]);
      }

      return Promise.resolve([]);
    });

    vi.doMock("@vercel/blob", () => ({
      put: vi.fn(),
    }));
    vi.doMock("sharp", () => ({
      default: vi.fn(),
    }));

    const { updateGenerationAsset } = await import(
      "../../server/helpers/image-playground.js"
    );

    const generation = await updateGenerationAsset(
      sqlTagMock as never,
      "gen-1",
      { url: "https://cdn.example.com/edited.png" },
      "db-user-1",
      null,
    );

    expect(generation).toEqual({
      id: "gen-1",
      batchId: "batch-1",
      userId: "db-user-1",
      asyncTaskId: null,
      seed: 123,
      asset: {
        url: "https://cdn.example.com/edited.png",
        width: 1792,
        height: 768,
        provider: "google",
        model: "gemini-3-pro-image-preview",
      },
      createdAt: "2026-03-19T19:00:00.000Z",
    });
  });
});
