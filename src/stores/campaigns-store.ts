import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { CampaignSummary, CarouselScript, MarketingCampaign } from "@/types";

type CampaignAsset = { base64: string; mimeType: string };

interface CampaignsStore {
  campaign: MarketingCampaign | null;
  campaignsList: CampaignSummary[];
  campaignProductImages: CampaignAsset[] | null;
  campaignCompositionAssets: CampaignAsset[] | null;
  isGenerating: boolean;
  setCampaign: (campaign: MarketingCampaign | null) => void;
  setCampaignsList: (campaignsList: CampaignSummary[]) => void;
  addCampaignSummary: (campaign: CampaignSummary) => void;
  updateCampaignSummary: (id: string, updates: Partial<CampaignSummary>) => void;
  removeCampaignSummary: (id: string) => void;
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
  campaignsList: [],
  campaignProductImages: null,
  campaignCompositionAssets: null,
  isGenerating: false,
};

export const useCampaignsStore = create<CampaignsStore>()(
  devtools(
    (set) => ({
      ...initialState,
      setCampaign: (campaign) => set({ campaign }),
      setCampaignsList: (campaignsList) => set({ campaignsList }),
      addCampaignSummary: (campaign) =>
        set((state) => ({
          campaignsList: [
            campaign,
            ...state.campaignsList.filter((item) => item.id !== campaign.id),
          ],
        })),
      updateCampaignSummary: (id, updates) =>
        set((state) => ({
          campaignsList: state.campaignsList.map((campaign) =>
            campaign.id === id ? { ...campaign, ...updates } : campaign,
          ),
        })),
      removeCampaignSummary: (id) =>
        set((state) => ({
          campaignsList: state.campaignsList.filter((campaign) => campaign.id !== id),
          campaign: state.campaign?.id === id ? null : state.campaign,
        })),
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
