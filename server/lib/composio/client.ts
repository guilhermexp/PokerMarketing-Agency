/**
 * Composio REST API client.
 *
 * Wraps Composio v3 API directly via fetch instead of the SDK,
 * since the JS SDK may have different method names across versions.
 * This gives us full control and avoids SDK quirks.
 */

import logger from "../logger.js";

const COMPOSIO_API_BASE = "https://backend.composio.dev/api/v3";

function getApiKey(): string {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) {
    throw new Error("COMPOSIO_API_KEY environment variable is required");
  }
  return key;
}

async function composioFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiKey = getApiKey();
  const url = `${COMPOSIO_API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error(
      { status: response.status, url, body },
      "[Composio] API request failed",
    );
    throw new Error(
      `Composio API error ${response.status}: ${body || response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposioToolkit {
  slug: string;
  name: string;
  description: string;
  logo: string;
  tools_count: number;
  auth_schemes: string[] | null;
  composio_managed_auth_schemes: string[] | null;
}

interface RawToolkit {
  slug: string;
  name: string;
  auth_schemes: string[] | null;
  composio_managed_auth_schemes: string[] | null;
  meta?: {
    logo?: string;
    description?: string;
    tools_count?: number;
    categories?: Array<{ id: string; name: string }>;
    [key: string]: unknown;
  };
}

export interface ComposioToolkitDetails extends ComposioToolkit {
  initiation_fields?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
}

interface ToolkitsListResponse {
  items: RawToolkit[];
  total_items?: number;
  total_pages?: number;
  current_page?: number;
  next_cursor?: string;
}

export interface ComposioTool {
  name: string;
  display_name: string;
  description: string;
  parameters: Record<string, unknown>;
  tags?: string[];
}

interface ToolsListResponse {
  items?: ComposioTool[];
  tools?: ComposioTool[];
}

interface AuthConfigResponse {
  toolkit: { slug: string };
  auth_config: {
    id: string;
    auth_scheme: string;
    is_composio_managed: boolean;
  };
}

interface ConnectedAccountResponse {
  id: string;
  redirect_url?: string;
  redirect_uri?: string;
  status?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

export async function listToolkits(params?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ toolkits: ComposioToolkit[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit ?? 20));

  const qs = searchParams.toString();
  const data = await composioFetch<ToolkitsListResponse>(
    `/toolkits${qs ? `?${qs}` : ""}`,
  );

  // Filter to only show toolkits with Composio-managed OAuth
  // and normalize meta fields (logo, description) to top-level
  const filtered: ComposioToolkit[] = (data.items || [])
    .filter((tk) => {
      const managedSchemes = tk.composio_managed_auth_schemes || [];
      return managedSchemes.length > 0;
    })
    .map((tk) => ({
      slug: tk.slug,
      name: tk.name,
      description: (tk.meta?.description as string) ?? "",
      logo: (tk.meta?.logo as string) ?? "",
      tools_count: tk.meta?.tools_count ?? 0,
      auth_schemes: tk.auth_schemes,
      composio_managed_auth_schemes: tk.composio_managed_auth_schemes,
    }));

  return { toolkits: filtered, total: data.total_items ?? filtered.length };
}

export async function retrieveToolkit(
  slug: string,
): Promise<ComposioToolkitDetails> {
  const raw = await composioFetch<RawToolkit & { initiation_fields?: ComposioToolkitDetails["initiation_fields"] }>(`/toolkits/${slug}`);
  return {
    slug: raw.slug,
    name: raw.name,
    description: (raw.meta?.description as string) ?? "",
    logo: (raw.meta?.logo as string) ?? "",
    tools_count: raw.meta?.tools_count ?? 0,
    auth_schemes: raw.auth_schemes,
    composio_managed_auth_schemes: raw.composio_managed_auth_schemes,
    initiation_fields: raw.initiation_fields,
  };
}

export async function createAuthConfig(toolkitSlug: string): Promise<string> {
  const data = await composioFetch<AuthConfigResponse>("/auth_configs", {
    method: "POST",
    body: JSON.stringify({
      toolkit: { slug: toolkitSlug },
      auth_config: {
        type: "use_composio_managed_auth",
        credentials: {}, // MUST be empty for managed auth
      },
    }),
  });
  return data.auth_config.id;
}

export async function createConnectedAccount(
  authConfigId: string,
  entityId: string,
): Promise<{ connectedAccountId: string; redirectUrl: string | null }> {
  const data = await composioFetch<ConnectedAccountResponse>(
    "/connected_accounts",
    {
      method: "POST",
      body: JSON.stringify({
        auth_config: { id: authConfigId },
        connection: { entity_id: entityId },
      }),
    },
  );
  return {
    connectedAccountId: data.id,
    redirectUrl: data.redirect_url ?? data.redirect_uri ?? null,
  };
}

export async function getConnectedAccountStatus(
  connectedAccountId: string,
): Promise<string> {
  const data = await composioFetch<ConnectedAccountResponse>(
    `/connected_accounts/${connectedAccountId}`,
  );
  return (data.status ?? "unknown").toLowerCase();
}

export async function listTools(
  toolkitSlug: string,
): Promise<ComposioTool[]> {
  const data = await composioFetch<ToolsListResponse>(
    `/tools?toolkit=${toolkitSlug}`,
  );
  return data.items ?? data.tools ?? [];
}
