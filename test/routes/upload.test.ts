import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteApp } from "./helpers/create-route-app";

describe("upload routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uploads base64 assets through the service layer", async () => {
    const uploadBase64AssetMock = vi.fn().mockResolvedValue({
      success: true,
      url: "https://blob.example.com/file.png",
      filename: "file.png",
      size: 123,
    });

    vi.doMock("../../server/services/upload-service.js", () => ({
      proxyBlobVideo: vi.fn(),
      uploadBase64Asset: uploadBase64AssetMock,
    }));

    const { registerUploadRoutes } = await import("../../server/routes/upload.js");
    const app = createRouteApp(registerUploadRoutes);

    const response = await request(app).post("/api/upload").send({
      filename: "file.png",
      contentType: "image/png",
      data: "Zm9v",
    });

    expect(response.status).toBe(200);
    expect(response.body.error).toBeNull();
    expect(response.body.data.url).toBe("https://blob.example.com/file.png");
  });

  it("returns validation errors from proxy-video as error envelopes", async () => {
    const { ValidationError } = await import("../../server/lib/errors/index.js");
    const proxyBlobVideoMock = vi.fn().mockRejectedValue(
      new ValidationError("Invalid URL"),
    );

    vi.doMock("../../server/services/upload-service.js", () => ({
      proxyBlobVideo: proxyBlobVideoMock,
      uploadBase64Asset: vi.fn(),
    }));

    const { registerUploadRoutes } = await import("../../server/routes/upload.js");
    const app = createRouteApp(registerUploadRoutes);

    const response = await request(app).get("/api/proxy-video").query({
      url: "notaurl",
    });

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe("Invalid URL");
  });
});
