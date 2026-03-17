import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteApp } from "./helpers/create-route-app";

describe("brand profile routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns brand profile data from the service layer", async () => {
    const getBrandProfileMock = vi.fn().mockResolvedValue({
      id: "brand-1",
      name: "Poker Lab",
    });

    vi.doMock("../../server/services/brand-profiles-service.js", () => ({
      getBrandProfile: getBrandProfileMock,
      createBrandProfile: vi.fn(),
      updateBrandProfile: vi.fn(),
    }));

    const { registerBrandProfileRoutes } = await import(
      "../../server/routes/db-brand-profiles.js"
    );
    const app = createRouteApp(registerBrandProfileRoutes);

    const response = await request(app).get("/api/db/brand-profiles").query({
      user_id: "auth-user-1",
    });

    expect(response.status).toBe(200);
    expect(response.body.error).toBeNull();
    expect(response.body.data.name).toBe("Poker Lab");
  });

  it("returns not found envelope when update target is missing", async () => {
    const { NotFoundError } = await import("../../server/lib/errors/index.js");
    const updateBrandProfileMock = vi.fn().mockRejectedValue(
      new NotFoundError("Brand profile"),
    );

    vi.doMock("../../server/services/brand-profiles-service.js", () => ({
      getBrandProfile: vi.fn(),
      createBrandProfile: vi.fn(),
      updateBrandProfile: updateBrandProfileMock,
    }));

    const { registerBrandProfileRoutes } = await import(
      "../../server/routes/db-brand-profiles.js"
    );
    const app = createRouteApp(registerBrandProfileRoutes);

    const response = await request(app)
      .put("/api/db/brand-profiles")
      .query({ id: "missing-brand" })
      .send({ name: "Updated brand" });

    expect(response.status).toBe(404);
    expect(response.body.data).toBeNull();
    expect(response.body.error.message).toBe("Brand profile not found");
  });
});
