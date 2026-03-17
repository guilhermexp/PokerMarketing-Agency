import {
  ValidationError,
  PermissionDeniedError,
  ExternalServiceError,
} from "../lib/errors/index.mjs";
import { logError } from "../lib/logging-helpers.mjs";
import { sanitizeErrorForClient } from "../lib/ai/retry.mjs";
import {
  proxyBlobVideo,
  uploadBase64Asset,
} from "../services/upload-service.mjs";

export function registerUploadRoutes(app) {
  app.get("/api/proxy-video", async (req, res) => {
    try {
      const result = await proxyBlobVideo(req.query.url, req.headers.range);
      res.status(result.status);
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.send(result.body);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof PermissionDeniedError) {
        return res.status(403).json({ error: error.message });
      }
      if (error instanceof ExternalServiceError) {
        return res.status(error.statusCode || 502).json({ error: error.message });
      }
      logError("Video Proxy", error);
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.post("/api/upload", async (req, res) => {
    try {
      const result = await uploadBase64Asset(req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logError("Upload API", error);
      return res.status(500).json({
        error: sanitizeErrorForClient(error),
      });
    }
  });
}
