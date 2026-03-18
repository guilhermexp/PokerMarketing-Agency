import { beforeEach, describe, expect, it } from "vitest";
import { useCampaignsStore } from "../campaigns-store";
import type { CampaignSummary, CarouselScript, MarketingCampaign } from "@/types";

const summary: CampaignSummary = {
  id: "campaign-1",
  name: "Launch",
  status: "draft",
  createdAt: "2026-03-18T00:00:00.000Z",
};

const campaign: MarketingCampaign = {
  id: "campaign-1",
  name: "Launch",
  videoClipScripts: [],
  posts: [],
  adCreatives: [],
  carousels: [
    {
      id: "carousel-1",
      title: "Carousel",
      hook: "Hook",
      slides: [],
      cover_prompt: "Prompt",
    },
  ],
};

describe("useCampaignsStore", () => {
  beforeEach(() => {
    useCampaignsStore.getState().resetCampaignState();
  });

  it("adiciona e atualiza um resumo de campanha sem duplicar ids", () => {
    useCampaignsStore.getState().addCampaignSummary(summary);
    useCampaignsStore.getState().addCampaignSummary({ ...summary, name: "Updated" });
    useCampaignsStore.getState().updateCampaignSummary("campaign-1", { status: "ready" });

    expect(useCampaignsStore.getState().campaignsList).toEqual([
      { ...summary, name: "Updated", status: "ready" },
    ]);
  });

  it("remove a campanha ativa e atualiza o carousel correto", () => {
    useCampaignsStore.getState().setCampaign(campaign);

    const updatedCarousel: CarouselScript = {
      ...campaign.carousels[0],
      title: "Carousel atualizado",
    };

    useCampaignsStore.getState().updateCarousel(updatedCarousel);
    expect(useCampaignsStore.getState().campaign?.carousels?.[0]?.title).toBe(
      "Carousel atualizado",
    );

    useCampaignsStore.getState().removeCampaignSummary("campaign-1");
    expect(useCampaignsStore.getState().campaign).toBeNull();
  });
});
