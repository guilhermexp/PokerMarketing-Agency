import { describe, expect, it } from "vitest";
import {
  getOpenApiDocument,
  getRouteContract,
  normalizeOpenApiPath,
  routeContracts,
  validateRouteOutput,
} from "../../server/schemas/api-contracts.js";

describe("API contracts", () => {
  it("normalizes express paths into OpenAPI format", () => {
    expect(normalizeOpenApiPath("/api/video-playground/topics/:id")).toBe(
      "/api/video-playground/topics/{id}",
    );
  });

  it("resolves contracts for registered JSON routes", () => {
    const contract = getRouteContract("GET", "/api/db/gallery");

    expect(contract).toBeDefined();
    expect(contract?.path).toBe("/api/db/gallery");
    expect(contract?.response.kind).toBe("json");
  });

  it("validates route output against the configured schema", () => {
    expect(() =>
      validateRouteOutput("GET", "/health", {
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
    ).not.toThrow();

    expect(() =>
      validateRouteOutput("GET", "/health", {
        status: "ok",
      }),
    ).toThrow();
  });

  it("accepts the structured colors payload returned by /api/ai/extract-colors", () => {
    expect(() =>
      validateRouteOutput("POST", "/api/ai/extract-colors", {
        primaryColor: "#112233",
        secondaryColor: null,
        tertiaryColor: "#445566",
      }),
    ).not.toThrow();
  });

  it("generates an OpenAPI document with JSON and streaming routes", () => {
    const document = getOpenApiDocument();

    expect(document.paths["/api/db/gallery"]?.get).toBeDefined();
    expect(
      document.paths["/api/agent/studio/stream"]?.post?.responses?.["200"]?.content?.[
        "text/event-stream"
      ],
    ).toBeDefined();
    expect(
      document.paths["/api/proxy-video"]?.get?.responses?.["200"]?.content?.[
        "application/octet-stream"
      ],
    ).toBeDefined();
  });

  it("tracks every registered route contract centrally", () => {
    expect(routeContracts).toHaveLength(98);
    expect(getRouteContract("POST", "/api/feedback")).toBeDefined();
  });
});
