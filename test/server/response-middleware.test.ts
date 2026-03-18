import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createResponseEnvelopeMiddleware } from "../../server/lib/response-middleware.js";

describe("response middleware", () => {
  it("bypasses the envelope when skipResponseEnvelope is enabled", async () => {
    const app = express();
    app.use(createResponseEnvelopeMiddleware());
    app.get("/raw", (_req, res) => {
      res.locals.skipResponseEnvelope = true;
      res.json({ ok: true });
    });

    const response = await request(app).get("/raw");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("converts error-like payloads into error envelopes", async () => {
    const app = express();
    app.use(createResponseEnvelopeMiddleware());
    app.get("/error", (_req, res) => {
      res.status(400).json({ error: "broken" });
    });

    const response = await request(app).get("/error");

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe("broken");
  });
});
