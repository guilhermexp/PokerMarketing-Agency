import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerApiDocs } from "../../server/lib/api-docs.js";
import { createResponseEnvelopeMiddleware } from "../../server/lib/response-middleware.js";

describe("API docs routes", () => {
  it("serves the generated OpenAPI JSON", async () => {
    const app = express();
    app.use(createResponseEnvelopeMiddleware());
    registerApiDocs(app);

    const response = await request(app).get("/api/openapi.json");

    expect(response.status).toBe(200);
    expect(response.body.data.info.title).toBe("Poker Marketing Agency API");
    expect(response.body.data.paths["/api/db/gallery"]).toBeDefined();
  });

  it("serves Swagger UI", async () => {
    const app = express();
    registerApiDocs(app);

    const response = await request(app).get("/api/docs/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("<div id=\"swagger-ui\"></div>");
  });
});
