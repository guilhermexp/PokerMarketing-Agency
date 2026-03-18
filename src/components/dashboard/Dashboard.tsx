import React, { useEffect, useMemo, useState, useTransition } from "react";
import { authClient } from "../../lib/auth-client";
import { useCampaigns } from "../../hooks/useAppData";
import { FloatingSidebar } from "../layout/FloatingSidebar";
import {
  DashboardProps,
  type Tab,
  type View,
} from "./dashboard-shared";
import { DEFAULT_CAMPAIGN_IMAGE_MODEL } from "../../config/imageGenerationModelOptions";
import { DashboardCampaignView } from "./dashboard-campaign-view";
import { DashboardFlyerView } from "./dashboard-flyer-view";
import { DashboardOverlays } from "./dashboard-overlays";
import { DashboardSecondaryViews } from "./dashboard-secondary-views";

export const Dashboard: React.FC<DashboardProps> = ({
  activeView,
  allSchedules,
  assistantHistory,
  brandProfile,
  campaign,
  compositionAssets,
  currentScheduleId,
  dailyFlyerState,
  editingImage,
  flyerState,
  galleryImages,
  galleryIsLoading,
  instagramContext,
  isAssistantLoading,
  isGenerating,
  isWeekExpired,
  onAddImageToGallery,
  onAddStyleReference,
  onAddTournamentEvent,
  onAssistantSendMessage,
  onCarouselUpdate,
  onClearExpiredSchedule,
  onClearSelectedStyleReference,
  onCloseImageEditor,
  onCreateCarouselFromPrompt,
  onDeleteGalleryImage,
  onDeleteSchedule,
  onDeleteScheduledPost,
  onEditProfile,
  onGenerate,
  onLoadCampaign,
  onMarkGalleryImagePublished,
  onPublishToCampaign,
  onPublishToInstagram,
  onRefreshGallery,
  onRemoveStyleReference,
  onRequestImageEdit,
  onResetCampaign,
  onRetryScheduledPost,
  onSchedulePost,
  onSelectSchedule,
  onSelectStyleReference,
  onSetChatReference,
  onSetChatReferenceSilent,
  onShowToolEditPreview,
  onTournamentFileUpload,
  onToolEditApproved,
  onToolEditRejected,
  onUpdateCreativeModel,
  onUpdateGalleryImage,
  onUpdateScheduledPost,
  onViewChange,
  organizationId,
  pendingToolEdit,
  productImages,
  publishingStates,
  scheduledPosts,
  selectedDailyFlyerIds,
  selectedStyleReference,
  setDailyFlyerState,
  setFlyerState,
  setSelectedDailyFlyerIds,
  styleReferences,
  toolEditPreview,
  tournamentEvents,
  userId,
  weekScheduleInfo,
}) => {
  const { campaigns } = useCampaigns(userId || null, organizationId);
  const [activeTab, setActiveTab] = useState<Tab>("clips");
  const [isTabPending, startTabTransition] = useTransition();
  const [selectedCampaignImageModel, setSelectedCampaignImageModel] = useState(
    DEFAULT_CAMPAIGN_IMAGE_MODEL,
  );
  const [isInsideSchedule, setIsInsideSchedule] = useState(false);
  const [quickPostImage, setQuickPostImage] = useState<(typeof galleryImages)[number] | null>(
    null,
  );
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleModalImage, setScheduleModalImage] = useState<
    (typeof galleryImages)[number] | null
  >(null);

  const hasClips = (campaign?.videoClipScripts?.length ?? 0) > 0;
  const hasPosts = (campaign?.posts?.length ?? 0) > 0;
  const hasAds = (campaign?.adCreatives?.length ?? 0) > 0;
  const hasCarousels =
    (campaign?.carousels?.length ?? 0) > 0 ||
    (campaign?.videoClipScripts?.length ?? 0) > 0;

  const availableTabs = useMemo(
    () =>
      ([
        { id: "clips", enabled: hasClips },
        { id: "carrossel", enabled: hasCarousels },
        { id: "posts", enabled: hasPosts },
        { id: "ads", enabled: hasAds },
      ] as const).filter((tab) => tab.enabled),
    [hasAds, hasCarousels, hasClips, hasPosts],
  );

  useEffect(() => {
    if (campaign && availableTabs.length > 0 && !availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [activeTab, availableTabs, campaign]);

  const signOut = () => authClient.signOut();
  const showUploadForm = !campaign && !isGenerating;

  return (
    <div className="min-h-[100dvh] md:h-screen flex overflow-hidden bg-black text-white font-sans selection:bg-primary selection:text-black">
      <FloatingSidebar activeView={activeView} onViewChange={onViewChange} />

      <main className="flex-1 overflow-y-auto relative z-10 bg-black pb-24 sm:pb-[env(safe-area-inset-bottom)] lg:pl-20">
        {activeView === "campaign" ? (
          <DashboardCampaignView
            activeTab={activeTab}
            brandProfile={brandProfile}
            campaign={campaign}
            campaigns={campaigns}
            chatReferenceImage={null}
            compositionAssets={compositionAssets}
            galleryImages={galleryImages}
            instagramContext={instagramContext}
            isGenerating={isGenerating}
            isTabPending={isTabPending}
            onAddImageToGallery={onAddImageToGallery}
            onAddStyleReference={onAddStyleReference}
            onCarouselUpdate={onCarouselUpdate}
            onClearSelectedStyleReference={onClearSelectedStyleReference}
            onGenerate={onGenerate}
            onLoadCampaign={onLoadCampaign}
            onPublishToCampaign={onPublishToCampaign}
            onResetCampaign={onResetCampaign}
            onSchedulePost={onSchedulePost}
            onSelectStyleReference={onSelectStyleReference}
            onSetChatReference={onSetChatReference}
            onUpdateCreativeModel={onUpdateCreativeModel}
            onUpdateGalleryImage={onUpdateGalleryImage}
            onViewChange={onViewChange}
            productImages={productImages}
            selectedCampaignImageModel={selectedCampaignImageModel}
            selectedStyleReference={selectedStyleReference}
            setActiveTab={setActiveTab}
            setQuickPostImage={setQuickPostImage}
            setSelectedCampaignImageModel={setSelectedCampaignImageModel}
            showUploadForm={showUploadForm}
            startTabTransition={startTabTransition}
            styleReferences={styleReferences}
            userId={userId}
          />
        ) : null}

        {activeView === "flyer" ? (
          <DashboardFlyerView
            allSchedules={allSchedules}
            brandProfile={brandProfile}
            currentScheduleId={currentScheduleId}
            dailyFlyerState={dailyFlyerState}
            flyerState={flyerState}
            galleryImages={galleryImages}
            instagramContext={instagramContext}
            isInsideSchedule={isInsideSchedule}
            isWeekExpired={isWeekExpired}
            onAddImageToGallery={onAddImageToGallery}
            onAddTournamentEvent={onAddTournamentEvent}
            onBackToSchedulesList={() => setIsInsideSchedule(false)}
            onClearExpiredSchedule={onClearExpiredSchedule}
            onDeleteGalleryImage={onDeleteGalleryImage}
            onDeleteSchedule={onDeleteSchedule}
            onPublishToCampaign={onPublishToCampaign}
            onSchedulePost={onSchedulePost}
            onSelectSchedule={onSelectSchedule}
            onSetChatReference={onSetChatReference}
            onTournamentFileUpload={onTournamentFileUpload}
            onUpdateGalleryImage={onUpdateGalleryImage}
            selectedDailyFlyerIds={selectedDailyFlyerIds}
            selectedStyleReference={selectedStyleReference}
            setDailyFlyerState={setDailyFlyerState}
            setFlyerState={setFlyerState}
            setIsInsideSchedule={setIsInsideSchedule}
            setSelectedDailyFlyerIds={setSelectedDailyFlyerIds}
            styleReferences={styleReferences}
            tournamentEvents={tournamentEvents}
            userId={userId}
            weekScheduleInfo={weekScheduleInfo}
          />
        ) : null}

        {activeView !== "campaign" && activeView !== "flyer" ? (
          <DashboardSecondaryViews
            activeView={activeView as Exclude<View, "campaign" | "flyer">}
            brandProfile={brandProfile}
            campaign={campaign}
            campaigns={campaigns}
            galleryImages={galleryImages}
            galleryIsLoading={galleryIsLoading}
            onAddImageToGallery={onAddImageToGallery}
            onCreateCarouselFromPrompt={onCreateCarouselFromPrompt}
            onDeleteGalleryImage={onDeleteGalleryImage}
            onDeleteScheduledPost={onDeleteScheduledPost}
            onLoadCampaign={onLoadCampaign}
            onMarkGalleryImagePublished={onMarkGalleryImagePublished}
            onPublishToInstagram={onPublishToInstagram}
            onRefreshGallery={onRefreshGallery}
            onRetryScheduledPost={onRetryScheduledPost}
            onSchedulePost={onSchedulePost}
            onSelectStyleReference={onSelectStyleReference}
            onSetQuickPostImage={setQuickPostImage}
            onSetScheduleModalImage={setScheduleModalImage}
            onSetScheduleModalOpen={setScheduleModalOpen}
            onSetChatReference={onSetChatReference}
            onUpdateGalleryImage={onUpdateGalleryImage}
            onUpdateScheduledPost={onUpdateScheduledPost}
            organizationId={organizationId}
            publishingStates={publishingStates}
            scheduledPosts={scheduledPosts}
            styleReferences={styleReferences}
            userId={userId}
            onViewChange={onViewChange}
          />
        ) : null}
      </main>

      <DashboardOverlays
        assistantHistory={assistantHistory}
        brandProfile={brandProfile}
        campaigns={campaigns}
        chatReferenceImage={null}
        editingImage={editingImage}
        galleryImages={galleryImages}
        instagramContext={instagramContext}
        isAssistantLoading={isAssistantLoading}
        onAssistantSendMessage={onAssistantSendMessage}
        onCloseImageEditor={onCloseImageEditor}
        onEditProfile={onEditProfile}
        onMarkGalleryImagePublished={onMarkGalleryImagePublished}
        onRequestImageEdit={onRequestImageEdit}
        onSchedulePost={onSchedulePost}
        onSetChatReference={onSetChatReference}
        onSetChatReferenceSilent={onSetChatReferenceSilent}
        onShowToolEditPreview={onShowToolEditPreview}
        onSignOut={signOut}
        onToolEditApproved={onToolEditApproved}
        onToolEditRejected={onToolEditRejected}
        onUpdateGalleryImage={onUpdateGalleryImage}
        pendingToolEdit={pendingToolEdit}
        quickPostImage={quickPostImage}
        scheduleModalImage={scheduleModalImage}
        scheduleModalOpen={scheduleModalOpen}
        scheduledPosts={scheduledPosts}
        setQuickPostImage={setQuickPostImage}
        setScheduleModalImage={setScheduleModalImage}
        setScheduleModalOpen={setScheduleModalOpen}
        toolEditPreview={toolEditPreview}
      />
    </div>
  );
};
