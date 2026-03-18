import React from "react";
import type { InstagramContext } from "../../services/rubeService";
import type { WeekScheduleWithCount } from "../../services/apiClient";
import type {
  BrandProfile,
  CampaignSummary,
  ChatMessage,
  ChatReferenceImage,
  ContentInput,
  CreativeModel,
  GalleryImage,
  GenerationOptions,
  ImageModel,
  MarketingCampaign,
  PendingToolEdit,
  StyleReference,
  Theme,
  TournamentEvent,
  WeekScheduleInfo,
  InstagramPublishState,
} from "../../types";
import type { TimePeriod } from "../flyer/FlyerGenerator";
import type { ScheduledPost } from "../../types";

export type View =
  | "campaign"
  | "campaigns"
  | "carousels"
  | "flyer"
  | "gallery"
  | "calendar"
  | "playground"
  | "image-playground";

export type Tab = "clips" | "carrossel" | "posts" | "ads";

export interface DashboardProps {
  brandProfile: BrandProfile;
  campaign: MarketingCampaign | null;
  productImages?: { base64: string; mimeType: string }[] | null;
  compositionAssets?: { base64: string; mimeType: string }[] | null;
  onGenerate: (input: ContentInput, options: GenerationOptions) => void;
  isGenerating: boolean;
  onEditProfile: () => void;
  onResetCampaign: () => void;
  isAssistantOpen: boolean;
  onToggleAssistant: () => void;
  assistantHistory: ChatMessage[];
  isAssistantLoading: boolean;
  onAssistantSendMessage: (
    message: string,
    image: ChatReferenceImage | null,
  ) => void;
  chatReferenceImage: ChatReferenceImage | null;
  onSetChatReference: (image: GalleryImage | null) => void;
  onSetChatReferenceSilent?: (image: GalleryImage | null) => void;
  theme: Theme;
  onThemeToggle: () => void;
  galleryImages: GalleryImage[];
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onDeleteGalleryImage?: (imageId: string) => void;
  onMarkGalleryImagePublished?: (imageId: string) => void;
  onRefreshGallery?: () => void;
  galleryIsLoading?: boolean;
  tournamentEvents: TournamentEvent[];
  weekScheduleInfo: WeekScheduleInfo | null;
  onTournamentFileUpload: (file: File) => Promise<void>;
  onAddTournamentEvent: (event: TournamentEvent) => void;
  flyerState: Record<string, (GalleryImage | "loading")[]>;
  setFlyerState: React.Dispatch<
    React.SetStateAction<Record<string, (GalleryImage | "loading")[]>>
  >;
  dailyFlyerState: Record<
    string,
    Record<TimePeriod, (GalleryImage | "loading")[]>
  >;
  setDailyFlyerState: React.Dispatch<
    React.SetStateAction<
      Record<string, Record<TimePeriod, (GalleryImage | "loading")[]>>
    >
  >;
  selectedDailyFlyerIds: Record<string, Record<TimePeriod, string | null>>;
  setSelectedDailyFlyerIds: React.Dispatch<
    React.SetStateAction<Record<string, Record<TimePeriod, string | null>>>
  >;
  activeView: View;
  onViewChange: (view: View) => void;
  onPublishToCampaign: (text: string, flyer: GalleryImage) => void;
  styleReferences: StyleReference[];
  onAddStyleReference: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference: (id: string) => void;
  onSelectStyleReference: (ref: StyleReference) => void;
  selectedStyleReference: StyleReference | null;
  onClearSelectedStyleReference: () => void;
  scheduledPosts: ScheduledPost[];
  onSchedulePost: (
    post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">,
  ) => void;
  onUpdateScheduledPost: (
    postId: string,
    updates: Partial<ScheduledPost>,
  ) => void;
  onDeleteScheduledPost: (postId: string) => void;
  onRetryScheduledPost?: (postId: string) => void;
  onPublishToInstagram: (post: ScheduledPost) => void;
  publishingStates: Record<string, InstagramPublishState>;
  campaignsList: CampaignSummary[];
  onLoadCampaign: (campaignId: string) => void;
  onCreateCarouselFromPrompt?: (
    prompt: string,
    slidesPerCarousel: number,
    imageModel?: ImageModel,
  ) => Promise<void>;
  userId?: string;
  organizationId?: string | null;
  isWeekExpired?: boolean;
  onClearExpiredSchedule?: () => void;
  allSchedules?: WeekScheduleWithCount[];
  currentScheduleId?: string | null;
  onSelectSchedule?: (schedule: WeekScheduleWithCount) => void;
  onDeleteSchedule?: (scheduleId: string) => void;
  onUpdateCreativeModel?: (model: CreativeModel) => void;
  instagramContext?: InstagramContext;
  onCarouselUpdate?: (carousel: import("../../types").CarouselScript) => void;
  pendingToolEdit?: PendingToolEdit | null;
  editingImage?: GalleryImage | null;
  onRequestImageEdit?: (request: {
    toolCallId: string;
    toolName: string;
    prompt: string;
    imageId: string;
  }) => void;
  onToolEditApproved?: (toolCallId: string, imageUrl: string) => void;
  onToolEditRejected?: (toolCallId: string, reason?: string) => void;
  onShowToolEditPreview?: (payload: {
    toolCallId: string;
    imageUrl: string;
    prompt?: string;
    referenceImageId?: string;
    referenceImageUrl?: string;
  }) => void;
  toolEditPreview?: import("../image-preview/types").EditPreview | null;
  onCloseImageEditor?: () => void;
}

export const DOT_GRID_STYLE_40 = {
  backgroundImage: "radial-gradient(circle, rgb(170, 170, 170) 1px, transparent 1px)",
  backgroundPosition: "10px 10px",
  backgroundSize: "40px 40px",
} as const;

export const DOT_GRID_STYLE_20 = {
  backgroundImage: "radial-gradient(circle, rgb(170, 170, 170) 1px, transparent 1px)",
  backgroundPosition: "10px 10px",
  backgroundSize: "20px 20px",
} as const;

export const DOT_GRID_STYLE_50 = {
  backgroundImage: "radial-gradient(circle, rgb(170, 170, 170) 1px, transparent 1px)",
  backgroundPosition: "15px 15px",
  backgroundSize: "50px 50px",
} as const;

export const DOT_GRID_STYLE_30 = {
  backgroundImage: "radial-gradient(circle, rgb(170, 170, 170) 1px, transparent 1px)",
  backgroundPosition: "15px 15px",
  backgroundSize: "30px 30px",
} as const;

export const VIGNETTE_STYLE = {
  background:
    "radial-gradient(80% 70%, transparent 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.9) 75%, black 100%)",
} as const;

export const ViewLoadingFallback = () => (
  <div className="w-full h-full min-h-[220px] flex items-center justify-center">
    <span className="text-xs text-muted-foreground">Carregando...</span>
  </div>
);
