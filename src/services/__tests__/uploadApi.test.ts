import { beforeEach, describe, expect, it, vi } from "vitest";

describe("uploadApi", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("sends binary uploads as FormData with the csrf token header", async () => {
    let csrfToken: string | null = null;
    const clearCsrfTokenMock = vi.fn();
    const getCsrfTokenMock = vi.fn(async () => {
      csrfToken = "fresh-csrf-token";
      return csrfToken;
    });

    vi.doMock("../api-client/csrf", () => ({
      clearCsrfToken: clearCsrfTokenMock,
      getCsrfToken: getCsrfTokenMock,
      getCurrentCsrfToken: () => csrfToken,
    }));

    const { uploadToBlob } = await import("../api-client/uploadApi");

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          success: true,
          url: "https://blob.example.com/clip.mp4",
          filename: "clip.mp4",
          size: 5,
        },
        error: null,
        meta: null,
      }),
    } as unknown as Response);

    const result = await uploadToBlob(
      new Blob(["hello"], { type: "video/mp4" }),
      "clip.mp4",
      "video/mp4",
    );

    expect(result.url).toBe("https://blob.example.com/clip.mp4");
    expect(getCsrfTokenMock).toHaveBeenCalledTimes(1);

    const [url, options] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(url).toBe("/api/upload");
    expect(options?.method).toBe("POST");
    expect(options?.credentials).toBe("include");
    expect(options?.headers).toEqual({ "X-CSRF-Token": "fresh-csrf-token" });
    expect(options?.body).toBeInstanceOf(FormData);

    const formData = options?.body as FormData;
    expect(formData.get("filename")).toBe("clip.mp4");
    expect(formData.get("contentType")).toBe("video/mp4");

    const file = formData.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("clip.mp4");
    expect((file as File).type).toBe("video/mp4");
    expect((file as File).size).toBe(5);
    expect(clearCsrfTokenMock).not.toHaveBeenCalled();
  });

  it("clears the csrf token when the multipart upload is rejected with 403", async () => {
    const clearCsrfTokenMock = vi.fn();

    vi.doMock("../api-client/csrf", () => ({
      clearCsrfToken: clearCsrfTokenMock,
      getCsrfToken: vi.fn(),
      getCurrentCsrfToken: () => "stale-csrf-token",
    }));

    const { uploadToBlob } = await import("../api-client/uploadApi");

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({
        error: {
          message: "Forbidden",
        },
      }),
    } as unknown as Response);

    await expect(
      uploadToBlob(new Blob(["x"], { type: "image/png" }), "image.png", "image/png"),
    ).rejects.toThrow("Forbidden");

    expect(clearCsrfTokenMock).toHaveBeenCalledTimes(1);
  });
});
