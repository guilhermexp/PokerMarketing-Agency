import { describe, expect, it } from "vitest";
import {
  buildConnectSrcOrigins,
  buildScriptSrcOrigins,
  createCspNonceDirective,
} from "../../server/lib/csp.js";

describe("CSP helpers", () => {
  it("keeps unsafe inline script allowances only outside production", () => {
    expect(buildScriptSrcOrigins(false)).toContain("'unsafe-inline'");
    expect(buildScriptSrcOrigins(false)).toContain("'unsafe-eval'");
    expect(buildScriptSrcOrigins(true)).not.toContain("'unsafe-inline'");
    expect(buildScriptSrcOrigins(true)).not.toContain("'unsafe-eval'");
  });

  it("builds nonce directives and restricted websocket origins", () => {
    expect(createCspNonceDirective("nonce-123")).toBe("'nonce-nonce-123'");

    const connectSrc = buildConnectSrcOrigins();
    expect(connectSrc).toContain("wss://sociallab.pro");
    expect(connectSrc).toContain("wss://localhost:3002");
    expect(connectSrc).not.toContain("wss:");
  });
});
