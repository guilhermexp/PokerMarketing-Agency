import { describe, expect, it, vi } from "vitest";

import {
  STATIC_HTML_CACHE_CONTROL,
  STATIC_IMMUTABLE_ASSET_CACHE_CONTROL,
  applySpaHtmlHeaders,
  applyStaticCacheHeaders,
} from "../static-cache.js";

describe("static-cache", () => {
  it("marca index.html como nao-cacheavel", () => {
    const setHeader = vi.fn();

    applyStaticCacheHeaders(
      { setHeader } as { setHeader: (name: string, value: string) => void },
      "/app/dist/index.html",
    );

    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      STATIC_HTML_CACHE_CONTROL,
    );
  });

  it("marca chunks hashados em /assets como imutaveis", () => {
    const setHeader = vi.fn();

    applyStaticCacheHeaders(
      { setHeader } as { setHeader: (name: string, value: string) => void },
      "/app/dist/assets/index-C6hdOEpe.js",
    );

    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      STATIC_IMMUTABLE_ASSET_CACHE_CONTROL,
    );
  });

  it("aplica cabecalho sem cache no html servido pelo catch-all da SPA", () => {
    const setHeader = vi.fn();

    applySpaHtmlHeaders({
      setHeader,
    } as { setHeader: (name: string, value: string) => void });

    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      STATIC_HTML_CACHE_CONTROL,
    );
  });
});
