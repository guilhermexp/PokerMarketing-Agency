import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRouteApp } from "../routes/helpers/create-route-app";

const putMock = vi.fn(async (filename) => ({
  url: `https://blob.vercel-storage.com/${filename}`,
}));

vi.mock("@vercel/blob", () => ({
  put: putMock,
}));

describe("/api/upload security", () => {
  let server;
  let apiBaseUrl = "";

  beforeAll(async () => {
    const { registerUploadRoutes } = await import("../../server/routes/upload.js");
    const app = createRouteApp(registerUploadRoutes);

    server = await new Promise((resolve) => {
      const listener = app.listen(0, () => resolve(listener));
    });

    const address = server.address();
    apiBaseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve(undefined)));
    });
  });

  const UPLOAD_ENDPOINT = () => `${apiBaseUrl}/api/upload`;

  const createTestData = (content = "test") => Buffer.from(content).toString("base64");

  const normalizeBody = (payload) => {
    if (payload?.error && typeof payload.error === "object") {
      return {
        ...payload,
        error: payload.error.message || JSON.stringify(payload.error),
      };
    }

    if (payload?.data && typeof payload.data === "object") {
      return payload.data;
    }

    return payload;
  };

  const uploadFile = async (filename, contentType, data = null) => {
    const response = await fetch(UPLOAD_ENDPOINT(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename,
        contentType,
        data: data || createTestData(),
      }),
    });

    return {
      status: response.status,
      body: normalizeBody(await response.json()),
    };
  };

  describe("dangerous content-type rejection (XSS/code injection)", () => {
    it("should reject text/html (stored XSS risk)", async () => {
      const result = await uploadFile("malicious.html", "text/html");

      expect(result.status).toBe(400);
      expect(result.body.error).toBeDefined();
      expect(result.body.error).toContain("Invalid content type: text/html");
      expect(result.body.error).toContain("Allowed types:");
    });

    it("should reject image/svg+xml (JavaScript in SVG)", async () => {
      const result = await uploadFile("malicious.svg", "image/svg+xml");

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid content type: image/svg+xml");
    });

    it("should reject text/javascript (code injection)", async () => {
      const result = await uploadFile("malicious.js", "text/javascript");

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid content type: text/javascript");
    });

    it("should reject application/javascript (code injection)", async () => {
      const result = await uploadFile("malicious.js", "application/javascript");

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid content type: application/javascript");
    });

    it("should reject application/x-msdownload (executable)", async () => {
      const result = await uploadFile("malicious.exe", "application/x-msdownload");

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid content type: application/x-msdownload");
    });

    it("should reject application/octet-stream (executable)", async () => {
      const result = await uploadFile("malicious.bin", "application/octet-stream");

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid content type: application/octet-stream");
    });

    it("should reject text/html with embedded XSS payload", async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      const result = await uploadFile("xss.html", "text/html", createTestData(xssPayload));

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid content type: text/html");
    });

    it("should reject SVG with script element", async () => {
      const svgWithScript = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <script>alert('XSS')</script>
        </svg>
      `;
      const result = await uploadFile("xss.svg", "image/svg+xml", createTestData(svgWithScript));

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid content type: image/svg+xml");
    });
  });

  describe("allowed content types (should pass validation)", () => {
    it("should accept image/jpeg", async () => {
      const result = await uploadFile("test.jpg", "image/jpeg");
      expect(result.status).toBe(200);
      expect(result.body.url).toContain("test.jpg");
    });

    it("should accept image/png", async () => {
      const result = await uploadFile("test.png", "image/png");
      expect(result.status).toBe(200);
      expect(result.body.url).toContain("test.png");
    });

    it("should accept image/webp", async () => {
      const result = await uploadFile("test.webp", "image/webp");
      expect(result.status).toBe(200);
      expect(result.body.url).toContain("test.webp");
    });

    it("should accept image/gif", async () => {
      const result = await uploadFile("test.gif", "image/gif");
      expect(result.status).toBe(200);
      expect(result.body.url).toContain("test.gif");
    });

    it("should accept video/mp4", async () => {
      const result = await uploadFile("test.mp4", "video/mp4");
      expect(result.status).toBe(200);
      expect(result.body.url).toContain("test.mp4");
    });

    it("should accept video/webm", async () => {
      const result = await uploadFile("test.webm", "video/webm");
      expect(result.status).toBe(200);
      expect(result.body.url).toContain("test.webm");
    });
  });

  describe("edge cases", () => {
    it("should reject missing content type", async () => {
      const response = await fetch(UPLOAD_ENDPOINT(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: "test.jpg",
          data: createTestData(),
        }),
      });

      const result = {
        status: response.status,
        body: normalizeBody(await response.json()),
      };

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Validation failed");
    });

    it("should reject empty content type", async () => {
      const result = await uploadFile("test.jpg", "");

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Validation failed");
    });

    it("should reject case-variant content types (IMAGE/JPEG)", async () => {
      const result = await uploadFile("test.jpg", "IMAGE/JPEG");

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid content type: IMAGE/JPEG");
    });

    it("should reject content type with parameters", async () => {
      const result = await uploadFile("test.jpg", "image/jpeg; charset=utf-8");

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid content type");
    });
  });

  describe("error message quality", () => {
    it("should provide helpful error with list of allowed types", async () => {
      const result = await uploadFile("bad.html", "text/html");

      expect(result.status).toBe(400);
      expect(result.body.error).toContain("Invalid content type: text/html");
      expect(result.body.error).toContain("Allowed types:");
      expect(result.body.error).toContain("image/jpeg");
      expect(result.body.error).toContain("image/png");
      expect(result.body.error).toContain("video/mp4");
    });
  });
});
