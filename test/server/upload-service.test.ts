import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("upload service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects proxying a blob URL that is not associated with the authenticated organization", async () => {
    const sqlMock = vi.fn().mockResolvedValue([]);

    vi.doMock("../../server/lib/db.js", () => ({
      getSql: () => sqlMock,
    }));

    const { PermissionDeniedError } = await import("../../server/lib/errors/index.js");
    const { assertBlobUrlBelongsToOrganization } = await import(
      "../../server/services/upload-service.js"
    );

    await expect(
      assertBlobUrlBelongsToOrganization(
        "https://team.public.blob.vercel-storage.com/private-video.mp4",
        "org-1",
      ),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("allows proxying a blob URL that is associated with the authenticated organization", async () => {
    const sqlMock = vi.fn().mockResolvedValue([{ matched: "1" }]);

    vi.doMock("../../server/lib/db.js", () => ({
      getSql: () => sqlMock,
    }));

    const { assertBlobUrlBelongsToOrganization } = await import(
      "../../server/services/upload-service.js"
    );

    await expect(
      assertBlobUrlBelongsToOrganization(
        "https://team.public.blob.vercel-storage.com/private-video.mp4",
        "org-1",
      ),
    ).resolves.toBeUndefined();
  });

  it("compresses large image buffers before upload and prefers webp when possible", async () => {
    const width = 1600;
    const height = 1200;
    const inputBuffer = await sharp(randomBytes(width * height * 3), {
      raw: { width, height, channels: 3 },
    })
      .png()
      .toBuffer();

    const { optimizeImageBuffer } = await import("../../server/services/upload-service.js");

    const optimized = await optimizeImageBuffer(inputBuffer, "image/png");

    expect(optimized.contentType).toBe("image/webp");
    expect(optimized.buffer.byteLength).toBeLessThan(inputBuffer.byteLength);
  });

  it("skips compression for images smaller than 200KB", async () => {
    const inputBuffer = await sharp({
      create: {
        width: 80,
        height: 80,
        channels: 3,
        background: "#2563eb",
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const { optimizeImageBuffer } = await import("../../server/services/upload-service.js");

    const optimized = await optimizeImageBuffer(inputBuffer, "image/jpeg");

    expect(optimized.contentType).toBe("image/jpeg");
    expect(optimized.buffer.equals(inputBuffer)).toBe(true);
  });
});
