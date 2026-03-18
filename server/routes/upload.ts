import type { Express } from "express";
import {
  ValidationError,
  PermissionDeniedError,
  ExternalServiceError,
} from "../lib/errors/index.js";
import { logError } from "../lib/logging-helpers.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import {
  proxyBlobVideo,
  uploadBase64Asset,
} from "../services/upload-service.js";
import { validateRequest } from "../middleware/validate.js";
import {
  type ProxyVideoQuery,
  type UploadBody,
  proxyVideoQuerySchema,
  uploadBodySchema,
} from "../schemas/upload-schemas.js";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function registerUploadRoutes(app: Express): void {
  app.get("/api/proxy-video", validateRequest({ query: proxyVideoQuerySchema }), async (req, res) => {
    try {
      const { url } = req.query as ProxyVideoQuery;
      const result = await proxyBlobVideo(url, req.headers.range);
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
      logError("Video Proxy", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.post("/api/upload", validateRequest({ body: uploadBodySchema }), async (req, res) => {
    try {
      const result = await uploadBase64Asset(req.body as UploadBody);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logError("Upload API", toError(error));
      return res.status(500).json({
        error: sanitizeErrorForClient(error),
      });
    }
  });
}
