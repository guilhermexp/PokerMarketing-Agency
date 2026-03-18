import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../server/lib/errors/index.js";
import {
  asyncHandler,
  errorHandler,
  notFoundHandler,
} from "../../server/middleware/errorHandler.js";
import { createResponseEnvelopeMiddleware } from "../../server/lib/response-middleware.js";

vi.mock("../../server/lib/logger.js", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

describe("error handler middleware", () => {
  it("reuses x-request-id and serializes AppError details", async () => {
    const app = express();
    app.use(createResponseEnvelopeMiddleware());
    app.get("/boom", (_req, _res, next) => {
      next(
        new AppError("Nope", "NOPE", 422, true, {
          field: "name",
        }),
      );
    });
    app.use(errorHandler);

    const response = await request(app)
      .get("/boom")
      .set("x-request-id", "req-123");

    expect(response.status).toBe(422);
    expect(response.headers["x-request-id"]).toBe("req-123");
    expect(response.body.error.message).toBe("Nope");
    expect(response.body.error.code).toBe("NOPE");
  });

  it("creates 404 responses through notFoundHandler", async () => {
    const app = express();
    app.use(createResponseEnvelopeMiddleware());
    app.use(notFoundHandler);
    app.use(errorHandler);

    const response = await request(app).get("/missing");

    expect(response.status).toBe(404);
    expect(response.body.error.message).toContain("Route not found");
  });

  it("captures rejected async handlers", async () => {
    const app = express();
    app.use(createResponseEnvelopeMiddleware());
    app.get(
      "/async-boom",
      asyncHandler(async () => {
        throw new Error("async fail");
      }),
    );
    app.use(errorHandler);

    const response = await request(app).get("/async-boom");

    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe("async fail");
  });
});
