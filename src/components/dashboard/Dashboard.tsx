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
  PendingToolEdit,
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
import { ImagePreviewModal } from "../image-preview/ImagePreviewModal";
import { Zap, Layers, Image, Calendar, LayoutGrid, Video } from "lucide-react";
import type { ScheduledPost } from "../../types";
import { PlaygroundView } from "../playground";
import { GeneratingLoader } from "../ui/quantum-pulse-loade";
import { PublishedStoriesWidget } from "../ui/published-stories-widget";

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
  // Tool edit approval
  pendingToolEdit?: PendingToolEdit | null;
  editingImage?: GalleryImage | null;
  onRequestImageEdit?: (request: {
    toolCallId: string;
    toolName: string;
    prompt: string;
    imageId: string;
  }) => void;
  onToolEditApproved?: (toolCallId: string, imageUrl: string) => void;
  onToolEditRejected?: (toolCallId: string, reason?: string) => void;
  onShowToolEditPreview?: (payload: {
    toolCallId: string;
    imageUrl: string;
    prompt?: string;
    referenceImageId?: string;
    referenceImageUrl?: string;
  }) => void;
  toolEditPreview?: import("../image-preview/types").EditPreview | null;
  onCloseImageEditor?: () => void;
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
    // Tool edit approval
    editingImage,
    pendingToolEdit,
    onRequestImageEdit,
    onToolEditApproved,
    onToolEditRejected,
    onCloseImageEditor,
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
      />

      <main className="flex-1 overflow-y-auto relative z-10 bg-black pb-24 sm:pb-[env(safe-area-inset-bottom)] lg:pl-20">
        {activeView === "campaign" && showUploadForm && (
          <>
            {/* Dot Grid Background - only on upload form */}
            <div className="fixed inset-0 pointer-events-none z-0">
              <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(circle, rgb(170, 170, 170) 1px, transparent 1px)', backgroundSize: '40px 40px', backgroundPosition: '10px 10px' }} />
              <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle, rgb(170, 170, 170) 1px, transparent 1px)', backgroundSize: '20px 20px', backgroundPosition: '10px 10px' }} />
              <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle, rgb(170, 170, 170) 1px, transparent 1px)', backgroundSize: '50px 50px', backgroundPosition: '15px 15px' }} />
              <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(circle, rgb(170, 170, 170) 1px, transparent 1px)', backgroundSize: '30px 30px', backgroundPosition: '15px 15px' }} />
              <div className="absolute inset-0" style={{ background: 'radial-gradient(80% 70%, transparent 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.9) 75%, black 100%)' }} />
            </div>
          </>
        )}

        {activeView === "campaign" && (
          <div className="px-4 py-4 sm:px-6 sm:py-5 relative z-10">
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
              <div className="mt-8 sm:mt-12 flex flex-col items-center px-3 sm:px-0">
                {/* Header with Tabs */}
                <div className="w-full max-w-6xl mb-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-8">
                      <button className="text-[15px] font-semibold text-white pb-2 border-b-2 border-white/90">
                        Todas
                      </button>
                      <button className="text-[15px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors pb-2">
                        Vídeos
                      </button>
                      <button className="text-[15px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors pb-2">
                        Posts
                      </button>
                      <button className="text-[15px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors pb-2">
                        Ads
                      </button>
                    </div>
                    <button
                      onClick={() => onViewChange("campaigns")}
                      className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5 font-medium"
                    >
                      Ver todas
                      <Icon name="arrow-right" className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Filter Tags */}
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
                    <button className="px-4 py-2 rounded-full text-sm font-medium bg-black/40 backdrop-blur-2xl border border-white/10 text-white/90 whitespace-nowrap shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                      Todas templates
                    </button>
                    <button className="px-4 py-2 rounded-full text-sm font-medium bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 transition-all whitespace-nowrap shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                      Populares
                    </button>
                    <button className="px-4 py-2 rounded-full text-sm font-medium bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 transition-all whitespace-nowrap shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                      Marketing
                    </button>
                    <button className="px-4 py-2 rounded-full text-sm font-medium bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 transition-all whitespace-nowrap shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                      Social Media
                    </button>
                    <button className="px-4 py-2 rounded-full text-sm font-medium bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 transition-all whitespace-nowrap shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                      Promoções
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
                  {campaigns.slice(0, 3).map((camp) => {
                    const previewItems = [
                      camp.clip_preview_url ? { url: camp.clip_preview_url, type: 'clip' } : null,
                      camp.post_preview_url ? { url: camp.post_preview_url, type: 'post' } : null,
                      camp.ad_preview_url ? { url: camp.ad_preview_url, type: 'ad' } : null,
                      camp.carousel_preview_url ? { url: camp.carousel_preview_url, type: 'carousel' } : null,
                    ].filter(Boolean) as Array<{ url: string; type: string }>;
                    const columns = Math.min(previewItems.length, 4) || 1;
                    const totalAssets = Number(camp.clips_count || 0) + Number(camp.posts_count || 0) + Number(camp.ads_count || 0) + Number(camp.carousels_count || 0);

                    return (
                      <div
                        key={camp.id}
                        onClick={() => onLoadCampaign(camp.id)}
                        className="group cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
                      >
                        {/* Preview Images with Overlay Text */}
                        {totalAssets > 0 && previewItems.length > 0 ? (
                          <div className="aspect-video relative overflow-hidden bg-black ring-1 ring-zinc-800/50">
                            {/* Image Grid */}
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
                              {previewItems.map((item, i) => (
                                <div
                                  key={i}
                                  className="relative overflow-hidden h-full"
                                >
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
                                {camp.name || "Sem título"}
                              </h4>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {isGenerating && <GeneratingLoader />}
            {campaign && (
              <div className="animate-fade-in-up space-y-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="text-left">
                    <h2 className="text-3xl font-semibold text-white tracking-tight">
                      Campanha Gerada
                    </h2>
                    <p className="text-sm text-white/50 mt-2">
                      {campaign.videoClipScripts?.length || 0} clips •{" "}
                      {campaign.posts?.length || 0} posts •{" "}
                      {campaign.adCreatives?.length || 0} anúncios
                      {campaign.toneOfVoiceUsed && (
                        <span className="ml-2">
                          • Tom: {campaign.toneOfVoiceUsed}
                        </span>
                      )}
                      {campaign.generatedWithModel && (
                        <span className="ml-2">
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
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 backdrop-blur-2xl border shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${activeTab === tab.id
                          ? "bg-black/40 border-white/10 text-white/90"
                          : "bg-black/40 border-white/10 text-white/60 hover:text-white/90 hover:border-white/30"
                          }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                    <button
                      onClick={onResetCampaign}
                      className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                    >
                      <Icon name="zap" className="w-4 h-4" />
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
                          caption: "",
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
                          caption: "",
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
                  caption: "",
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
          onUpdateReference={(ref) => onSetChatReference({ id: ref.id, src: ref.src })}
          galleryImages={galleryImages}
          brandProfile={brandProfile}
          pendingToolEdit={props.pendingToolEdit}
          onRequestImageEdit={props.onRequestImageEdit}
          onToolEditApproved={props.onToolEditApproved}
          onToolEditRejected={props.onToolEditRejected}
          onShowToolEditPreview={props.onShowToolEditPreview}
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

      {/* ImagePreviewModal for Tool Edit Approval */}
      {editingImage && (
        <ImagePreviewModal
          image={editingImage}
          onClose={onCloseImageEditor || (() => {})}
          onImageUpdate={(newSrc) => {
            // Update gallery image
            onUpdateGalleryImage?.(editingImage.id, newSrc);
          }}
          onSetChatReference={onSetChatReference}
          pendingToolEdit={pendingToolEdit}
          onToolEditApproved={onToolEditApproved}
          onToolEditRejected={onToolEditRejected}
          initialEditPreview={props.toolEditPreview || null}
          chatComponent={
            import.meta.env.VITE_USE_VERCEL_AI_SDK === 'true' ? (
              <AssistantPanelNew
                isOpen={true}
                onClose={() => {}}
                referenceImage={chatReferenceImage}
                onClearReference={() => onSetChatReference(null)}
                onUpdateReference={(ref) => onSetChatReference({ id: ref.id, src: ref.src })}
                galleryImages={galleryImages}
                brandProfile={brandProfile}
                pendingToolEdit={props.pendingToolEdit}
                onRequestImageEdit={props.onRequestImageEdit}
                onToolEditApproved={props.onToolEditApproved}
                onToolEditRejected={props.onToolEditRejected}
                onShowToolEditPreview={props.onShowToolEditPreview}
              />
            ) : null
          }
        />
      )}

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

      {/* Published Stories Widget - Floating bottom left */}
      <PublishedStoriesWidget
        scheduledPosts={scheduledPosts}
        brandProfile={brandProfile}
      />

      {/* Footer - Desktop only */}
      <footer className="fixed bottom-4 left-4 z-[10000] pointer-events-auto hidden lg:flex flex-col items-center gap-2 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10 p-2 shadow-[0_25px_90px_rgba(0,0,0,0.7)]">
        <button
          onClick={onEditProfile}
          className="flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          title={brandProfile.name}
        >
          {brandProfile.logo ? (
            <img
              src={brandProfile.logo}
              alt="Logo"
              className="w-10 h-10 rounded-xl object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
              <span className="text-sm font-semibold">
                {brandProfile.name.substring(0, 1).toUpperCase()}
              </span>
            </div>
          )}
        </button>

        <button
          onClick={() => signOut()}
          className="flex items-center justify-center p-2.5 cursor-pointer text-white hover:text-red-400 active:scale-95 transition-all rounded-xl hover:bg-white/5"
          title="Sair"
        >
          <Icon name="log-out" className="w-5 h-5" />
        </button>
      </footer>
    </div>
  );
};
