import { put } from "@vercel/blob";
import { logExternalAPI, logExternalAPIResult, logError } from "../lib/logging-helpers.mjs";
import { validateContentType } from "../lib/validation/contentType.mjs";
import logger from "../lib/logger.mjs";

// Max file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export function registerUploadRoutes(app) {
app.get("/api/proxy-video", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "url parameter is required" });
    }

    // Only allow proxying Vercel Blob URLs for security
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    if (
      parsedUrl.protocol !== "https:" ||
      !parsedUrl.hostname.endsWith(".blob.vercel-storage.com")
    ) {
      return res
        .status(403)
        .json({ error: "Only Vercel Blob URLs are allowed" });
    }

    logger.debug({ url }, "[Video Proxy] Fetching video");

    const response = await fetch(parsedUrl.href);

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Failed to fetch video: ${response.statusText}` });
    }

    // Set CORS and COEP-compatible headers
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "video/mp4",
    );
    res.setHeader(
      "Content-Length",
      response.headers.get("content-length") || "",
    );
    res.setHeader("Accept-Ranges", "bytes");

    // Handle range requests for video seeking
    const range = req.headers.range;
    if (range) {
      const contentLength = parseInt(
        response.headers.get("content-length") || "0",
      );
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${contentLength}`);
      res.setHeader("Content-Length", end - start + 1);
    }

    // Stream the video data
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    logError("Video Proxy", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/upload", async (req, res) => {
  try {
    const { filename, contentType, data } = req.body;

    if (!filename || !contentType || !data) {
      return res.status(400).json({
        error: "Missing required fields: filename, contentType, data",
      });
    }

    // SECURITY: Validate content type against whitelist to prevent XSS/code injection
    // WHY: Users can upload ANY file type via multipart upload
    // - Without validation, attacker uploads text/html with <script> tags
    // - Vercel Blob serves file publicly with attacker-controlled MIME type
    // - Victim clicks link → browser executes malicious JavaScript (Stored XSS)
    // - validateContentType() blocks HTML, SVG, JavaScript, executables
    // - Only safe image/video formats (JPEG, PNG, WebP, MP4, etc.) are allowed
    try {
      validateContentType(contentType);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid content type",
      });
    }

    // Decode base64 data
    const buffer = Buffer.from(data, "base64");

    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      });
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;

    // Upload to Vercel Blob
    logExternalAPI(
      "Vercel Blob",
      "Upload file",
      `${contentType} | ${(buffer.length / 1024).toFixed(1)}KB`,
    );
    const uploadStart = Date.now();

    const blob = await put(uniqueFilename, buffer, {
      access: "public",
      contentType,
    });

    logExternalAPIResult(
      "Vercel Blob",
      "Upload file",
      Date.now() - uploadStart,
    );

    return res.status(200).json({
      success: true,
      url: blob.url,
      filename: uniqueFilename,
      size: buffer.length,
    });
  } catch (error) {
    logError("Upload API", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
}
