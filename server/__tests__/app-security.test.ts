import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app.js";
import { registerInitRoutes } from "../routes/init.js";

describe("app security defaults", () => {
  it("applies the expected helmet security headers", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("rate limits the csrf token endpoint at 50 requests per minute", async () => {
    let response;

    for (let attempt = 0; attempt < 51; attempt += 1) {
      response = await request(app).get("/api/csrf-token").set("X-Forwarded-For", "198.51.100.10");
    }

    expect(response?.status).toBe(429);
  });

  it("rate limits the db init endpoint at 10 requests per minute", async () => {
    const publicApp = express();
    registerInitRoutes(publicApp);

    let response;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request(publicApp)
        .get("/api/db/init")
        .set("X-Forwarded-For", "198.51.100.11");
    }

    expect(response?.status).toBe(429);
  });
});
