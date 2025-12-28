/**
 * Centralized data fetching hook with SWR caching
 * This prevents duplicate API calls and reduces database egress
 */

import useSWR, { SWRConfiguration } from 'swr';
import {
  getBrandProfile,
  getGalleryImages,
  getScheduledPosts,
  getCampaigns,
  getTournamentData,
  getWeekSchedulesList,
  type DbBrandProfile,
  type DbGalleryImage,
  type DbScheduledPost,
  type DbCampaign,
  type TournamentData,
  type WeekScheduleWithCount,
} from '../services/apiClient';

// Global SWR config to minimize refetches
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,      // Don't refetch when tab gets focus
  revalidateOnReconnect: false,  // Don't refetch on reconnect
  revalidateIfStale: false,      // Don't auto-refetch stale data
  dedupingInterval: 60000,       // Dedupe requests within 60s
  errorRetryCount: 2,            // Only retry twice on error
};

// Cache keys
const KEYS = {
  brandProfile: (userId: string, orgId?: string | null) =>
    ['brand-profile', userId, orgId || 'personal'],
  gallery: (userId: string, orgId?: string | null) =>
    ['gallery', userId, orgId || 'personal'],
  scheduledPosts: (userId: string, orgId?: string | null) =>
    ['scheduled-posts', userId, orgId || 'personal'],
  campaigns: (userId: string, orgId?: string | null) =>
    ['campaigns', userId, orgId || 'personal'],
  tournamentData: (userId: string, orgId?: string | null) =>
    ['tournament-data', userId, orgId || 'personal'],
  schedulesList: (userId: string, orgId?: string | null) =>
    ['schedules-list', userId, orgId || 'personal'],
};

/**
 * Hook for brand profile with caching
 */
export function useBrandProfile(userId: string | null, organizationId?: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    userId ? KEYS.brandProfile(userId, organizationId) : null,
    () => getBrandProfile(userId!, organizationId),
    defaultConfig
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
 * Hook for gallery images with caching
 */
export function useGalleryImages(userId: string | null, organizationId?: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    userId ? KEYS.gallery(userId, organizationId) : null,
    () => getGalleryImages(userId!, organizationId),
    defaultConfig
  );

  return {
    images: data || [],
    isLoading,
    error,
    refresh: () => mutate(),
    // Optimistic update for adding image
    addImage: (image: DbGalleryImage) => {
      mutate((current) => current ? [image, ...current] : [image], false);
    },
    // Optimistic update for removing image
    removeImage: (imageId: string) => {
      mutate((current) => current?.filter(img => img.id !== imageId), false);
    },
    // Update specific image
    updateImage: (imageId: string, updates: Partial<DbGalleryImage>) => {
      mutate((current) => current?.map(img =>
        img.id === imageId ? { ...img, ...updates } : img
      ), false);
    },
  };
}

/**
 * Hook for scheduled posts with caching
 */
export function useScheduledPosts(userId: string | null, organizationId?: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    userId ? KEYS.scheduledPosts(userId, organizationId) : null,
    () => getScheduledPosts(userId!, organizationId),
    defaultConfig
  );

  return {
    posts: data || [],
    isLoading,
    error,
    refresh: () => mutate(),
    // Optimistic updates
    addPost: (post: DbScheduledPost) => {
      mutate((current) => {
        const updated = current ? [...current, post] : [post];
        return updated.sort((a, b) =>
          new Date(a.scheduled_timestamp).getTime() - new Date(b.scheduled_timestamp).getTime()
        );
      }, false);
    },
    updatePost: (postId: string, updates: Partial<DbScheduledPost>) => {
      mutate((current) => current?.map(p =>
        p.id === postId ? { ...p, ...updates } : p
      ), false);
    },
    removePost: (postId: string) => {
      mutate((current) => current?.filter(p => p.id !== postId), false);
    },
  };
}

/**
 * Hook for campaigns list with caching
 */
export function useCampaigns(userId: string | null, organizationId?: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    userId ? KEYS.campaigns(userId, organizationId) : null,
    () => getCampaigns(userId!, organizationId),
    defaultConfig
  );

  return {
    campaigns: data || [],
    isLoading,
    error,
    refresh: () => mutate(),
    // Optimistic updates
    addCampaign: (campaign: DbCampaign) => {
      mutate((current) => current ? [campaign, ...current] : [campaign], false);
    },
    removeCampaign: (campaignId: string) => {
      mutate((current) => current?.filter(c => c.id !== campaignId), false);
    },
    updateCampaign: (campaignId: string, updates: Partial<DbCampaign>) => {
      mutate((current) => current?.map(c =>
        c.id === campaignId ? { ...c, ...updates } : c
      ), false);
    },
  };
}

/**
 * Hook for tournament data with caching
 */
export function useTournamentData(userId: string | null, organizationId?: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    userId ? KEYS.tournamentData(userId, organizationId) : null,
    () => getTournamentData(userId!, organizationId),
    defaultConfig
  );

  return {
    schedule: data?.schedule || null,
    events: data?.events || [],
    isLoading,
    error,
    refresh: () => mutate(),
    setData: (newData: TournamentData) => mutate(newData, false),
  };
}

/**
 * Hook for week schedules list with caching
 */
export function useSchedulesList(userId: string | null, organizationId?: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    userId ? KEYS.schedulesList(userId, organizationId) : null,
    () => getWeekSchedulesList(userId!, organizationId),
    defaultConfig
  );

  return {
    schedules: data?.schedules || [],
    isLoading,
    error,
    refresh: () => mutate(),
    setSchedules: (schedules: WeekScheduleWithCount[]) =>
      mutate({ schedules }, false),
  };
}

/**
 * Prefetch all data for a user (call once on login)
 */
export async function prefetchUserData(
  userId: string,
  organizationId?: string | null
): Promise<void> {
  // These will populate the SWR cache
  await Promise.allSettled([
    getBrandProfile(userId, organizationId),
    getGalleryImages(userId, organizationId),
    getScheduledPosts(userId, organizationId),
    getCampaigns(userId, organizationId),
    getTournamentData(userId, organizationId),
    getWeekSchedulesList(userId, organizationId),
  ]);
}
