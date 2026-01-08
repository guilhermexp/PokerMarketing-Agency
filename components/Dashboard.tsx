import React, { useState } from "react";
import { useClerk } from "@clerk/clerk-react";
import type {
  BrandProfile,
  MarketingCampaign,
  ContentInput,
  IconName,
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
} from "../types";
import type { InstagramContext } from "../services/rubeService";
import type { WeekScheduleWithCount } from "../services/apiClient";
import { useCampaigns } from "../hooks/useAppData";
import { UploadForm } from "./UploadForm";
import { ClipsTab } from "./tabs/ClipsTab";
import { CarrosselTab } from "./tabs/CarrosselTab";
import { PostsTab } from "./tabs/PostsTab";
import { AdCreativesTab } from "./tabs/AdCreativesTab";
import { Loader } from "./common/Loader";
import { Icon } from "./common/Icon";
import { Button } from "./common/Button";
import { FlyerGenerator, TimePeriod } from "./FlyerGenerator";
import { AssistantPanel } from "./assistant/AssistantPanel";
import { GalleryView } from "./GalleryView";
import { CalendarView } from "./calendar/CalendarView";
import { CampaignsList } from "./CampaignsList";
import { SchedulesListView } from "./SchedulesListView";
import { QuickPostModal } from "./common/QuickPostModal";
import { FloatingSidebar } from "./FloatingSidebar";
import type { ScheduledPost } from "../types";

type View = "campaign" | "campaigns" | "flyer" | "gallery" | "calendar";

interface DashboardProps {
  brandProfile: BrandProfile;
  campaign: MarketingCampaign | null;
  productImages?: { base64: string; mimeType: string }[] | null;
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
  // Gallery Pagination
  onGalleryLoadMore?: () => void;
  galleryIsLoadingMore?: boolean;
  galleryHasMore?: boolean;
  tournamentEvents: TournamentEvent[];
  weekScheduleInfo: WeekScheduleInfo | null;
  onTournamentFileUpload: (file: File) => Promise<void>;
  onAddTournamentEvent: (event: TournamentEvent) => void;
  flyerState: Record<string, (GalleryImage | "loading")[]>;
  setFlyerState: React.Dispatch<
    React.SetStateAction<Record<string, (GalleryImage | "loading")[]>>
  >;
  dailyFlyerState: Record<TimePeriod, (GalleryImage | "loading")[]>;
  setDailyFlyerState: React.Dispatch<
    React.SetStateAction<Record<TimePeriod, (GalleryImage | "loading")[]>>
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
}

type Tab = "clips" | "carrossel" | "posts" | "ads";

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const {
    brandProfile,
    campaign,
    productImages,
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
    onGalleryLoadMore,
    galleryIsLoadingMore,
    galleryHasMore,
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
    campaignsList,
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
  } = props;

  // Debug log for productImages
  console.log("[Dashboard] productImages:", productImages ? `${productImages.length} image(s)` : "null");

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

  const tabs: { id: Tab; label: string }[] = [
    { id: "clips", label: "Clips" },
    { id: "carrossel", label: "Carrossel" },
    { id: "posts", label: "Social" },
    { id: "ads", label: "Ads" },
  ];

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

      <main className="flex-1 overflow-y-auto relative z-10 bg-[#070707] pb-16 sm:pb-[env(safe-area-inset-bottom)] sm:pl-16">
        {activeView === "campaign" && (
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            {showUploadForm && (
              <UploadForm
                onGenerate={onGenerate}
                isGenerating={isGenerating}
                brandProfile={brandProfile}
                onUpdateCreativeModel={
                  props.onUpdateCreativeModel || (() => {})
                }
                styleReferences={styleReferences}
                selectedStyleReference={selectedStyleReference}
                onSelectStyleReference={onSelectStyleReference}
                onClearSelectedStyleReference={onClearSelectedStyleReference}
              />
            )}
            {isGenerating && (
              <>
                <div className="flex flex-col items-center justify-center text-center p-32 aura-card border-white/5 bg-white/[0.01]">
                  <p className="text-white/50 text-sm font-medium tracking-wide">
                    criando...
                  </p>
                  <h2 className="text-4xl font-black mt-4 tracking-[-0.05em] uppercase">
                    Synthesizing Identity
                  </h2>
                  <p className="text-white/40 mt-4 max-w-xs text-xs font-medium tracking-wide">
                    Autonomous agents are configuring your marketing ecosystem.
                  </p>
                </div>
                <div className="flex justify-center mt-20">
                  <img
                    src="/logo-socialab.png"
                    alt="Socialab"
                    className="w-48 h-48 md:w-64 md:h-64 animate-spin"
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
                      {campaign.generatedWithModel && (
                        <span className="ml-2 text-white/20">
                          • {campaign.generatedWithModel.split("/").pop()}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Tabs Navigation */}
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all duration-200 ${
                          activeTab === tab.id
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
                    />
                  )}
                  {activeTab === "carrossel" && (
                    <CarrosselTab
                      videoClipScripts={campaign.videoClipScripts}
                      galleryImages={galleryImages}
                      brandProfile={brandProfile}
                      onAddImageToGallery={onAddImageToGallery}
                      onUpdateGalleryImage={onUpdateGalleryImage}
                      onSetChatReference={onSetChatReference}
                      onPublishCarousel={instagramContext?.instagramAccountId ? handlePublishCarousel : undefined}
                    />
                  )}
                  {activeTab === "posts" && (
                    <PostsTab
                      posts={campaign.posts}
                      brandProfile={brandProfile}
                      referenceImage={productImages?.[0] || null}
                      onAddImageToGallery={onAddImageToGallery}
                      onUpdateGalleryImage={onUpdateGalleryImage}
                      onSetChatReference={onSetChatReference}
                      styleReferences={styleReferences}
                      onAddStyleReference={onAddStyleReference}
                      onRemoveStyleReference={onRemoveStyleReference}
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
                          title: image.prompt?.substring(0, 50) || "Post Social",
                          description: image.prompt || "",
                          scheduledDate: dateStr,
                          scheduledTime: "12:00",
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
                      onAddImageToGallery={onAddImageToGallery}
                      onUpdateGalleryImage={onUpdateGalleryImage}
                      onSetChatReference={onSetChatReference}
                      styleReferences={styleReferences}
                      onAddStyleReference={onAddStyleReference}
                      onRemoveStyleReference={onRemoveStyleReference}
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
                          title: image.prompt?.substring(0, 50) || "Anúncio",
                          description: image.prompt || "",
                          scheduledDate: dateStr,
                          scheduledTime: "12:00",
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
              onLoadMore={onGalleryLoadMore}
              isLoadingMore={galleryIsLoadingMore}
              hasMore={galleryHasMore}
              onSchedulePost={(image) => {
                // Create scheduled post for tomorrow at noon
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(12, 0, 0, 0);
                const dateStr = tomorrow.toISOString().split("T")[0];
                onSchedulePost({
                  type: "flyer",
                  contentId: image.id,
                  imageUrl: image.src,
                  caption: image.prompt || "Post agendado",
                  hashtags: [],
                  scheduledDate: dateStr,
                  scheduledTime: "12:00",
                  scheduledTimestamp: tomorrow.getTime(),
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  platforms: { instagram: true, facebook: false },
                  status: "draft",
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
      </main>

      <AssistantPanel
        isOpen={isAssistantOpen}
        onClose={onToggleAssistant}
        history={assistantHistory}
        isLoading={isAssistantLoading}
        onSendMessage={onAssistantSendMessage}
        referenceImage={chatReferenceImage}
        onClearReference={() => onSetChatReference(null)}
      />
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
      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-[#0a0a0a] border-t border-white/[0.08] safe-area-pb">
        <div className="flex items-center justify-around px-2 py-2">
          {[
            { icon: "zap" as IconName, label: "Direct", key: "campaign" as View },
            { icon: "layers" as IconName, label: "Campanhas", key: "campaigns" as View },
            { icon: "image" as IconName, label: "Flyers", key: "flyer" as View },
            { icon: "calendar" as IconName, label: "Agenda", key: "calendar" as View },
            { icon: "layout" as IconName, label: "Galeria", key: "gallery" as View },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => onViewChange(item.key)}
              className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-lg transition-all ${
                activeView === item.key
                  ? "text-white"
                  : "text-white/40"
              }`}
            >
              <Icon name={item.icon} className="w-5 h-5" />
              <span className="text-[9px] mt-0.5 font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

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
