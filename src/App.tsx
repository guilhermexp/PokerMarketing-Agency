import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { BrandProfileSetup } from "./components/brand/BrandProfileSetup";
import { Dashboard } from "./components/dashboard/Dashboard";
import { AssistantPanel } from "./components/assistant/AssistantPanel";
import { AssistantPanelNew } from "./components/assistant/AssistantPanelNew";
import { SettingsModal } from "./components/settings/SettingsModal";
import { useInstagramAccounts } from "./components/settings/ConnectInstagramModal";
import { Loader } from "./components/common/Loader";
import {
  generateCampaign,
  editImage,
  generateLogo,
  generateImage,
} from "./services/geminiService";
import { runAssistantConversationStream } from "./services/assistantService";
import {
  publishToInstagram,
  uploadImageForInstagram,
  type InstagramContentType,
  type InstagramContext,
} from "./services/rubeService";
import { uploadDataUrlToBlob } from "./services/blobService";
import type { EditPreview } from "./components/image-preview/types";
import type {
  BrandProfile,
  MarketingCampaign,
  ContentInput,
  ChatMessage,
  Theme,
  TournamentEvent,
  GalleryImage,
  ChatReferenceImage,
  ChatPart,
  GenerationOptions,
  WeekScheduleInfo,
  StyleReference,
  ScheduledPost,
  InstagramPublishState,
  CreativeModel,
  AssistantFunctionCall,
  PendingToolEdit,
} from "./types";
import { Icon } from "./components/common/Icon";
import {
  AuthWrapper,
  useAuth,
} from "./components/auth/AuthWrapper";
import { useOrganization } from "@clerk/clerk-react";
import { BackgroundJobsProvider } from "./hooks/useBackgroundJobs";
import { BackgroundJobsIndicator } from "./components/common/BackgroundJobsIndicator";
import { ChatProvider } from "./contexts/ChatContext";
import {
  getBrandProfile,
  createBrandProfile,
  updateBrandProfile,
  createGalleryImage,
  createScheduledPost,
  updateScheduledPost as updateScheduledPostApi,
  deleteScheduledPost as deleteScheduledPostApi,
  getCampaignById,
  createCampaign as createCampaignApi,
  createWeekSchedule,
  deleteWeekSchedule,
  getScheduleEvents,
  getWeekSchedulesList,
  deleteGalleryImage,
  updateGalleryImage,
  getDailyFlyers,
  type DbCampaign,
  type WeekScheduleWithCount,
  type DbTournamentEvent,
} from "./services/apiClient";
import {
  useInitialData,
  useGalleryImages,
  useScheduledPosts,
  useCampaigns,
  useTournamentData,
  useSchedulesList,
} from "./hooks/useAppData";
import type { CampaignSummary } from "./types";

export type TimePeriod =
  | "ALL"
  | "MORNING"
  | "AFTERNOON"
  | "NIGHT"
  | "HIGHLIGHTS";
export type ViewType =
  | "campaign"
  | "campaigns"
  | "flyer"
  | "gallery"
  | "calendar"
  | "playground"
  | "image-playground";

const MAX_CHAT_HISTORY_MESSAGES = 10;

const excelTimeToStr = (val: unknown): string => {
  if (typeof val === "number") {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }
  return String(val || "");
};

const parseDateOnly = (dateStr: string): Date => {
  const [datePart] = dateStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const resizeImageForChat = (
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
): Promise<{ base64: string; mimeType: "image/jpeg" }> => {
  return new Promise((resolve, reject) => {
    const loadImage = async () => {
      let imageSrc = dataUrl;
      let revokeUrl = false;

      if (!dataUrl.startsWith("data:")) {
        const response = await fetch(dataUrl);
        if (!response.ok) {
          throw new Error(`Falha ao carregar imagem (${response.status})`);
        }
        const blob = await response.blob();
        imageSrc = URL.createObjectURL(blob);
        revokeUrl = true;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round(width * (maxHeight / height));
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas context error"));
        ctx.drawImage(img, 0, 0, width, height);
        if (revokeUrl) URL.revokeObjectURL(imageSrc);
        const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.6);
        resolve({
          base64: resizedDataUrl.split(",")[1],
          mimeType: "image/jpeg",
        });
      };
      img.onerror = (err) => reject(err);
      img.src = imageSrc;
    };

    loadImage().catch(reject);
  });
};

// Normalize platform names to match database enum values
const normalizeSocialPlatform = (platform: string): string => {
  const normalized = platform.toLowerCase().trim();
  if (normalized.includes("twitter") || normalized.includes("x.com")) {
    return "Twitter";
  }
  if (normalized.includes("instagram")) return "Instagram";
  if (normalized.includes("linkedin")) return "LinkedIn";
  if (normalized.includes("facebook")) return "Facebook";
  return platform; // Return original if no match
};

const normalizeAdPlatform = (platform: string): string => {
  const normalized = platform.toLowerCase().trim();
  if (normalized.includes("facebook") || normalized.includes("meta")) {
    return "Facebook";
  }
  if (normalized.includes("google")) return "Google";
  return platform;
};

const getTruncatedHistory = (
  history: ChatMessage[],
  maxLength: number = MAX_CHAT_HISTORY_MESSAGES,
): ChatMessage[] => {
  const truncated =
    history.length <= maxLength ? [...history] : history.slice(-maxLength);
  return truncated.map((msg, index) => {
    if (index < truncated.length - 2) {
      return {
        ...msg,
        parts: msg.parts.map((part) =>
          part.inlineData ? { text: "[Imagem de referência anterior]" } : part,
        ),
      };
    }
    return msg;
  });
};

function AppContent() {
  const {
    userId,
    clerkUserId,
    isLoading: authLoading,
    isDbSyncing: _isDbSyncing,
    dbUser,
  } = useAuth();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const organizationId = organization?.id || null;

  // Track if initial data load has happened (prevents hot reload re-fetches)
  const hasInitializedRef = useRef(false);
  const initScopeRef = useRef<{
    userId: string | null;
    orgId: string | null;
  }>({ userId: null, orgId: null });

  const [brandProfile, setBrandProfile] = useState<BrandProfile | undefined>(undefined);
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [campaignProductImages, setCampaignProductImages] = useState<
    { base64: string; mimeType: string }[] | null
  >(null);
  const [campaignCompositionAssets, setCampaignCompositionAssets] = useState<
    { base64: string; mimeType: string }[] | null
  >(null);

  // Helper to save productImages to localStorage
  const saveProductImagesToStorage = (campaignId: string, images: { base64: string; mimeType: string }[] | null) => {
    if (images && images.length > 0) {
      try {
        localStorage.setItem(`productImages_${campaignId}`, JSON.stringify(images));
        console.debug("[App] Saved productImages to localStorage for campaign:", campaignId);
      } catch (e) {
        console.warn("[App] Failed to save productImages to localStorage:", e);
      }
    }
  };

  // Helper to load productImages from localStorage
  const loadProductImagesFromStorage = (campaignId: string): { base64: string; mimeType: string }[] | null => {
    try {
      const stored = localStorage.getItem(`productImages_${campaignId}`);
      if (stored) {
        const images = JSON.parse(stored);
        console.debug("[App] Loaded productImages from localStorage for campaign:", campaignId);
        return images;
      }
    } catch (e) {
      console.warn("[App] Failed to load productImages from localStorage:", e);
    }
    return null;
  };
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>("campaign");

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [chatReferenceImage, setChatReferenceImage] =
    useState<ChatReferenceImage | null>(null);
  const [toolImageReference, setToolImageReference] =
    useState<ChatReferenceImage | null>(null);
  const [lastUploadedImage, setLastUploadedImage] =
    useState<ChatReferenceImage | null>(null);

  // Tool edit approval integration with AI Studio
  const [pendingToolEdit, setPendingToolEdit] = useState<PendingToolEdit | null>(null);
  const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);
  const [toolEditPreview, setToolEditPreview] = useState<EditPreview | null>(null);

  // Track context to prevent flashing between screens
  const contextRef = useRef({ userId, organizationId });
  const hasInitialDataLoadedOnce = useRef(false);

  // PERF: Always use clerkUserId - server resolves to DB UUID via resolveUserId()
  // This prevents double-fetch when dbUser.id becomes available after sync
  // The server's resolveUserId() handles both Clerk IDs and UUIDs with caching
  const initialDataUserId = clerkUserId || null;

  // === OPTIMIZED: Single request to load ALL initial data ===
  // PERF: Only fetch after orgLoaded to avoid double-fetch when user is in an organization
  // Without this gate, we fetch with organizationId=null first, then refetch when org loads
  const { data: initialData, isLoading: isInitialLoading } = useInitialData(
    orgLoaded ? initialDataUserId : null, // Gate by orgLoaded to prevent premature fetch
    organizationId,
    clerkUserId,
  );

  // Check if context changed (compare current context with what initialData was loaded for)
  // This prevents showing stale UI while waiting for new context data
  const isContextChanging =
    contextRef.current.userId !== userId ||
    contextRef.current.organizationId !== organizationId;

  // On first mount, always show loader until initialData loads at least once
  const isInitialMount = !hasInitialDataLoadedOnce.current && !initialData;

  if (isContextChanging || isInitialMount) {
    console.debug(
      "[App] Showing loader -",
      isContextChanging ? "context changing" : "initial mount",
      "ref:",
      contextRef.current,
      "current:",
      { userId, organizationId }
    );
  }

  // === SWR CACHED DATA HOOKS (now just read from cache populated by useInitialData) ===
  const {
    images: swrGalleryImages,
    addImage: swrAddGalleryImage,
    removeImage: swrRemoveGalleryImage,
    updateImage: swrUpdateGalleryImage,
    // loadMore: galleryLoadMore,
    // isLoadingMore: galleryIsLoadingMore,
    // hasMore: galleryHasMore,
  } = useGalleryImages(userId, organizationId);

  const {
    posts: swrScheduledPosts,
    addPost: swrAddScheduledPost,
    updatePost: swrUpdateScheduledPost,
    removePost: swrRemoveScheduledPost,
  } = useScheduledPosts(userId, organizationId);

  const { campaigns: swrCampaigns, addCampaign: swrAddCampaign } = useCampaigns(
    userId,
    organizationId,
  );

  const { schedule: swrTournamentSchedule, events: swrTournamentEvents } =
    useTournamentData(userId, organizationId);

  const { schedules: swrAllSchedules } = useSchedulesList(
    userId,
    organizationId,
  );

  // Instagram accounts for multi-tenant publishing
  const { accounts: instagramAccounts } = useInstagramAccounts(
    userId || "",
    organizationId,
  );



  // Get active Instagram context (first active account)
  const getInstagramContext = (): InstagramContext | undefined => {
    const activeAccount = instagramAccounts.find((a) => a.is_active);
    if (activeAccount && userId) {
      return {
        instagramAccountId: activeAccount.id,
        userId: userId,
        organizationId: organizationId || undefined,
      };
    }
    return undefined;
  };

  const [tournamentEvents, setTournamentEvents] = useState<TournamentEvent[]>(
    [],
  );
  const [allSchedules, setAllSchedules] = useState<WeekScheduleWithCount[]>([]);

  const mapDbEventToTournamentEvent = (e: DbTournamentEvent): TournamentEvent => ({
    id: e.id,
    day: e.day_of_week,
    name: e.name,
    game: e.game || "",
    gtd: e.gtd || "",
    buyIn: e.buy_in || "",
    rebuy: e.rebuy || "",
    addOn: e.add_on || "",
    stack: e.stack || "",
    players: e.players || "",
    lateReg: e.late_reg || "",
    minutes: e.minutes || "",
    structure: e.structure || "",
    times: e.times || {},
  });

  // Transform SWR data to local format
  const galleryImages: GalleryImage[] = (swrGalleryImages || [])
    .filter((img) => !img.src_url.startsWith("blob:"))
    .map((img) => ({
      id: img.id,
      src: img.src_url,
      prompt: img.prompt || undefined,
      source: img.source as GalleryImage["source"],
      model: img.model as GalleryImage["model"],
      mediaType: (img.media_type as GalleryImage["mediaType"]) || "image",
      duration: img.duration || undefined,
      // Campaign linking fields
      post_id: img.post_id || undefined,
      ad_creative_id: img.ad_creative_id || undefined,
      video_script_id: img.video_script_id || undefined,
      // Timestamps
      created_at: img.created_at,
      published_at: img.published_at || undefined,
    }));

  const scheduledPosts: ScheduledPost[] = (swrScheduledPosts || [])
    .map((post) => {
      const normalizedDate =
        post.scheduled_date?.split("T")[0] || post.scheduled_date;
      return {
        id: post.id,
        type: post.content_type as ScheduledPost["type"],
        contentId: post.content_id || "",
        imageUrl: post.image_url,
        carouselImageUrls: post.carousel_image_urls || undefined,
        caption: post.caption,
        hashtags: post.hashtags || [],
        scheduledDate: normalizedDate,
        scheduledTime: post.scheduled_time,
        scheduledTimestamp: new Date(post.scheduled_timestamp).getTime(),
        timezone: post.timezone,
        platforms: post.platforms as ScheduledPost["platforms"],
        instagramContentType:
          post.instagram_content_type as ScheduledPost["instagramContentType"],
        status: post.status as ScheduledPost["status"],
        publishedAt: post.published_at
          ? new Date(post.published_at).getTime()
          : undefined,
        errorMessage: post.error_message || undefined,
        createdAt: new Date(post.created_at).getTime(),
        updatedAt: new Date(post.updated_at || post.created_at).getTime(),
        createdFrom: (post.created_from ||
          "gallery") as ScheduledPost["createdFrom"],
      };
    })
    .sort((a, b) => a.scheduledTimestamp - b.scheduledTimestamp);

  const campaignsList: CampaignSummary[] = (swrCampaigns || []).map(
    (c: DbCampaign) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      createdAt: c.created_at,
    }),
  );

  useEffect(() => {
    if (swrTournamentEvents && swrTournamentEvents.length > 0) {
      setTournamentEvents(swrTournamentEvents.map(mapDbEventToTournamentEvent));
    } else if (tournamentEvents.length > 0) {
      // Only clear if we actually had events before (avoids unnecessary renders)
      setTournamentEvents([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swrTournamentEvents]);

  useEffect(() => {
    // Only update if the schedules actually differ
    if (swrAllSchedules && swrAllSchedules.length > 0) {
      setAllSchedules(swrAllSchedules);
    } else if (allSchedules.length > 0) {
      setAllSchedules([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swrAllSchedules]);

  // Local state for non-cached data
  const [weekScheduleInfo, setWeekScheduleInfo] =
    useState<WeekScheduleInfo | null>(null);
  const [currentScheduleId, setCurrentScheduleId] = useState<string | null>(
    null,
  );
  const [isWeekExpired, setIsWeekExpired] = useState(false);
  const [flyerState, setFlyerState] = useState<
    Record<string, (GalleryImage | "loading")[]>
  >({});
  // Daily flyer state: { DAY: { PERIOD: [flyers] } }
  // Loaded from database via getDailyFlyers() when schedule is selected/auto-loaded
  const [dailyFlyerState, setDailyFlyerState] = useState<
    Record<string, Record<TimePeriod, (GalleryImage | "loading")[]>>
  >({});

  // Selected flyer ID per day/period: { DAY: { PERIOD: flyerId } }
  // Used to track which flyer is selected when multiple are generated
  const [selectedDailyFlyerIds, setSelectedDailyFlyerIds] = useState<
    Record<string, Record<TimePeriod, string | null>>
  >({});

  const [theme, setTheme] = useState<Theme>("dark");
  const [selectedStyleReference, setSelectedStyleReference] =
    useState<StyleReference | null>(null);
  const [publishingStates, setPublishingStates] = useState<
    Record<string, InstagramPublishState>
  >({});

  useEffect(() => {
    const previous = initScopeRef.current;
    const nextScope = { userId, orgId: organizationId };
    if (previous.userId !== userId || previous.orgId !== organizationId) {
      hasInitializedRef.current = false;
      initScopeRef.current = nextScope;
    }
  }, [userId, organizationId]);

  // === OPTIMIZED: Use initialData from unified endpoint ===
  // Clear brandProfile when switching contexts (user/organization)
  useEffect(() => {
    console.debug("[App] Context changed, clearing brandProfile");
    setBrandProfile(undefined);
  }, [userId, organizationId]);

  // Brand profile is now loaded via useInitialData (single request for ALL data)
  // Update contextRef ONLY when data is loaded for the new context
  useEffect(() => {
    if (initialData) {
      console.debug("[App] InitialData loaded, updating contextRef and marking as loaded");
      // Mark that initialData has loaded at least once
      hasInitialDataLoadedOnce.current = true;
      // Data loaded for current context - update ref to mark context as stable
      contextRef.current = { userId, organizationId };

      // Set brand profile if it exists
      if (initialData.brandProfile && !brandProfile) {
        console.debug("[App] Setting brandProfile from initialData");
        const dbBrandProfile = initialData.brandProfile;
        setBrandProfile({
          name: dbBrandProfile.name,
          description: dbBrandProfile.description || "",
          logo: dbBrandProfile.logo_url || null,
          primaryColor: dbBrandProfile.primary_color,
          secondaryColor: dbBrandProfile.secondary_color,
          tertiaryColor: dbBrandProfile.tertiary_color || "",
          toneOfVoice:
            dbBrandProfile.tone_of_voice as BrandProfile["toneOfVoice"],
          toneTargets:
            (dbBrandProfile.settings
              ?.toneTargets as BrandProfile["toneTargets"]) || undefined,
          creativeModel:
            (dbBrandProfile.settings
              ?.creativeModel as BrandProfile["creativeModel"]) || undefined,
        });
      }
    }
  }, [initialData, brandProfile, userId, organizationId]);

  // Load style references from gallery images with is_style_reference=true
  // This replaces the old localStorage-based approach for organization-wide sharing
  const styleReferences = React.useMemo(() => {
    return (swrGalleryImages || [])
      .filter((img) => img.is_style_reference)
      .map((img) => ({
        id: img.id,
        src: img.src_url,
        name: img.style_reference_name || img.prompt || 'Favorito sem nome',
        createdAt: new Date(img.created_at).getTime(),
      }));
  }, [swrGalleryImages]);

  // Track if we've already restored from database to avoid re-running
  const hasRestoredDailyFlyersRef = useRef(false);
  const lastLoadedScheduleIdRef = useRef<string | null>(null);
  const lastLoadedOrgIdRef = useRef<string | null | undefined>(undefined);

  // Load daily flyers from database (gallery_images with week_schedule_id)
  // Uses currentScheduleId which is set by handleSelectSchedule or auto-load
  useEffect(() => {
    console.log('🔄 [DailyFlyers] useEffect triggered:', {
      userId: !!userId,
      currentScheduleId,
      organizationId,
      hasRestored: hasRestoredDailyFlyersRef.current,
      lastLoadedScheduleId: lastLoadedScheduleIdRef.current,
    });

    if (!userId || !currentScheduleId) {
      console.log('⏭️ [DailyFlyers] Skipping: missing userId or currentScheduleId');
      return;
    }

    // Only load once per schedule + organization combination
    // Re-load if organization changed (e.g., from null to a value after org loads)
    const orgChanged = lastLoadedOrgIdRef.current !== undefined && lastLoadedOrgIdRef.current !== organizationId;
    if (
      lastLoadedScheduleIdRef.current === currentScheduleId &&
      hasRestoredDailyFlyersRef.current &&
      !orgChanged
    ) {
      console.log('⏭️ [DailyFlyers] Skipping: already loaded for this schedule+org');
      return;
    }

    // If org changed, reset the restored flag to force reload
    if (orgChanged) {
      console.log('🔄 [DailyFlyers] Organization changed, forcing reload');
      hasRestoredDailyFlyersRef.current = false;
    }

    const loadDailyFlyers = async () => {
      try {
        console.log('📥 [DailyFlyers] Loading from database:', {
          currentScheduleId,
          userId,
          organizationId,
        });
        const result = await getDailyFlyers(userId, currentScheduleId, organizationId);
        console.log('📦 [DailyFlyers] Result:', {
          imagesCount: result.images?.length || 0,
          structuredKeys: Object.keys(result.structured || {}),
        });

        if (!result.structured || Object.keys(result.structured).length === 0) {
          console.log('⚠️ [DailyFlyers] No flyers found in database');
          hasRestoredDailyFlyersRef.current = true;
          lastLoadedScheduleIdRef.current = currentScheduleId;
          lastLoadedOrgIdRef.current = organizationId;
          return;
        }

        // Convert database images to GalleryImage format
        const restoredState: Record<string, Record<TimePeriod, GalleryImage[]>> = {};

        Object.entries(result.structured).forEach(([day, periods]) => {
          if (!restoredState[day]) {
            restoredState[day] = {
              ALL: [],
              MORNING: [],
              AFTERNOON: [],
              NIGHT: [],
              HIGHLIGHTS: [],
            };
          }

          Object.entries(periods).forEach(([period, dbImages]) => {
            const galleryImagesForPeriod: GalleryImage[] = dbImages.map((dbImg) => ({
              id: dbImg.id,
              src: dbImg.src_url,
              prompt: dbImg.prompt || undefined,
              source: dbImg.source,
              model: dbImg.model as GalleryImage['model'],
              aspectRatio: dbImg.aspect_ratio || undefined,
              imageSize: dbImg.image_size as GalleryImage['imageSize'] | undefined,
              week_schedule_id: dbImg.week_schedule_id || undefined,
              daily_flyer_day: dbImg.daily_flyer_day || undefined,
              daily_flyer_period: dbImg.daily_flyer_period || undefined,
              created_at: dbImg.created_at,
            }));

            if (galleryImagesForPeriod.length > 0) {
              restoredState[day][period as TimePeriod] = galleryImagesForPeriod;
            }
          });
        });

        if (Object.keys(restoredState).length > 0) {
          // IMPORTANT: Merge with existing state to preserve any flyers generated during this session
          // that haven't been saved to the database yet
          setDailyFlyerState((prev) => {
            const merged = { ...prev };
            Object.entries(restoredState).forEach(([day, periods]) => {
              if (!merged[day]) {
                merged[day] = periods;
              } else {
                // Merge periods, keeping existing flyers and adding new ones from DB
                Object.entries(periods).forEach(([period, dbImages]) => {
                  const existingImages = merged[day][period as TimePeriod] || [];
                  // Only add images from DB that aren't already in state (by ID)
                  const existingIds = new Set(
                    existingImages
                      .filter((img): img is GalleryImage => img !== "loading")
                      .map((img) => img.id)
                  );
                  const newFromDb = dbImages.filter((img) => !existingIds.has(img.id));
                  merged[day][period as TimePeriod] = [...existingImages, ...newFromDb];
                });
              }
            });
            return merged;
          });
          console.log('✅ [DailyFlyers] Merged state from database:', Object.keys(restoredState));
        }

        hasRestoredDailyFlyersRef.current = true;
        lastLoadedScheduleIdRef.current = currentScheduleId;
        lastLoadedOrgIdRef.current = organizationId;
      } catch (err) {
        console.error('[App] Failed to load daily flyers from database:', err);
      }
    };

    loadDailyFlyers();
  }, [userId, currentScheduleId, organizationId]);

  // Reset restoration flag when schedule changes
  // Note: handleSelectSchedule also clears state, this handles edge cases
  useEffect(() => {
    // Only clear state when actually switching to a DIFFERENT schedule
    // Don't clear on initial load (when lastLoadedScheduleIdRef.current is null)
    if (
      currentScheduleId &&
      lastLoadedScheduleIdRef.current &&
      currentScheduleId !== lastLoadedScheduleIdRef.current
    ) {
      console.debug('[App] Schedule changed, clearing daily flyer state');
      hasRestoredDailyFlyersRef.current = false;
      setDailyFlyerState({});
    }
  }, [currentScheduleId]);

  // Process tournament schedule info when SWR data loads
  useEffect(() => {
    if (swrTournamentSchedule) {
      const schedule = swrTournamentSchedule;
      setCurrentScheduleId(schedule.id);

      // Check if week is expired
      const endDate = parseDateOnly(schedule.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      setIsWeekExpired(today > endDate);

      // Set week schedule info (handle ISO datetime strings)
      const startDate = parseDateOnly(schedule.start_date);
      const endDateInfo = parseDateOnly(schedule.end_date);
      setWeekScheduleInfo({
        id: schedule.id,
        startDate: `${String(startDate.getDate()).padStart(2, "0")}/${String(startDate.getMonth() + 1).padStart(2, "0")}`,
        endDate: `${String(endDateInfo.getDate()).padStart(2, "0")}/${String(endDateInfo.getMonth() + 1).padStart(2, "0")}`,
        filename: schedule.filename || "Planilha carregada",
        daily_flyer_urls: schedule.daily_flyer_urls,
      });
    }
  }, [swrTournamentSchedule]);

  // Track if chat has been initialized (prevents infinite loop)
  const chatInitializedRef = useRef(false);

  useEffect(() => {
    if (brandProfile && !chatInitializedRef.current && chatHistory.length === 0) {
      chatInitializedRef.current = true;
      setChatHistory([
        {
          role: "model",
          parts: [
            {
              text: `Olá Diretor! Sou o seu Agente Criativo de Elite. O que vamos forjar hoje?`,
            },
          ],
        },
      ]);
    }
  }, [brandProfile, chatHistory.length]);

  const handleAddImageToGallery = useCallback((
    image: Omit<GalleryImage, "id">,
  ): GalleryImage => {
    // Create image with temporary ID immediately for UI responsiveness
    const tempId = `temp-${Date.now()}`;
    const newImage: GalleryImage = { ...image, id: tempId };

    // Save to database in background (don't block UI)
    if (userId) {
      swrAddGalleryImage({
        id: tempId,
        user_id: userId,
        src_url: image.src,
        prompt: image.prompt || null,
        source: image.source,
        model: image.model,
        aspect_ratio: null,
        image_size: null,
        created_at: new Date().toISOString(),
        // Include linking fields for immediate filtering support
        post_id: image.post_id || null,
        ad_creative_id: image.ad_creative_id || null,
        video_script_id: image.video_script_id || null,
        media_type: image.mediaType || null,
        duration: image.duration || null,
        // Daily flyer fields
        week_schedule_id: image.week_schedule_id || null,
        daily_flyer_day: image.daily_flyer_day || null,
        daily_flyer_period: image.daily_flyer_period || null,
      });

      (async () => {
        try {
          const srcUrl = image.src.startsWith("data:")
            ? await uploadDataUrlToBlob(image.src)
            : image.src;
          const dbImage = await createGalleryImage(userId, {
            src_url: srcUrl,
            prompt: image.prompt,
            source: image.source,
            model: image.model,
            post_id: image.post_id,
            ad_creative_id: image.ad_creative_id,
            video_script_id: image.video_script_id,
            organization_id: organizationId,
            media_type: image.mediaType,
            duration: image.duration,
            // Daily flyer fields
            week_schedule_id: image.week_schedule_id,
            daily_flyer_day: image.daily_flyer_day,
            daily_flyer_period: image.daily_flyer_period,
          });
          // Replace temp image with the real database image
          swrRemoveGalleryImage(tempId);
          swrAddGalleryImage(dbImage);
          if (toolImageReference?.id === tempId) {
            setToolImageReference({ id: dbImage.id, src: dbImage.src_url });
          }
        } catch (e) {
          console.error("Failed to save image to database:", e);
        }
      })();
    }

    return newImage;
  }, [
    organizationId,
    setToolImageReference,
    swrAddGalleryImage,
    swrRemoveGalleryImage,
    toolImageReference?.id,
    userId,
  ]);

  const handleUpdateGalleryImage = useCallback((imageId: string, newImageSrc: string) => {
    console.log('🗃️ [App] handleUpdateGalleryImage called:', {
      imageId,
      newSrc: newImageSrc.substring(0, 50),
    });

    // Update SWR cache immediately (optimistic update)
    swrUpdateGalleryImage(imageId, { src_url: newImageSrc });
    console.log('🗃️ [App] SWR cache updated');

    if (toolImageReference?.id === imageId) {
      setToolImageReference({ id: imageId, src: newImageSrc });
      console.log('🗃️ [App] toolImageReference updated');
    }

    // Skip temp images, synthetic IDs (like thumbnail-xxx), and other non-database IDs
    if (imageId.startsWith("temp-") || imageId.startsWith("thumbnail-") || imageId.includes("-cover")) {
      console.log('🗃️ [App] Skipping synthetic/temp image ID:', imageId);
      return;
    }

    // Upload to Blob and update database in background
    (async () => {
      try {
        const srcUrl = newImageSrc.startsWith("data:")
          ? await uploadDataUrlToBlob(newImageSrc)
          : newImageSrc;

        console.log('🗃️ [App] Updating database with:', {
          imageId,
          srcUrl: srcUrl.substring(0, 50),
        });

        await updateGalleryImage(imageId, { src_url: srcUrl });
        console.log('🗃️ [App] Database updated successfully');

        // Update cache with final Blob URL
        if (srcUrl !== newImageSrc) {
          swrUpdateGalleryImage(imageId, { src_url: srcUrl });
          if (toolImageReference?.id === imageId)
            setToolImageReference({ id: imageId, src: srcUrl });
          console.log('🗃️ [App] Cache updated with blob URL');
        }
      } catch (e) {
        console.error("🗃️ [App] Failed to update image in database:", e);
      }
    })();
  }, [
    setToolImageReference,
    swrUpdateGalleryImage,
    toolImageReference?.id,
  ]);

  const handleDeleteGalleryImage = async (imageId: string) => {
    // Remove from SWR cache immediately (optimistic update)
    swrRemoveGalleryImage(imageId);

    if (imageId.startsWith("temp-")) return;

    // Also remove from database
    try {
      await deleteGalleryImage(imageId);
    } catch (e) {
      console.error("Failed to delete image from database:", e);
    }
  };

  const handleMarkGalleryImagePublished = (imageId: string) => {
    // Update SWR cache to mark image as published
    swrUpdateGalleryImage(imageId, {
      published_at: new Date().toISOString(),
    } as Partial<GalleryImage>);
  };

  const handleAddStyleReference = async (
    ref: Omit<StyleReference, "id" | "createdAt">,
  ) => {
    console.info("[App] handleAddStyleReference called", ref);

    // Find the gallery image by src
    const galleryImage = swrGalleryImages?.find((img) => img.src_url === ref.src);

    if (!galleryImage) {
      console.error("[App] Could not find gallery image with src:", ref.src);
      return;
    }

    try {
      // Update image to mark as style reference
      await updateGalleryImage(galleryImage.id, {
        is_style_reference: true,
        style_reference_name: ref.name,
      });

      // Update local SWR cache
      swrUpdateGalleryImage(galleryImage.id, {
        is_style_reference: true,
        style_reference_name: ref.name,
      });

      console.info("[App] Successfully added to favorites:", galleryImage.id);
    } catch (error) {
      console.error("[App] Failed to add style reference:", error);
    }
  };

  const handleRemoveStyleReference = async (id: string) => {
    console.info("[App] handleRemoveStyleReference called", id);

    try {
      // Update image to unmark as style reference
      await updateGalleryImage(id, {
        is_style_reference: false,
        style_reference_name: null,
      });

      // Update local SWR cache
      swrUpdateGalleryImage(id, {
        is_style_reference: false,
        style_reference_name: null,
      });

      console.info("[App] Successfully removed from favorites:", id);

      if (selectedStyleReference?.id === id) setSelectedStyleReference(null);
    } catch (error) {
      console.error("[App] Failed to remove style reference:", error);
    }
  };

  const handleSelectStyleReference = (ref: StyleReference) => {
    setSelectedStyleReference(ref);
    setActiveView("flyer");
  };

  // Scheduled Posts Handlers
  const handleSchedulePost = async (
    post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">,
  ) => {
    if (!userId) {
      console.error("Cannot schedule post without userId");
      return;
    }

    // Validate required fields before attempting to create
    if (!post.imageUrl || !post.scheduledDate || !post.scheduledTime || !post.platforms) {
      console.error("Cannot schedule post: missing required fields", {
        hasImageUrl: !!post.imageUrl,
        hasScheduledDate: !!post.scheduledDate,
        hasScheduledTime: !!post.scheduledTime,
        hasPlatforms: !!post.platforms,
      });
      alert("Erro ao agendar: campos obrigatórios ausentes. Por favor, tente novamente.");
      return;
    }

    // Check if this is "publish now" (scheduled within 1 minute of now)
    const isPublishNow = post.scheduledTimestamp <= Date.now() + 60000;

    try {
      // 1. Create post in database
      const instagramContext = getInstagramContext();
      const payload = {
        content_type: post.type,
        content_id: post.contentId,
        image_url: post.imageUrl,
        carousel_image_urls: post.carouselImageUrls,
        caption: post.caption,
        hashtags: post.hashtags,
        scheduled_date: post.scheduledDate,
        scheduled_time: post.scheduledTime,
        scheduled_timestamp: new Date(post.scheduledTimestamp).toISOString(),
        timezone: post.timezone,
        platforms: post.platforms,
        instagram_content_type: post.instagramContentType,
        instagram_account_id: instagramContext?.instagramAccountId,
        created_from: post.createdFrom,
        organization_id: organizationId,
      };
      console.debug(
        "[Schedule] Sending payload:",
        payload,
        isPublishNow ? "(PUBLISH NOW)" : "",
      );
      const dbPost = await createScheduledPost(userId, payload);

      // Add to SWR cache (optimistic update)
      swrAddScheduledPost(dbPost);

      const newPost: ScheduledPost = {
        id: dbPost.id,
        type: dbPost.content_type as ScheduledPost["type"],
        contentId: dbPost.content_id || "",
        imageUrl: dbPost.image_url,
        // Use original post data as fallback if DB doesn't return array
        carouselImageUrls: dbPost.carousel_image_urls || post.carouselImageUrls,
        caption: dbPost.caption,
        hashtags: dbPost.hashtags || [],
        scheduledDate: dbPost.scheduled_date,
        scheduledTime: dbPost.scheduled_time,
        scheduledTimestamp: new Date(dbPost.scheduled_timestamp).getTime(),
        timezone: dbPost.timezone,
        platforms: dbPost.platforms as ScheduledPost["platforms"],
        instagramContentType:
          dbPost.instagram_content_type as ScheduledPost["instagramContentType"],
        status: dbPost.status as ScheduledPost["status"],
        createdAt: new Date(dbPost.created_at).getTime(),
        updatedAt: Date.now(),
        createdFrom: (dbPost.created_from ||
          "gallery") as ScheduledPost["createdFrom"],
      };

      // 2. If "Publish Now", immediately publish to Instagram
      if (
        isPublishNow &&
        (post.platforms === "instagram" || post.platforms === "both")
      ) {
        console.debug("[Schedule] Publishing immediately...");
        // Use setTimeout to ensure state is updated before publishing
        setTimeout(() => {
          handlePublishToInstagram(newPost);
        }, 100);
      } else {
        // Post is saved and scheduled - will need manual publish when time comes
        console.debug(
          `[Schedule] Post ${dbPost.id} scheduled for ${new Date(post.scheduledTimestamp).toISOString()}`,
        );
      }
    } catch (e) {
      console.error("Failed to schedule post:", e);
    }
  };

  const handleUpdateScheduledPost = async (
    postId: string,
    updates: Partial<ScheduledPost>,
  ) => {
    try {
      // Map frontend field names to database field names
      const dbUpdates: Record<string, unknown> = {};
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.publishedAt !== undefined)
        dbUpdates.published_at = new Date(updates.publishedAt).toISOString();
      if (updates.errorMessage !== undefined)
        dbUpdates.error_message = updates.errorMessage;
      if (updates.instagramMediaId !== undefined)
        dbUpdates.instagram_media_id = updates.instagramMediaId;
      if (updates.publishAttempts !== undefined)
        dbUpdates.publish_attempts = updates.publishAttempts;
      if (updates.lastPublishAttempt !== undefined)
        dbUpdates.last_publish_attempt = new Date(
          updates.lastPublishAttempt,
        ).toISOString();
      if (updates.scheduledDate !== undefined)
        dbUpdates.scheduled_date = updates.scheduledDate;
      if (updates.scheduledTime !== undefined)
        dbUpdates.scheduled_time = updates.scheduledTime;

      // If date or time changed, recalculate the timestamp
      if (
        updates.scheduledDate !== undefined ||
        updates.scheduledTime !== undefined
      ) {
        // Find current post to get existing date/time if one is missing
        const currentPost = swrScheduledPosts?.find((p) => p.id === postId);
        const newDate = updates.scheduledDate ?? currentPost?.scheduled_date;
        const newTime = updates.scheduledTime ?? currentPost?.scheduled_time;
        if (newDate && newTime) {
          const timestamp = new Date(`${newDate}T${newTime}:00`);
          dbUpdates.scheduled_timestamp = timestamp.toISOString();
        }
      }

      await updateScheduledPostApi(postId, dbUpdates);
      // Update SWR cache
      swrUpdateScheduledPost(postId, dbUpdates);
    } catch (e) {
      console.error("Failed to update scheduled post:", e);
    }
  };

  const handleDeleteScheduledPost = async (postId: string) => {
    try {
      // Remove from SWR cache immediately (optimistic update)
      swrRemoveScheduledPost(postId);
      await deleteScheduledPostApi(postId);
    } catch (e) {
      console.error("Failed to delete scheduled post:", e);
    }
  };

  const handlePublishToInstagram = async (post: ScheduledPost) => {
    const postId = post.id;

    // Initialize publishing state
    setPublishingStates((prev) => ({
      ...prev,
      [postId]: {
        step: "uploading_image",
        message: "Preparando imagem...",
        progress: 10,
      },
    }));

    try {
      // Update post status to publishing
      await handleUpdateScheduledPost(postId, { status: "publishing" });

      // Step 1: Upload image to get HTTP URL (Instagram requires HTTP URLs, not data URLs)
      setPublishingStates((prev) => ({
        ...prev,
        [postId]: {
          step: "uploading_image",
          message: "Fazendo upload da imagem...",
          progress: 15,
        },
      }));

      const imageUrl = await uploadImageForInstagram(post.imageUrl);

      // Step 2: Prepare caption with hashtags
      const fullCaption = `${post.caption}\n\n${post.hashtags.join(" ")}`;

      // Step 3: Determine content type (default to photo)
      const contentType: InstagramContentType =
        post.instagramContentType || "photo";

      // Step 4: Publish to Instagram with progress tracking
      const instagramContext = getInstagramContext();
      if (!instagramContext) {
        throw new Error(
          "Conecte sua conta Instagram em Configurações → Integrações para publicar.",
        );
      }

      const result = await publishToInstagram(
        imageUrl,
        fullCaption,
        contentType,
        (progress) => {
          setPublishingStates((prev) => ({
            ...prev,
            [postId]: progress,
          }));
        },
        instagramContext,
        post.carouselImageUrls,
      );

      if (result.success) {
        await handleUpdateScheduledPost(postId, {
          status: "published",
          publishedAt: Date.now(),
          instagramMediaId: result.mediaId,
        });

        setPublishingStates((prev) => ({
          ...prev,
          [postId]: {
            step: "completed",
            message: "Publicado!",
            progress: 100,
            postId: result.mediaId,
          },
        }));

        // Clear state after 3 seconds
        setTimeout(() => {
          setPublishingStates((prev) => {
            const { [postId]: _, ...rest } = prev;
            return rest;
          });
        }, 3000);
      } else {
        throw new Error(result.errorMessage || "Falha na publicacao");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";

      await handleUpdateScheduledPost(postId, {
        status: "failed",
        errorMessage,
        publishAttempts: (post.publishAttempts || 0) + 1,
        lastPublishAttempt: Date.now(),
      });

      setPublishingStates((prev) => ({
        ...prev,
        [postId]: { step: "failed", message: errorMessage, progress: 0 },
      }));
    }
  };

  const handleGenerateCampaign = async (
    input: ContentInput,
    options: GenerationOptions,
  ) => {
    setIsGenerating(true);
    setError(null);
    setActiveView("campaign");
    // Store product images for use in PostsTab and AdCreativesTab
    console.debug("[App] Storing productImages:", input.productImages ? `${input.productImages.length} image(s)` : "null");
    setCampaignProductImages(input.productImages);
    // Store composition assets for use in image generation
    console.debug("[App] Storing compositionAssets:", input.compositionAssets ? `${input.compositionAssets.length} asset(s)` : "null");
    setCampaignCompositionAssets(input.compositionAssets || null);
    try {
      const r = await generateCampaign(brandProfile!, input, options);
      const toneUsed = input.toneOfVoiceOverride || brandProfile!.toneOfVoice;
      r.toneOfVoiceUsed = toneUsed;

      // Save campaign to database if authenticated
      if (userId) {
        try {
          // Generate a name from the transcript (first 50 chars)
          const campaignName = input.transcript
            ? input.transcript.substring(0, 50) +
            (input.transcript.length > 50 ? "..." : "")
            : `Campanha ${new Date().toLocaleDateString("pt-BR")}`;

          const savedCampaign = await createCampaignApi(userId, {
            name: campaignName,
            input_transcript: input.transcript,
            generation_options: {
              ...options,
              toneOfVoiceOverride: input.toneOfVoiceOverride || null,
              toneOfVoiceUsed: input.toneOfVoiceOverride || brandProfile!.toneOfVoice,
            } as unknown as Record<string, unknown>,
            status: "completed",
            organization_id: organizationId,
            video_clip_scripts: (r.videoClipScripts || []).map((v) => ({
              title: v.title,
              hook: v.hook,
              image_prompt: v.image_prompt,
              audio_script: v.audio_script,
              scenes: v.scenes,
            })),
            posts: (r.posts || []).map((p) => ({
              platform: normalizeSocialPlatform(p.platform),
              content: p.content,
              hashtags: p.hashtags,
              image_prompt: p.image_prompt,
            })),
            ad_creatives: (r.adCreatives || []).map((a) => ({
              platform: normalizeAdPlatform(a.platform),
              headline: a.headline,
              body: a.body,
              cta: a.cta,
              image_prompt: a.image_prompt,
            })),
            carousel_scripts: (r.carousels || [])
              .filter((c) => c && c.title && c.hook && c.cover_prompt) // Filter out invalid carousels
              .map((c) => ({
                title: c.title,
                hook: c.hook,
                cover_prompt: c.cover_prompt,
                caption: c.caption ?? undefined,
                slides: c.slides || [],
              })),
          });

          // Update campaign with database IDs (including clip/post/ad IDs for image linking)
          r.id = savedCampaign.id;
          r.name = campaignName;
          r.inputTranscript = input.transcript;
          r.createdAt = savedCampaign.created_at;

          // Map database IDs to local state for video_script_id linking
          if (
            savedCampaign.video_clip_scripts &&
            savedCampaign.video_clip_scripts.length > 0 &&
            r.videoClipScripts
          ) {
            r.videoClipScripts = r.videoClipScripts.map((clip, index) => ({
              ...clip,
              id: savedCampaign.video_clip_scripts[index]?.id,
            }));
          }
          if (savedCampaign.posts && savedCampaign.posts.length > 0 && r.posts) {
            r.posts = r.posts.map((post, index) => ({
              ...post,
              id: savedCampaign.posts[index]?.id,
            }));
          }
          if (
            savedCampaign.ad_creatives &&
            savedCampaign.ad_creatives.length > 0 &&
            r.adCreatives
          ) {
            r.adCreatives = r.adCreatives.map((ad, index) => ({
              ...ad,
              id: savedCampaign.ad_creatives[index]?.id,
            }));
          }
          if (
            savedCampaign.carousel_scripts &&
            savedCampaign.carousel_scripts.length > 0 &&
            r.carousels
          ) {
            r.carousels = r.carousels.map((carousel, index) => ({
              ...carousel,
              id: savedCampaign.carousel_scripts[index]?.id,
            }));
          }

          // Update SWR cache for campaigns list
          swrAddCampaign(savedCampaign);

          console.debug(
            "[Campaign] Saved to database with IDs:",
            savedCampaign.id,
            "clips:",
            (r.videoClipScripts || []).map((c) => c.id),
            "posts:",
            (r.posts || []).map((p) => p.id),
            "ads:",
            (r.adCreatives || []).map((a) => a.id),
          );

          // Persist productImages to localStorage for this campaign
          if (input.productImages && input.productImages.length > 0) {
            saveProductImagesToStorage(savedCampaign.id, input.productImages);
          }
        } catch (saveError) {
          console.error("[Campaign] Failed to save to database:", saveError);
          // Continue even if save fails - campaign is still in memory
        }
      }

      setCampaign(r);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLoadCampaign = async (campaignId: string) => {
    if (!userId) {
      console.error("Cannot load campaign: user not authenticated");
      return;
    }
    try {
      console.debug("[Campaign] Loading campaign:", campaignId);
      const fullCampaign = await getCampaignById(
        campaignId,
        userId,
        organizationId,
      );
      console.debug("[Campaign] API response:", fullCampaign);

        if (fullCampaign) {
        const toneOverride = (fullCampaign.generation_options as { toneOfVoiceOverride?: string } | null)
          ?.toneOfVoiceOverride;
        const toneOfVoiceUsed =
          typeof toneOverride === "string" ? toneOverride : brandProfile?.toneOfVoice;

        const loadedCampaign: MarketingCampaign = {
          id: fullCampaign.id,
          name: fullCampaign.name || undefined,
          inputTranscript: fullCampaign.input_transcript || undefined,
          createdAt: fullCampaign.created_at,
          updatedAt: fullCampaign.updated_at,
          videoClipScripts: (fullCampaign.video_clip_scripts || []).map(
            (v) => ({
              id: v.id, // Include database ID for gallery image linking
              title: v.title,
              hook: v.hook,
              image_prompt: v.image_prompt || "",
              audio_script: v.audio_script || "",
              scenes: v.scenes || [],
              thumbnail_url: v.thumbnail_url || null, // Include saved thumbnail URL
            }),
          ),
          posts: (fullCampaign.posts || []).map((p) => ({
            id: p.id, // Include database ID for image updates
            platform: p.platform as
              | "Instagram"
              | "LinkedIn"
              | "Twitter"
              | "Facebook",
            content: p.content,
            hashtags: p.hashtags || [],
            image_prompt: p.image_prompt || "",
            image_url: p.image_url || null, // Include saved image URL
          })),
          adCreatives: (fullCampaign.ad_creatives || []).map((a) => ({
            id: a.id, // Include database ID for image updates
            platform: a.platform as "Facebook" | "Google",
            headline: a.headline,
            body: a.body,
            cta: a.cta,
            image_prompt: a.image_prompt || "",
            image_url: a.image_url || null, // Include saved image URL
          })),
          carousels: (fullCampaign.carousel_scripts || []).map((c) => ({
            id: c.id,
            title: c.title,
            hook: c.hook,
            cover_prompt: c.cover_prompt || "",
            cover_url: c.cover_url ?? undefined,
            caption: c.caption || "",
            slides: c.slides || [],
          })),
          toneOfVoiceUsed: toneOfVoiceUsed as MarketingCampaign["toneOfVoiceUsed"],
        };
        console.debug(
          "[Campaign] Loaded:",
          loadedCampaign.videoClipScripts.length,
          "clips,",
          loadedCampaign.posts.length,
          "posts,",
          loadedCampaign.adCreatives.length,
          "ads,",
          loadedCampaign.carousels.length,
          "carousels",
        );
        setCampaign(loadedCampaign);
        setActiveView("campaign");

        // Restore productImages from localStorage for this campaign
        const storedProductImages = loadProductImagesFromStorage(campaignId);
        setCampaignProductImages(storedProductImages);
      } else {
        console.error("[Campaign] API returned null for campaign:", campaignId);
        setError("Campanha não encontrada");
      }
    } catch (error: unknown) {
      console.error("Failed to load campaign:", error);
      setError("Falha ao carregar campanha");
    }
  };

  const handlePublishFlyerToCampaign = (text: string, flyer: GalleryImage) => {
    const input: ContentInput = {
      transcript: text,
      productImages: [
        {
          base64: flyer.src.split(",")[1],
          mimeType: flyer.src.match(/:(.*?);/)?.[1] || "image/png",
        },
      ],
      inspirationImages: null,
    };
    const options: GenerationOptions = {
      videoClipScripts: { generate: true, count: 1 },
      posts: {
        instagram: { generate: true, count: 1 },
        facebook: { generate: true, count: 1 },
        twitter: { generate: true, count: 1 },
        linkedin: { generate: false, count: 0 },
      },
      adCreatives: {
        facebook: { generate: true, count: 1 },
        google: { generate: false, count: 0 },
      },
    };
    setCampaign(null);
    handleGenerateCampaign(input, options);
  };

  const handleSelectSchedule = async (schedule: WeekScheduleWithCount) => {
    if (!userId) return;

    // Only clear state if actually SWITCHING to a different schedule
    // Don't clear if reloading the same schedule (e.g., on remount)
    const isSwitchingSchedule = currentScheduleId && currentScheduleId !== schedule.id;

    try {
      // Load events for selected schedule
      const eventsData = await getScheduleEvents(
        userId,
        schedule.id,
        organizationId,
      );
      const mappedEvents: TournamentEvent[] = eventsData.events.map(
        mapDbEventToTournamentEvent,
      );
      setTournamentEvents(mappedEvents);

      // Only clear daily flyer state when SWITCHING schedules (not on initial load or reload)
      if (isSwitchingSchedule) {
        console.log('🔄 [handleSelectSchedule] Switching schedules, clearing flyer state');
        setDailyFlyerState({});
        hasRestoredDailyFlyersRef.current = false;

        // Clear schedule-specific localStorage items for a fresh start
        localStorage.removeItem("dailyFlyerMapping");
        localStorage.removeItem("flyer_selectedDay");
      }

      setCurrentScheduleId(schedule.id);

      // Check if this schedule is expired
      const endDate = parseDateOnly(schedule.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      setIsWeekExpired(today > endDate);

      // Set week schedule info (handle ISO datetime strings)
      const startDate = parseDateOnly(schedule.start_date);
      const endDateInfo = parseDateOnly(schedule.end_date);
      setWeekScheduleInfo({
        id: schedule.id,
        startDate: `${String(startDate.getDate()).padStart(2, "0")}/${String(startDate.getMonth() + 1).padStart(2, "0")}`,
        endDate: `${String(endDateInfo.getDate()).padStart(2, "0")}/${String(endDateInfo.getMonth() + 1).padStart(2, "0")}`,
        filename: schedule.filename || "Planilha carregada",
        daily_flyer_urls: schedule.daily_flyer_urls,
      });

      console.debug(
        `[Tournaments] Selected schedule ${schedule.id} with ${mappedEvents.length} events`,
      );
    } catch (error: unknown) {
      console.error("[Tournaments] Failed to load schedule events:", error);
    }
  };

  // Auto-load the most recent schedule when page loads
  // This ensures daily flyers are shown after refresh/login
  const hasAutoLoadedScheduleRef = useRef(false);
  useEffect(() => {
    // Only auto-load once per session, when we have schedules but no current selection
    if (
      !hasAutoLoadedScheduleRef.current &&
      swrAllSchedules &&
      swrAllSchedules.length > 0 &&
      !currentScheduleId &&
      userId
    ) {
      hasAutoLoadedScheduleRef.current = true;
      console.log('🔄 [AutoLoad] Loading most recent schedule:', swrAllSchedules[0].id);
      // Load the most recent schedule (first in list, sorted by created_at DESC)
      handleSelectSchedule(swrAllSchedules[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swrAllSchedules, currentScheduleId, userId]);

  const executeTool = useCallback(async (
    toolCall: { name: string; args: Record<string, unknown> },
  ): Promise<
    | { success: true; image_data: string; message: string }
    | { error: string }
  > => {
    const { name, args } = toolCall;
    if (name === "create_image") {
      try {
        const productImages = lastUploadedImage
          ? [
            {
              base64: lastUploadedImage.src.split(",")[1],
              mimeType:
                lastUploadedImage.src.match(/:(.*?);/)?.[1] || "image/png",
            },
          ]
          : undefined;
        const imageUrl = await generateImage(
          args.description as string,
          brandProfile!,
          {
            aspectRatio: (args.aspect_ratio as string) || "1:1",
            model: "gemini-3-pro-image-preview",
            productImages,
          },
        );
        const newImg = handleAddImageToGallery({
          src: imageUrl,
          prompt: args.description as string,
          source: "Edição",
          model: "gemini-3-pro-image-preview",
        });
        setToolImageReference({ id: newImg.id, src: newImg.src });
        return {
          success: true,
          image_data: imageUrl,
          message: "Asset visual forjado com sucesso.",
        };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
    if (name === "edit_referenced_image") {
      if (!toolImageReference) return { error: "Nenhuma imagem em foco." };
      try {
        const [h, b64] = toolImageReference.src.split(",");
        const m = h.match(/:(.*?);/)?.[1] || "image/png";
        const newUrl = await editImage(b64, m, args.prompt as string);
        handleUpdateGalleryImage(toolImageReference.id, newUrl);
        return {
          success: true,
          image_data: newUrl,
          message: "Ajuste aplicado.",
        };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
    if (name === "add_collab_logo_to_image") {
      if (!toolImageReference)
        return {
          error: "Nenhuma imagem de arte em foco para adicionar o logo.",
        };
      if (!lastUploadedImage)
        return {
          error:
            "Nenhum logo foi enviado no chat. Peça ao usuário para anexar o logo.",
        };
      try {
        const [h, b64] = toolImageReference.src.split(",");
        const m = h.match(/:(.*?);/)?.[1] || "image/png";
        const editPrompt = `Adicione um logotipo de parceiro na imagem. ${(args.style_instruction as string) ||
          "Posicione no canto inferior direito de forma harmoniosa."
          }`;
        const newUrl = await editImage(b64, m, editPrompt);
        handleUpdateGalleryImage(toolImageReference.id, newUrl);
        return {
          success: true,
          image_data: newUrl,
          message: "Logo de parceria adicionado com sucesso.",
        };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
    if (name === "create_brand_logo") {
      try {
        const logoUrl = await generateLogo(args.prompt as string);
        const newImg = handleAddImageToGallery({
          src: logoUrl,
          prompt: args.prompt as string,
          source: "Logo",
          model: "gemini-3-pro-image-preview",
        });
        setToolImageReference({ id: newImg.id, src: newImg.src });
        return {
          success: true,
          image_data: logoUrl,
          message: "Logo criado com sucesso.",
        };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
    return { error: `Comando não reconhecido: ${name}` };
  }, [
    brandProfile,
    handleAddImageToGallery,
    handleUpdateGalleryImage,
    lastUploadedImage,
    setToolImageReference,
    toolImageReference
  ]);

  const handleAssistantSendMessage = useCallback(async (
    message: string,
    image: ChatReferenceImage | null,
  ) => {
    setIsAssistantLoading(true);
    const userMessageParts: ChatPart[] = [];
    if (image) {
      setLastUploadedImage(image);
      if (!image.id.startsWith("local-")) setToolImageReference(image);
      const { base64, mimeType } = await resizeImageForChat(
        image.src,
        384,
        384,
      );
      userMessageParts.push({ inlineData: { data: base64, mimeType } });
    }
    if (message.trim()) userMessageParts.push({ text: message });
    const userMessage: ChatMessage = { role: "user", parts: userMessageParts };
    const history = [...chatHistory, userMessage];
    setChatHistory(history);
    setChatReferenceImage(null);
    try {
      setChatHistory((prev) => [
        ...prev,
        { role: "model", parts: [{ text: "" }] },
      ]);
      const streamResponse = await runAssistantConversationStream(
        getTruncatedHistory(history),
        brandProfile,
      );
      let accumulatedText = "";
      let functionCall: AssistantFunctionCall | undefined;
      for await (const chunk of streamResponse) {
        if (chunk.text) {
          accumulatedText += chunk.text;
          setChatHistory((prev) => {
            const next = [...prev];
            if (next[next.length - 1].role === "model")
              next[next.length - 1] = {
                ...next[next.length - 1],
                parts: [{ text: accumulatedText }],
              };
            return next;
          });
        }
        if (chunk.functionCall) functionCall = chunk.functionCall;
      }
      if (functionCall) {
        const modelMsg: ChatMessage = {
          role: "model",
          parts: [{ functionCall }],
        };
        setChatHistory((prev) => {
          const next = [...prev];
          next[next.length - 1] = modelMsg;
          return next;
        });
        const result = await executeTool(functionCall);
        const toolMsg: ChatMessage = {
          role: "user",
          parts: [
            { functionResponse: { name: functionCall.name, response: result } },
          ],
        };
        setChatHistory((prev) => [...prev, toolMsg]);
        if ('success' in result && result.success && result.image_data) {
          const [header, base64] = result.image_data.split(",");
          setChatHistory((prev) => [
            ...prev,
            {
              role: "model",
              parts: [
                {
                  text: "Gerei uma prévia:",
                  inlineData: {
                    data: base64,
                    mimeType: header.match(/:(.*?);/)?.[1] || "image/png",
                  },
                },
              ],
            },
          ]);
        }
        setChatHistory((prev) => [
          ...prev,
          { role: "model", parts: [{ text: "" }] },
        ]);
        const finalStream = await runAssistantConversationStream(
          getTruncatedHistory([...history, modelMsg, toolMsg]),
          brandProfile,
        );
        let finalAcc = "";
        for await (const chunk of finalStream) {
          if (chunk.text) {
            finalAcc += chunk.text;
            setChatHistory((prev) => {
              const next = [...prev];
              if (next[next.length - 1].role === "model")
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  parts: [{ text: finalAcc }],
                };
              return next;
            });
          }
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[Chat] Error sending message:", err);
      setChatHistory((prev) => {
        const next = [...prev];
        if (next.length > 0)
          next[next.length - 1] = {
            ...next[next.length - 1],
            parts: [{ text: `Erro: ${errorMessage}` }],
          };
        return next;
      });
    } finally {
      setIsAssistantLoading(false);
    }
  }, [
    brandProfile,
    chatHistory,
    executeTool,
    setChatHistory,
    setChatReferenceImage,
    setIsAssistantLoading,
    setLastUploadedImage,
    setToolImageReference
  ]);

  const parseWeekFromFilename = (filename: string): WeekScheduleInfo | null => {
    // Padrão: "PPST 16 18 al 21 18" ou "PPST_16_18_al_21_18" ou "PPST 22-12 al 28-12"
    // Aceita espaços, underscores ou hífens como separadores
    const match = filename.match(
      /(\d{1,2})[\s_-](\d{1,2})[\s_-]al[\s_-](\d{1,2})[\s_-](\d{1,2})/i,
    );
    if (match) {
      const [, startDay, startMonth, endDay, endMonth] = match;
      return {
        startDate: `${startDay.padStart(2, "0")}/${startMonth.padStart(2, "0")}`,
        endDate: `${endDay.padStart(2, "0")}/${endMonth.padStart(2, "0")}`,
        filename,
      };
    }
    return null;
  };

  const handleTournamentFileUpload = (file: File) => {
    console.debug("[Upload] Starting file upload:", file.name);
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          console.debug("[Upload] File read complete, parsing...");
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
          }) as unknown[][];
          const events: TournamentEvent[] = [];
          let currentDay = "";
          const dayMap: Record<string, string> = {
            MONDAY: "MONDAY",
            SEGUNDA: "MONDAY",
            TUESDAY: "TUESDAY",
            TERÇA: "TUESDAY",
            WEDNESDAY: "WEDNESDAY",
            QUARTA: "WEDNESDAY",
            THURSDAY: "THURSDAY",
            QUINTA: "THURSDAY",
            FRIDAY: "FRIDAY",
            SEXTA: "FRIDAY",
            SATURDAY: "SATURDAY",
            SÁBADO: "SATURDAY",
            SUNDAY: "SUNDAY",
            DOMINGO: "SUNDAY",
          };
          json.forEach((row, i) => {
            const raw = String(row[1] || "")
              .trim()
              .toUpperCase();
            if (dayMap[raw]) currentDay = dayMap[raw];
            else if (row[9] && i > 2 && row[9] !== "NAME" && currentDay) {
              events.push({
                id: `${currentDay}-${i}`,
                day: currentDay,
                name: String(row[9]),
                game: String(row[10]),
                gtd: String(row[8]),
                buyIn: String(row[11]),
                rebuy: String(row[12]),
                addOn: String(row[13]),
                stack: String(row[15]),
                players: String(row[16]),
                lateReg: String(row[17]),
                minutes: String(row[18]),
                structure: String(row[19]),
                times: { "-3": excelTimeToStr(row[2]) },
              });
            }
          });
          console.debug("[Upload] Parsed", events.length, "events from file");
          setTournamentEvents(events);

          // Extrair info da semana do nome do arquivo ou da aba
          let weekInfo =
            parseWeekFromFilename(file.name) ||
            parseWeekFromFilename(wb.SheetNames[0]);

          // Se não conseguir extrair do nome, usar semana atual
          if (!weekInfo) {
            const today = new Date();
            const dayOfWeek = today.getDay();
            const monday = new Date(today);
            monday.setDate(
              today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
            );
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);

            weekInfo = {
              startDate: `${String(monday.getDate()).padStart(2, "0")}/${String(monday.getMonth() + 1).padStart(2, "0")}`,
              endDate: `${String(sunday.getDate()).padStart(2, "0")}/${String(sunday.getMonth() + 1).padStart(2, "0")}`,
              filename: file.name,
            };
          }

          console.debug("[Upload] WeekInfo:", weekInfo);
          setWeekScheduleInfo(weekInfo);

          // Save to database if authenticated
          console.debug("[Upload] userId:", userId);
          if (userId) {
            try {
              // NOTE: We no longer delete existing schedules - we keep all of them
              // so user can switch between different weeks

              // Parse dates for database (convert DD/MM to YYYY-MM-DD)
              const year = new Date().getFullYear();
              const [startDay, startMonth] = weekInfo.startDate.split("/");
              const [endDay, endMonth] = weekInfo.endDate.split("/");

              // Handle year rollover (if end month < start month, end is next year)
              let endYear = year;
              if (parseInt(endMonth) < parseInt(startMonth)) {
                endYear = year + 1;
              }

              const startDateISO = `${year}-${startMonth.padStart(2, "0")}-${startDay.padStart(2, "0")}`;
              const endDateISO = `${endYear}-${endMonth.padStart(2, "0")}-${endDay.padStart(2, "0")}`;

              const result = await createWeekSchedule(userId, {
                start_date: startDateISO,
                end_date: endDateISO,
                filename: file.name,
                organization_id: organizationId,
                events: events.map((ev) => ({
                  day: ev.day,
                  name: ev.name,
                  game: ev.game,
                  gtd: ev.gtd,
                  buyIn: ev.buyIn,
                  rebuy: ev.rebuy,
                  addOn: ev.addOn,
                  stack: ev.stack,
                  players: ev.players,
                  lateReg: ev.lateReg,
                  minutes: ev.minutes,
                  structure: ev.structure,
                  times: ev.times,
                })),
              });

              setCurrentScheduleId(result.schedule.id);
              setIsWeekExpired(false);
              console.debug(
                `[Tournaments] Saved ${result.eventsCount} events to database`,
              );

              // Refresh schedules list
              const schedulesData = await getWeekSchedulesList(
                userId,
                organizationId,
              );
              setAllSchedules(schedulesData.schedules);
            } catch (dbErr) {
              console.error("[Tournaments] Failed to save to database:", dbErr);
              // Continue anyway - data is still in local state
            }
          }

          console.debug(
            "[Upload] Complete! Events:",
            events.length,
            "WeekInfo:",
            weekInfo.startDate,
            "-",
            weekInfo.endDate,
          );
          resolve();
        } catch (err) {
          console.error("[Upload] Error:", err);
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  // ========================================================================
  // CHAT CONTEXT - Callbacks otimizados
  // ========================================================================

  const handleSetChatReference = useCallback((img: GalleryImage | ChatReferenceImage | null) => {
    setChatReferenceImage(img ? { id: img.id, src: img.src } : null);
    if (img && !isAssistantOpen) setIsAssistantOpen(true);
  }, [isAssistantOpen]);

  const handleSetChatReferenceSilent = useCallback((img: GalleryImage | ChatReferenceImage | null) => {
    setChatReferenceImage(img ? { id: img.id, src: img.src } : null);
  }, []);

  // Tool edit approval handlers
  const handleRequestImageEdit = useCallback((request: {
    toolCallId: string;
    toolName: string;
    prompt: string;
    imageId: string;
  }) => {
    console.debug('[App] Tool edit requested:', request);

    // Find image in gallery
    const image = galleryImages.find(img => img.id === request.imageId);

    if (!image) {
      console.error('[App] Image not found:', request.imageId);
      // Auto-reject if image not found
      setPendingToolEdit({
        ...request,
        result: 'rejected',
        error: 'Imagem não encontrada na galeria'
      });
      return;
    }

    // Open AI Studio with the image
    setEditingImage(image);
    setPendingToolEdit(request);
  }, [galleryImages]);

  const handleToolEditApproved = useCallback((toolCallId: string, imageUrl: string) => {
    console.log('🎯 [App] Tool edit approved:', {
      toolCallId,
      imageUrl,
      imageUrlType: typeof imageUrl,
      imageUrlLength: imageUrl?.length,
      isHttps: imageUrl?.startsWith('https://'),
      isBlob: imageUrl?.startsWith('blob:'),
    });

    // Update pending state to mark as approved
    setPendingToolEdit(prev => {
      const updated = prev ? {
        ...prev,
        result: 'approved' as const,
        imageUrl
      } : null;
      console.log('🎯 [App] Updated pendingToolEdit:', updated);
      return updated;
    });

    // Clear states (will be handled by AssistantPanelNew after it gets the result)
    setTimeout(() => {
      setPendingToolEdit(null);
      setEditingImage(null);
      setToolEditPreview(null);
    }, 100);
  }, []);

  const handleToolEditRejected = useCallback((toolCallId: string, reason?: string) => {
    console.debug('[App] Tool edit rejected:', { toolCallId, reason });

    // Update pending state to mark as rejected
    setPendingToolEdit(prev => prev ? {
      ...prev,
      result: 'rejected',
      error: reason || 'Edição rejeitada pelo usuário'
    } : null);

    // Clear states (will be handled by AssistantPanelNew after it gets the result)
    setTimeout(() => {
      setPendingToolEdit(null);
      setEditingImage(null);
    }, 100);
  }, []);

  const handleShowToolEditPreview = useCallback((payload: {
    toolCallId: string;
    imageUrl: string;
    prompt?: string;
    referenceImageId?: string;
    referenceImageUrl?: string;
  }) => {
    const {
      toolCallId,
      imageUrl,
      prompt,
      referenceImageId,
      referenceImageUrl,
    } = payload;

    const imageFromGallery = referenceImageId
      ? galleryImages.find(img => img.id === referenceImageId)
      : null;

    const previewImage = imageFromGallery || (referenceImageUrl ? {
      id: referenceImageId || `tool-edit-${toolCallId}`,
      src: referenceImageUrl,
      source: 'ai-tool-edit',
      model: 'gemini-3-pro-image-preview',
    } as GalleryImage : null);

    if (!previewImage) {
      console.warn('[App] Tool edit preview skipped: reference image not found');
      return;
    }

    setEditingImage(previewImage);
    setToolEditPreview({
      dataUrl: imageUrl,
      type: 'edit',
      prompt,
    });

    // Preserve or create pendingToolEdit for approval flow
    setPendingToolEdit(prev => {
      // If there's already a pending edit with the same toolCallId, keep it
      if (prev && prev.toolCallId === toolCallId) {
        return prev;
      }
      // Otherwise create a new one from the payload
      return {
        toolCallId,
        toolName: 'edit_image',
        prompt: prompt || '',
        imageId: previewImage.id,
      };
    });
  }, [galleryImages]);

  const handleCloseImageEditor = useCallback(() => {
    setEditingImage(null);
    setToolEditPreview(null);
  }, []);

  const chatContextValue = useMemo(() => ({
    onSetChatReference: handleSetChatReference,
    isAssistantOpen,
    setIsAssistantOpen,
    renderPreviewChatPanel: () =>
      import.meta.env.VITE_USE_VERCEL_AI_SDK === 'true' ? (
        <AssistantPanelNew
          isOpen={true}
          onClose={() => {}}
          referenceImage={chatReferenceImage}
          onClearReference={() => handleSetChatReferenceSilent(null)}
          onUpdateReference={(ref) => handleSetChatReferenceSilent(ref)}
          galleryImages={galleryImages}
          brandProfile={brandProfile}
          pendingToolEdit={pendingToolEdit}
          onRequestImageEdit={handleRequestImageEdit}
          onToolEditApproved={handleToolEditApproved}
          onToolEditRejected={handleToolEditRejected}
          onShowToolEditPreview={handleShowToolEditPreview}
        />
      ) : (
        <AssistantPanel
          isOpen={true}
          onClose={() => {}}
          history={chatHistory}
          isLoading={isAssistantLoading}
          onSendMessage={handleAssistantSendMessage}
          referenceImage={chatReferenceImage}
          onClearReference={() => handleSetChatReferenceSilent(null)}
        />
      )
  }), [
    handleSetChatReference,
    isAssistantOpen,
    chatReferenceImage,
    galleryImages,
    brandProfile,
    pendingToolEdit,
    handleRequestImageEdit,
    handleToolEditApproved,
    handleToolEditRejected,
    handleShowToolEditPreview,
    chatHistory,
    isAssistantLoading,
    handleAssistantSendMessage,
    handleSetChatReferenceSilent
  ]);

  // Show loader while:
  // 1. Authentication is loading
  // 2. Initial data is loading
  // 3. Organization context is not loaded
  // 4. Brand profile exists in initialData but hasn't been set to local state yet (race condition fix)
  // 5. Context is changing (userId or organizationId changed - prevents flashing BrandProfileSetup screen)
  // 6. Initial mount - first render before any data loaded (prevents flash on app startup)
  const isBrandProfilePending = !!(initialData?.brandProfile && !brandProfile);

  if (
    authLoading ||
    isInitialLoading ||
    !orgLoaded ||
    isBrandProfilePending ||
    isContextChanging ||
    isInitialMount
  )
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader size={64} className="text-white/60" />
      </div>
    );

  return (
    <>
      {error && (
        <div className="fixed bottom-6 right-6 bg-surface border border-red-500/50 rounded-xl z-[100] max-w-sm p-4 flex items-start space-x-4 animate-fade-in-up">
          <Icon name="x" className="w-4 h-4 text-red-400" />
          <div className="flex-1">
            <p className="font-bold text-sm">Erro</p>
            <p className="text-sm opacity-50">{error}</p>
          </div>
        </div>
      )}
      {!brandProfile ? (
        <BrandProfileSetup
          onProfileSubmit={async (p) => {
            console.debug(
              "[BrandProfile] onProfileSubmit called, userId:",
              userId,
              "orgId:",
              organizationId,
            );
            setBrandProfile(p);
            // Save to database if authenticated
            if (userId) {
              console.debug(
                "[BrandProfile] Saving to database with userId:",
                userId,
                "orgId:",
                organizationId,
              );
              try {
                console.debug("[BrandProfile] Creating new profile...");
                const created = await createBrandProfile(userId, {
                  name: p.name,
                  description: p.description,
                  logo_url: p.logo || undefined,
                  primary_color: p.primaryColor,
                  secondary_color: p.secondaryColor,
                  tertiary_color: p.tertiaryColor,
                  tone_of_voice: p.toneOfVoice,
                  organization_id: organizationId,
                });
                console.debug("[BrandProfile] Created:", created);
              } catch (e) {
                console.error("Failed to save brand profile:", e);
              }
            } else {
              console.debug(
                "[BrandProfile] userId is null/undefined, skipping save",
              );
            }
          }}
          existingProfile={null}
        />
      ) : (
        <>
          <SettingsModal
            isOpen={isEditingProfile}
            onClose={() => setIsEditingProfile(false)}
            brandProfile={brandProfile}
            onSaveProfile={async (p) => {
              console.debug(
                "[BrandProfile] Updating profile, userId:",
                userId,
                "orgId:",
                organizationId,
              );
              setBrandProfile(p);
              if (userId) {
                try {
                  const existingProfile = await getBrandProfile(
                    userId,
                    organizationId,
                  );
                  if (existingProfile) {
                    await updateBrandProfile(existingProfile.id, {
                      name: p.name,
                      description: p.description,
                      logo_url: p.logo || undefined,
                      primary_color: p.primaryColor,
                      secondary_color: p.secondaryColor,
                      tertiary_color: p.tertiaryColor,
                      tone_of_voice: p.toneOfVoice,
                      settings: {
                        ...existingProfile.settings,
                        toneTargets: p.toneTargets,
                        creativeModel: p.creativeModel,
                      },
                    });
                    console.debug("[BrandProfile] Updated successfully");
                  }
                } catch (e) {
                  console.error("Failed to update brand profile:", e);
                }
              }
            }}
          />
          <ChatProvider value={chatContextValue}>
            <Dashboard
              brandProfile={brandProfile!}
            campaign={campaign}
            productImages={campaignProductImages}
            compositionAssets={campaignCompositionAssets}
            onGenerate={handleGenerateCampaign}
            isGenerating={isGenerating}
            onEditProfile={() => setIsEditingProfile(true)}
            onResetCampaign={() => {
              setCampaign(null);
              setCampaignProductImages(null);
              setCampaignCompositionAssets(null);
            }}
            isAssistantOpen={isAssistantOpen}
            onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
            assistantHistory={chatHistory}
            isAssistantLoading={isAssistantLoading}
            onAssistantSendMessage={handleAssistantSendMessage}
            chatReferenceImage={chatReferenceImage}
            onSetChatReference={handleSetChatReference}
            onSetChatReferenceSilent={handleSetChatReferenceSilent}
            theme={theme}
            onThemeToggle={() =>
              setTheme((t) => (t === "light" ? "dark" : "light"))
            }
            galleryImages={galleryImages}
            onAddImageToGallery={handleAddImageToGallery}
            onUpdateGalleryImage={handleUpdateGalleryImage}
            onDeleteGalleryImage={handleDeleteGalleryImage}
            onMarkGalleryImagePublished={handleMarkGalleryImagePublished}
            tournamentEvents={tournamentEvents}
            weekScheduleInfo={weekScheduleInfo}
            onTournamentFileUpload={handleTournamentFileUpload}
            onAddTournamentEvent={(ev) =>
              setTournamentEvents((p) => [ev, ...p])
            }
            allSchedules={allSchedules}
            currentScheduleId={currentScheduleId}
            onSelectSchedule={handleSelectSchedule}
            onDeleteSchedule={async (scheduleId) => {
              if (!userId) return;
              try {
                await deleteWeekSchedule(userId, scheduleId, organizationId);
                // Update local state
                setAllSchedules((prev) =>
                  prev.filter((s) => s.id !== scheduleId),
                );
                // If deleted the current schedule, clear it
                if (currentScheduleId === scheduleId) {
                  setCurrentScheduleId(null);
                  setTournamentEvents([]);
                  setWeekScheduleInfo(null);
                  setIsWeekExpired(false);
                }
                console.debug("[Tournaments] Deleted schedule:", scheduleId);
              } catch (e) {
                console.error("[Tournaments] Failed to delete schedule:", e);
              }
            }}
            flyerState={flyerState}
            setFlyerState={setFlyerState}
            dailyFlyerState={dailyFlyerState}
            setDailyFlyerState={setDailyFlyerState}
            selectedDailyFlyerIds={selectedDailyFlyerIds}
            setSelectedDailyFlyerIds={setSelectedDailyFlyerIds}
            activeView={activeView}
            onViewChange={setActiveView}
            onPublishToCampaign={handlePublishFlyerToCampaign}
            styleReferences={styleReferences}
            onAddStyleReference={handleAddStyleReference}
            onRemoveStyleReference={handleRemoveStyleReference}
            onSelectStyleReference={handleSelectStyleReference}
            selectedStyleReference={selectedStyleReference}
            onClearSelectedStyleReference={() =>
              setSelectedStyleReference(null)
            }
            scheduledPosts={scheduledPosts}
            onSchedulePost={handleSchedulePost}
            onUpdateScheduledPost={handleUpdateScheduledPost}
            onDeleteScheduledPost={handleDeleteScheduledPost}
            onPublishToInstagram={handlePublishToInstagram}
            publishingStates={publishingStates}
            campaignsList={campaignsList}
            onLoadCampaign={handleLoadCampaign}
            userId={userId ?? undefined}
            organizationId={organizationId}
            isWeekExpired={isWeekExpired}
            onClearExpiredSchedule={async () => {
              if (userId && currentScheduleId) {
                try {
                  await deleteWeekSchedule(
                    userId,
                    currentScheduleId,
                    organizationId,
                  );
                  setCurrentScheduleId(null);
                  setTournamentEvents([]);
                  setWeekScheduleInfo(null);
                  setIsWeekExpired(false);
                } catch (e) {
                  console.error(
                    "[Tournaments] Failed to clear expired schedule:",
                    e,
                  );
                }
              }
            }}
            instagramContext={getInstagramContext()}
            onUpdateCreativeModel={async (model: CreativeModel) => {
              // Update local state immediately
              setBrandProfile((prev) =>
                prev ? { ...prev, creativeModel: model } : prev,
              );
              // Save to database in background
              if (userId) {
                try {
                  const existingProfile = await getBrandProfile(
                    userId,
                    organizationId,
                  );
                  if (existingProfile) {
                    await updateBrandProfile(existingProfile.id, {
                      settings: {
                        ...existingProfile.settings,
                        creativeModel: model,
                      },
                    });
                    console.debug(
                      "[BrandProfile] Creative model updated to:",
                      model,
                    );
                  }
                } catch (e) {
                  console.error("Failed to update creative model:", e);
                }
              }
            }}
            onCarouselUpdate={(updatedCarousel) => {
              // Update carousel in campaign state
              setCampaign((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  carousels: prev.carousels?.map((c) =>
                    c.id === updatedCarousel.id ? updatedCarousel : c
                  ) || [],
                };
              });
            }}
            pendingToolEdit={pendingToolEdit}
            editingImage={editingImage}
            onRequestImageEdit={handleRequestImageEdit}
            onToolEditApproved={handleToolEditApproved}
            onToolEditRejected={handleToolEditRejected}
            onShowToolEditPreview={handleShowToolEditPreview}
            toolEditPreview={toolEditPreview}
            onCloseImageEditor={handleCloseImageEditor}
          />
          </ChatProvider>
        </>
      )}
      <BackgroundJobsIndicator isAssistantOpen={isAssistantOpen} />
    </>
  );
}

function AppWithBackgroundJobs() {
  const { userId } = useAuth();
  const { organization } = useOrganization();

  return (
    <BackgroundJobsProvider userId={userId} organizationId={organization?.id}>
      <AppContent />
    </BackgroundJobsProvider>
  );
}

function App() {
  return (
    <AuthWrapper>
      <AppWithBackgroundJobs />
    </AuthWrapper>
  );
}

export default App;
