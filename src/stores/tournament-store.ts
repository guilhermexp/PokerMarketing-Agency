/**
 * Tournament Store - Tournament schedules, events, and flyer state management
 *
 * Manages:
 * - Tournament events list
 * - Week schedules list
 * - Current schedule selection
 * - Week schedule info (dates, filename)
 * - Daily flyer state (by day and period)
 * - Selected flyer IDs per day/period
 * - Restoration tracking flags
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { TournamentEvent, GalleryImage, WeekScheduleInfo } from "@/types";
import type { WeekScheduleWithCount } from "@/services/apiClient";

// =============================================================================
// Types
// =============================================================================

export type TimePeriod = "ALL" | "MORNING" | "AFTERNOON" | "NIGHT" | "HIGHLIGHTS";

type FlyerStateValue = GalleryImage | "loading";
type FlyerState = Record<string, FlyerStateValue[]>;
type DailyFlyerState = Record<string, Record<TimePeriod, FlyerStateValue[]>>;
type SelectedDailyFlyerIds = Record<string, Record<TimePeriod, string | null>>;

type SetStateAction<T> = T | ((prev: T) => T);

interface TournamentState {
  // State
  tournamentEvents: TournamentEvent[];
  allSchedules: WeekScheduleWithCount[];
  currentScheduleId: string | null;
  weekScheduleInfo: WeekScheduleInfo | null;
  isWeekExpired: boolean;
  flyerState: FlyerState;
  dailyFlyerState: DailyFlyerState;
  selectedDailyFlyerIds: SelectedDailyFlyerIds;

  // Restoration tracking (converted from refs)
  hasRestoredDailyFlyers: boolean;
  lastLoadedScheduleId: string | null;
  lastLoadedOrgId: string | null | undefined;
  hasAutoLoadedSchedule: boolean;

  // Basic setters
  setTournamentEvents: (action: SetStateAction<TournamentEvent[]>) => void;
  setAllSchedules: (action: SetStateAction<WeekScheduleWithCount[]>) => void;
  setCurrentScheduleId: (id: string | null) => void;
  setWeekScheduleInfo: (info: WeekScheduleInfo | null) => void;
  setIsWeekExpired: (expired: boolean) => void;
  setFlyerState: (action: SetStateAction<FlyerState>) => void;
  setDailyFlyerState: (action: SetStateAction<DailyFlyerState>) => void;
  setSelectedDailyFlyerIds: (action: SetStateAction<SelectedDailyFlyerIds>) => void;

  // Restoration tracking setters
  setHasRestoredDailyFlyers: (restored: boolean) => void;
  setLastLoadedScheduleId: (id: string | null) => void;
  setLastLoadedOrgId: (id: string | null | undefined) => void;
  setHasAutoLoadedSchedule: (loaded: boolean) => void;

  // Simple handlers
  addTournamentEvent: (event: TournamentEvent) => void;
  removeSchedule: (scheduleId: string) => void;
  clearScheduleState: () => void;
  resetTournamentState: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState = {
  tournamentEvents: [] as TournamentEvent[],
  allSchedules: [] as WeekScheduleWithCount[],
  currentScheduleId: null as string | null,
  weekScheduleInfo: null as WeekScheduleInfo | null,
  isWeekExpired: false,
  flyerState: {} as FlyerState,
  dailyFlyerState: {} as DailyFlyerState,
  selectedDailyFlyerIds: {} as SelectedDailyFlyerIds,
  hasRestoredDailyFlyers: false,
  lastLoadedScheduleId: null as string | null,
  lastLoadedOrgId: undefined as string | null | undefined,
  hasAutoLoadedSchedule: false,
};

// =============================================================================
// Store
// =============================================================================

export const useTournamentStore = create<TournamentState>()(
  devtools(
    (set) => ({
      ...initialState,

      // Basic setters with functional update support
      setTournamentEvents: (action) =>
        set((state) => ({
          tournamentEvents:
            typeof action === "function" ? action(state.tournamentEvents) : action,
        })),

      setAllSchedules: (action) =>
        set((state) => ({
          allSchedules:
            typeof action === "function" ? action(state.allSchedules) : action,
        })),

      setCurrentScheduleId: (id) => set({ currentScheduleId: id }),

      setWeekScheduleInfo: (info) => set({ weekScheduleInfo: info }),

      setIsWeekExpired: (expired) => set({ isWeekExpired: expired }),

      setFlyerState: (action) =>
        set((state) => ({
          flyerState:
            typeof action === "function" ? action(state.flyerState) : action,
        })),

      setDailyFlyerState: (action) =>
        set((state) => ({
          dailyFlyerState:
            typeof action === "function" ? action(state.dailyFlyerState) : action,
        })),

      setSelectedDailyFlyerIds: (action) =>
        set((state) => ({
          selectedDailyFlyerIds:
            typeof action === "function"
              ? action(state.selectedDailyFlyerIds)
              : action,
        })),

      // Restoration tracking setters
      setHasRestoredDailyFlyers: (restored) =>
        set({ hasRestoredDailyFlyers: restored }),

      setLastLoadedScheduleId: (id) => set({ lastLoadedScheduleId: id }),

      setLastLoadedOrgId: (id) => set({ lastLoadedOrgId: id }),

      setHasAutoLoadedSchedule: (loaded) => set({ hasAutoLoadedSchedule: loaded }),

      // Simple handlers
      addTournamentEvent: (event) =>
        set((state) => ({
          tournamentEvents: [event, ...state.tournamentEvents],
        })),

      removeSchedule: (scheduleId) =>
        set((state) => ({
          allSchedules: state.allSchedules.filter((s) => s.id !== scheduleId),
        })),

      clearScheduleState: () =>
        set({
          currentScheduleId: null,
          tournamentEvents: [],
          weekScheduleInfo: null,
          isWeekExpired: false,
          dailyFlyerState: {},
          selectedDailyFlyerIds: {},
          hasRestoredDailyFlyers: false,
        }),

      resetTournamentState: () => set(initialState),
    }),
    { name: "TournamentStore" }
  )
);

// =============================================================================
// Selectors
// =============================================================================

export const selectTournamentEvents = (state: TournamentState) =>
  state.tournamentEvents;
export const selectAllSchedules = (state: TournamentState) => state.allSchedules;
export const selectCurrentScheduleId = (state: TournamentState) =>
  state.currentScheduleId;
export const selectWeekScheduleInfo = (state: TournamentState) =>
  state.weekScheduleInfo;
export const selectIsWeekExpired = (state: TournamentState) => state.isWeekExpired;
export const selectDailyFlyerState = (state: TournamentState) =>
  state.dailyFlyerState;
export const selectSelectedDailyFlyerIds = (state: TournamentState) =>
  state.selectedDailyFlyerIds;
