import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRouteContract,
} from "../../server/schemas/api-contracts.js";

const repoRoot = resolve(__dirname, "../..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("phase 4 remediation - batch 1", () => {
  it("keeps api-contracts explicit instead of permissive", () => {
    const source = readRepoFile("server/schemas/api-contracts.ts");

    expect(source).not.toContain(".passthrough(");
    expect(source).not.toContain("z.unknown(");
  });

  it("defines request contracts for critical admin and AI routes", () => {
    const requiredRequestContracts = [
      "GET /api/admin/usage",
      "GET /api/admin/users",
      "GET /api/admin/organizations",
      "GET /api/admin/logs",
      "GET /api/admin/logs/:id",
      "POST /api/admin/logs/:id/ai-suggestions",
      "POST /api/agent/studio/stream",
      "POST /api/agent/studio/answer",
      "GET /api/agent/studio/history",
      "GET /api/agent/studio/content-search",
      "GET /api/agent/studio/files",
      "POST /api/agent/studio/reset",
      "POST /api/ai/campaign",
      "POST /api/ai/image",
      "POST /api/ai/edit-image",
      "POST /api/ai/extract-colors",
      "POST /api/ai/image/async",
      "POST /api/ai/image/async/batch",
      "GET /api/ai/image/async/status/:jobId",
      "GET /api/ai/image/async/jobs",
      "DELETE /api/ai/image/async/cancel/:jobId",
      "POST /api/ai/flyer",
      "POST /api/ai/text",
      "POST /api/ai/enhance-prompt",
      "POST /api/ai/convert-prompt",
      "POST /api/chat",
      "POST /api/ai/assistant",
      "GET /api/image-playground/topics",
      "POST /api/image-playground/topics",
      "PATCH /api/image-playground/topics/:id",
      "DELETE /api/image-playground/topics/:id",
      "GET /api/image-playground/batches",
      "DELETE /api/image-playground/batches/:id",
      "POST /api/image-playground/generate",
      "GET /api/image-playground/status/:generationId",
      "DELETE /api/image-playground/generations/:id",
      "PATCH /api/image-playground/generations/:id",
      "POST /api/image-playground/generate-title",
      "GET /api/video-playground/topics",
      "POST /api/video-playground/topics",
      "PATCH /api/video-playground/topics/:id",
      "DELETE /api/video-playground/topics/:id",
      "GET /api/video-playground/sessions",
      "POST /api/video-playground/generate",
      "DELETE /api/video-playground/sessions/:id",
      "DELETE /api/video-playground/generations/:id",
      "PATCH /api/video-playground/generations/:id",
      "POST /api/video-playground/generate-title",
    ];

    for (const routeKey of requiredRequestContracts) {
      const [method, ...pathParts] = routeKey.split(" ");
      const path = pathParts.join(" ");
      const contract = getRouteContract(method, path);

      expect(contract, routeKey).toBeDefined();
      expect(contract?.request, routeKey).toBeDefined();
    }
  });

  it("registers validateRequest on every pending route file", () => {
    const routeFiles = [
      "server/routes/admin.ts",
      "server/routes/agent-studio.ts",
      "server/routes/ai-assistant.ts",
      "server/routes/ai-campaign.ts",
      "server/routes/ai-image.ts",
      "server/routes/ai-text.ts",
      "server/routes/ai-video.ts",
      "server/routes/image-playground.ts",
      "server/routes/video-playground.ts",
    ];

    for (const relativePath of routeFiles) {
      const source = readRepoFile(relativePath);
      expect(source, relativePath).toContain("validateRequest");
    }
  });
});
