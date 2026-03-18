import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteApp } from "./helpers/create-route-app";

describe("campaign routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns campaign data from the service layer", async () => {
    const getCampaignsMock = vi.fn().mockResolvedValue([
      { id: "campaign-1", name: "Spring Launch" },
    ]);

    vi.doMock("../../server/services/campaigns-service.js", () => ({
      getCampaigns: getCampaignsMock,
      createCampaign: vi.fn(),
      deleteCampaign: vi.fn(),
      updateCampaignClipThumbnail: vi.fn(),
      updateCampaignSceneImage: vi.fn(),
      getCarousels: vi.fn(),
      updateCarousel: vi.fn(),
      updateCarouselSlideImage: vi.fn(),
    }));

    const { registerCampaignRoutes } = await import("../../server/routes/db-campaigns.js");
    const app = createRouteApp(registerCampaignRoutes);

    const response = await request(app).get("/api/db/campaigns").query({
      user_id: "auth-user-1",
      organization_id: "org-1",
    });

    expect(response.status).toBe(200);
    expect(response.body.error).toBeNull();
    expect(response.body.data).toEqual([
      { id: "campaign-1", name: "Spring Launch" },
    ]);
  });

  it("passes through invalid service output with soft validation", async () => {
    const getCampaignsMock = vi.fn().mockResolvedValue(42);

    vi.doMock("../../server/services/campaigns-service.js", () => ({
      getCampaigns: getCampaignsMock,
      createCampaign: vi.fn(),
      deleteCampaign: vi.fn(),
      updateCampaignClipThumbnail: vi.fn(),
      updateCampaignSceneImage: vi.fn(),
      getCarousels: vi.fn(),
      updateCarousel: vi.fn(),
      updateCarouselSlideImage: vi.fn(),
    }));

    const { registerCampaignRoutes } = await import("../../server/routes/db-campaigns.js");
    const app = createRouteApp(registerCampaignRoutes);

    const response = await request(app).get("/api/db/campaigns").query({
      user_id: "auth-user-1",
      organization_id: "org-1",
    });

    // Soft validation: invalid output is passed through (logged, never blocked)
    expect(response.status).toBe(200);
    expect(response.body.data).toBe(42);
  });
});
