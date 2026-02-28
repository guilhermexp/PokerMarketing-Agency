/**
 * Flyer Store - Zustand store for FlyerGenerator state management
 *
 * This store manages all UI state for the FlyerGenerator component,
 * replacing local state in the main component for better testability
 * and state sharing.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type {
  FlyerTemplate,
  GeneratedFlyer,
  TimePeriod,
  Currency,
  AspectRatio,
  Language,
  SortOption,
  WeekStats,
} from '@/types/flyer.types';
import type { GalleryImage, ImageModel, ImageSize, StyleReference } from '@/types';
import type { TournamentEvent, WeekScheduleInfo } from '@/types';

// ============================================
// State Interfaces
// ============================================

export interface FlyerState {
  // --- Flyer Data ---
  flyers: GeneratedFlyer[];
  templates: FlyerTemplate[];
  tournaments: TournamentEvent[];
  schedules: WeekScheduleInfo[];
  dailyFlyers: Record<string, Record<TimePeriod, GalleryImage[]>>;

  // --- Selection State ---
  selectedDay: string;
  selectedFlyerId: string | null;
  selectedTemplateId: string | null;

  // --- Generation Config ---
  selectedAspectRatio: AspectRatio;
  selectedImageSize: ImageSize;
  selectedCurrency: Currency;
  selectedLanguage: Language;
  selectedImageModel: ImageModel;

  // --- Display Options ---
  showIndividualTournaments: boolean;
  showPastTournaments: boolean;
  enabledPeriods: TimePeriod[];
  showOnlyWithGtd: boolean;
  sortBy: SortOption;

  // --- Assets ---
  collabLogo: { base64: string; mimeType: string } | null;
  compositionAssets: { base64: string; mimeType: string }[];

  // --- Style References ---
  globalStyleReference: StyleReference | null;
  manualStyleReference: StyleReference | null;
  styleFavorites: StyleReference[];

  // --- UI State ---
  isStylePanelOpen: boolean;
  isManualModalOpen: boolean;
  isSchedulesPanelOpen: boolean;
  isSettingsModalOpen: boolean;
  activeHelpTooltip: string | null;

  // --- Loading/Error State ---
  isLoading: boolean;
  isBatchGenerating: boolean;
  batchTrigger: number;
  error: string | null;

  // --- Week Stats ---
  weekStats: WeekStats;
}

// ============================================
// Actions Interface
// ============================================

interface FlyerActions {
  // --- Flyer Data Actions ---
  setFlyers: (flyers: GeneratedFlyer[]) => void;
  addFlyer: (flyer: GeneratedFlyer) => void;
  removeFlyer: (id: string) => void;
  setTemplates: (templates: FlyerTemplate[]) => void;
  setTournaments: (tournaments: TournamentEvent[]) => void;
  addTournament: (tournament: TournamentEvent) => void;
  updateTournament: (id: string, updates: Partial<TournamentEvent>) => void;
  setSchedules: (schedules: WeekScheduleInfo[]) => void;
  setDailyFlyers: (dailyFlyers: FlyerState['dailyFlyers']) => void;

  // --- Selection Actions ---
  selectDay: (day: string) => void;
  selectFlyer: (id: string | null) => void;
  selectTemplate: (id: string | null) => void;

  // --- Generation Config Actions ---
  setAspectRatio: (ratio: AspectRatio) => void;
  setImageSize: (size: ImageSize) => void;
  setCurrency: (currency: Currency) => void;
  setLanguage: (language: Language) => void;
  setImageModel: (model: ImageModel) => void;

  // --- Display Options Actions ---
  setShowIndividualTournaments: (show: boolean) => void;
  setShowPastTournaments: (show: boolean) => void;
  setEnabledPeriods: (periods: TimePeriod[]) => void;
  togglePeriod: (period: TimePeriod) => void;
  setShowOnlyWithGtd: (show: boolean) => void;
  setSortBy: (sort: SortOption) => void;

  // --- Asset Actions ---
  setCollabLogo: (logo: { base64: string; mimeType: string } | null) => void;
  addCompositionAsset: (asset: { base64: string; mimeType: string }) => void;
  removeCompositionAsset: (index: number) => void;
  clearCompositionAssets: () => void;

  // --- Style Reference Actions ---
  setGlobalStyleReference: (style: StyleReference | null) => void;
  setManualStyleReference: (style: StyleReference | null) => void;
  toggleStyleFavorite: (style: StyleReference) => void;
  setStyleFavorites: (favorites: StyleReference[]) => void;

  // --- UI Actions ---
  toggleStylePanel: () => void;
  setStylePanelOpen: (open: boolean) => void;
  setManualModalOpen: (open: boolean) => void;
  setSchedulesPanelOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  setActiveHelpTooltip: (tooltip: string | null) => void;

  // --- Loading/Error Actions ---
  setLoading: (loading: boolean) => void;
  setBatchGenerating: (generating: boolean) => void;
  triggerBatchGeneration: () => void;
  setError: (error: string | null) => void;

  // --- Week Stats Actions ---
  setWeekStats: (stats: WeekStats) => void;

  // --- Reset Actions ---
  resetConfig: () => void;
  resetAll: () => void;
}

// ============================================
// Constants
// ============================================

const DEFAULT_ASPECT_RATIO: AspectRatio = "9:16";
const DEFAULT_IMAGE_SIZE: ImageSize = "2K";
const DEFAULT_CURRENCY: Currency = "USD";
const DEFAULT_LANGUAGE: Language = "pt";
const DEFAULT_IMAGE_MODEL: ImageModel = "gemini-3-pro-image-preview";
const DEFAULT_ENABLED_PERIODS: TimePeriod[] = ["MORNING", "AFTERNOON", "NIGHT", "HIGHLIGHTS"];

// ============================================
// Store Implementation
// ============================================

export const useFlyerStore = create<FlyerState & FlyerActions>()(
  devtools(
    persist(
      (set, get) => ({
        // --- Initial State ---
        flyers: [],
        templates: [],
        tournaments: [],
        schedules: [],
        dailyFlyers: {},

        selectedDay: "MONDAY",
        selectedFlyerId: null,
        selectedTemplateId: null,

        selectedAspectRatio: DEFAULT_ASPECT_RATIO,
        selectedImageSize: DEFAULT_IMAGE_SIZE,
        selectedCurrency: DEFAULT_CURRENCY,
        selectedLanguage: DEFAULT_LANGUAGE,
        selectedImageModel: DEFAULT_IMAGE_MODEL,

        showIndividualTournaments: false,
        showPastTournaments: false,
        enabledPeriods: [...DEFAULT_ENABLED_PERIODS],
        showOnlyWithGtd: false,
        sortBy: "time",

        collabLogo: null,
        compositionAssets: [],

        globalStyleReference: null,
        manualStyleReference: null,
        styleFavorites: [],

        isStylePanelOpen: false,
        isManualModalOpen: false,
        isSchedulesPanelOpen: false,
        isSettingsModalOpen: false,
        activeHelpTooltip: null,

        isLoading: false,
        isBatchGenerating: false,
        batchTrigger: 0,
        error: null,

        weekStats: {
          totalEvents: 0,
          activeDays: 0,
          generatedFlyers: 0,
          scheduledPosts: 0,
        },

        // --- Flyer Data Actions ---
        setFlyers: (flyers) => set({ flyers }),
        addFlyer: (flyer) => set((state) => ({
          flyers: [...state.flyers, flyer]
        })),
        removeFlyer: (id) => set((state) => ({
          flyers: state.flyers.filter((f) => f.id !== id)
        })),
        setTemplates: (templates) => set({ templates }),
        setTournaments: (tournaments) => set({
          tournaments,
          weekStats: {
            ...get().weekStats,
            totalEvents: tournaments.length,
            activeDays: new Set(tournaments.map((t) => t.day)).size,
          }
        }),
        addTournament: (tournament) => set((state) => ({
          tournaments: [...state.tournaments, tournament],
          weekStats: {
            ...state.weekStats,
            totalEvents: state.weekStats.totalEvents + 1,
          }
        })),
        updateTournament: (id, updates) => set((state) => ({
          tournaments: state.tournaments.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),
        setSchedules: (schedules) => set({ schedules }),
        setDailyFlyers: (dailyFlyers) => set({ dailyFlyers }),

        // --- Selection Actions ---
        selectDay: (day) => set({ selectedDay: day }),
        selectFlyer: (id) => set({ selectedFlyerId: id }),
        selectTemplate: (id) => set({ selectedTemplateId: id }),

        // --- Generation Config Actions ---
        setAspectRatio: (ratio) => set({ selectedAspectRatio: ratio }),
        setImageSize: (size) => set({ selectedImageSize: size }),
        setCurrency: (currency) => set({ selectedCurrency: currency }),
        setLanguage: (language) => set({ selectedLanguage: language }),
        setImageModel: (model) => set({ selectedImageModel: model }),

        // --- Display Options Actions ---
        setShowIndividualTournaments: (show) => set({ showIndividualTournaments: show }),
        setShowPastTournaments: (show) => set({ showPastTournaments: show }),
        setEnabledPeriods: (periods) => set({ enabledPeriods: periods }),
        togglePeriod: (period) => set((state) => {
          const enabled = state.enabledPeriods.includes(period)
            ? state.enabledPeriods.filter((p) => p !== period)
            : [...state.enabledPeriods, period];
          return { enabledPeriods: enabled };
        }),
        setShowOnlyWithGtd: (show) => set({ showOnlyWithGtd: show }),
        setSortBy: (sort) => set({ sortBy: sort }),

        // --- Asset Actions ---
        setCollabLogo: (logo) => set({ collabLogo: logo }),
        addCompositionAsset: (asset) => set((state) => ({
          compositionAssets: [...state.compositionAssets, asset]
        })),
        removeCompositionAsset: (index) => set((state) => ({
          compositionAssets: state.compositionAssets.filter((_, i) => i !== index)
        })),
        clearCompositionAssets: () => set({ compositionAssets: [] }),

        // --- Style Reference Actions ---
        setGlobalStyleReference: (style) => set({ globalStyleReference: style }),
        setManualStyleReference: (style) => set({ manualStyleReference: style }),
        toggleStyleFavorite: (style) => set((state) => {
          const isFavorite = state.styleFavorites.some((f) => f.id === style.id);
          const newFavorites = isFavorite
            ? state.styleFavorites.filter((f) => f.id !== style.id)
            : [...state.styleFavorites, style];
          return { styleFavorites: newFavorites };
        }),
        setStyleFavorites: (favorites) => set({ styleFavorites: favorites }),

        // --- UI Actions ---
        toggleStylePanel: () => set((state) => ({ isStylePanelOpen: !state.isStylePanelOpen })),
        setStylePanelOpen: (open) => set({ isStylePanelOpen: open }),
        setManualModalOpen: (open) => set({ isManualModalOpen: open }),
        setSchedulesPanelOpen: (open) => set({ isSchedulesPanelOpen: open }),
        setSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),
        setActiveHelpTooltip: (tooltip) => set({ activeHelpTooltip: tooltip }),

        // --- Loading/Error Actions ---
        setLoading: (loading) => set({ isLoading: loading }),
        setBatchGenerating: (generating) => set({ isBatchGenerating: generating }),
        triggerBatchGeneration: () => set((state) => ({
          batchTrigger: state.batchTrigger + 1
        })),
        setError: (error) => set({ error }),

        // --- Week Stats Actions ---
        setWeekStats: (stats) => set({ weekStats: stats }),

        // --- Reset Actions ---
        resetConfig: () => set({
          selectedAspectRatio: DEFAULT_ASPECT_RATIO,
          selectedImageSize: DEFAULT_IMAGE_SIZE,
          selectedCurrency: DEFAULT_CURRENCY,
          selectedLanguage: DEFAULT_LANGUAGE,
          selectedImageModel: DEFAULT_IMAGE_MODEL,
          showIndividualTournaments: false,
          showPastTournaments: false,
          enabledPeriods: [...DEFAULT_ENABLED_PERIODS],
          showOnlyWithGtd: false,
          sortBy: "time",
          collabLogo: null,
          compositionAssets: [],
          manualStyleReference: null,
        }),
        resetAll: () => set({
          flyers: [],
          templates: [],
          tournaments: [],
          schedules: [],
          dailyFlyers: {},
          selectedDay: "MONDAY",
          selectedFlyerId: null,
          selectedTemplateId: null,
          selectedAspectRatio: DEFAULT_ASPECT_RATIO,
          selectedImageSize: DEFAULT_IMAGE_SIZE,
          selectedCurrency: DEFAULT_CURRENCY,
          selectedLanguage: DEFAULT_LANGUAGE,
          selectedImageModel: DEFAULT_IMAGE_MODEL,
          showIndividualTournaments: false,
          showPastTournaments: false,
          enabledPeriods: [...DEFAULT_ENABLED_PERIODS],
          showOnlyWithGtd: false,
          sortBy: "time",
          collabLogo: null,
          compositionAssets: [],
          globalStyleReference: null,
          manualStyleReference: null,
          styleFavorites: [],
          isStylePanelOpen: false,
          isManualModalOpen: false,
          isSchedulesPanelOpen: false,
          isSettingsModalOpen: false,
          activeHelpTooltip: null,
          isLoading: false,
          isBatchGenerating: false,
          batchTrigger: 0,
          error: null,
          weekStats: {
            totalEvents: 0,
            activeDays: 0,
            generatedFlyers: 0,
            scheduledPosts: 0,
          },
        }),
      }),
      {
        name: 'flyer-store',
        partialize: (state) => ({
          selectedDay: state.selectedDay,
          selectedAspectRatio: state.selectedAspectRatio,
          selectedImageSize: state.selectedImageSize,
          selectedCurrency: state.selectedCurrency,
          selectedLanguage: state.selectedLanguage,
          selectedImageModel: state.selectedImageModel,
          showIndividualTournaments: state.showIndividualTournaments,
          showPastTournaments: state.showPastTournaments,
          enabledPeriods: state.enabledPeriods,
          showOnlyWithGtd: state.showOnlyWithGtd,
          sortBy: state.sortBy,
          styleFavorites: state.styleFavorites,
        }),
      },
    ),
    { name: 'FlyerStore' },
  ),
);

// ============================================
// Selectors
// ============================================

export const selectCurrentDayTournaments = (state: FlyerState & FlyerActions) =>
  state.tournaments.filter((t) => t.day === state.selectedDay);

export const selectEnabledPeriodTournaments = (state: FlyerState & FlyerActions) => {
  const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const todayIndex = DAY_ORDER.indexOf(today);

  return state.tournaments.filter((t) =>
    state.enabledPeriods.includes(t.day as TimePeriod) &&
    (state.showPastTournaments || DAY_ORDER.indexOf(t.day) >= todayIndex)
  );
};

export const selectSortedTournaments = (state: FlyerState & FlyerActions) => {
  const tournaments = state.tournaments.filter((t) => t.day === state.selectedDay);
  if (state.sortBy === "time") {
    return [...tournaments].sort((a, b) => {
      const timeA = parseInt(a.times?.["-3"]?.replace(/[^0-9]/g, "") || "0");
      const timeB = parseInt(b.times?.["-3"]?.replace(/[^0-9]/g, "") || "0");
      return timeA - timeB;
    });
  }
  return [...tournaments].sort((a, b) => {
    const gtdA = parseFloat(a.gtd?.replace(/[^0-9.-]/g, "") || "0");
    const gtdB = parseFloat(b.gtd?.replace(/[^0-9.-]/g, "") || "0");
    return gtdB - gtdA;
  });
};

// Use with useShallow to prevent unnecessary re-renders:
// const config = useFlyerStore(useShallow(selectGenerationConfig));
export const selectGenerationConfig = (state: FlyerState & FlyerActions) => ({
  aspectRatio: state.selectedAspectRatio,
  imageSize: state.selectedImageSize,
  currency: state.selectedCurrency,
  language: state.selectedLanguage,
  model: state.selectedImageModel,
});
