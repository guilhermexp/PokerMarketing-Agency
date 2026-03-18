import { beforeEach, describe, expect, it } from "vitest";
import { useCampaignsStore } from "../campaigns-store";
import type { CarouselScript, MarketingCampaign } from "@/types";

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

  it("atualiza o carousel correto e reseta o estado client-only", () => {
    useCampaignsStore.getState().setCampaign(campaign);
    useCampaignsStore.getState().setCampaignProductImages([
      { base64: "abc", mimeType: "image/png" },
    ]);

    const updatedCarousel: CarouselScript = {
      ...campaign.carousels[0],
      title: "Carousel atualizado",
    };

    useCampaignsStore.getState().updateCarousel(updatedCarousel);
    expect(useCampaignsStore.getState().campaign?.carousels?.[0]?.title).toBe(
      "Carousel atualizado",
    );

    useCampaignsStore.getState().resetCampaignState();
    expect(useCampaignsStore.getState().campaign).toBeNull();
    expect(useCampaignsStore.getState().campaignProductImages).toBeNull();
  });
});
