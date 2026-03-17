import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

describe("server entrypoint syntax", () => {
  it("parses without duplicate declarations", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--check", "server/index.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
