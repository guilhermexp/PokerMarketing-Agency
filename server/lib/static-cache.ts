import path from "node:path";
import type { Response } from "express";

export const STATIC_HTML_CACHE_CONTROL = "no-store, no-cache, must-revalidate";
export const STATIC_IMMUTABLE_ASSET_CACHE_CONTROL =
  "public, max-age=31536000, immutable";

type HeaderResponse = Pick<Response, "setHeader">;

export function applySpaHtmlHeaders(res: HeaderResponse): void {
  res.setHeader("Cache-Control", STATIC_HTML_CACHE_CONTROL);
}

export function applyStaticCacheHeaders(
  res: HeaderResponse,
  filePath: string,
): void {
  if (filePath.endsWith(".html")) {
    applySpaHtmlHeaders(res);
    return;
  }

  const normalizedAssetsSegment = `${path.sep}assets${path.sep}`;
  if (filePath.includes(normalizedAssetsSegment)) {
    res.setHeader("Cache-Control", STATIC_IMMUTABLE_ASSET_CACHE_CONTROL);
  }
}
