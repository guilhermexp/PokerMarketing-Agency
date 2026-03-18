import React, { Suspense, lazy } from "react";
import { AnimatePresence } from "framer-motion";
import { UploadForm } from "../campaigns/UploadForm";
import { Icon } from "../common/Icon";
import { GeneratingLoader } from "../ui/quantum-pulse-loade";
import { IMAGE_GENERATION_MODEL_OPTIONS } from "../../config/imageGenerationModelOptions";
import type { GalleryImage, ImageModel, MarketingCampaign } from "../../types";
import type { DashboardProps, Tab } from "./dashboard-shared";
import {
  DOT_GRID_STYLE_20,
  DOT_GRID_STYLE_30,
  DOT_GRID_STYLE_40,
  DOT_GRID_STYLE_50,
  VIGNETTE_STYLE,
  ViewLoadingFallback,
} from "./dashboard-shared";

const ClipsTab = lazy(() =>
  import("../tabs/ClipsTab").then((m) => ({ default: m.ClipsTab })),
);
const CarrosselTab = lazy(() =>
  import("../carousel/CarouselTab").then((m) => ({ default: m.CarouselTab })),
);
const PostsTab = lazy(() =>
  import("../tabs/PostsTab").then((m) => ({ default: m.PostsTab })),
);
const AdCreativesTab = lazy(() =>
  import("../tabs/AdCreativesTab").then((m) => ({ default: m.AdCreativesTab })),
);

interface CampaignPreview {
  ad_preview_url?: string | null;
  ads_count?: number | string | null;
  carousel_preview_url?: string | null;
  carousels_count?: number | string | null;
  clip_preview_url?: string | null;
  clips_count?: number | string | null;
  id: string;
  name?: string | null;
  post_preview_url?: string | null;
  posts_count?: number | string | null;
}

interface DashboardCampaignViewProps {
  activeTab: Tab;
  brandProfile: DashboardProps["brandProfile"];
  campaign: MarketingCampaign | null;
  campaigns: CampaignPreview[];
  chatReferenceImage: DashboardProps["chatReferenceImage"];
  compositionAssets: DashboardProps["compositionAssets"];
  galleryImages: DashboardProps["galleryImages"];
  instagramContext: DashboardProps["instagramContext"];
  isGenerating: boolean;
  isTabPending: boolean;
  onAddImageToGallery: DashboardProps["onAddImageToGallery"];
  onAddStyleReference: DashboardProps["onAddStyleReference"];
  onCarouselUpdate: DashboardProps["onCarouselUpdate"];
  onClearSelectedStyleReference: DashboardProps["onClearSelectedStyleReference"];
  onGenerate: DashboardProps["onGenerate"];
  onLoadCampaign: DashboardProps["onLoadCampaign"];
  onPublishToCampaign: DashboardProps["onPublishToCampaign"];
  onResetCampaign: DashboardProps["onResetCampaign"];
  onSchedulePost: DashboardProps["onSchedulePost"];
  onSelectStyleReference: DashboardProps["onSelectStyleReference"];
  onSetChatReference: DashboardProps["onSetChatReference"];
  onUpdateCreativeModel?: DashboardProps["onUpdateCreativeModel"];
  onUpdateGalleryImage: DashboardProps["onUpdateGalleryImage"];
  onViewChange: DashboardProps["onViewChange"];
  productImages: DashboardProps["productImages"];
  selectedCampaignImageModel: ImageModel;
  selectedStyleReference: DashboardProps["selectedStyleReference"];
  setActiveTab: React.Dispatch<React.SetStateAction<Tab>>;
  setQuickPostImage: React.Dispatch<React.SetStateAction<GalleryImage | null>>;
  setSelectedCampaignImageModel: React.Dispatch<React.SetStateAction<ImageModel>>;
  showUploadForm: boolean;
  startTabTransition: React.TransitionStartFunction;
  styleReferences: DashboardProps["styleReferences"];
  userId: DashboardProps["userId"];
}

function renderCampaignPreviewCard(
  campaign: CampaignPreview,
  onLoadCampaign: DashboardProps["onLoadCampaign"],
) {
  const previewItems = [
    campaign.clip_preview_url ? { url: campaign.clip_preview_url, type: "clip" } : null,
    campaign.post_preview_url ? { url: campaign.post_preview_url, type: "post" } : null,
    campaign.ad_preview_url ? { url: campaign.ad_preview_url, type: "ad" } : null,
    campaign.carousel_preview_url
      ? { url: campaign.carousel_preview_url, type: "carousel" }
      : null,
  ].filter(Boolean) as Array<{ type: string; url: string }>;
  const columns = Math.min(previewItems.length, 4) || 1;
  const totalAssets =
    Number(campaign.clips_count || 0) +
    Number(campaign.posts_count || 0) +
    Number(campaign.ads_count || 0) +
    Number(campaign.carousels_count || 0);

  return (
    <div
      key={campaign.id}
      onClick={() => onLoadCampaign(campaign.id)}
      className="group cursor-pointer rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
    >
      {totalAssets > 0 && previewItems.length > 0 ? (
        <div className="aspect-video relative overflow-hidden bg-black ring-1 ring-zinc-800/50">
          <div
            className={`grid gap-0.5 h-full grid-rows-1 ${
              columns === 1
                ? "grid-cols-1"
                : columns === 2
                  ? "grid-cols-2"
                  : columns === 3
                    ? "grid-cols-3"
                    : "grid-cols-4"
            }`}
          >
            {previewItems.map((item, index) => (
              <div key={index} className="relative overflow-hidden h-full">
                <img
                  src={item.url}
                  alt={item.type}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="aspect-video relative overflow-hidden bg-zinc-900 flex items-center justify-center ring-1 ring-zinc-800/50">
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <p className="text-sm text-zinc-500 relative z-10">Sem conteúdo</p>
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <h4 className="text-lg font-semibold text-white line-clamp-1">
              {campaign.name || "Sem título"}
            </h4>
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardCampaignView({
  activeTab,
  brandProfile,
  campaign,
  campaigns,
  chatReferenceImage,
  compositionAssets,
  galleryImages,
  instagramContext,
  isGenerating,
  isTabPending,
  onAddImageToGallery,
  onAddStyleReference,
  onCarouselUpdate,
  onClearSelectedStyleReference,
  onGenerate,
  onLoadCampaign,
  onPublishToCampaign,
  onResetCampaign,
  onSchedulePost,
  onSelectStyleReference,
  onSetChatReference,
  onUpdateCreativeModel,
  onUpdateGalleryImage,
  onViewChange,
  productImages,
  selectedCampaignImageModel,
  selectedStyleReference,
  setActiveTab,
  setQuickPostImage,
  setSelectedCampaignImageModel,
  showUploadForm,
  startTabTransition,
  styleReferences,
  userId,
}: DashboardCampaignViewProps) {
  const hasClips = (campaign?.videoClipScripts?.length ?? 0) > 0;
  const hasPosts = (campaign?.posts?.length ?? 0) > 0;
  const hasAds = (campaign?.adCreatives?.length ?? 0) > 0;
  const hasCarousels =
    (campaign?.carousels?.length ?? 0) > 0 ||
    (campaign?.videoClipScripts?.length ?? 0) > 0;

  const availableTabs = ([
    { id: "clips", label: "Clips", enabled: hasClips },
    { id: "carrossel", label: "Carrossel", enabled: hasCarousels },
    { id: "posts", label: "Social", enabled: hasPosts },
    { id: "ads", label: "Ads", enabled: hasAds },
  ] as const).filter((tab) => tab.enabled);

  const handlePublishCarousel = async (imageUrls: string[], caption: string) => {
    if (!instagramContext?.instagramAccountId) {
      alert("Conecte uma conta do Instagram em Configurações → Integrações");
      return;
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    onSchedulePost({
      type: "flyer",
      contentId: "",
      imageUrl: imageUrls[0],
      carouselImageUrls: imageUrls,
      caption,
      hashtags: [],
      scheduledDate: dateStr,
      scheduledTime: timeStr,
      scheduledTimestamp: Date.now(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platforms: "instagram",
      status: "scheduled",
      createdFrom: "campaign",
      instagramContentType: "carousel",
    });
  };

  return (
    <>
      {showUploadForm ? (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 opacity-50" style={DOT_GRID_STYLE_40} />
          <div className="absolute inset-0 opacity-30" style={DOT_GRID_STYLE_20} />
          <div className="absolute inset-0 opacity-40" style={DOT_GRID_STYLE_50} />
          <div className="absolute inset-0 opacity-25" style={DOT_GRID_STYLE_30} />
          <div className="absolute inset-0" style={VIGNETTE_STYLE} />
        </div>
      ) : null}

      <div
        className={`px-4 sm:px-6 relative z-10 ${
          showUploadForm && campaigns.length === 0
            ? "py-4 sm:py-5 flex flex-col items-center justify-center min-h-[calc(100dvh-2rem)]"
            : "pt-32 sm:pt-40 pb-4 sm:pb-5"
        }`}
      >
        {showUploadForm ? (
          <div className={campaigns.length === 0 ? "w-full" : "mb-2"}>
            <UploadForm
              onGenerate={onGenerate}
              isGenerating={isGenerating}
              brandProfile={brandProfile}
              onUpdateCreativeModel={onUpdateCreativeModel || (() => {})}
              styleReferences={styleReferences}
              selectedStyleReference={selectedStyleReference}
              onSelectStyleReference={onSelectStyleReference}
              onClearSelectedStyleReference={onClearSelectedStyleReference}
            />
          </div>
        ) : null}

        {showUploadForm && campaigns.length > 0 ? (
          <div className="mt-24 sm:mt-32 flex flex-col items-center px-3 sm:px-0">
            <div className="w-full max-w-6xl mb-0.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button className="text-[10px] font-semibold text-white border-b border-white/90">
                    Todas
                  </button>
                  <button className="text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
                    Vídeos
                  </button>
                  <button className="text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
                    Posts
                  </button>
                  <button className="text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
                    Ads
                  </button>
                </div>
                <button
                  onClick={() => onViewChange("campaigns")}
                  className="text-[9px] text-zinc-400 hover:text-white transition-colors flex items-center gap-0.5 font-medium"
                >
                  Ver todas
                  <Icon name="arrow-right" className="w-1.5 h-1.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-6xl">
              {campaigns.slice(0, 6).map((item) =>
                renderCampaignPreviewCard(item, onLoadCampaign),
              )}
            </div>
          </div>
        ) : null}

        <AnimatePresence>{isGenerating ? <GeneratingLoader /> : null}</AnimatePresence>

        {campaign ? (
          <div className="animate-fade-in-up space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="text-left">
                <h2 className="text-3xl font-semibold text-white tracking-tight">
                  Campanha Gerada
                </h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {campaign.videoClipScripts?.length || 0} clips •{" "}
                  {campaign.posts?.length || 0} posts •{" "}
                  {campaign.adCreatives?.length || 0} anúncios
                  {campaign.toneOfVoiceUsed ? (
                    <span className="ml-2">• Tom: {campaign.toneOfVoiceUsed}</span>
                  ) : null}
                  {campaign.generatedWithModel ? (
                    <span className="ml-2">
                      • {campaign.generatedWithModel.split("/").pop()}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-2xl border border-border px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    Imagem
                  </span>
                  <select
                    value={selectedCampaignImageModel}
                    onChange={(event) =>
                      setSelectedCampaignImageModel(event.target.value as ImageModel)
                    }
                    className="bg-transparent border border-white/10 rounded-full px-3 py-1 text-xs text-white/90 focus:outline-none focus:border-white/30"
                    title="Modelo global de geração de imagens da campanha"
                  >
                    {IMAGE_GENERATION_MODEL_OPTIONS.map((option) => (
                      <option key={option.model} value={option.model}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {availableTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => startTabTransition(() => setActiveTab(tab.id))}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 backdrop-blur-2xl border shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${
                      activeTab === tab.id
                        ? "bg-black/40 border-border text-white/90"
                        : "bg-black/40 border-border text-muted-foreground hover:text-white/90"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
                <button
                  onClick={onResetCampaign}
                  className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-border rounded-full text-sm font-medium text-muted-foreground hover:text-white/90 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                >
                  <Icon name="zap" className="w-4 h-4" />
                  Nova Campanha
                </button>
              </div>
            </div>

            <div
              className={`space-y-4 ${
                isTabPending ? "opacity-70 transition-opacity duration-150" : ""
              }`}
            >
              {activeTab === "clips" ? (
                <Suspense fallback={<ViewLoadingFallback />}>
                  <ClipsTab
                    brandProfile={brandProfile}
                    videoClipScripts={campaign.videoClipScripts}
                    selectedImageModel={selectedCampaignImageModel}
                    onChangeSelectedImageModel={setSelectedCampaignImageModel}
                    onAddImageToGallery={onAddImageToGallery}
                    onUpdateGalleryImage={onUpdateGalleryImage}
                    onSetChatReference={onSetChatReference}
                    styleReferences={styleReferences}
                    onAddStyleReference={onAddStyleReference}
                    onRemoveStyleReference={undefined}
                    userId={userId}
                    galleryImages={galleryImages}
                    campaignId={campaign.id}
                    instagramContext={instagramContext}
                    onSchedulePost={onSchedulePost}
                    productImages={productImages}
                  />
                </Suspense>
              ) : null}
              {activeTab === "carrossel" ? (
                <Suspense fallback={<ViewLoadingFallback />}>
                  <CarrosselTab
                    videoClipScripts={campaign.videoClipScripts}
                    carousels={campaign.carousels}
                    galleryImages={galleryImages}
                    brandProfile={brandProfile}
                    chatReferenceImage={chatReferenceImage || undefined}
                    selectedStyleReference={selectedStyleReference || undefined}
                    compositionAssets={compositionAssets || undefined}
                    productImages={productImages || undefined}
                    selectedImageModel={selectedCampaignImageModel}
                    onAddImageToGallery={onAddImageToGallery}
                    onUpdateGalleryImage={onUpdateGalleryImage}
                    onSetChatReference={onSetChatReference}
                    onPublishCarousel={
                      instagramContext?.instagramAccountId
                        ? handlePublishCarousel
                        : undefined
                    }
                    onSchedulePost={onSchedulePost}
                    onCarouselUpdate={onCarouselUpdate}
                  />
                </Suspense>
              ) : null}
              {activeTab === "posts" ? (
                <Suspense fallback={<ViewLoadingFallback />}>
                  <PostsTab
                    posts={campaign.posts}
                    brandProfile={brandProfile}
                    selectedImageModel={selectedCampaignImageModel}
                    onChangeSelectedImageModel={setSelectedCampaignImageModel}
                    referenceImage={productImages?.[0] || null}
                    chatReferenceImage={chatReferenceImage || undefined}
                    onAddImageToGallery={onAddImageToGallery}
                    onUpdateGalleryImage={onUpdateGalleryImage}
                    onSetChatReference={onSetChatReference}
                    styleReferences={styleReferences}
                    onAddStyleReference={onAddStyleReference}
                    onRemoveStyleReference={undefined}
                    selectedStyleReference={selectedStyleReference || undefined}
                    compositionAssets={compositionAssets || undefined}
                    userId={userId}
                    galleryImages={galleryImages}
                    campaignId={campaign.id}
                    onQuickPost={setQuickPostImage}
                    onSchedulePost={(image) => onPublishToCampaign("", image)}
                  />
                </Suspense>
              ) : null}
              {activeTab === "ads" ? (
                <Suspense fallback={<ViewLoadingFallback />}>
                  <AdCreativesTab
                    adCreatives={campaign.adCreatives}
                    brandProfile={brandProfile}
                    selectedImageModel={selectedCampaignImageModel}
                    onChangeSelectedImageModel={setSelectedCampaignImageModel}
                    referenceImage={productImages?.[0] || null}
                    chatReferenceImage={chatReferenceImage || undefined}
                    onAddImageToGallery={onAddImageToGallery}
                    onUpdateGalleryImage={onUpdateGalleryImage}
                    onSetChatReference={onSetChatReference}
                    styleReferences={styleReferences}
                    onAddStyleReference={onAddStyleReference}
                    onRemoveStyleReference={undefined}
                    selectedStyleReference={selectedStyleReference || undefined}
                    compositionAssets={compositionAssets || undefined}
                    userId={userId}
                    galleryImages={galleryImages}
                    campaignId={campaign.id}
                    onQuickPost={setQuickPostImage}
                    onSchedulePost={(image) => onPublishToCampaign("", image)}
                  />
                </Suspense>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
