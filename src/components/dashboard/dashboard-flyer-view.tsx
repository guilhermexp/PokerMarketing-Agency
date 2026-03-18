import React, { Suspense, lazy } from "react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Icon } from "@/components/common/Icon";
import { ViewLoadingFallback } from "@/components/dashboard/dashboard-shared";
import { useBrandProfileController } from "@/controllers/BrandProfileController";
import { useCampaignController } from "@/controllers/CampaignController";
import { useGalleryController } from "@/controllers/GalleryController";
import { useTournamentController } from "@/controllers/TournamentController";

const FlyerGenerator = lazy(() =>
  import("@/components/flyer/FlyerGenerator").then((module) => ({
    default: module.FlyerGenerator,
  }))
);
const SchedulesListView = lazy(() =>
  import("@/components/schedules/SchedulesListView").then((module) => ({
    default: module.SchedulesListView,
  }))
);

function formatDateDisplay(dateStr: string) {
  if (!dateStr) return "";
  if (/^\d{2}\/\d{2}$/.test(dateStr)) return dateStr;

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

export function DashboardFlyerView() {
  const { brandProfile, userId } = useBrandProfileController();
  const { handlePublishFlyerToCampaign } = useCampaignController();
  const {
    galleryImages,
    handleAddImageToGallery,
    handleDeleteGalleryImage,
    handleSchedulePost,
    handleSetChatReference,
    handleUpdateGalleryImage,
    instagramContext,
    selectedStyleReference,
    styleReferences,
  } = useGalleryController();
  const {
    allSchedules,
    currentScheduleId,
    dailyFlyerState,
    flyerState,
    handleAddTournamentEvent,
    handleClearExpiredSchedule,
    handleDeleteSchedule,
    handleSelectSchedule,
    handleTournamentFileUpload,
    isInsideSchedule,
    isWeekExpired,
    selectedDailyFlyerIds,
    setDailyFlyerState,
    setFlyerState,
    setIsInsideSchedule,
    setSelectedDailyFlyerIds,
    tournamentEvents,
    weekScheduleInfo,
  } = useTournamentController();

  if (!brandProfile) {
    return null;
  }

  if (!isInsideSchedule) {
    return (
      <ErrorBoundary fallback={<ViewLoadingFallback />}>
        <Suspense fallback={<ViewLoadingFallback />}>
          <SchedulesListView
            schedules={allSchedules || []}
            onSelectSchedule={(schedule) => {
              void handleSelectSchedule(schedule);
              setIsInsideSchedule(true);
            }}
            onFileUpload={handleTournamentFileUpload}
            currentScheduleId={currentScheduleId}
            onEnterAfterUpload={() => setIsInsideSchedule(true)}
            onDeleteSchedule={handleDeleteSchedule}
            onAddEvent={(event) => {
              handleAddTournamentEvent(event);
              setIsInsideSchedule(true);
            }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-border border-b bg-[#070707] px-4 py-3 sm:px-6">
        <button
          onClick={() => setIsInsideSchedule(false)}
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Semana {formatDateDisplay(weekScheduleInfo.startDate)} -{" "}
              {formatDateDisplay(weekScheduleInfo.endDate)}
            </span>
          </>
        ) : null}
      </div>
      <div className="flex-1 overflow-hidden">
        <ErrorBoundary fallback={<ViewLoadingFallback />}>
          <Suspense fallback={<ViewLoadingFallback />}>
            <FlyerGenerator
              brandProfile={brandProfile}
              events={tournamentEvents}
              weekScheduleInfo={weekScheduleInfo}
              onFileUpload={handleTournamentFileUpload}
              onAddEvent={handleAddTournamentEvent}
              onAddImageToGallery={handleAddImageToGallery}
              flyerState={flyerState}
              setFlyerState={setFlyerState}
              dailyFlyerState={dailyFlyerState}
              setDailyFlyerState={setDailyFlyerState}
              selectedDailyFlyerIds={selectedDailyFlyerIds}
              setSelectedDailyFlyerIds={setSelectedDailyFlyerIds}
              onUpdateGalleryImage={handleUpdateGalleryImage}
              onDeleteGalleryImage={handleDeleteGalleryImage}
              onSetChatReference={handleSetChatReference}
              onPublishToCampaign={handlePublishFlyerToCampaign}
              selectedStyleReference={selectedStyleReference}
              onClearSelectedStyleReference={() => undefined}
              styleReferences={styleReferences}
              onSelectStyleReference={() => undefined}
              isWeekExpired={isWeekExpired}
              onClearExpiredSchedule={handleClearExpiredSchedule}
              userId={userId ?? undefined}
              allSchedules={allSchedules}
              currentScheduleId={currentScheduleId}
              onSelectSchedule={handleSelectSchedule}
              instagramContext={instagramContext}
              galleryImages={galleryImages}
              onSchedulePost={handleSchedulePost}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
