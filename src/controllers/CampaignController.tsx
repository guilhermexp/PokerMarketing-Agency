import React, { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useCampaignHandlers } from "@/hooks/useCampaignHandlers";
import { useTransformedCampaignsList } from "@/hooks/useDataTransformers";
import { useCampaigns } from "@/hooks/useAppData";
import { useBrandProfileController } from "@/controllers/BrandProfileController";
import { useCampaignsStore } from "@/stores/campaigns-store";
import type { DbCampaign } from "@/services/apiClient";
import type { CampaignSummary, MarketingCampaign } from "@/types";

interface CampaignControllerValue {
  campaign: MarketingCampaign | null;
  campaignProductImages: { base64: string; mimeType: string }[] | null;
  campaignCompositionAssets: { base64: string; mimeType: string }[] | null;
  isGenerating: boolean;
  campaigns: DbCampaign[];
  campaignsList: CampaignSummary[];
  handleGenerateCampaign: ReturnType<
    typeof useCampaignHandlers
  >["handleGenerateCampaign"];
  handleCreateCarouselFromPrompt: ReturnType<
    typeof useCampaignHandlers
  >["handleCreateCarouselFromPrompt"];
  handleLoadCampaign: ReturnType<
    typeof useCampaignHandlers
  >["handleLoadCampaign"];
  handlePublishFlyerToCampaign: ReturnType<
    typeof useCampaignHandlers
  >["handlePublishFlyerToCampaign"];
  handleResetCampaign: ReturnType<
    typeof useCampaignHandlers
  >["handleResetCampaign"];
  handleCarouselUpdate: ReturnType<
    typeof useCampaignHandlers
  >["handleCarouselUpdate"];
}

const CampaignControllerContext = createContext<CampaignControllerValue | null>(
  null
);

interface CampaignControllerProps {
  children: ReactNode;
}

export function CampaignController({ children }: CampaignControllerProps) {
  const { brandProfile, onViewChange, organizationId, setError, userId } =
    useBrandProfileController();

  const campaign = useCampaignsStore((state) => state.campaign);
  const setCampaign = useCampaignsStore((state) => state.setCampaign);
  const campaignProductImages = useCampaignsStore(
    (state) => state.campaignProductImages
  );
  const setCampaignProductImages = useCampaignsStore(
    (state) => state.setCampaignProductImages
  );
  const campaignCompositionAssets = useCampaignsStore(
    (state) => state.campaignCompositionAssets
  );
  const setCampaignCompositionAssets = useCampaignsStore(
    (state) => state.setCampaignCompositionAssets
  );
  const isGenerating = useCampaignsStore((state) => state.isGenerating);
  const setIsGenerating = useCampaignsStore((state) => state.setIsGenerating);

  const { campaigns = [], addCampaign: swrAddCampaign } = useCampaigns(
    userId,
    organizationId
  );
  const campaignsList = useTransformedCampaignsList(campaigns);

  const {
    handleGenerateCampaign,
    handleCreateCarouselFromPrompt,
    handleLoadCampaign,
    handlePublishFlyerToCampaign,
    handleResetCampaign,
    handleCarouselUpdate,
  } = useCampaignHandlers({
    userId,
    organizationId,
    brandProfile,
    campaign,
    setCampaign,
    setCampaignProductImages,
    setCampaignCompositionAssets,
    setIsGenerating,
    setError,
    swrAddCampaign,
    onViewChange,
  });

  const value = useMemo<CampaignControllerValue>(
    () => ({
      campaign,
      campaignProductImages,
      campaignCompositionAssets,
      isGenerating,
      campaigns,
      campaignsList,
      handleGenerateCampaign,
      handleCreateCarouselFromPrompt,
      handleLoadCampaign,
      handlePublishFlyerToCampaign,
      handleResetCampaign,
      handleCarouselUpdate,
    }),
    [
      campaign,
      campaignProductImages,
      campaignCompositionAssets,
      isGenerating,
      campaigns,
      campaignsList,
      handleGenerateCampaign,
      handleCreateCarouselFromPrompt,
      handleLoadCampaign,
      handlePublishFlyerToCampaign,
      handleResetCampaign,
      handleCarouselUpdate,
    ]
  );

  return (
    <CampaignControllerContext.Provider value={value}>
      {children}
    </CampaignControllerContext.Provider>
  );
}

export function useCampaignController() {
  const context = useContext(CampaignControllerContext);

  if (!context) {
    throw new Error("useCampaignController must be used within CampaignController");
  }

  return context;
}
