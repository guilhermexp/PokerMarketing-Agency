import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { CarouselScript, MarketingCampaign } from "@/types";

type CampaignAsset = { base64: string; mimeType: string };

interface CampaignsStore {
  campaign: MarketingCampaign | null;
  campaignProductImages: CampaignAsset[] | null;
  campaignCompositionAssets: CampaignAsset[] | null;
  isGenerating: boolean;
  setCampaign: (campaign: MarketingCampaign | null) => void;
  setCampaignProductImages: (campaignProductImages: CampaignAsset[] | null) => void;
  setCampaignCompositionAssets: (
    campaignCompositionAssets: CampaignAsset[] | null,
  ) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  updateCarousel: (updatedCarousel: CarouselScript) => void;
  resetCampaignState: () => void;
}

const initialState = {
  campaign: null,
  campaignProductImages: null,
  campaignCompositionAssets: null,
  isGenerating: false,
};

export const useCampaignsStore = create<CampaignsStore>()(
  devtools(
    (set) => ({
      ...initialState,
      setCampaign: (campaign) => set({ campaign }),
      setCampaignProductImages: (campaignProductImages) =>
        set({ campaignProductImages }),
      setCampaignCompositionAssets: (campaignCompositionAssets) =>
        set({ campaignCompositionAssets }),
      setIsGenerating: (isGenerating) => set({ isGenerating }),
      updateCarousel: (updatedCarousel) =>
        set((state) => ({
          campaign: state.campaign
            ? {
                ...state.campaign,
                carousels:
                  state.campaign.carousels?.map((carousel) =>
                    carousel.id === updatedCarousel.id ? updatedCarousel : carousel,
                  ) || [],
              }
            : null,
        })),
      resetCampaignState: () => set(initialState),
    }),
    { name: "CampaignsStore" },
  ),
);
