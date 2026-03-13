import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

const runJobQueueProbe = (env) =>
  spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const mod = await import("./server/helpers/job-queue.mjs");
        const result = await mod.waitForRedis(50);
        console.log("RESULT=" + JSON.stringify({
          waitForRedis: result,
          redisAvailable: mod.isRedisAvailable(),
        }));
      `,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
      encoding: "utf8",
    },
  );

describe("job queue runtime gating", () => {
  it("does not attempt Redis in development even when REDIS_URL is configured", () => {
    const result = runJobQueueProbe({
      NODE_ENV: "development",
      REDIS_URL: "redis://default:secret@127.0.0.1:6379",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("[JobQueue] Probing Redis:");
    expect(result.stdout).toContain('"waitForRedis":false');
    expect(result.stdout).toContain('"redisAvailable":false');
  });

  it("keeps Redis enabled in production mode", () => {
    const result = runJobQueueProbe({
      NODE_ENV: "production",
      REDIS_URL: "redis://default:secret@127.0.0.1:6379",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[JobQueue] Probing Redis:");
  });
});
