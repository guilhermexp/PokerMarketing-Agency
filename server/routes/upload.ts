import type { Express, NextFunction, Request as ExpressRequest } from "express";
import { createRateLimitMiddleware, getRequestAuthContext } from "../lib/auth.js";
import {
  AppError,
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
import { sendError } from "../lib/response.js";
import {
  type ProxyVideoQuery,
  type UploadBody,
  uploadMultipartBodySchema,
  proxyVideoQuerySchema,
  uploadBodySchema,
} from "../schemas/upload-schemas.js";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toValidationErrorMessage() {
  return "Validation failed";
}

async function readRequestBuffer(req: ExpressRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function extractMultipartBoundary(contentTypeHeader: string): string | null {
  const match = contentTypeHeader.match(/boundary=(?:"([^\"]+)"|([^;]+))/i);
  return match?.[1] || match?.[2] || null;
}

function extractMultipartFieldDisposition(
  contentDisposition: string,
  field: "name" | "filename",
): string | null {
  const match = contentDisposition.match(new RegExp(`${field}="([^"]+)"`, "i"));
  return match?.[1] || null;
}

async function parseMultipartUploadBody(req: ExpressRequest): Promise<UploadBody> {
  const contentTypeHeader = req.headers["content-type"];
  const normalizedContentTypeHeader = Array.isArray(contentTypeHeader)
    ? contentTypeHeader[0]
    : contentTypeHeader;

  if (!normalizedContentTypeHeader?.includes("multipart/form-data")) {
    throw new ValidationError(toValidationErrorMessage());
  }

  const boundary = extractMultipartBoundary(normalizedContentTypeHeader);
  if (!boundary) {
    throw new ValidationError(toValidationErrorMessage());
  }

  const body = await readRequestBuffer(req);
  const rawBody = body.toString("latin1");
  const parts = rawBody
    .split(`--${boundary}`)
    .map((part) => {
      if (part.startsWith("\r\n")) {
        return part.slice(2);
      }

      return part;
    })
    .filter((part) => Boolean(part) && part !== "--\r\n" && part !== "--");

  let filename: string | undefined;
  let contentType: string | undefined;
  let fileBuffer: Buffer | null = null;

  for (const part of parts) {
    const separatorIndex = part.indexOf("\r\n\r\n");
    if (separatorIndex < 0) {
      continue;
    }

    const rawHeaders = part.slice(0, separatorIndex);
    let rawValue = part.slice(separatorIndex + 4);

    if (rawValue.endsWith("\r\n")) {
      rawValue = rawValue.slice(0, -2);
    }

    const headers = rawHeaders.split("\r\n");
    const contentDisposition =
      headers.find((header) => header.toLowerCase().startsWith("content-disposition:")) || "";
    const fieldName = extractMultipartFieldDisposition(contentDisposition, "name");
    const fileNameFromPart = extractMultipartFieldDisposition(contentDisposition, "filename");
    const partContentType = headers
      .find((header) => header.toLowerCase().startsWith("content-type:"))
      ?.split(":")[1]
      ?.trim();

    if (!fieldName) {
      continue;
    }

    if (fileNameFromPart) {
      fileBuffer = Buffer.from(rawValue, "latin1");
      filename ||= fileNameFromPart;
      contentType ||= partContentType;
      continue;
    }

    if (fieldName === "filename") {
      filename = rawValue;
    }

    if (fieldName === "contentType") {
      contentType = rawValue;
    }
  }

  const parsed = uploadMultipartBodySchema.safeParse({
    filename: filename || "",
    contentType: contentType || "",
    file: fileBuffer,
  });

  if (!parsed.success) {
    throw new ValidationError(toValidationErrorMessage());
  }

  return {
    filename: parsed.data.filename,
    contentType: parsed.data.contentType,
    data: parsed.data.file.toString("base64"),
  };
}

function parseJsonUploadBody(req: ExpressRequest): UploadBody {
  const parsed = uploadBodySchema.safeParse(req.body);

  if (!parsed.success) {
    throw new ValidationError(toValidationErrorMessage());
  }

  return parsed.data;
}

export function registerUploadRoutes(app: Express): void {
  const proxyVideoRateLimit = createRateLimitMiddleware(20, 60_000, "media:proxy-video");

  app.get("/api/proxy-video", proxyVideoRateLimit, validateRequest({ query: proxyVideoQuerySchema }), async (req, res) => {
    try {
      const { url } = req.query as ProxyVideoQuery;
      const authContext = getRequestAuthContext(req);
      const result = await proxyBlobVideo(
        url,
        req.headers.range,
        authContext
          ? {
              userId: authContext.userId,
              organizationId: authContext.orgId,
            }
          : null,
      );
      res.status(result.status);
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.send(result.body);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ValidationError) {
        throw new AppError(error.message, 400);
      }
      if (error instanceof PermissionDeniedError) {
        throw new AppError(error.message, 403);
      }
      if (error instanceof ExternalServiceError) {
        return res.status(error.statusCode || 502).json({ error: error.message });
      }
      logError("Video Proxy", toError(error));
      res.status(500).json({ error: sanitizeErrorForClient(error) });
    }
  });

  app.post("/api/upload", async (req, res, next: NextFunction) => {
    try {
      const uploadBody = req.is("multipart/form-data")
        ? await parseMultipartUploadBody(req)
        : parseJsonUploadBody(req);
      const result = await uploadBase64Asset(uploadBody);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode);
        sendError(res, error);
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400);
        sendError(res, new AppError(error.message, 400));
        return;
      }
      logError("Upload API", toError(error));
      return res.status(500).json({
        error: sanitizeErrorForClient(error),
      });
    }
  });
}
