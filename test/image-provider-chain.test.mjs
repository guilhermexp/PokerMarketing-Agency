import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

describe("image provider chain", () => {
  it("keeps only Gemini enabled even if fallback providers are configured", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
          const mod = await import("./server/lib/ai/image-providers.mjs");
          console.log(JSON.stringify({
            chain: mod.PROVIDER_CHAIN,
            gemini: mod.isProviderEnabled("gemini"),
            replicate: mod.isProviderEnabled("replicate"),
            fal: mod.isProviderEnabled("fal"),
          }));
        `,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GEMINI_API_KEY: "test-gemini-key",
          REPLICATE_API_TOKEN: "test-replicate-key",
          FAL_KEY: "test-fal-key",
          IMAGE_PROVIDERS: "gemini,replicate,fal",
        },
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"chain":["gemini"]');
    expect(result.stdout).toContain('"gemini":true');
    expect(result.stdout).toContain('"replicate":false');
    expect(result.stdout).toContain('"fal":false');
  });
});
