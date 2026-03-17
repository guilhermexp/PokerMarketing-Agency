import { beforeEach, describe, expect, it, vi } from "vitest";

const putMock = vi.fn();

vi.mock("@vercel/blob", () => ({
  put: putMock,
}));

describe("upload service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects invalid proxy URLs", async () => {
    const { proxyBlobVideo } = await import("../../server/services/upload-service.js");

    await expect(proxyBlobVideo("notaurl")).rejects.toMatchObject({
      message: "Invalid URL",
    });
  });

  it("rejects non-Vercel Blob hosts", async () => {
    const { proxyBlobVideo } = await import("../../server/services/upload-service.js");

    await expect(proxyBlobVideo("https://example.com/video.mp4")).rejects.toMatchObject({
      message: "Only Vercel Blob URLs are allowed",
    });
  });

  it("proxies blob videos and preserves partial content headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({
          "content-type": "video/mp4",
          "content-length": "10",
        }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      }),
    );

    const { proxyBlobVideo } = await import("../../server/services/upload-service.js");
    const result = await proxyBlobVideo(
      "https://foo.public.blob.vercel-storage.com/video.mp4",
      "bytes=0-3",
    );

    expect(result.status).toBe(206);
    expect(result.headers["Content-Range"]).toBe("bytes 0-3/10");
    expect(result.headers["Content-Type"]).toBe("video/mp4");
    expect(result.body).toBeInstanceOf(Buffer);
  });

  it("uploads base64 assets through Vercel Blob", async () => {
    putMock.mockResolvedValue({
      url: "https://blob.example.com/uploaded.png",
    });

    const { uploadBase64Asset } = await import("../../server/services/upload-service.js");
    const result = await uploadBase64Asset({
      filename: "uploaded.png",
      contentType: "image/png",
      data: Buffer.from("hello world").toString("base64"),
    });

    expect(putMock).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.url).toBe("https://blob.example.com/uploaded.png");
    expect(result.filename).toContain("uploaded.png");
  });

  it("rejects unsupported upload content types", async () => {
    const { uploadBase64Asset } = await import("../../server/services/upload-service.js");

    await expect(
      uploadBase64Asset({
        filename: "payload.exe",
        contentType: "application/x-msdownload",
        data: Buffer.from("hello world").toString("base64"),
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Invalid content type"),
    });
  });
});
