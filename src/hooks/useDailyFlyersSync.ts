/**
 * Daily Flyers Sync Hook
 *
 * Manages loading daily flyers from database and syncing to store:
 * - Loads flyers when schedule changes
 * - Handles organization context changes
 * - Merges with existing state
 */

import { useEffect } from "react";
import type { GalleryImage } from "@/types";
import type { TimePeriod } from "@/stores/tournament-store";
import { getDailyFlyers } from "@/services/apiClient";

// =============================================================================
// Types
// =============================================================================

type FlyerStateValue = GalleryImage | "loading";
type DailyFlyerState = Record<string, Record<TimePeriod, FlyerStateValue[]>>;
type SetStateAction<T> = T | ((prev: T) => T);

interface UseDailyFlyersSyncParams {
  userId: string | null;
  organizationId: string | null;
  currentScheduleId: string | null;
  hasRestoredDailyFlyers: boolean;
  lastLoadedScheduleId: string | null;
  lastLoadedOrgId: string | null | undefined;
  setDailyFlyerState: (action: SetStateAction<DailyFlyerState>) => void;
  setHasRestoredDailyFlyers: (restored: boolean) => void;
  setLastLoadedScheduleId: (id: string | null) => void;
  setLastLoadedOrgId: (id: string | null | undefined) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useDailyFlyersSync({
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
}: UseDailyFlyersSyncParams): void {
  // Load daily flyers from database
  useEffect(() => {
    console.debug("[DailyFlyers] useEffect triggered:", {
      userId: !!userId,
      currentScheduleId,
      organizationId,
      hasRestored: hasRestoredDailyFlyers,
      lastLoadedScheduleId,
    });

    if (!userId || !currentScheduleId) {
      console.debug("[DailyFlyers] Skipping: missing userId or currentScheduleId");
      return;
    }

    const orgChanged =
      lastLoadedOrgId !== undefined && lastLoadedOrgId !== organizationId;
    if (
      lastLoadedScheduleId === currentScheduleId &&
      hasRestoredDailyFlyers &&
      !orgChanged
    ) {
      console.debug("[DailyFlyers] Skipping: already loaded for this schedule+org");
      return;
    }

    if (orgChanged) {
      console.debug("[DailyFlyers] Organization changed, forcing reload");
      setHasRestoredDailyFlyers(false);
    }

    const loadDailyFlyers = async () => {
      try {
        console.debug("[DailyFlyers] Loading from database:", {
          currentScheduleId,
          userId,
          organizationId,
        });
        const result = await getDailyFlyers(userId, currentScheduleId, organizationId);
        console.debug("[DailyFlyers] Result:", {
          imagesCount: result.images?.length || 0,
          structuredKeys: Object.keys(result.structured || {}),
        });

        if (!result.structured || Object.keys(result.structured).length === 0) {
          console.debug("[DailyFlyers] No flyers found in database");
          setHasRestoredDailyFlyers(true);
          setLastLoadedScheduleId(currentScheduleId);
          setLastLoadedOrgId(organizationId);
          return;
        }

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
              thumbnailSrc: dbImg.thumbnail_url || undefined,
              prompt: dbImg.prompt || undefined,
              source: dbImg.source,
              model: dbImg.model as GalleryImage["model"],
              aspectRatio: dbImg.aspect_ratio || undefined,
              imageSize: dbImg.image_size as GalleryImage["imageSize"] | undefined,
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
          setDailyFlyerState((prev) => {
            const merged = { ...prev };
            Object.entries(restoredState).forEach(([day, periods]) => {
              if (!merged[day]) {
                merged[day] = periods;
              } else {
                Object.entries(periods).forEach(([period, dbImages]) => {
                  const existingImages = merged[day][period as TimePeriod] || [];
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
          console.debug("[DailyFlyers] Merged state from database:", Object.keys(restoredState));
        }

        setHasRestoredDailyFlyers(true);
        setLastLoadedScheduleId(currentScheduleId);
        setLastLoadedOrgId(organizationId);
      } catch (err) {
        console.error("[App] Failed to load daily flyers from database:", err);
      }
    };

    loadDailyFlyers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentScheduleId, organizationId]);

  // Clear state when schedule changes
  useEffect(() => {
    if (
      currentScheduleId &&
      lastLoadedScheduleId &&
      currentScheduleId !== lastLoadedScheduleId
    ) {
      console.debug("[App] Schedule changed, clearing daily flyer state");
      setHasRestoredDailyFlyers(false);
      setDailyFlyerState({});
    }
  }, [currentScheduleId, lastLoadedScheduleId, setHasRestoredDailyFlyers, setDailyFlyerState]);
}
