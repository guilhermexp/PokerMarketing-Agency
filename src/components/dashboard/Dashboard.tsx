import React, { useEffect, useMemo, useState } from "react";
import { useClerk } from "@clerk/clerk-react";
import type {
  BrandProfile,
  MarketingCampaign,
  ContentInput,
  ChatMessage,
  Theme,
  TournamentEvent,
  GalleryImage,
  ChatReferenceImage,
  GenerationOptions,
  WeekScheduleInfo,
  StyleReference,
  InstagramPublishState,
  CampaignSummary,
  CreativeModel,
} from "../../types";
import type { InstagramContext } from "../../services/rubeService";
import type { WeekScheduleWithCount } from "../../services/apiClient";
import { useCampaigns } from "../../hooks/useAppData";
import { UploadForm } from "../campaigns/UploadForm";
import { ClipsTab } from "../tabs/ClipsTab";
import { CarrosselTab } from "../tabs/CarrosselTab";
import { PostsTab } from "../tabs/PostsTab";
import { AdCreativesTab } from "../tabs/AdCreativesTab";
import { Icon } from "../common/Icon";
import { FlyerGenerator, TimePeriod } from "../flyer/FlyerGenerator";
import { AssistantPanel } from "../assistant/AssistantPanel";
import { AssistantPanelNew } from "../assistant/AssistantPanelNew";
import { GalleryView } from "../gallery/GalleryView";
import { CalendarView } from "../calendar/CalendarView";
import { CampaignsList } from "../campaigns/CampaignsList";
import { SchedulesListView } from "../schedules/SchedulesListView";
import { QuickPostModal } from "../common/QuickPostModal";
import { FloatingSidebar } from "../layout/FloatingSidebar";
import { LimelightNav } from "../ui/limelight-nav";
import { Zap, Layers, Image, Calendar, LayoutGrid, Video } from "lucide-react";
import type { ScheduledPost } from "../../types";
import { PlaygroundView } from "../playground";

type View = "campaign" | "campaigns" | "flyer" | "gallery" | "calendar" | "playground";

interface DashboardProps {
  brandProfile: BrandProfile;
  campaign: MarketingCampaign | null;
  productImages?: { base64: string; mimeType: string }[] | null;
  compositionAssets?: { base64: string; mimeType: string }[] | null; // Assets (ativos) for composition
  onGenerate: (input: ContentInput, options: GenerationOptions) => void;
  isGenerating: boolean;
  onEditProfile: () => void;
  onResetCampaign: () => void;
  isAssistantOpen: boolean;
  onToggleAssistant: () => void;
  assistantHistory: ChatMessage[];
  isAssistantLoading: boolean;
  onAssistantSendMessage: (
    message: string,
    image: ChatReferenceImage | null,
  ) => void;
  chatReferenceImage: ChatReferenceImage | null;
  onSetChatReference: (image: GalleryImage | null) => void;
  theme: Theme;
  onThemeToggle: () => void;
  galleryImages: GalleryImage[];
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onDeleteGalleryImage?: (imageId: string) => void;
  onMarkGalleryImagePublished?: (imageId: string) => void;
  tournamentEvents: TournamentEvent[];
  weekScheduleInfo: WeekScheduleInfo | null;
  onTournamentFileUpload: (file: File) => Promise<void>;
  onAddTournamentEvent: (event: TournamentEvent) => void;
  flyerState: Record<string, (GalleryImage | "loading")[]>;
  setFlyerState: React.Dispatch<
    React.SetStateAction<Record<string, (GalleryImage | "loading")[]>>
  >;
  dailyFlyerState: Record<
    string,
    Record<TimePeriod, (GalleryImage | "loading")[]>
  >;
  setDailyFlyerState: React.Dispatch<
    React.SetStateAction<
      Record<string, Record<TimePeriod, (GalleryImage | "loading")[]>>
    >
  >;
  // Navigation
  activeView: View;
  onViewChange: (view: View) => void;
  onPublishToCampaign: (text: string, flyer: GalleryImage) => void;
  // Style References
  styleReferences: StyleReference[];
  onAddStyleReference: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference: (id: string) => void;
  onSelectStyleReference: (ref: StyleReference) => void;
  selectedStyleReference: StyleReference | null;
  onClearSelectedStyleReference: () => void;
  // Calendar & Scheduling
  scheduledPosts: ScheduledPost[];
  onSchedulePost: (
    post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">,
  ) => void;
  onUpdateScheduledPost: (
    postId: string,
    updates: Partial<ScheduledPost>,
  ) => void;
  onDeleteScheduledPost: (postId: string) => void;
  // Instagram Publishing
  onPublishToInstagram: (post: ScheduledPost) => void;
  publishingStates: Record<string, InstagramPublishState>;
  // Campaigns List
  campaignsList: CampaignSummary[];
  onLoadCampaign: (campaignId: string) => void;
  userId?: string;
  organizationId?: string | null;
  // Week Schedule
  isWeekExpired?: boolean;
  onClearExpiredSchedule?: () => void;
  // All schedules list
  allSchedules?: WeekScheduleWithCount[];
  currentScheduleId?: string | null;
  onSelectSchedule?: (schedule: WeekScheduleWithCount) => void;
  onDeleteSchedule?: (scheduleId: string) => void;
  // Creative Model
  onUpdateCreativeModel?: (model: CreativeModel) => void;
  // Instagram Multi-tenant
  instagramContext?: InstagramContext;
  // Carousel updates
  onCarouselUpdate?: (carousel: import("../../types").CarouselScript) => void;
}

type Tab = "clips" | "carrossel" | "posts" | "ads";

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const {
    brandProfile,
    campaign,
    productImages,
    compositionAssets,
    onGenerate,
    isGenerating,
    onEditProfile,
    onResetCampaign,
    isAssistantOpen,
    onToggleAssistant,
    assistantHistory,
    isAssistantLoading,
    onAssistantSendMessage,
    galleryImages,
    onAddImageToGallery,
    onUpdateGalleryImage,
    tournamentEvents,
    weekScheduleInfo,
    onTournamentFileUpload,
    onAddTournamentEvent,
    flyerState,
    setFlyerState,
    dailyFlyerState,
    setDailyFlyerState,
    chatReferenceImage,
    onSetChatReference,
    activeView,
    onViewChange,
    onPublishToCampaign,
    onDeleteGalleryImage,
    styleReferences,
    onAddStyleReference,
    onRemoveStyleReference,
    onSelectStyleReference,
    selectedStyleReference,
    onClearSelectedStyleReference,
    scheduledPosts,
    onSchedulePost,
    onUpdateScheduledPost,
    onDeleteScheduledPost,
    onPublishToInstagram,
    publishingStates,
    campaignsList: _campaignsList,
    onLoadCampaign,
    userId,
    organizationId,
    isWeekExpired,
    onClearExpiredSchedule,
    allSchedules,
    currentScheduleId,
    onSelectSchedule,
    onDeleteSchedule,
    onMarkGalleryImagePublished,
    instagramContext,
    onCarouselUpdate,
  } = props;

  // Debug log for productImages
  console.debug("[Dashboard] productImages:", productImages ? `${productImages.length} image(s)` : "null");

  const { signOut } = useClerk();
  const { campaigns } = useCampaigns(userId || null, organizationId);
  const [activeTab, setActiveTab] = useState<Tab>("clips");
  const [isInsideSchedule, setIsInsideSchedule] = useState(false);
  const [quickPostImage, setQuickPostImage] = useState<GalleryImage | null>(
    null,
  );

  // Handler to publish carousel directly to Instagram
  const handlePublishCarousel = async (imageUrls: string[], caption: string) => {
    if (!instagramContext?.instagramAccountId) {
      alert('Conecte uma conta do Instagram em Configurações → Integrações');
      return;
    }

    // Create scheduled post for immediate publishing
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    onSchedulePost({
      type: 'flyer',
      contentId: '',
      imageUrl: imageUrls[0],
      carouselImageUrls: imageUrls,
      caption,
      hashtags: [],
      scheduledDate: dateStr,
      scheduledTime: timeStr,
      scheduledTimestamp: Date.now(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platforms: 'instagram',
      status: 'scheduled',
      createdFrom: 'campaign',
      instagramContentType: 'carousel',
    });
  };

  // Format date string (handles both ISO and DD/MM formats)
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    // If already in DD/MM format, return as is
    if (/^\d{2}\/\d{2}$/.test(dateStr)) return dateStr;
    // Parse ISO date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  };

  // Handler para selecionar planilha e entrar no modo edição
  const handleEnterSchedule = (schedule: WeekScheduleWithCount) => {
    onSelectSchedule?.(schedule);
    setIsInsideSchedule(true);
  };

  // Handler para voltar para lista de planilhas
  const handleBackToSchedulesList = () => {
    setIsInsideSchedule(false);
  };

  const hasClips = (campaign?.videoClipScripts?.length ?? 0) > 0;
  const hasPosts = (campaign?.posts?.length ?? 0) > 0;
  const hasAds = (campaign?.adCreatives?.length ?? 0) > 0;
  const hasCarousels =
    (campaign?.carousels?.length ?? 0) > 0 ||
    (campaign?.videoClipScripts?.length ?? 0) > 0;

  const availableTabs = useMemo(
    () =>
      ([
        { id: "clips", label: "Clips", enabled: hasClips },
        { id: "carrossel", label: "Carrossel", enabled: hasCarousels },
        { id: "posts", label: "Social", enabled: hasPosts },
        { id: "ads", label: "Ads", enabled: hasAds },
      ] as const).filter((tab) => tab.enabled),
    [hasClips, hasCarousels, hasPosts, hasAds],
  );

  useEffect(() => {
    if (!campaign || availableTabs.length === 0) return;
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [campaign, availableTabs, activeTab]);

  const showUploadForm = !campaign && !isGenerating;

  return (
    <div className="min-h-[100dvh] md:h-screen flex overflow-hidden bg-black text-white font-sans selection:bg-primary selection:text-black">
      {/* Floating Sidebar - Desktop only */}
      <FloatingSidebar
        activeView={activeView}
        onViewChange={onViewChange}
        brandProfile={brandProfile}
        onEditProfile={onEditProfile}
        onSignOut={() => signOut()}
      />

      <main className="flex-1 overflow-y-auto relative z-10 bg-[#070707] pb-24 sm:pb-[env(safe-area-inset-bottom)] sm:pl-16">
        {activeView === "campaign" && (
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            {showUploadForm && (
              <div className="mb-2">
                <UploadForm
                  onGenerate={onGenerate}
                  isGenerating={isGenerating}
                  brandProfile={brandProfile}
                  onUpdateCreativeModel={
                    props.onUpdateCreativeModel || (() => { })
                  }
                  styleReferences={styleReferences}
                  selectedStyleReference={selectedStyleReference}
                  onSelectStyleReference={onSelectStyleReference}
                  onClearSelectedStyleReference={onClearSelectedStyleReference}
                />
              </div>
            )}

            {/* Recent Campaigns Preview - shown below upload form */}
            {showUploadForm && campaigns.length > 0 && (
              <div className="mt-6 flex flex-col items-center">
                <div className="flex items-center justify-between mb-4 w-full max-w-4xl">
                  <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider">
                    Últimas Campanhas
                  </h3>
                  <button
                    onClick={() => onViewChange("campaigns")}
                    className="text-[10px] text-white/35 hover:text-white/70 transition-colors"
                  >
                    Ver todas →
                  </button>
                </div>
                <div className="flex gap-4 justify-center w-full max-w-4xl">
                  {campaigns.slice(0, 3).map((camp) => {
                    const previewItems = [
                      camp.clip_preview_url ? { url: camp.clip_preview_url, type: 'clip' } : null,
                      camp.post_preview_url ? { url: camp.post_preview_url, type: 'post' } : null,
                      camp.ad_preview_url ? { url: camp.ad_preview_url, type: 'ad' } : null,
                    ].filter(Boolean) as Array<{ url: string; type: string }>;
                    const columns = Math.min(previewItems.length, 3) || 1;
                    const totalAssets = Number(camp.clips_count || 0) + Number(camp.posts_count || 0) + Number(camp.ads_count || 0);

                    return (
                      <div
                        key={camp.id}
                        onClick={() => onLoadCampaign(camp.id)}
                        className="flex-1 max-w-[320px] cursor-pointer bg-[#0a0a0a] rounded-xl overflow-hidden border border-white/[0.06] hover:border-white/[0.12] transition-all hover:scale-[1.02]"
                      >
                        {/* Preview Images */}
                        {totalAssets > 0 && previewItems.length > 0 ? (
                          <>
                            <div className="h-40">
                              <div
                                className={`grid gap-1 h-full grid-rows-1 ${
                                  columns === 1
                                    ? "grid-cols-1"
                                    : columns === 2
                                      ? "grid-cols-2"
                                      : "grid-cols-3"
                                }`}
                              >
                                {previewItems.map((item, i) => (
                                  <div
                                    key={i}
                                    className="relative overflow-hidden h-full bg-white/[0.02]"
                                  >
                                    <img
                                      src={item.url}
                                      alt={item.type}
                                      className="absolute inset-0 w-full h-full object-cover"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Info */}
                            <div className="px-4 py-3">
                              <h4 className="text-xs font-semibold text-white/80 truncate">
                                {camp.name || "Sem título"}
                              </h4>
                              <p className="text-[10px] text-white/35 mt-1">
                                {Number(camp.clips_count) > 0 && `${camp.clips_count} clip${Number(camp.clips_count) !== 1 ? 's' : ''}`}
                                {Number(camp.posts_count) > 0 && ` • ${camp.posts_count} post${Number(camp.posts_count) !== 1 ? 's' : ''}`}
                                {Number(camp.ads_count) > 0 && ` • ${camp.ads_count} ad${Number(camp.ads_count) !== 1 ? 's' : ''}`}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="h-40 bg-white/[0.01] flex items-center justify-center">
                              <p className="text-[10px] text-white/25">Vazia</p>
                            </div>
                            <div className="px-4 py-3">
                              <h4 className="text-xs font-semibold text-white/80 truncate">
                                {camp.name || "Sem título"}
                              </h4>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {isGenerating && (
              <>
                <style>{`
                  @keyframes shimmerText {
                    0% {
                      background-position: -200% 0;
                    }
                    100% {
                      background-position: 200% 0;
                    }
                  }

                  .shimmer-text {
                    background: linear-gradient(
                      90deg,
                      rgba(255, 255, 255, 0.85) 0%,
                      rgba(255, 255, 255, 0.25) 40%,
                      rgba(255, 255, 255, 0.95) 50%,
                      rgba(255, 255, 255, 0.25) 60%,
                      rgba(255, 255, 255, 0.85) 100%
                    );
                    background-size: 200% 100%;
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                    animation: shimmerText 2.4s ease-in-out infinite;
                  }
                `}</style>
                <div className="flex flex-col items-center justify-center text-center p-32 aura-card border-white/5 bg-white/[0.01]">
                  <h2 className="text-4xl font-black tracking-[-0.05em] uppercase shimmer-text">
                    Gerando sua campanha
                  </h2>
                  <p className="text-white/40 mt-4 max-w-xs text-xs font-medium tracking-wide">
                    Agentes autônomos estão configurando seu ecossistema de marketing.
                  </p>
                </div>
                <div className="flex justify-center mt-20">
                  <img
                    src="/logo-socialab.png"
                    alt="Socialab"
                    className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 animate-spin"
                    style={{ animationDuration: "8s" }}
                  />
                </div>
              </>
            )}
            {campaign && (
              <div className="animate-fade-in-up space-y-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="text-left">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                      Campanha Gerada
                    </h2>
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">
                      {campaign.videoClipScripts?.length || 0} clips •{" "}
                      {campaign.posts?.length || 0} posts •{" "}
                      {campaign.adCreatives?.length || 0} anúncios
                      {campaign.toneOfVoiceUsed && (
                        <span className="ml-2 text-white/20">
                          • Tom: {campaign.toneOfVoiceUsed}
                        </span>
                      )}
                      {campaign.generatedWithModel && (
                        <span className="ml-2 text-white/20">
                          • {campaign.generatedWithModel.split("/").pop()}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Tabs Navigation */}
                    {availableTabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all duration-200 ${activeTab === tab.id
                          ? "bg-primary/10 text-primary/80 border border-primary/20"
                          : "bg-transparent text-white/50 hover:text-white/70 hover:border-white/[0.1] border border-white/[0.06]"
                          }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                    <div className="w-px h-6 bg-white/[0.06] mx-1"></div>
                    <button
                      onClick={onResetCampaign}
                      className="flex items-center gap-1.5 px-3 py-2 bg-transparent border border-white/[0.06] rounded-lg text-[10px] font-bold text-white/50 uppercase tracking-wide hover:border-white/[0.1] hover:text-white/70 transition-all"
                    >
                      <Icon name="zap" className="w-3 h-3" />
                      Nova Campanha
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-4">
                  {activeTab === "clips" && (
                      <ClipsTab
                        brandProfile={brandProfile}
                        videoClipScripts={campaign.videoClipScripts}
                        onAddImageToGallery={onAddImageToGallery}
                        onUpdateGalleryImage={onUpdateGalleryImage}
                        onSetChatReference={onSetChatReference}
                        styleReferences={styleReferences}
                        onAddStyleReference={onAddStyleReference}
                        onRemoveStyleReference={onRemoveStyleReference}
                        userId={userId}
                        galleryImages={galleryImages}
                        campaignId={campaign.id}
                        instagramContext={instagramContext}
                        onSchedulePost={onSchedulePost}
                        productImages={productImages}
                      />
                  )}
                  {activeTab === "carrossel" && (
                    <CarrosselTab
                      videoClipScripts={campaign.videoClipScripts}
                      carousels={campaign.carousels}
                      galleryImages={galleryImages}
                      brandProfile={brandProfile}
                      chatReferenceImage={chatReferenceImage || undefined}
                      selectedStyleReference={selectedStyleReference || undefined}
                      compositionAssets={compositionAssets || undefined}
                      productImages={productImages || undefined}
                      onAddImageToGallery={onAddImageToGallery}
                      onUpdateGalleryImage={onUpdateGalleryImage}
                      onSetChatReference={onSetChatReference}
                      onPublishCarousel={instagramContext?.instagramAccountId ? handlePublishCarousel : undefined}
                      onSchedulePost={onSchedulePost}
                      onCarouselUpdate={onCarouselUpdate}
                    />
                  )}
                  {activeTab === "posts" && (
                    <PostsTab
                      posts={campaign.posts}
                      brandProfile={brandProfile}
                      referenceImage={productImages?.[0] || null}
                      chatReferenceImage={chatReferenceImage || undefined}
                      onAddImageToGallery={onAddImageToGallery}
                      onUpdateGalleryImage={onUpdateGalleryImage}
                      onSetChatReference={onSetChatReference}
                      styleReferences={styleReferences}
                      onAddStyleReference={onAddStyleReference}
                      onRemoveStyleReference={onRemoveStyleReference}
                      selectedStyleReference={selectedStyleReference || undefined}
                      compositionAssets={compositionAssets || undefined}
                      userId={userId}
                      galleryImages={galleryImages}
                      campaignId={campaign.id}
                      onQuickPost={setQuickPostImage}
                      onSchedulePost={(image) => {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        tomorrow.setHours(12, 0, 0, 0);
                        const dateStr = tomorrow.toISOString().split("T")[0];
                        onSchedulePost({
                          type: "flyer",
                          contentId: image.id,
                          imageUrl: image.src,
                          caption: image.prompt || "",
                          createdFrom: "campaign",
                          hashtags: [],
                          scheduledDate: dateStr,
                          scheduledTime: "12:00",
                          scheduledTimestamp: tomorrow.getTime(),
                          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                          platforms: "instagram",
                          status: "scheduled",
                        });
                      }}
                    />
                  )}
                  {activeTab === "ads" && (
                    <AdCreativesTab
                      adCreatives={campaign.adCreatives}
                      brandProfile={brandProfile}
                      referenceImage={productImages?.[0] || null}
                      chatReferenceImage={chatReferenceImage || undefined}
                      onAddImageToGallery={onAddImageToGallery}
                      onUpdateGalleryImage={onUpdateGalleryImage}
                      onSetChatReference={onSetChatReference}
                      styleReferences={styleReferences}
                      onAddStyleReference={onAddStyleReference}
                      onRemoveStyleReference={onRemoveStyleReference}
                      selectedStyleReference={selectedStyleReference || undefined}
                      compositionAssets={compositionAssets || undefined}
                      userId={userId}
                      galleryImages={galleryImages}
                      campaignId={campaign.id}
                      onQuickPost={setQuickPostImage}
                      onSchedulePost={(image) => {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        tomorrow.setHours(12, 0, 0, 0);
                        const dateStr = tomorrow.toISOString().split("T")[0];
                        onSchedulePost({
                          type: "flyer",
                          contentId: image.id,
                          imageUrl: image.src,
                          caption: image.prompt || "",
                          createdFrom: "campaign",
                          hashtags: [],
                          scheduledDate: dateStr,
                          scheduledTime: "12:00",
                          scheduledTimestamp: tomorrow.getTime(),
                          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                          platforms: "instagram",
                          status: "scheduled",
                        });
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {activeView === "flyer" && !isInsideSchedule && (
          <SchedulesListView
            schedules={allSchedules || []}
            onSelectSchedule={handleEnterSchedule}
            onFileUpload={onTournamentFileUpload}
            currentScheduleId={currentScheduleId}
            onEnterAfterUpload={() => setIsInsideSchedule(true)}
            onDeleteSchedule={onDeleteSchedule}
            onAddEvent={(event) => {
              onAddTournamentEvent(event);
              setIsInsideSchedule(true);
            }}
          />
        )}
        {activeView === "flyer" && isInsideSchedule && (
          <div className="flex flex-col h-full">
            {/* Back button header */}
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6 border-b border-white/5 flex-shrink-0 bg-[#070707]">
              <button
                onClick={handleBackToSchedulesList}
                className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Voltar às Planilhas
                </span>
              </button>
              {weekScheduleInfo && (
                <>
                  <div className="h-4 w-px bg-white/10" />
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                    Semana {formatDateDisplay(weekScheduleInfo.startDate)} -{" "}
                    {formatDateDisplay(weekScheduleInfo.endDate)}
                  </span>
                </>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <FlyerGenerator
                brandProfile={brandProfile}
                events={tournamentEvents}
                weekScheduleInfo={weekScheduleInfo}
                onFileUpload={onTournamentFileUpload}
                onAddEvent={onAddTournamentEvent}
                onAddImageToGallery={onAddImageToGallery}
                flyerState={flyerState}
                setFlyerState={setFlyerState}
                dailyFlyerState={dailyFlyerState}
                setDailyFlyerState={setDailyFlyerState}
                onUpdateGalleryImage={onUpdateGalleryImage}
                onSetChatReference={onSetChatReference}
                onPublishToCampaign={onPublishToCampaign}
                selectedStyleReference={selectedStyleReference}
                onClearSelectedStyleReference={onClearSelectedStyleReference}
                styleReferences={styleReferences}
                onSelectStyleReference={onSelectStyleReference}
                isWeekExpired={isWeekExpired}
                onClearExpiredSchedule={onClearExpiredSchedule}
                userId={userId}
                allSchedules={allSchedules}
                currentScheduleId={currentScheduleId}
                onSelectSchedule={onSelectSchedule}
                instagramContext={instagramContext}
                galleryImages={galleryImages}
                onSchedulePost={onSchedulePost}
              />
            </div>
          </div>
        )}
        {activeView === "gallery" && (
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <GalleryView
              images={galleryImages}
              onUpdateImage={onUpdateGalleryImage}
              onDeleteImage={onDeleteGalleryImage}
              onSetChatReference={onSetChatReference}
              styleReferences={styleReferences}
              onAddStyleReference={onAddStyleReference}
              onRemoveStyleReference={onRemoveStyleReference}
              onSelectStyleReference={onSelectStyleReference}
              onPublishToCampaign={onPublishToCampaign}
              onQuickPost={setQuickPostImage}
              onSchedulePost={(image) => {
                // Create scheduled post for tomorrow at noon
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(12, 0, 0, 0);
                const dateStr = tomorrow.toISOString().split("T")[0];
                onSchedulePost({
                  type: "flyer",
                  contentId: image.id,
                  createdFrom: "gallery",
                  imageUrl: image.src,
                  caption: image.prompt || "Post agendado",
                  hashtags: [],
                  scheduledDate: dateStr,
                  scheduledTime: "12:00",
                  scheduledTimestamp: tomorrow.getTime(),
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  platforms: "instagram",
                  status: "scheduled",
                });
                onViewChange("calendar");
              }}
            />
          </div>
        )}
        {activeView === "calendar" && (
          <div className="px-4 py-4 sm:px-6 sm:py-5 h-full">
            <CalendarView
              scheduledPosts={scheduledPosts}
              onSchedulePost={onSchedulePost}
              onUpdateScheduledPost={onUpdateScheduledPost}
              onDeleteScheduledPost={onDeleteScheduledPost}
              galleryImages={galleryImages}
              campaigns={campaigns}
              onPublishToInstagram={onPublishToInstagram}
              publishingStates={publishingStates}
            />
          </div>
        )}
        {activeView === "campaigns" && userId && (
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <CampaignsList
              userId={userId}
              organizationId={organizationId}
              onSelectCampaign={onLoadCampaign}
              onNewCampaign={() => onViewChange("campaign")}
              currentCampaignId={campaign?.id}
            />
          </div>
        )}
        {activeView === "playground" && (
          <div className="h-full">
            <PlaygroundView brandProfile={brandProfile} userId={userId} />
          </div>
        )}
      </main>

      {/* Feature Flag: Vercel AI SDK */}
      {import.meta.env.VITE_USE_VERCEL_AI_SDK === 'true' ? (
        <AssistantPanelNew
          isOpen={isAssistantOpen}
          onClose={onToggleAssistant}
          referenceImage={chatReferenceImage}
          onClearReference={() => onSetChatReference(null)}
          brandProfile={brandProfile}
        />
      ) : (
        <AssistantPanel
          isOpen={isAssistantOpen}
          onClose={onToggleAssistant}
          history={assistantHistory}
          isLoading={isAssistantLoading}
          onSendMessage={onAssistantSendMessage}
          referenceImage={chatReferenceImage}
          onClearReference={() => onSetChatReference(null)}
        />
      )}
      {/* Assistant Toggle Button - Desktop */}
      {!isAssistantOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 hidden sm:block">
          <button
            onClick={onToggleAssistant}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-105 bg-white/10 backdrop-blur-xl text-white/60 hover:text-white border border-white/5"
          >
            <Icon name="zap" className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      {(() => {
        const mobileNavItems = [
          { id: "campaign", icon: <Zap />, label: "Direct" },
          { id: "campaigns", icon: <Layers />, label: "Campanhas" },
          { id: "flyer", icon: <Image />, label: "Flyers" },
          { id: "calendar", icon: <Calendar />, label: "Agenda" },
          { id: "gallery", icon: <LayoutGrid />, label: "Galeria" },
          { id: "playground", icon: <Video />, label: "Playground" },
        ] as const;
        const activeNavIndex = mobileNavItems.findIndex(item => item.id === activeView);
        return (
          <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden flex justify-center pb-[max(12px,env(safe-area-inset-bottom))] pt-3 pointer-events-none">
            <div className="pointer-events-auto">
              <LimelightNav
                items={mobileNavItems.map(item => ({
                  id: item.id,
                  icon: item.icon,
                  label: item.label,
                  onClick: () => onViewChange(item.id as View),
                }))}
                activeIndex={activeNavIndex >= 0 ? activeNavIndex : 0}
                onTabChange={(index) => onViewChange(mobileNavItems[index].id as View)}
              />
            </div>
          </div>
        );
      })()}

      {/* QuickPost Modal for Gallery */}
      {quickPostImage && (
        <QuickPostModal
          isOpen={!!quickPostImage}
          onClose={() => setQuickPostImage(null)}
          image={quickPostImage}
          brandProfile={brandProfile}
          context={quickPostImage.prompt || "Imagem da galeria"}
          onImagePublished={onMarkGalleryImagePublished}
          instagramContext={instagramContext}
        />
      )}
    </div>
  );
};
