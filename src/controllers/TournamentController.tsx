import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useBrandProfileController } from "@/controllers/BrandProfileController";
import { useDailyFlyersSync } from "@/hooks/useDailyFlyersSync";
import { useTournamentHandlers, mapDbEventToTournamentEvent, parseDateOnly } from "@/hooks/useTournamentHandlers";
import { useSchedulesList, useTournamentData } from "@/hooks/useAppData";
import { useTournamentStore } from "@/stores/tournament-store";
import type { WeekScheduleWithCount } from "@/services/apiClient";
import type { TournamentEvent, WeekScheduleInfo } from "@/types";

interface TournamentControllerValue {
  tournamentEvents: TournamentEvent[];
  weekScheduleInfo: WeekScheduleInfo | null;
  allSchedules: WeekScheduleWithCount[];
  currentScheduleId: string | null;
  flyerState: ReturnType<typeof useTournamentStore.getState>["flyerState"];
  setFlyerState: ReturnType<typeof useTournamentStore.getState>["setFlyerState"];
  dailyFlyerState: ReturnType<typeof useTournamentStore.getState>["dailyFlyerState"];
  setDailyFlyerState: ReturnType<
    typeof useTournamentStore.getState
  >["setDailyFlyerState"];
  selectedDailyFlyerIds: ReturnType<
    typeof useTournamentStore.getState
  >["selectedDailyFlyerIds"];
  setSelectedDailyFlyerIds: ReturnType<
    typeof useTournamentStore.getState
  >["setSelectedDailyFlyerIds"];
  isWeekExpired: boolean;
  isInsideSchedule: boolean;
  setIsInsideSchedule: (open: boolean) => void;
  handleAddTournamentEvent: (event: TournamentEvent) => void;
  handleTournamentFileUpload: ReturnType<
    typeof useTournamentHandlers
  >["handleTournamentFileUpload"];
  handleSelectSchedule: ReturnType<
    typeof useTournamentHandlers
  >["handleSelectSchedule"];
  handleDeleteSchedule: ReturnType<
    typeof useTournamentHandlers
  >["handleDeleteSchedule"];
  handleClearExpiredSchedule: ReturnType<
    typeof useTournamentHandlers
  >["handleClearExpiredSchedule"];
}

const TournamentControllerContext =
  createContext<TournamentControllerValue | null>(null);

interface TournamentControllerProps {
  children: ReactNode;
}

export function TournamentController({ children }: TournamentControllerProps) {
  const { organizationId, userId } = useBrandProfileController();

  const [tournamentEvents, setTournamentEvents] = useState<TournamentEvent[]>(
    []
  );
  const [allSchedules, setAllSchedules] = useState<WeekScheduleWithCount[]>([]);
  const [weekScheduleInfo, setWeekScheduleInfo] =
    useState<WeekScheduleInfo | null>(null);
  const [isWeekExpired, setIsWeekExpired] = useState(false);
  const [isInsideSchedule, setIsInsideSchedule] = useState(false);

  const currentScheduleId = useTournamentStore(
    (state) => state.currentScheduleId
  );
  const setCurrentScheduleId = useTournamentStore(
    (state) => state.setCurrentScheduleId
  );
  const flyerState = useTournamentStore((state) => state.flyerState);
  const setFlyerState = useTournamentStore((state) => state.setFlyerState);
  const dailyFlyerState = useTournamentStore((state) => state.dailyFlyerState);
  const setDailyFlyerState = useTournamentStore(
    (state) => state.setDailyFlyerState
  );
  const selectedDailyFlyerIds = useTournamentStore(
    (state) => state.selectedDailyFlyerIds
  );
  const setSelectedDailyFlyerIds = useTournamentStore(
    (state) => state.setSelectedDailyFlyerIds
  );
  const hasRestoredDailyFlyers = useTournamentStore(
    (state) => state.hasRestoredDailyFlyers
  );
  const setHasRestoredDailyFlyers = useTournamentStore(
    (state) => state.setHasRestoredDailyFlyers
  );
  const lastLoadedScheduleId = useTournamentStore(
    (state) => state.lastLoadedScheduleId
  );
  const setLastLoadedScheduleId = useTournamentStore(
    (state) => state.setLastLoadedScheduleId
  );
  const lastLoadedOrgId = useTournamentStore((state) => state.lastLoadedOrgId);
  const setLastLoadedOrgId = useTournamentStore(
    (state) => state.setLastLoadedOrgId
  );
  const hasAutoLoadedSchedule = useTournamentStore(
    (state) => state.hasAutoLoadedSchedule
  );
  const setHasAutoLoadedSchedule = useTournamentStore(
    (state) => state.setHasAutoLoadedSchedule
  );

  const { schedule: swrTournamentSchedule, events: swrTournamentEvents } =
    useTournamentData(userId, organizationId);
  const { schedules: swrAllSchedules } = useSchedulesList(userId, organizationId);

  const {
    handleTournamentFileUpload,
    handleSelectSchedule,
    handleDeleteSchedule,
    handleClearExpiredSchedule,
  } = useTournamentHandlers({
    userId,
    organizationId,
    currentScheduleId,
    setTournamentEvents,
    setWeekScheduleInfo,
    setCurrentScheduleId,
    setIsWeekExpired,
    setAllSchedules,
    setDailyFlyerState,
    setHasRestoredDailyFlyers,
  });

  useDailyFlyersSync({
    userId,
    organizationId,
    currentScheduleId,
    hasRestoredDailyFlyers,
    lastLoadedScheduleId,
    lastLoadedOrgId,
    setDailyFlyerState,
    setHasRestoredDailyFlyers,
    setLastLoadedScheduleId,
    setLastLoadedOrgId,
  });

  const handleAddTournamentEvent = useCallback((event: TournamentEvent) => {
    setTournamentEvents((current) => [event, ...current]);
  }, []);

  useEffect(() => {
    if (swrTournamentEvents?.length) {
      setTournamentEvents(swrTournamentEvents.map(mapDbEventToTournamentEvent));
      return;
    }

    if (tournamentEvents.length) {
      setTournamentEvents([]);
    }
  }, [swrTournamentEvents, tournamentEvents.length]);

  useEffect(() => {
    if (swrAllSchedules?.length) {
      setAllSchedules(swrAllSchedules);
      return;
    }

    if (allSchedules.length) {
      setAllSchedules([]);
    }
  }, [swrAllSchedules, allSchedules.length]);

  useEffect(() => {
    if (!swrTournamentSchedule) return;

    const schedule = swrTournamentSchedule;
    setCurrentScheduleId(schedule.id);

    const endDate = parseDateOnly(schedule.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    setIsWeekExpired(today > endDate);

    const startDate = parseDateOnly(schedule.start_date);
    setWeekScheduleInfo({
      id: schedule.id,
      startDate: `${String(startDate.getDate()).padStart(2, "0")}/${String(
        startDate.getMonth() + 1
      ).padStart(2, "0")}`,
      endDate: `${String(endDate.getDate()).padStart(2, "0")}/${String(
        endDate.getMonth() + 1
      ).padStart(2, "0")}`,
      filename: schedule.filename || "Planilha carregada",
      daily_flyer_urls: schedule.daily_flyer_urls,
    });
  }, [swrTournamentSchedule, setCurrentScheduleId]);

  useEffect(() => {
    if (
      !hasAutoLoadedSchedule &&
      swrAllSchedules?.length &&
      !currentScheduleId &&
      userId
    ) {
      setHasAutoLoadedSchedule(true);
      void handleSelectSchedule(swrAllSchedules[0]);
    }
  }, [
    swrAllSchedules,
    currentScheduleId,
    userId,
    hasAutoLoadedSchedule,
    setHasAutoLoadedSchedule,
    handleSelectSchedule,
  ]);

  const value = useMemo<TournamentControllerValue>(
    () => ({
      tournamentEvents,
      weekScheduleInfo,
      allSchedules,
      currentScheduleId,
      flyerState,
      setFlyerState,
      dailyFlyerState,
      setDailyFlyerState,
      selectedDailyFlyerIds,
      setSelectedDailyFlyerIds,
      isWeekExpired,
      isInsideSchedule,
      setIsInsideSchedule,
      handleAddTournamentEvent,
      handleTournamentFileUpload,
      handleSelectSchedule,
      handleDeleteSchedule,
      handleClearExpiredSchedule,
    }),
    [
      tournamentEvents,
      weekScheduleInfo,
      allSchedules,
      currentScheduleId,
      flyerState,
      setFlyerState,
      dailyFlyerState,
      setDailyFlyerState,
      selectedDailyFlyerIds,
      setSelectedDailyFlyerIds,
      isWeekExpired,
      isInsideSchedule,
      handleAddTournamentEvent,
      handleTournamentFileUpload,
      handleSelectSchedule,
      handleDeleteSchedule,
      handleClearExpiredSchedule,
    ]
  );

  return (
    <TournamentControllerContext.Provider value={value}>
      {children}
    </TournamentControllerContext.Provider>
  );
}

export function useTournamentController() {
  const context = useContext(TournamentControllerContext);

  if (!context) {
    throw new Error(
      "useTournamentController must be used within TournamentController"
    );
  }

  return context;
}
