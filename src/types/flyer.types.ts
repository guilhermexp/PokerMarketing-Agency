/**
 * Flyer-specific types
 * Separated from types.ts for better organization
 */

import type { ImageModel, ImageSize, StyleReference, TournamentEvent, WeekScheduleInfo } from '@/types';

// Time periods for flyer generation
export type TimePeriod = "ALL" | "MORNING" | "AFTERNOON" | "NIGHT" | "HIGHLIGHTS";

// Currency options
export type Currency = "USD" | "BRL";

// Aspect ratio options
export type AspectRatio = "9:16" | "1:1" | "16:9";

// Language options
export type Language = "pt" | "en";

// Sort options
export type SortOption = "time" | "gtd";

// Flyer generation configuration
export interface FlyerGenerationConfig {
  selectedAspectRatio: AspectRatio;
  selectedImageSize: ImageSize;
  selectedCurrency: Currency;
  selectedLanguage: Language;
  selectedImageModel: ImageModel;
  showIndividualTournaments: boolean;
  showPastTournaments: boolean;
  enabledPeriods: TimePeriod[];
  showOnlyWithGtd: boolean;
  sortBy: SortOption;
  collabLogo: { base64: string; mimeType: string } | null;
  manualStyleReference: StyleReference | null;
  globalStyleReference: StyleReference | null;
  compositionAssets: { base64: string; mimeType: string }[] | null;
}

// Generated flyer
export interface GeneratedFlyer {
  id: string;
  url: string;
  period: TimePeriod;
  eventId?: string; // For individual tournament flyers
  day?: string;
  createdAt: number;
}

// Daily flyer summary
export interface DailyFlyer {
  id: string;
  day: string;
  period: TimePeriod;
  imageUrl: string;
  eventIds: string[];
}

// Schedule from Excel import
export interface FlyerSchedule {
  id: string;
  filename: string;
  startDate: string;
  endDate: string;
  dailyFlyers: Record<TimePeriod, string[]>;
  createdAt: number;
}

// Flyer template
export interface FlyerTemplate {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
  isDefault?: boolean;
}

// Props for FlyerGenerator component
export interface FlyerGeneratorProps {
  brandProfile: {
    name: string;
    primaryColor: string;
    secondaryColor: string;
    logo: string | null;
  };
  selectedStyleReference: StyleReference | null;
  onStyleSelect: (style: StyleReference | null) => void;
  tournaments: TournamentEvent[];
  schedules: WeekScheduleInfo[];
  onSchedulesChange: () => void;
  galleryImages: { id: string; src: string }[];
  styleFavorites: StyleReference[];
  onFavoriteToggle: (styleId: string) => void;
}

// Week statistics
export interface WeekStats {
  totalEvents: number;
  activeDays: number;
  generatedFlyers: number;
  scheduledPosts: number;
}
