import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadConfig,
  saveConfigValue,
  validateConfig,
} from "../config.js";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sociallab-cli-config-"));
  tempDirs.push(dir);
  return dir;
}

describe("config", () => {
  afterEach(() => {
    tempDirs.length = 0;
  });

  it("prioritizes env vars over rc file values", async () => {
    const homeDir = createTempDir();
    writeFileSync(
      join(homeDir, ".sociallabrc"),
      JSON.stringify({
        url: "https://rc.example.com",
        token: "rc-token",
        userId: "rc-user",
        orgId: "rc-org",
      }),
      "utf8",
    );

    const config = await loadConfig({
      env: {
        SOCIALLAB_URL: "https://env.example.com",
        SOCIALLAB_TOKEN: "env-token",
        SOCIALLAB_USER_ID: "env-user",
      },
      homeDir,
    });

    expect(config.url).toBe("https://env.example.com");
    expect(config.token).toBe("env-token");
    expect(config.userId).toBe("env-user");
    expect(config.orgId).toBe("rc-org");
  });

  it("writes normalized keys to ~/.sociallabrc", async () => {
    const homeDir = createTempDir();

    await saveConfigValue("user_id", "user-123", { homeDir });
    await saveConfigValue("url", "https://api.example.com", { homeDir });

    const saved = JSON.parse(
      readFileSync(join(homeDir, ".sociallabrc"), "utf8"),
    ) as Record<string, string>;

    expect(saved).toEqual({
      url: "https://api.example.com",
      userId: "user-123",
    });
  });

  it("fails fast when required config is missing", () => {
    expect(() =>
      validateConfig({
        url: "http://localhost:3002",
        token: "",
        userId: "",
        orgId: undefined,
      }),
    ).toThrowError(/SOCIALLAB_TOKEN.*SOCIALLAB_USER_ID/);
  });
});
