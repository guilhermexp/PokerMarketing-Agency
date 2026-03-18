import { describe, expect, it } from "vitest";
import { injectNonceIntoHtml } from "../../server/lib/spa-html.js";

describe("SPA HTML nonce injection", () => {
  it("adds a nonce to script tags without one", () => {
    const html = [
      "<!doctype html>",
      '<script type="module" src="/assets/app.js"></script>',
      '<script nonce="existing" src="/assets/already-safe.js"></script>',
    ].join("");

    const result = injectNonceIntoHtml(html, "nonce-123");

    expect(result).toContain('<script nonce="nonce-123" type="module" src="/assets/app.js"></script>');
    expect(result).toContain('<script nonce="existing" src="/assets/already-safe.js"></script>');
  });
});
