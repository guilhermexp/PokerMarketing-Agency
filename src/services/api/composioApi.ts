/**
 * Composio API client.
 *
 * Uses its own base URL (/api/composio) separate from fetchApi (/api/db).
 */

import {
  getCsrfToken,
  getCurrentCsrfToken,
  clearCsrfToken,
} from "../api-client/csrf";
import { unwrapApiData } from "./response";
import type {
  ComposioToolkit,
  ComposioProfile,
  ComposioTool,
  CreateProfileResponse,
  ProfileStatus,
} from "./types/composioTypes";

const COMPOSIO_API_BASE = "/api/composio";

async function fetchComposioApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const requiresCsrf = method !== "GET" && method !== "HEAD";

  if (requiresCsrf && !getCurrentCsrfToken()) {
    await getCsrfToken();
  }

  const response = await fetch(`${COMPOSIO_API_BASE}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(requiresCsrf && getCurrentCsrfToken()
        ? { "X-CSRF-Token": getCurrentCsrfToken()! }
        : {}),
      ...options.headers,
    },
  });

  if (response.status === 403) {
    clearCsrfToken();
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    const message =
      (body as Record<string, unknown>).error ??
      (body as Record<string, unknown>).message ??
      `HTTP ${response.status}`;
    throw new Error(String(message));
  }

  const json: unknown = await response.json();
  return unwrapApiData<T>(json as T);
}

// ---------------------------------------------------------------------------
// Toolkit Discovery
// ---------------------------------------------------------------------------

export async function getToolkits(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{ toolkits: ComposioToolkit[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.search) searchParams.set("search", params.search);

  const qs = searchParams.toString();
  return fetchComposioApi(`/toolkits${qs ? `?${qs}` : ""}`);
}

export async function getToolkitDetails(
  slug: string,
): Promise<ComposioToolkit> {
  return fetchComposioApi(`/toolkits/${slug}`);
}

export async function getToolsForToolkit(
  slug: string,
): Promise<{ tools: ComposioTool[]; count: number }> {
  return fetchComposioApi(`/tools/${slug}`);
}

// ---------------------------------------------------------------------------
// Profile Management
// ---------------------------------------------------------------------------

export async function getProfiles(): Promise<{ profiles: ComposioProfile[] }> {
  return fetchComposioApi("/profiles");
}

export async function createProfile(body: {
  toolkit_slug: string;
  profile_name: string;
}): Promise<CreateProfileResponse> {
  return fetchComposioApi("/profiles", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteProfile(id: string): Promise<{ success: boolean }> {
  return fetchComposioApi(`/profiles/${id}`, {
    method: "DELETE",
  });
}

export async function getProfileStatus(id: string): Promise<ProfileStatus> {
  return fetchComposioApi(`/profiles/${id}/status`);
}
