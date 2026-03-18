import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "../../server/middleware/errorHandler.js";
import { createResponseEnvelopeMiddleware } from "../../server/lib/response-middleware.js";
import { validateRequest } from "../../server/middleware/validate.js";

describe("validateRequest middleware", () => {
  it("parses validated values before reaching the handler", async () => {
    const app = express();
    app.use(express.json());
    app.use(createResponseEnvelopeMiddleware());

    app.post(
      "/test",
      validateRequest({
        body: z.object({
          amount: z.coerce.number().int().positive(),
        }),
      }),
      (req, res) => {
        res.json({
          amount: req.body.amount,
          type: typeof req.body.amount,
        });
      },
    );

    app.use(errorHandler);

    const response = await request(app).post("/test").send({ amount: "42" });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ amount: 42, type: "number" });
  });

  it("returns a 400 envelope when validation fails", async () => {
    const app = express();
    app.use(express.json());
    app.use(createResponseEnvelopeMiddleware());

    app.get(
      "/test",
      validateRequest({
        query: z.object({
          user_id: z.string().trim().min(1),
        }),
      }),
      (_req, res) => {
        res.json({ ok: true });
      },
    );

    app.use(errorHandler);

    const response = await request(app).get("/test");

    expect(response.status).toBe(400);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe("Validation failed");
  });
});
