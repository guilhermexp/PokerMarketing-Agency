import { clientLogger } from "@/lib/client-logger";
/**
 * Main App Controller
 *
 * Thin orchestration component that connects stores, hooks, and renders UI.
 */

import React, { Suspense, lazy, useEffect, useRef, useMemo, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

// Components
import { BrandProfileSetup } from "./components/brand/BrandProfileSetup";
import { OnboardingModal } from "./components/brand/OnboardingModal";
import { SettingsModal } from "./components/settings/SettingsModal";
import { useInstagramAccounts } from "./components/settings/ConnectInstagramModal";
import { Loader } from "./components/common/Loader";
import { Icon } from "./components/common/Icon";
import { BackgroundJobsIndicator } from "./components/common/BackgroundJobsIndicator";
import { ToastContainer } from "./components/common/ToastContainer";
import { OverlayPortal } from "./components/common/OverlayPortal";
import { ChatProvider } from "./contexts/ChatContext";

// Auth
import { useAuth } from "./components/auth/AuthWrapper";
import { authClient, getOrganizationApi } from "./lib/auth-client";

// Stores
import { useBrandProfileStore } from "./stores/brand-profile-store";
import { useCampaignsStore } from "./stores/campaigns-store";
import { useGalleryStore } from "./stores/gallery-store";
import { useScheduledPostsStore } from "./stores/scheduled-posts-store";
import { useChatStore } from "./stores/chat-store";
import { useTournamentStore } from "./stores/tournament-store";
import { useUiStore } from "./stores/uiStore";

// API
import { getBrandProfile, createBrandProfile, updateBrandProfile } from "./services/apiClient";

// SWR Hooks
import {
  useInitialData, useGalleryImages, useScheduledPosts, useCampaigns, useTournamentData, useSchedulesList,
} from "./hooks/useAppData";

// Custom Hooks
import { useGalleryHandlers } from "./hooks/useGalleryHandlers";
import { useScheduledPostsHandlers } from "./hooks/useScheduledPostsHandlers";
import { useCampaignHandlers } from "./hooks/useCampaignHandlers";
import { useTournamentHandlers, mapDbEventToTournamentEvent, parseDateOnly } from "./hooks/useTournamentHandlers";
import { useAssistantHandlers } from "./hooks/useAssistantHandlers";
import { useCreativeModelHandler } from "./hooks/useBrandProfileHandlers";
import { useTransformedGalleryImages, useTransformedScheduledPosts, useTransformedCampaignsList, useStyleReferences } from "./hooks/useDataTransformers";
import { useDailyFlyersSync } from "./hooks/useDailyFlyersSync";

// Types
import type { BrandProfile, TournamentEvent, WeekScheduleInfo } from "./types";
import type { WeekScheduleWithCount } from "./services/apiClient";

// =============================================================================
// Constants
// =============================================================================

export type ViewType = "campaign" | "campaigns" | "carousels" | "flyer" | "gallery" | "calendar" | "playground" | "image-playground";

const VIEW_PATHS: Record<ViewType, string> = {
  campaign: "/campaign", campaigns: "/campaigns", carousels: "/carousels", flyer: "/flyer",
  gallery: "/gallery", calendar: "/calendar", playground: "/playground", "image-playground": "/image-playground",
};

// Lazy Components
const ClientFeedback = lazy(() => import("./feedback/client-feedback").then((m) => ({ default: m.ClientFeedback })));
const Dashboard = lazy(() => import("./components/dashboard/Dashboard").then((m) => ({ default: m.Dashboard })));
const AssistantPanel = lazy(() => import("./components/assistant/AssistantPanel").then((m) => ({ default: m.AssistantPanel })));
const AssistantPanelNew = lazy(() => import("./components/assistant/AssistantPanelNew").then((m) => ({ default: m.AssistantPanelNew })));

const LazyFallback = () => (
  <div className="w-full h-full min-h-[220px] flex items-center justify-center">
    <span className="text-xs text-muted-foreground">Carregando...</span>
  </div>
);

// =============================================================================
// Main Component
// =============================================================================

interface MainAppControllerProps { routeView: ViewType; }

export function MainAppController({ routeView }: MainAppControllerProps) {
  const navigate = useNavigate();

  // Auth
  const { userId, clerkUserId, isLoading: authLoading, isOrgReady } = useAuth();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const organizationId = activeOrg?.id || null;

  // Refs
  const skipBrandClearOnOrgSwitch = useRef(false);
  const contextRef = useRef({ userId, organizationId });
  const hasInitialDataLoadedOnce = useRef(false);

  // Stores - Brand Profile
  const brandProfile = useBrandProfileStore((s) => s.brandProfile);
  const setBrandProfile = useBrandProfileStore((s) => s.setBrandProfile);
  const clearBrandProfile = useBrandProfileStore((s) => s.clearBrandProfile);
  const isEditingProfile = useBrandProfileStore((s) => s.isEditingProfile);
  const setIsEditingProfile = useBrandProfileStore((s) => s.setIsEditingProfile);
  const showOnboarding = useBrandProfileStore((s) => s.showOnboarding);
  const setShowOnboarding = useBrandProfileStore((s) => s.setShowOnboarding);

  const [tournamentEvents, setTournamentEvents] = useState<TournamentEvent[]>([]);
  const [allSchedules, setAllSchedules] = useState<WeekScheduleWithCount[]>([]);
  const [weekScheduleInfo, setWeekScheduleInfo] = useState<WeekScheduleInfo | null>(null);
  const [isWeekExpired, setIsWeekExpired] = useState(false);

  // Stores - Campaigns
  const campaign = useCampaignsStore((s) => s.campaign);
  const setCampaign = useCampaignsStore((s) => s.setCampaign);
  const campaignProductImages = useCampaignsStore((s) => s.campaignProductImages);
  const setCampaignProductImages = useCampaignsStore((s) => s.setCampaignProductImages);
  const campaignCompositionAssets = useCampaignsStore((s) => s.campaignCompositionAssets);
  const setCampaignCompositionAssets = useCampaignsStore((s) => s.setCampaignCompositionAssets);
  const isGenerating = useCampaignsStore((s) => s.isGenerating);
  const setIsGenerating = useCampaignsStore((s) => s.setIsGenerating);

  // Stores - UI & Chat
  const error = useUiStore((s) => s.error);
  const setError = useUiStore((s) => s.setError);
  const theme = useUiStore((s) => s.theme);
  const handleThemeToggle = useUiStore((s) => s.toggleTheme);
  const isAssistantOpen = useChatStore((s) => s.isAssistantOpen);
  const setIsAssistantOpen = useChatStore((s) => s.setIsAssistantOpen);
  const chatHistory = useChatStore((s) => s.chatHistory);
  const setChatHistory = useChatStore((s) => s.setChatHistory);
  const isAssistantLoading = useChatStore((s) => s.isAssistantLoading);
  const setIsAssistantLoading = useChatStore((s) => s.setIsAssistantLoading);
  const chatReferenceImage = useChatStore((s) => s.chatReferenceImage);
  const setChatReferenceImage = useChatStore((s) => s.setChatReferenceImage);
  const toolImageReference = useChatStore((s) => s.toolImageReference);
  const setToolImageReference = useChatStore((s) => s.setToolImageReference);
  const lastUploadedImage = useChatStore((s) => s.lastUploadedImage);
  const setLastUploadedImage = useChatStore((s) => s.setLastUploadedImage);
  const pendingToolEdit = useChatStore((s) => s.pendingToolEdit);
  const editingImage = useChatStore((s) => s.editingImage);
  const toolEditPreview = useChatStore((s) => s.toolEditPreview);
  const chatInitialized = useChatStore((s) => s.chatInitialized);
  const initializeChatWithBrandProfile = useChatStore((s) => s.initializeChatWithBrandProfile);
  const handleSetChatReference = useChatStore((s) => s.handleSetChatReference);
  const handleSetChatReferenceSilent = useChatStore((s) => s.handleSetChatReferenceSilent);
  const handleToggleAssistant = useChatStore((s) => s.handleToggleAssistant);
  const handleToolEditApproved = useChatStore((s) => s.handleToolEditApproved);
  const handleToolEditRejected = useChatStore((s) => s.handleToolEditRejected);
  const handleCloseImageEditor = useChatStore((s) => s.handleCloseImageEditor);
  const storeHandleRequestImageEdit = useChatStore((s) => s.handleRequestImageEdit);
  const storeHandleShowToolEditPreview = useChatStore((s) => s.handleShowToolEditPreview);

  // Stores - Gallery & Posts
  const selectedStyleReference = useGalleryStore((s) => s.selectedStyleReference);
  const setSelectedStyleReference = useGalleryStore((s) => s.setSelectedStyleReference);
  const publishingStates = useScheduledPostsStore((s) => s.publishingStates);
  const setPublishingStates = useScheduledPostsStore((s) => s.setPublishingStates);

  // Stores - Tournament
  const currentScheduleId = useTournamentStore((s) => s.currentScheduleId);
  const setCurrentScheduleId = useTournamentStore((s) => s.setCurrentScheduleId);
  const flyerState = useTournamentStore((s) => s.flyerState);
  const setFlyerState = useTournamentStore((s) => s.setFlyerState);
  const dailyFlyerState = useTournamentStore((s) => s.dailyFlyerState);
  const setDailyFlyerState = useTournamentStore((s) => s.setDailyFlyerState);
  const selectedDailyFlyerIds = useTournamentStore((s) => s.selectedDailyFlyerIds);
  const setSelectedDailyFlyerIds = useTournamentStore((s) => s.setSelectedDailyFlyerIds);
  const hasRestoredDailyFlyers = useTournamentStore((s) => s.hasRestoredDailyFlyers);
  const setHasRestoredDailyFlyers = useTournamentStore((s) => s.setHasRestoredDailyFlyers);
  const lastLoadedScheduleId = useTournamentStore((s) => s.lastLoadedScheduleId);
  const setLastLoadedScheduleId = useTournamentStore((s) => s.setLastLoadedScheduleId);
  const lastLoadedOrgId = useTournamentStore((s) => s.lastLoadedOrgId);
  const setLastLoadedOrgId = useTournamentStore((s) => s.setLastLoadedOrgId);
  const hasAutoLoadedSchedule = useTournamentStore((s) => s.hasAutoLoadedSchedule);
  const setHasAutoLoadedSchedule = useTournamentStore((s) => s.setHasAutoLoadedSchedule);
  const handleAddTournamentEvent = useCallback(
    (event: TournamentEvent) =>
      setTournamentEvents((current) => [event, ...current]),
    [],
  );

  // SWR Data
  const { data: initialData, isLoading: isInitialLoading } = useInitialData(isOrgReady ? clerkUserId : null, organizationId, clerkUserId);
  const { images: swrGalleryImages, addImage: swrAddGalleryImage, removeImage: swrRemoveGalleryImage, updateImage: swrUpdateGalleryImage, refresh: refreshGallery, isLoading: galleryIsLoading } = useGalleryImages(userId, organizationId);
  const { posts: swrScheduledPosts, addPost: swrAddScheduledPost, updatePost: swrUpdateScheduledPost, removePost: swrRemoveScheduledPost } = useScheduledPosts(userId, organizationId);
  const { campaigns: swrCampaigns, addCampaign: swrAddCampaign } = useCampaigns(userId, organizationId);
  const { schedule: swrTournamentSchedule, events: swrTournamentEvents } = useTournamentData(userId, organizationId);
  const { schedules: swrAllSchedules } = useSchedulesList(userId, organizationId);
  const { accounts: instagramAccounts } = useInstagramAccounts(userId || "", organizationId);

  // Data Transformations
  const transformedGalleryImages = useTransformedGalleryImages(swrGalleryImages);
  const transformedScheduledPosts = useTransformedScheduledPosts(swrScheduledPosts);
  const transformedCampaignsList = useTransformedCampaignsList(swrCampaigns);
  const styleReferences = useStyleReferences(swrGalleryImages);
  const galleryImages = transformedGalleryImages;
  const campaignsList = transformedCampaignsList;
  const scheduledPosts = transformedScheduledPosts;

  // Computed
  const instagramContext = useMemo(() => {
    const acc = instagramAccounts.find((a) => a.is_active);
    return acc && userId ? { instagramAccountId: acc.id, userId, organizationId: organizationId || undefined } : undefined;
  }, [instagramAccounts, userId, organizationId]);
  const isContextChanging = contextRef.current.userId !== userId || contextRef.current.organizationId !== organizationId;
  const isInitialMount = !hasInitialDataLoadedOnce.current && !initialData;
  const handleViewChange = useCallback((view: ViewType) => navigate(VIEW_PATHS[view]), [navigate]);

  // Handler Hooks
  const galleryHandlers = useGalleryHandlers({ userId, organizationId, toolImageReference, setToolImageReference, swrAddGalleryImage, swrRemoveGalleryImage, swrUpdateGalleryImage, refreshGallery, swrGalleryImages, setSelectedStyleReference, selectedStyleReference, onViewChange: handleViewChange });
  const scheduledPostsHandlers = useScheduledPostsHandlers({ userId, organizationId, instagramContext, swrScheduledPosts, swrAddScheduledPost, swrUpdateScheduledPost, swrRemoveScheduledPost, setPublishingStates });
  const campaignHandlers = useCampaignHandlers({ userId, organizationId, brandProfile, campaign, setCampaign, setCampaignProductImages, setCampaignCompositionAssets, setIsGenerating, setError, swrAddCampaign, onViewChange: handleViewChange });
  const tournamentHandlers = useTournamentHandlers({ userId, organizationId, currentScheduleId, setTournamentEvents, setWeekScheduleInfo, setCurrentScheduleId, setIsWeekExpired, setAllSchedules, setDailyFlyerState, setHasRestoredDailyFlyers });
  const assistantHandlers = useAssistantHandlers({ brandProfile, chatHistory, setChatHistory, setIsAssistantLoading, setChatReferenceImage, toolImageReference, setToolImageReference, lastUploadedImage, setLastUploadedImage, handleAddImageToGallery: galleryHandlers.handleAddImageToGallery, handleUpdateGalleryImage: galleryHandlers.handleUpdateGalleryImage });
  const { handleUpdateCreativeModel } = useCreativeModelHandler({ userId, organizationId, brandProfile, setBrandProfile });

  // Daily Flyers Sync
  useDailyFlyersSync({ userId, organizationId, currentScheduleId, hasRestoredDailyFlyers, lastLoadedScheduleId, lastLoadedOrgId, setDailyFlyerState, setHasRestoredDailyFlyers, setLastLoadedScheduleId, setLastLoadedOrgId });

  // Wrappers
  const handleRequestImageEdit = useCallback((r: { toolCallId: string; toolName: string; prompt: string; imageId: string }) => storeHandleRequestImageEdit(r, galleryImages), [storeHandleRequestImageEdit, galleryImages]);
  const handleShowToolEditPreview = useCallback((p: { toolCallId: string; imageUrl: string; prompt?: string; referenceImageId?: string; referenceImageUrl?: string }) => storeHandleShowToolEditPreview(p, galleryImages), [storeHandleShowToolEditPreview, galleryImages]);
  const handleEditProfile = useCallback(() => setIsEditingProfile(true), [setIsEditingProfile]);

  // Effects - State Sync
  useEffect(() => { if (swrTournamentEvents?.length) setTournamentEvents(swrTournamentEvents.map(mapDbEventToTournamentEvent)); else if (tournamentEvents.length) setTournamentEvents([]); }, [swrTournamentEvents, setTournamentEvents, tournamentEvents.length]);
  useEffect(() => { if (swrAllSchedules?.length) setAllSchedules(swrAllSchedules); else if (allSchedules.length) setAllSchedules([]); }, [swrAllSchedules, setAllSchedules, allSchedules.length]);

  // Effects - Context
  useEffect(() => { if (skipBrandClearOnOrgSwitch.current) { skipBrandClearOnOrgSwitch.current = false; return; } clearBrandProfile(); }, [clearBrandProfile, userId, organizationId]);
  useEffect(() => {
    if (!initialData) return;
    hasInitialDataLoadedOnce.current = true;
    contextRef.current = { userId, organizationId };
    if (initialData.brandProfile && !brandProfile) {
      const db = initialData.brandProfile;
      setBrandProfile({ name: db.name, description: db.description || "", logo: db.logo_url || null, primaryColor: db.primary_color, secondaryColor: db.secondary_color, tertiaryColor: db.tertiary_color || "", toneOfVoice: db.tone_of_voice as BrandProfile["toneOfVoice"], toneTargets: db.settings?.toneTargets as BrandProfile["toneTargets"], creativeModel: db.settings?.creativeModel as BrandProfile["creativeModel"] });
    }
  }, [initialData, brandProfile, userId, organizationId, setBrandProfile]);
  useEffect(() => { if (brandProfile && !chatInitialized && chatHistory.length === 0) initializeChatWithBrandProfile(brandProfile); }, [brandProfile, chatHistory.length, chatInitialized, initializeChatWithBrandProfile]);

  // Effects - Tournament
  useEffect(() => {
    if (!swrTournamentSchedule) return;
    const s = swrTournamentSchedule;
    setCurrentScheduleId(s.id);
    const endDate = parseDateOnly(s.end_date); const today = new Date(); today.setHours(0, 0, 0, 0); endDate.setHours(23, 59, 59, 999);
    setIsWeekExpired(today > endDate);
    const startDate = parseDateOnly(s.start_date);
    setWeekScheduleInfo({ id: s.id, startDate: `${String(startDate.getDate()).padStart(2, "0")}/${String(startDate.getMonth() + 1).padStart(2, "0")}`, endDate: `${String(endDate.getDate()).padStart(2, "0")}/${String(endDate.getMonth() + 1).padStart(2, "0")}`, filename: s.filename || "Planilha carregada", daily_flyer_urls: s.daily_flyer_urls });
  }, [swrTournamentSchedule, setCurrentScheduleId, setIsWeekExpired, setWeekScheduleInfo]);
  useEffect(() => { if (!hasAutoLoadedSchedule && swrAllSchedules?.length && !currentScheduleId && userId) { setHasAutoLoadedSchedule(true); tournamentHandlers.handleSelectSchedule(swrAllSchedules[0]); } }, [swrAllSchedules, currentScheduleId, userId, hasAutoLoadedSchedule, setHasAutoLoadedSchedule, tournamentHandlers]);

  // Chat Context
  const chatContextValue = useMemo(() => ({
    onSetChatReference: handleSetChatReference, isAssistantOpen, setIsAssistantOpen,
    renderPreviewChatPanel: () => (
      <Suspense fallback={<LazyFallback />}>
        {import.meta.env.VITE_USE_VERCEL_AI_SDK === "true" ? (
          <AssistantPanelNew isOpen onClose={() => {}} referenceImage={chatReferenceImage} onClearReference={() => handleSetChatReferenceSilent(null)} onUpdateReference={handleSetChatReferenceSilent} galleryImages={galleryImages} brandProfile={brandProfile ?? undefined} pendingToolEdit={pendingToolEdit} onRequestImageEdit={handleRequestImageEdit} onToolEditApproved={handleToolEditApproved} onToolEditRejected={handleToolEditRejected} onShowToolEditPreview={handleShowToolEditPreview} />
        ) : (
          <AssistantPanel isOpen onClose={() => {}} history={chatHistory} isLoading={isAssistantLoading} onSendMessage={assistantHandlers.handleAssistantSendMessage} referenceImage={chatReferenceImage} onClearReference={() => handleSetChatReferenceSilent(null)} />
        )}
      </Suspense>
    ),
  }), [handleSetChatReference, isAssistantOpen, setIsAssistantOpen, chatReferenceImage, galleryImages, brandProfile, pendingToolEdit, handleRequestImageEdit, handleToolEditApproved, handleToolEditRejected, handleShowToolEditPreview, chatHistory, isAssistantLoading, assistantHandlers.handleAssistantSendMessage, handleSetChatReferenceSilent]);

  // Loading
  if (authLoading || isInitialLoading || !isOrgReady || !!(initialData?.brandProfile && !brandProfile) || isContextChanging || isInitialMount) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><Loader size={64} className="text-muted-foreground" /></div>;
  }

  // Render
  return (
    <>
      {error && (<OverlayPortal><div className="fixed bottom-6 right-6 bg-surface border border-red-500/50 rounded-xl z-[2147483645] max-w-sm p-4 flex items-start space-x-4 animate-fade-in-up"><Icon name="x" className="w-4 h-4 text-red-400" /><div className="flex-1"><p className="font-bold text-sm">Erro</p><p className="text-sm opacity-50">{error}</p></div></div></OverlayPortal>)}
      {!brandProfile ? (
        showOnboarding ? (<OnboardingModal onInviteAccepted={() => window.location.reload()} onCreateBrand={() => setShowOnboarding(false)} />) : (
          <BrandProfileSetup onProfileSubmit={async (p) => {
            setBrandProfile(p);
            if (!userId) return;
            try {
              let newOrgId = organizationId;
              if (!newOrgId) { const slug = p.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); const res = await getOrganizationApi().create({ name: p.name.trim(), slug }); if (res.data?.id) newOrgId = res.data.id; }
              if (newOrgId && newOrgId !== organizationId) { skipBrandClearOnOrgSwitch.current = true; await getOrganizationApi().setActive({ organizationId: newOrgId }); }
              await createBrandProfile(userId, { name: p.name, description: p.description, logo_url: p.logo || undefined, primary_color: p.primaryColor, secondary_color: p.secondaryColor, tertiary_color: p.tertiaryColor, tone_of_voice: p.toneOfVoice });
            } catch (e) { clientLogger.error("Failed to save brand profile:", e); }
          }} existingProfile={null} />
        )
      ) : (
        <>
          <SettingsModal isOpen={isEditingProfile} onClose={() => setIsEditingProfile(false)} brandProfile={brandProfile} onSaveProfile={async (p) => {
            setBrandProfile(p);
            if (!userId) return;
            try { const ex = await getBrandProfile(userId, organizationId); if (ex) await updateBrandProfile(ex.id, { name: p.name, description: p.description, logo_url: p.logo || undefined, primary_color: p.primaryColor, secondary_color: p.secondaryColor, tertiary_color: p.tertiaryColor, tone_of_voice: p.toneOfVoice, settings: { ...ex.settings, toneTargets: p.toneTargets, creativeModel: p.creativeModel } }); } catch (e) { clientLogger.error("Failed to update brand profile:", e); }
          }} />
          <ChatProvider value={chatContextValue}>
            <Suspense fallback={<LazyFallback />}>
              <Dashboard brandProfile={brandProfile} campaign={campaign} productImages={campaignProductImages} compositionAssets={campaignCompositionAssets} onGenerate={campaignHandlers.handleGenerateCampaign} isGenerating={isGenerating} onEditProfile={handleEditProfile} onResetCampaign={campaignHandlers.handleResetCampaign} isAssistantOpen={isAssistantOpen} onToggleAssistant={handleToggleAssistant} assistantHistory={chatHistory} isAssistantLoading={isAssistantLoading} onAssistantSendMessage={assistantHandlers.handleAssistantSendMessage} chatReferenceImage={chatReferenceImage} onSetChatReference={handleSetChatReference} onSetChatReferenceSilent={handleSetChatReferenceSilent} theme={theme} onThemeToggle={handleThemeToggle} galleryImages={galleryImages} onAddImageToGallery={galleryHandlers.handleAddImageToGallery} onUpdateGalleryImage={galleryHandlers.handleUpdateGalleryImage} onDeleteGalleryImage={galleryHandlers.handleDeleteGalleryImage} onMarkGalleryImagePublished={galleryHandlers.handleMarkGalleryImagePublished} onRefreshGallery={refreshGallery} galleryIsLoading={galleryIsLoading} tournamentEvents={tournamentEvents} weekScheduleInfo={weekScheduleInfo} onTournamentFileUpload={tournamentHandlers.handleTournamentFileUpload} onAddTournamentEvent={handleAddTournamentEvent} allSchedules={allSchedules} currentScheduleId={currentScheduleId} onSelectSchedule={tournamentHandlers.handleSelectSchedule} onDeleteSchedule={tournamentHandlers.handleDeleteSchedule} flyerState={flyerState} setFlyerState={setFlyerState} dailyFlyerState={dailyFlyerState} setDailyFlyerState={setDailyFlyerState} selectedDailyFlyerIds={selectedDailyFlyerIds} setSelectedDailyFlyerIds={setSelectedDailyFlyerIds} activeView={routeView} onViewChange={handleViewChange} onPublishToCampaign={campaignHandlers.handlePublishFlyerToCampaign} styleReferences={styleReferences} onAddStyleReference={galleryHandlers.handleAddStyleReference} onRemoveStyleReference={galleryHandlers.handleRemoveStyleReference} onSelectStyleReference={galleryHandlers.handleSelectStyleReference} selectedStyleReference={selectedStyleReference} onClearSelectedStyleReference={galleryHandlers.handleClearSelectedStyleReference} scheduledPosts={scheduledPosts} onSchedulePost={scheduledPostsHandlers.handleSchedulePost} onUpdateScheduledPost={scheduledPostsHandlers.handleUpdateScheduledPost} onDeleteScheduledPost={scheduledPostsHandlers.handleDeleteScheduledPost} onRetryScheduledPost={scheduledPostsHandlers.handleRetryScheduledPost} onPublishToInstagram={scheduledPostsHandlers.handlePublishToInstagram} publishingStates={publishingStates} campaignsList={campaignsList} onLoadCampaign={campaignHandlers.handleLoadCampaign} onCreateCarouselFromPrompt={campaignHandlers.handleCreateCarouselFromPrompt} userId={userId ?? undefined} organizationId={organizationId} isWeekExpired={isWeekExpired} onClearExpiredSchedule={tournamentHandlers.handleClearExpiredSchedule} instagramContext={instagramContext} onUpdateCreativeModel={handleUpdateCreativeModel} onCarouselUpdate={campaignHandlers.handleCarouselUpdate} pendingToolEdit={pendingToolEdit} editingImage={editingImage} onRequestImageEdit={handleRequestImageEdit} onToolEditApproved={handleToolEditApproved} onToolEditRejected={handleToolEditRejected} onShowToolEditPreview={handleShowToolEditPreview} toolEditPreview={toolEditPreview} onCloseImageEditor={handleCloseImageEditor} />
            </Suspense>
          </ChatProvider>
        </>
      )}
      <Suspense fallback={null}><ClientFeedback /></Suspense>
      <BackgroundJobsIndicator isAssistantOpen={isAssistantOpen} />
      <ToastContainer />
    </>
  );
}
