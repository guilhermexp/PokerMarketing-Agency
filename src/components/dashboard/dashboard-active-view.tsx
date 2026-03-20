import React, { Suspense } from "react";
import type { DbCampaign } from "../../services/apiClient";
import type { GalleryImage } from "../../types";
import { Icon } from "../common/Icon";
import { ViewLoadingFallback, type DashboardProps } from "./dashboard-shared";
import { lazyWithRetry } from "@/lib/asset-version-recovery";

const FlyerGenerator = lazyWithRetry(() =>
  import("../flyer/FlyerGenerator").then((m) => ({ default: m.FlyerGenerator })),
);
const SchedulesListView = lazyWithRetry(() =>
  import("../schedules/SchedulesListView").then((m) => ({
    default: m.SchedulesListView,
  })),
);
const GalleryView = lazyWithRetry(() =>
  import("../gallery/GalleryView").then((m) => ({ default: m.GalleryView })),
);
const CalendarView = lazyWithRetry(() =>
  import("../calendar/CalendarView").then((m) => ({ default: m.CalendarView })),
);
const CampaignsList = lazyWithRetry(() =>
  import("../campaigns/CampaignsList").then((m) => ({ default: m.CampaignsList })),
);
const CarouselsList = lazyWithRetry(() =>
  import("../campaigns/CarouselsList").then((m) => ({ default: m.CarouselsList })),
);
const PlaygroundView = lazyWithRetry(() =>
  import("../playground/PlaygroundView").then((m) => ({ default: m.PlaygroundView })),
);
const ImagePlaygroundPage = lazyWithRetry(() =>
  import("../image-playground/ImagePlaygroundPage").then((m) => ({
    default: m.ImagePlaygroundPage,
  })),
);

interface DashboardActiveViewProps {
  campaigns: DbCampaign[];
  formatDateDisplay: (date: string) => string;
  isInsideSchedule: boolean;
  onEnterAfterUpload: () => void;
  onEnterSchedule: (schedule: NonNullable<DashboardProps["allSchedules"]>[number]) => void;
  onLeaveSchedule: () => void;
  onOpenScheduleModal: (image: GalleryImage) => void;
  onQuickPost: (image: GalleryImage | null) => void;
  props: DashboardProps;
}

export function DashboardActiveView({
  campaigns,
  formatDateDisplay,
  isInsideSchedule,
  onEnterAfterUpload,
  onEnterSchedule,
  onLeaveSchedule,
  onOpenScheduleModal,
  onQuickPost,
  props,
}: DashboardActiveViewProps) {
  const {
    activeView,
    allSchedules,
    brandProfile,
    campaign,
    currentScheduleId,
    dailyFlyerState,
    flyerState,
    galleryImages,
    galleryIsLoading,
    instagramContext,
    isWeekExpired,
    onAddImageToGallery,
    onAddTournamentEvent,
    onClearExpiredSchedule,
    onCreateCarouselFromPrompt,
    onDeleteGalleryImage,
    onDeleteSchedule,
    onDeleteScheduledPost,
    onLoadCampaign,
    onMarkGalleryImagePublished,
    onPublishToCampaign,
    onPublishToInstagram,
    onRefreshGallery,
    onRetryScheduledPost,
    onSchedulePost,
    onSelectSchedule,
    onSetChatReference,
    onTournamentFileUpload,
    onUpdateGalleryImage,
    onUpdateScheduledPost,
    onViewChange,
    organizationId,
    publishingStates,
    scheduledPosts,
    selectedDailyFlyerIds,
    selectedStyleReference,
    setDailyFlyerState,
    setFlyerState,
    setSelectedDailyFlyerIds,
    styleReferences,
    tournamentEvents,
    userId,
    weekScheduleInfo,
  } = props;

  if (activeView === "flyer" && !isInsideSchedule) {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <SchedulesListView
          schedules={allSchedules || []}
          onSelectSchedule={onEnterSchedule}
          onFileUpload={onTournamentFileUpload}
          currentScheduleId={currentScheduleId}
          onEnterAfterUpload={onEnterAfterUpload}
          onDeleteSchedule={onDeleteSchedule}
          onAddEvent={(event) => {
            onAddTournamentEvent(event);
            onEnterAfterUpload();
          }}
        />
      </Suspense>
    );
  }

  if (activeView === "flyer" && isInsideSchedule) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-border border-b bg-[#070707] px-4 py-3 sm:px-6">
          <button
            onClick={onLeaveSchedule}
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-white/70"
          >
            <Icon name="arrow-left" className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Voltar às Planilhas
            </span>
          </button>
          {weekScheduleInfo ? (
            <>
              <div className="h-4 w-px bg-white/10" />
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                Semana {formatDateDisplay(weekScheduleInfo.startDate)} -{" "}
                {formatDateDisplay(weekScheduleInfo.endDate)}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewLoadingFallback />}>
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
              selectedDailyFlyerIds={selectedDailyFlyerIds}
              setSelectedDailyFlyerIds={setSelectedDailyFlyerIds}
              onUpdateGalleryImage={onUpdateGalleryImage}
              onDeleteGalleryImage={onDeleteGalleryImage}
              onSetChatReference={onSetChatReference}
              onPublishToCampaign={onPublishToCampaign}
              selectedStyleReference={selectedStyleReference}
              onClearSelectedStyleReference={props.onClearSelectedStyleReference}
              styleReferences={styleReferences}
              onSelectStyleReference={props.onSelectStyleReference}
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
          </Suspense>
        </div>
      </div>
    );
  }

  if (activeView === "gallery") {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <Suspense fallback={<ViewLoadingFallback />}>
          <GalleryView
            images={galleryImages}
            isLoading={galleryIsLoading}
            onUpdateImage={onUpdateGalleryImage}
            onDeleteImage={onDeleteGalleryImage}
            onSetChatReference={onSetChatReference}
            onRefresh={onRefreshGallery}
            styleReferences={styleReferences}
            onAddStyleReference={props.onAddStyleReference}
            onRemoveStyleReference={props.onRemoveStyleReference}
            onSelectStyleReference={props.onSelectStyleReference}
            onPublishToCampaign={onPublishToCampaign}
            onQuickPost={onQuickPost}
            onSchedulePost={onOpenScheduleModal}
          />
        </Suspense>
      </div>
    );
  }

  if (activeView === "calendar") {
    return (
      <div className="h-full px-4 py-4 sm:px-6 sm:py-5">
        <Suspense fallback={<ViewLoadingFallback />}>
          <CalendarView
            scheduledPosts={scheduledPosts}
            onSchedulePost={onSchedulePost}
            onUpdateScheduledPost={onUpdateScheduledPost}
            onDeleteScheduledPost={onDeleteScheduledPost}
            galleryImages={galleryImages}
            campaigns={campaigns}
            onPublishToInstagram={onPublishToInstagram}
            onRetryScheduledPost={onRetryScheduledPost}
            publishingStates={publishingStates}
          />
        </Suspense>
      </div>
    );
  }

  if (activeView === "campaigns" && userId) {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <Suspense fallback={<ViewLoadingFallback />}>
          <CampaignsList
            userId={userId}
            organizationId={organizationId}
            onSelectCampaign={onLoadCampaign}
            onNewCampaign={() => onViewChange("campaign")}
            currentCampaignId={campaign?.id}
          />
        </Suspense>
      </div>
    );
  }

  if (activeView === "carousels" && userId) {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <Suspense fallback={<ViewLoadingFallback />}>
          <CarouselsList
            userId={userId}
            organizationId={organizationId}
            brandProfile={brandProfile}
            galleryImages={galleryImages}
            onCreateCarouselFromPrompt={onCreateCarouselFromPrompt}
            onSelectCampaign={(campaignId) => {
              onLoadCampaign(campaignId);
              onViewChange("campaign");
            }}
          />
        </Suspense>
      </div>
    );
  }

  if (activeView === "playground") {
    return (
      <div className="h-full">
        <Suspense fallback={<ViewLoadingFallback />}>
          <PlaygroundView
            brandProfile={brandProfile}
            userId={userId}
            onAddImageToGallery={onAddImageToGallery}
          />
        </Suspense>
      </div>
    );
  }

  if (activeView === "image-playground") {
    return (
      <div className="h-full">
        <Suspense fallback={<ViewLoadingFallback />}>
          <ImagePlaygroundPage userId={userId} organizationId={organizationId} />
        </Suspense>
      </div>
    );
  }

  return null;
}
