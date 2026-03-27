/**
 * SWR hooks for Composio integration.
 */

import useSWR from "swr";
import {
  getProfiles,
  getToolkits,
  getProfileStatus,
} from "@/services/api/composioApi";
import type {
  ComposioProfile,
  ComposioToolkit,
  ProfileStatus,
} from "@/services/api/types/composioTypes";

export function useComposioProfiles() {
  const { data, error, isLoading, mutate } = useSWR(
    "composio:profiles",
    () => getProfiles(),
    { revalidateOnFocus: false },
  );

  return {
    profiles: data?.profiles ?? [],
    isLoading,
    error,
    mutate,
  };
}

export function useComposioToolkits(search?: string, page = 1) {
  const key = search
    ? `composio:toolkits:${search}:${page}`
    : `composio:toolkits::${page}`;

  const { data, error, isLoading } = useSWR(
    key,
    () => getToolkits({ search, page, limit: 20 }),
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  return {
    toolkits: data?.toolkits ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
  };
}

export function useProfileStatus(profileId: string | null) {
  const { data, error, isLoading } = useSWR<ProfileStatus>(
    profileId ? `composio:status:${profileId}` : null,
    () => getProfileStatus(profileId!),
    {
      refreshInterval: (latestData) =>
        latestData?.status === "initiated" ? 3000 : 0,
      revalidateOnFocus: false,
    },
  );

  return {
    status: data?.status ?? null,
    isLoading,
    error,
  };
}
