import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteApp } from "./helpers/create-route-app";

describe("gallery routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns gallery data from the service layer", async () => {
    const listGalleryMock = vi.fn().mockResolvedValue([
      { id: "img-1", src_url: "https://cdn.example.com/image.png" },
    ]);

    vi.doMock("../../server/services/gallery-service.mjs", () => ({
      listGallery: listGalleryMock,
      listDailyFlyers: vi.fn(),
      createGalleryImage: vi.fn(),
      updateGalleryImageRecord: vi.fn(),
      deleteGalleryImageRecord: vi.fn(),
    }));

    const { registerGalleryRoutes } = await import("../../server/routes/db-gallery.mjs");
    const app = createRouteApp(registerGalleryRoutes);

    const response = await request(app).get("/api/db/gallery").query({
      user_id: "auth-user-1",
    });

    expect(response.status).toBe(200);
    expect(response.body.error).toBeNull();
    expect(response.body.data).toEqual([
      { id: "img-1", src_url: "https://cdn.example.com/image.png" },
    ]);
  });

  it("returns validation errors on invalid gallery creation", async () => {
    const { ValidationError } = await import("../../server/lib/errors/index.mjs");
    const createGalleryImageMock = vi.fn().mockRejectedValue(
      new ValidationError("user_id, src_url, source, and model are required"),
    );

    vi.doMock("../../server/services/gallery-service.mjs", () => ({
      listGallery: vi.fn(),
      listDailyFlyers: vi.fn(),
      createGalleryImage: createGalleryImageMock,
      updateGalleryImageRecord: vi.fn(),
      deleteGalleryImageRecord: vi.fn(),
    }));

    const { registerGalleryRoutes } = await import("../../server/routes/db-gallery.mjs");
    const app = createRouteApp(registerGalleryRoutes);

    const response = await request(app).post("/api/db/gallery").send({
      user_id: "auth-user-1",
      src_url: "https://cdn.example.com/image.png",
      source: "generated",
      model: "gemini",
    });

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe(
      "user_id, src_url, source, and model are required",
    );
  });
});
