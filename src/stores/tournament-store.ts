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
import type { GalleryImage } from "@/types";

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
  flyerState: FlyerState;
  dailyFlyerState: DailyFlyerState;
  selectedDailyFlyerIds: SelectedDailyFlyerIds;
  currentScheduleId: string | null;

  // Restoration tracking (converted from refs)
  hasRestoredDailyFlyers: boolean;
  lastLoadedScheduleId: string | null;
  lastLoadedOrgId: string | null | undefined;
  hasAutoLoadedSchedule: boolean;

  setFlyerState: (action: SetStateAction<FlyerState>) => void;
  setDailyFlyerState: (action: SetStateAction<DailyFlyerState>) => void;
  setSelectedDailyFlyerIds: (action: SetStateAction<SelectedDailyFlyerIds>) => void;
  setCurrentScheduleId: (id: string | null) => void;

  // Restoration tracking setters
  setHasRestoredDailyFlyers: (restored: boolean) => void;
  setLastLoadedScheduleId: (id: string | null) => void;
  setLastLoadedOrgId: (id: string | null | undefined) => void;
  setHasAutoLoadedSchedule: (loaded: boolean) => void;

  // Simple handlers
  clearScheduleState: () => void;
  resetTournamentState: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState = {
  flyerState: {} as FlyerState,
  dailyFlyerState: {} as DailyFlyerState,
  selectedDailyFlyerIds: {} as SelectedDailyFlyerIds,
  currentScheduleId: null as string | null,
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

      setCurrentScheduleId: (id) => set({ currentScheduleId: id }),

      // Restoration tracking setters
      setHasRestoredDailyFlyers: (restored) =>
        set({ hasRestoredDailyFlyers: restored }),

      setLastLoadedScheduleId: (id) => set({ lastLoadedScheduleId: id }),

      setLastLoadedOrgId: (id) => set({ lastLoadedOrgId: id }),

      setHasAutoLoadedSchedule: (loaded) => set({ hasAutoLoadedSchedule: loaded }),

      clearScheduleState: () =>
        set({
          currentScheduleId: null,
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
export const selectCurrentScheduleId = (state: TournamentState) =>
  state.currentScheduleId;
export const selectDailyFlyerState = (state: TournamentState) =>
  state.dailyFlyerState;
export const selectSelectedDailyFlyerIds = (state: TournamentState) =>
  state.selectedDailyFlyerIds;
