import React, { Suspense, lazy } from "react";
import { Icon } from "../common/Icon";
import type { DashboardProps } from "./dashboard-shared";
import { ViewLoadingFallback } from "./dashboard-shared";

const FlyerGenerator = lazy(() =>
  import("../flyer/FlyerGenerator").then((m) => ({ default: m.FlyerGenerator })),
);
const SchedulesListView = lazy(() =>
  import("../schedules/SchedulesListView").then((m) => ({
    default: m.SchedulesListView,
  })),
);

interface DashboardFlyerViewProps {
  allSchedules?: DashboardProps["allSchedules"];
  brandProfile: DashboardProps["brandProfile"];
  currentScheduleId?: DashboardProps["currentScheduleId"];
  dailyFlyerState: DashboardProps["dailyFlyerState"];
  flyerState: DashboardProps["flyerState"];
  galleryImages: DashboardProps["galleryImages"];
  instagramContext: DashboardProps["instagramContext"];
  isInsideSchedule: boolean;
  isWeekExpired?: DashboardProps["isWeekExpired"];
  onAddImageToGallery: DashboardProps["onAddImageToGallery"];
  onAddTournamentEvent: DashboardProps["onAddTournamentEvent"];
  onBackToSchedulesList: () => void;
  onClearExpiredSchedule?: DashboardProps["onClearExpiredSchedule"];
  onDeleteGalleryImage?: DashboardProps["onDeleteGalleryImage"];
  onDeleteSchedule?: DashboardProps["onDeleteSchedule"];
  onPublishToCampaign: DashboardProps["onPublishToCampaign"];
  onSchedulePost: DashboardProps["onSchedulePost"];
  onSelectSchedule?: DashboardProps["onSelectSchedule"];
  onSetChatReference: DashboardProps["onSetChatReference"];
  onTournamentFileUpload: DashboardProps["onTournamentFileUpload"];
  onUpdateGalleryImage: DashboardProps["onUpdateGalleryImage"];
  selectedDailyFlyerIds: DashboardProps["selectedDailyFlyerIds"];
  selectedStyleReference: DashboardProps["selectedStyleReference"];
  setDailyFlyerState: DashboardProps["setDailyFlyerState"];
  setFlyerState: DashboardProps["setFlyerState"];
  setIsInsideSchedule: (value: boolean) => void;
  setSelectedDailyFlyerIds: DashboardProps["setSelectedDailyFlyerIds"];
  styleReferences: DashboardProps["styleReferences"];
  tournamentEvents: DashboardProps["tournamentEvents"];
  userId?: DashboardProps["userId"];
  weekScheduleInfo: DashboardProps["weekScheduleInfo"];
}

function formatDateDisplay(dateStr: string) {
  if (!dateStr) return "";
  if (/^\d{2}\/\d{2}$/.test(dateStr)) return dateStr;

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}`;
}

export function DashboardFlyerView({
  allSchedules,
  brandProfile,
  currentScheduleId,
  dailyFlyerState,
  flyerState,
  galleryImages,
  instagramContext,
  isInsideSchedule,
  isWeekExpired,
  onAddImageToGallery,
  onAddTournamentEvent,
  onBackToSchedulesList,
  onClearExpiredSchedule,
  onDeleteGalleryImage,
  onDeleteSchedule,
  onPublishToCampaign,
  onSchedulePost,
  onSelectSchedule,
  onSetChatReference,
  onTournamentFileUpload,
  onUpdateGalleryImage,
  selectedDailyFlyerIds,
  selectedStyleReference,
  setDailyFlyerState,
  setFlyerState,
  setIsInsideSchedule,
  setSelectedDailyFlyerIds,
  styleReferences,
  tournamentEvents,
  userId,
  weekScheduleInfo,
}: DashboardFlyerViewProps) {
  if (!isInsideSchedule) {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <SchedulesListView
          schedules={allSchedules || []}
          onSelectSchedule={(schedule) => {
            onSelectSchedule?.(schedule);
            setIsInsideSchedule(true);
          }}
          onFileUpload={onTournamentFileUpload}
          currentScheduleId={currentScheduleId}
          onEnterAfterUpload={() => setIsInsideSchedule(true)}
          onDeleteSchedule={onDeleteSchedule}
          onAddEvent={(event) => {
            onAddTournamentEvent(event);
            setIsInsideSchedule(true);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 border-b border-border flex-shrink-0 bg-[#070707]">
        <button
          onClick={onBackToSchedulesList}
          className="flex items-center gap-2 text-muted-foreground hover:text-white/70 transition-colors"
        >
          <Icon name="arrow-left" className="w-4 h-4" />
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
            onClearSelectedStyleReference={() => undefined}
            styleReferences={styleReferences}
            onSelectStyleReference={() => undefined}
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
