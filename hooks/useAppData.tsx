/**
 * Centralized data fetching hook with SWR caching
 * OPTIMIZED: Uses a single /api/db/init endpoint to load all data at once
 * This reduces 6 separate API calls to 1, dramatically reducing network transfer
 */

import React from "react";
import useSWR, { SWRConfiguration, mutate as globalMutate } from "swr";
import {
  getInitialData,
  type InitialData,
  type DbBrandProfile,
  type DbGalleryImage,
  type DbScheduledPost,
  type DbCampaign,
  type DbTournamentEvent,
  type TournamentData,
  type WeekScheduleWithCount,
} from "../services/apiClient";

// Global SWR config to minimize refetches
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false, // Don't refetch when tab gets focus
  revalidateOnReconnect: false, // Don't refetch on reconnect
  revalidateIfStale: false, // Don't auto-refetch stale data
  dedupingInterval: 300000, // Dedupe requests within 5 minutes (increased!)
  errorRetryCount: 2, // Only retry twice on error
};

// IMPORTANT: Stable empty array references to prevent infinite re-renders
// When hooks return `data || []`, each render creates a NEW array reference,
// causing useEffect dependencies to trigger infinite loops
const EMPTY_GALLERY: DbGalleryImage[] = [];
const EMPTY_POSTS: DbScheduledPost[] = [];
const EMPTY_CAMPAIGNS: DbCampaign[] = [];
const EMPTY_EVENTS: DbTournamentEvent[] = [];
const EMPTY_SCHEDULES: WeekScheduleWithCount[] = [];

// Cache keys
const KEYS = {
  // Unified initial data key
  initialData: (userId: string, orgId?: string | null) => [
    "initial-data",
    userId,
    orgId || "personal",
  ],
  // Individual keys (for optimistic updates)
  brandProfile: (userId: string, orgId?: string | null) => [
    "brand-profile",
    userId,
    orgId || "personal",
  ],
  gallery: (userId: string, orgId?: string | null) => [
    "gallery",
    userId,
    orgId || "personal",
  ],
  scheduledPosts: (userId: string, orgId?: string | null) => [
    "scheduled-posts",
    userId,
    orgId || "personal",
  ],
  campaigns: (userId: string, orgId?: string | null) => [
    "campaigns",
    userId,
    orgId || "personal",
  ],
  tournamentData: (userId: string, orgId?: string | null) => [
    "tournament-data",
    userId,
    orgId || "personal",
  ],
  schedulesList: (userId: string, orgId?: string | null) => [
    "schedules-list",
    userId,
    orgId || "personal",
  ],
};

// ============================================================================
// OPTIMIZED: Unified Initial Data Hook
// Loads ALL data in a single request and populates individual caches
// ============================================================================

/**
 * Main hook that loads ALL initial data in a single request
 * Use this in your main App component for initial load
 */
export function useInitialData(
  userId: string | null,
  organizationId?: string | null,
) {
  const { data, error, isLoading, mutate } = useSWR(
    userId ? KEYS.initialData(userId, organizationId) : null,
    async () => {
      console.log("[SWR] Fetching all initial data via /api/db/init...");
      const result = await getInitialData(userId!, organizationId);

      // Populate individual caches for optimistic updates
      // This allows individual hooks to work without re-fetching
      if (result) {
        console.log("[SWR] Populating individual caches from init data...");
        globalMutate(
          KEYS.brandProfile(userId!, organizationId),
          result.brandProfile,
          false,
        );
        globalMutate(
          KEYS.gallery(userId!, organizationId),
          result.gallery,
          false,
        );
        globalMutate(
          KEYS.scheduledPosts(userId!, organizationId),
          result.scheduledPosts,
          false,
        );
        globalMutate(
          KEYS.campaigns(userId!, organizationId),
          result.campaigns,
          false,
        );
        globalMutate(
          KEYS.tournamentData(userId!, organizationId),
          {
            schedule: result.tournamentSchedule,
            events: result.tournamentEvents,
          },
          false,
        );
        globalMutate(
          KEYS.schedulesList(userId!, organizationId),
          {
            schedules: result.schedulesList,
          },
          false,
        );
      }

      return result;
    },
    {
      ...defaultConfig,
      dedupingInterval: 600000, // 10 minutes for initial data
    },
  );

  return {
    data,
    isLoading,
    error,
    refresh: () => mutate(),
  };
}

// ============================================================================
// Individual Hooks - NO FETCHER, just read from cache
// These only work AFTER useInitialData has populated the caches
// ============================================================================

/**
 * Hook for gallery images - reads from cache only
 */
export function useGalleryImages(
  userId: string | null,
  organizationId?: string | null,
) {
  const { data, error, isLoading, mutate } = useSWR<DbGalleryImage[]>(
    userId ? KEYS.gallery(userId, organizationId) : null,
    // NO FETCHER - data comes from useInitialData
    null,
    {
      ...defaultConfig,
      // Don't refetch - cache is populated by useInitialData
      revalidateOnMount: false,
    },
  );

  // Track pagination state
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);

  // Load more images from API
  const loadMore = async () => {
    if (!userId || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const currentCount = data?.length || 0;
      const params = new URLSearchParams({
        user_id: userId,
        limit: '50',
        offset: currentCount.toString(),
      });
      if (organizationId) {
        params.set('organization_id', organizationId);
      }

      const response = await fetch(`/api/db/gallery?${params}`);
      if (!response.ok) throw new Error('Failed to load more images');

      const newImages: DbGalleryImage[] = await response.json();

      // If we got fewer than 50, there are no more images
      if (newImages.length < 50) {
        setHasMore(false);
      }

      // Append new images to cache
      if (newImages.length > 0) {
        mutate((current) => [...(current || []), ...newImages], false);
      }
    } catch (err) {
      console.error('[useGalleryImages] Failed to load more:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return {
    images: data ?? EMPTY_GALLERY,
    isLoading,
    error,
    refresh: () => mutate(),
    // Pagination
    loadMore,
    isLoadingMore,
    hasMore,
    // Optimistic update for adding image
    addImage: (image: DbGalleryImage) => {
      mutate((current) => (current ? [image, ...current] : [image]), false);
    },
    // Optimistic update for removing image
    removeImage: (imageId: string) => {
      mutate((current) => current?.filter((img) => img.id !== imageId), false);
    },
    // Update specific image
    updateImage: (imageId: string, updates: Partial<DbGalleryImage>) => {
      mutate(
        (current) =>
          current?.map((img) =>
            img.id === imageId ? { ...img, ...updates } : img,
          ),
        false,
      );
    },
  };
}

/**
 * Hook for scheduled posts - reads from cache only
 */
export function useScheduledPosts(
  userId: string | null,
  organizationId?: string | null,
) {
  const { data, error, isLoading, mutate } = useSWR<DbScheduledPost[]>(
    userId ? KEYS.scheduledPosts(userId, organizationId) : null,
    // NO FETCHER
    null,
    {
      ...defaultConfig,
      revalidateOnMount: false,
    },
  );

  return {
    posts: data ?? EMPTY_POSTS,
    isLoading,
    error,
    refresh: () => mutate(),
    // Optimistic updates
    addPost: (post: DbScheduledPost) => {
      mutate((current) => {
        const updated = current ? [...current, post] : [post];
        return updated.sort(
          (a, b) =>
            new Date(a.scheduled_timestamp).getTime() -
            new Date(b.scheduled_timestamp).getTime(),
        );
      }, false);
    },
    updatePost: (postId: string, updates: Partial<DbScheduledPost>) => {
      mutate(
        (current) =>
          current?.map((p) => (p.id === postId ? { ...p, ...updates } : p)),
        false,
      );
    },
    removePost: (postId: string) => {
      mutate((current) => current?.filter((p) => p.id !== postId), false);
    },
  };
}

/**
 * Hook for campaigns list - reads from cache only
 */
export function useCampaigns(
  userId: string | null,
  organizationId?: string | null,
) {
  const { data, error, isLoading, mutate } = useSWR<DbCampaign[]>(
    userId ? KEYS.campaigns(userId, organizationId) : null,
    // NO FETCHER
    null,
    {
      ...defaultConfig,
      revalidateOnMount: false,
    },
  );

  return {
    campaigns: data ?? EMPTY_CAMPAIGNS,
    isLoading,
    error,
    refresh: () => mutate(),
    // Optimistic updates
    addCampaign: (campaign: DbCampaign) => {
      mutate(
        (current) => (current ? [campaign, ...current] : [campaign]),
        false,
      );
    },
    removeCampaign: (campaignId: string) => {
      mutate((current) => current?.filter((c) => c.id !== campaignId), false);
    },
    updateCampaign: (campaignId: string, updates: Partial<DbCampaign>) => {
      mutate(
        (current) =>
          current?.map((c) => (c.id === campaignId ? { ...c, ...updates } : c)),
        false,
      );
    },
  };
}

/**
 * Hook for tournament data - reads from cache only
 */
export function useTournamentData(
  userId: string | null,
  organizationId?: string | null,
) {
  const { data, error, isLoading, mutate } = useSWR<TournamentData>(
    userId ? KEYS.tournamentData(userId, organizationId) : null,
    // NO FETCHER
    null,
    {
      ...defaultConfig,
      revalidateOnMount: false,
    },
  );

  return {
    schedule: data?.schedule ?? null,
    events: data?.events ?? EMPTY_EVENTS,
    isLoading,
    error,
    refresh: () => mutate(),
    setData: (newData: TournamentData) => mutate(newData, false),
  };
}

/**
 * Hook for week schedules list - reads from cache only
 */
export function useSchedulesList(
  userId: string | null,
  organizationId?: string | null,
) {
  const { data, error, isLoading, mutate } = useSWR<{
    schedules: WeekScheduleWithCount[];
  }>(
    userId ? KEYS.schedulesList(userId, organizationId) : null,
    // NO FETCHER
    null,
    {
      ...defaultConfig,
      revalidateOnMount: false,
    },
  );

  return {
    schedules: data?.schedules ?? EMPTY_SCHEDULES,
    isLoading,
    error,
    refresh: () => mutate(),
    setSchedules: (schedules: WeekScheduleWithCount[]) =>
      mutate({ schedules }, false),
  };
}

// ============================================================================
// Brand Profile Hook - still needs separate handling due to form editing
// ============================================================================

export function useBrandProfile(
  userId: string | null,
  organizationId?: string | null,
) {
  const { data, error, isLoading, mutate } = useSWR<DbBrandProfile | null>(
    userId ? KEYS.brandProfile(userId, organizationId) : null,
    // NO FETCHER
    null,
    {
      ...defaultConfig,
      revalidateOnMount: false,
    },
  );

  return {
    brandProfile: data,
    isLoading,
    error,
    refresh: () => mutate(),
    update: (newData: DbBrandProfile | null) => mutate(newData, false),
  };
}

/**
 * @deprecated Use useInitialData instead for initial load
 * This is kept for backwards compatibility
 */
export async function prefetchUserData(
  userId: string,
  organizationId?: string | null,
): Promise<void> {
  // Use the unified endpoint instead
  const data = await getInitialData(userId, organizationId);

  // Populate individual caches
  globalMutate(
    KEYS.brandProfile(userId, organizationId),
    data.brandProfile,
    false,
  );
  globalMutate(KEYS.gallery(userId, organizationId), data.gallery, false);
  globalMutate(
    KEYS.scheduledPosts(userId, organizationId),
    data.scheduledPosts,
    false,
  );
  globalMutate(KEYS.campaigns(userId, organizationId), data.campaigns, false);
  globalMutate(
    KEYS.tournamentData(userId, organizationId),
    {
      schedule: data.tournamentSchedule,
      events: data.tournamentEvents,
    },
    false,
  );
  globalMutate(
    KEYS.schedulesList(userId, organizationId),
    {
      schedules: data.schedulesList,
    },
    false,
  );
}
