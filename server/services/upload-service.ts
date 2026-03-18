import { put } from "@vercel/blob";
import sharp from "sharp";
import { getSql } from "../lib/db.js";
import {
  ValidationError,
  PermissionDeniedError,
  ExternalServiceError,
} from "../lib/errors/index.js";
import { validateContentType } from "../lib/validation/contentType.js";
import { logExternalAPI, logExternalAPIResult } from "../lib/logging-helpers.js";
import { resolveUserId } from "../lib/user-resolver.js";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const IMAGE_COMPRESSION_THRESHOLD_BYTES = 200 * 1024;
const COMPRESSIBLE_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export interface ProxyBlobVideoResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface ProxyBlobVideoAccessContext {
  userId: string;
  organizationId: string | null;
}

export interface OptimizedImageBufferResult {
  buffer: Buffer;
  contentType: string;
}

function normalizeBlobUrl(url: string): string {
  return url.trim();
}

function replaceFilenameExtension(filename: string, contentType: string): string {
  const extension =
    contentType === "image/webp"
      ? "webp"
      : contentType === "image/png"
        ? "png"
        : contentType.includes("jpeg")
          ? "jpg"
          : null;

  if (!extension) {
    return filename;
  }

  const baseName = filename.replace(/\.[^.]+$/, "");
  return `${baseName}.${extension}`;
}

export async function optimizeImageBuffer(
  buffer: Buffer,
  contentType: string,
): Promise<OptimizedImageBufferResult> {
  if (
    buffer.length < IMAGE_COMPRESSION_THRESHOLD_BYTES ||
    !COMPRESSIBLE_IMAGE_CONTENT_TYPES.has(contentType.toLowerCase())
  ) {
    return { buffer, contentType };
  }

  const image = sharp(buffer, { failOn: "none" }).rotate();
  const webpBuffer = await image.webp({ quality: 85 }).toBuffer();

  if (webpBuffer.length < buffer.length) {
    return {
      buffer: webpBuffer,
      contentType: "image/webp",
    };
  }

  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    const jpegBuffer = await sharp(buffer, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 85 })
      .toBuffer();

    if (jpegBuffer.length < buffer.length) {
      return {
        buffer: jpegBuffer,
        contentType: "image/jpeg",
      };
    }
  }

  return { buffer, contentType };
}

export async function uploadBufferToBlob(
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; filename: string; size: number; contentType: string }> {
  const optimized = await optimizeImageBuffer(buffer, contentType);
  const normalizedFilename = replaceFilenameExtension(filename, optimized.contentType);
  const blob = await put(normalizedFilename, optimized.buffer, {
    access: "public",
    contentType: optimized.contentType,
  });

  return {
    url: blob.url,
    filename: normalizedFilename,
    size: optimized.buffer.length,
    contentType: optimized.contentType,
  };
}

export async function assertBlobUrlBelongsToOrganization(
  url: string,
  organizationId: string,
): Promise<void> {
  const sql = getSql();
  const blobUrl = normalizeBlobUrl(url);
  const rows = await sql`
    SELECT 1 AS matched
    FROM gallery_images
    WHERE organization_id = ${organizationId}
      AND deleted_at IS NULL
      AND (${blobUrl} = src_url OR ${blobUrl} = thumbnail_url)
    UNION ALL
    SELECT 1 AS matched
    FROM posts
    WHERE organization_id = ${organizationId}
      AND ${blobUrl} = image_url
    UNION ALL
    SELECT 1 AS matched
    FROM ad_creatives
    WHERE organization_id = ${organizationId}
      AND ${blobUrl} = image_url
    UNION ALL
    SELECT 1 AS matched
    FROM video_clip_scripts
    WHERE organization_id = ${organizationId}
      AND (${blobUrl} = thumbnail_url OR ${blobUrl} = video_url)
    UNION ALL
    SELECT 1 AS matched
    FROM carousel_scripts
    WHERE organization_id = ${organizationId}
      AND ${blobUrl} = cover_url
    LIMIT 1
  ` as Array<{ matched: string }>;

  if (rows.length === 0) {
    const error = new PermissionDeniedError();
    error.message = "Blob URL does not belong to the authenticated organization";
    throw error;
  }
}

async function assertBlobUrlBelongsToUser(
  url: string,
  userId: string,
): Promise<void> {
  const sql = getSql();
  const resolvedUserId = await resolveUserId(sql, userId);
  if (!resolvedUserId) {
    const error = new PermissionDeniedError();
    error.message = "Unable to resolve authenticated user";
    throw error;
  }

  const blobUrl = normalizeBlobUrl(url);
  const rows = await sql`
    SELECT 1 AS matched
    FROM gallery_images
    WHERE user_id = ${resolvedUserId}
      AND organization_id IS NULL
      AND deleted_at IS NULL
      AND (${blobUrl} = src_url OR ${blobUrl} = thumbnail_url)
    UNION ALL
    SELECT 1 AS matched
    FROM posts
    WHERE user_id = ${resolvedUserId}
      AND organization_id IS NULL
      AND ${blobUrl} = image_url
    UNION ALL
    SELECT 1 AS matched
    FROM ad_creatives
    WHERE user_id = ${resolvedUserId}
      AND organization_id IS NULL
      AND ${blobUrl} = image_url
    UNION ALL
    SELECT 1 AS matched
    FROM video_clip_scripts
    WHERE user_id = ${resolvedUserId}
      AND organization_id IS NULL
      AND (${blobUrl} = thumbnail_url OR ${blobUrl} = video_url)
    UNION ALL
    SELECT 1 AS matched
    FROM carousel_scripts
    WHERE user_id = ${resolvedUserId}
      AND organization_id IS NULL
      AND ${blobUrl} = cover_url
    LIMIT 1
  ` as Array<{ matched: string }>;

  if (rows.length === 0) {
    const error = new PermissionDeniedError();
    error.message = "Blob URL does not belong to the authenticated user";
    throw error;
  }
}

async function assertBlobUrlAccess(
  url: string,
  accessContext: ProxyBlobVideoAccessContext | null | undefined,
): Promise<void> {
  if (!accessContext?.userId) {
    const error = new PermissionDeniedError();
    error.message = "Authenticated access is required";
    throw error;
  }

  if (accessContext.organizationId) {
    await assertBlobUrlBelongsToOrganization(url, accessContext.organizationId);
    return;
  }

  await assertBlobUrlBelongsToUser(url, accessContext.userId);
}

export async function proxyBlobVideo(
  url: string,
  range?: string,
  accessContext?: ProxyBlobVideoAccessContext | null,
): Promise<ProxyBlobVideoResult> {
  if (!url) {
    throw new ValidationError("url parameter is required");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ValidationError("Invalid URL");
  }

  if (
    parsedUrl.protocol !== "https:" ||
    !parsedUrl.hostname.endsWith(".blob.vercel-storage.com")
  ) {
    const error = new PermissionDeniedError();
    error.message = "Only Vercel Blob URLs are allowed";
    throw error;
  }

  await assertBlobUrlAccess(parsedUrl.href, accessContext);

  const response = await fetch(parsedUrl.href);
  if (!response.ok) {
    throw new ExternalServiceError(
      "Vercel Blob",
      `Failed to fetch video: ${response.statusText}`,
      null,
      response.status,
    );
  }

  const headers: Record<string, string> = {
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": response.headers.get("content-type") || "video/mp4",
    "Content-Length": response.headers.get("content-length") || "",
    "Accept-Ranges": "bytes",
  };

  let status = 200;
  if (range) {
    const contentLength = Number.parseInt(
      response.headers.get("content-length") || "0",
      10,
    );
    const parts = range.replace(/bytes=/, "").split("-");
    const start = Number.parseInt(parts[0] || "0", 10);
    const end = parts[1]
      ? Number.parseInt(parts[1], 10)
      : contentLength - 1;

    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${contentLength}`;
    headers["Content-Length"] = String(end - start + 1);
  }

  const body = Buffer.from(await response.arrayBuffer());
  return { status, headers, body };
}

export interface UploadBase64AssetParams {
  filename: string;
  contentType: string;
  data: string;
}

export interface UploadBase64AssetResult {
  success: boolean;
  url: string;
  filename: string;
  size: number;
}

export async function uploadBase64Asset({ filename, contentType, data }: UploadBase64AssetParams): Promise<UploadBase64AssetResult> {
  if (!filename || !contentType || !data) {
    throw new ValidationError("Missing required fields: filename, contentType, data");
  }

  try {
    validateContentType(contentType);
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : "Invalid content type",
    );
  }

  const buffer = Buffer.from(data, "base64");
  if (buffer.length > MAX_FILE_SIZE) {
    throw new ValidationError(
      `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    );
  }

  const uniqueFilename = `${Date.now()}-${filename}`;

  logExternalAPI(
    "Vercel Blob",
    "Upload file",
    `${contentType} | ${(buffer.length / 1024).toFixed(1)}KB`,
  );
  const uploadStart = Date.now();

  const upload = await uploadBufferToBlob(uniqueFilename, buffer, contentType);

  logExternalAPIResult("Vercel Blob", "Upload file", Date.now() - uploadStart);

  return {
    success: true,
    url: upload.url,
    filename: upload.filename,
    size: upload.size,
  };
}
