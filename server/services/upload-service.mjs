import { put } from "@vercel/blob";
import {
  ValidationError,
  PermissionDeniedError,
  ExternalServiceError,
} from "../lib/errors/index.js";
import { validateContentType } from "../lib/validation/contentType.js";
import { logExternalAPI, logExternalAPIResult } from "../lib/logging-helpers.js";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export async function proxyBlobVideo(url, range) {
  if (!url) {
    throw new ValidationError("url parameter is required");
  }

  let parsedUrl;
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

  const response = await fetch(parsedUrl.href);
  if (!response.ok) {
    const error = new ExternalServiceError(
      "Vercel Blob",
      `Failed to fetch video: ${response.statusText}`,
    );
    error.statusCode = response.status;
    throw error;
  }

  const headers = {
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
    const start = Number.parseInt(parts[0], 10);
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

export async function uploadBase64Asset({ filename, contentType, data }) {
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

  const blob = await put(uniqueFilename, buffer, {
    access: "public",
    contentType,
  });

  logExternalAPIResult("Vercel Blob", "Upload file", Date.now() - uploadStart);

  return {
    success: true,
    url: blob.url,
    filename: uniqueFilename,
    size: buffer.length,
  };
}
