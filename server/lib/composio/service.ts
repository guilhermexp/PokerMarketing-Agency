/**
 * Composio Integration Service.
 *
 * Orchestrates the 6-step pipeline for creating Composio profiles
 * and provides CRUD operations for profile management.
 */

import { getSql } from "../db.js";
import logger from "../logger.js";
import { encrypt, decrypt } from "./encryption.js";
import {
  retrieveToolkit,
  createAuthConfig,
  createConnectedAccount,
  createMcpServer,
  generateMcpUrl,
  getConnectedAccountStatus,
  listToolkits as apiListToolkits,
  listTools as apiListTools,
  type ComposioToolkit,
  type ComposioToolkitDetails,
  type ComposioTool,
} from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposioProfile {
  id: string;
  user_id: string;
  toolkit_slug: string;
  toolkit_name: string;
  profile_name: string;
  is_active: boolean;
  connected_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileStatus {
  status: "initiated" | "active" | "failed" | "unknown";
  connected_account_id: string | null;
}

interface EncryptedConfig {
  type: "composio";
  toolkit_slug: string;
  toolkit_name: string;
  mcp_url: string;
  redirect_url: string | null;
  user_id: string;
  connected_account_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// 6-Step Pipeline: Create Profile
// ---------------------------------------------------------------------------

export async function createComposioProfile(params: {
  userId: string;
  toolkitSlug: string;
  profileName: string;
}): Promise<{ profileId: string; redirectUrl: string | null }> {
  const { userId, toolkitSlug, profileName } = params;
  const sql = getSql();

  logger.info(
    { userId, toolkitSlug, profileName },
    "[Composio] Starting 6-step profile creation pipeline",
  );

  // Step 1: Verify toolkit exists
  const toolkit = await retrieveToolkit(toolkitSlug);
  logger.debug({ toolkitSlug, name: toolkit.name }, "[Composio] Step 1: Toolkit verified");

  // Step 2: Create auth config (managed OAuth, credentials = {})
  const authConfigId = await createAuthConfig(toolkitSlug);
  logger.debug({ authConfigId }, "[Composio] Step 2: Auth config created");

  // Step 3: Create connected account (returns redirect_url for OAuth)
  const { connectedAccountId, redirectUrl } = await createConnectedAccount(
    authConfigId,
    userId,
  );
  logger.debug(
    { connectedAccountId, hasRedirectUrl: !!redirectUrl },
    "[Composio] Step 3: Connected account created",
  );

  // Step 4: Create MCP server
  const mcpServerId = await createMcpServer([authConfigId]);
  logger.debug({ mcpServerId }, "[Composio] Step 4: MCP server created");

  // Step 5: Generate MCP URL
  const mcpUrl = await generateMcpUrl(mcpServerId, [connectedAccountId]);
  logger.debug("[Composio] Step 5: MCP URL generated");

  // Step 6: Save profile to database with encrypted config
  const config: EncryptedConfig = {
    type: "composio",
    toolkit_slug: toolkitSlug,
    toolkit_name: toolkit.name,
    mcp_url: mcpUrl,
    redirect_url: redirectUrl,
    user_id: userId,
    connected_account_id: connectedAccountId,
    created_at: new Date().toISOString(),
  };

  const encryptedConfig = encrypt(JSON.stringify(config));

  const rows = await sql`
    INSERT INTO composio_profiles (
      user_id, toolkit_slug, toolkit_name, profile_name,
      encrypted_config, connected_account_id
    )
    VALUES (
      ${userId}, ${toolkitSlug}, ${toolkit.name}, ${profileName},
      ${encryptedConfig}, ${connectedAccountId}
    )
    RETURNING id
  `;

  const profileId = (rows[0] as Record<string, unknown>).id as string;
  logger.info(
    { profileId, toolkitSlug },
    "[Composio] Step 6: Profile saved to database",
  );

  return { profileId, redirectUrl };
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

export async function listUserProfiles(
  userId: string,
): Promise<ComposioProfile[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, user_id, toolkit_slug, toolkit_name, profile_name,
           is_active, connected_account_id, created_at, updated_at
    FROM composio_profiles
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return rows as unknown as ComposioProfile[];
}

export async function deleteProfile(
  profileId: string,
  userId: string,
): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM composio_profiles
    WHERE id = ${profileId} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function getProfileStatus(
  profileId: string,
  userId: string,
): Promise<ProfileStatus> {
  const sql = getSql();
  const rows = await sql`
    SELECT connected_account_id
    FROM composio_profiles
    WHERE id = ${profileId} AND user_id = ${userId}
  `;

  if (rows.length === 0) {
    return { status: "unknown", connected_account_id: null };
  }

  const connectedAccountId = (rows[0] as Record<string, unknown>).connected_account_id as string | null;
  if (!connectedAccountId) {
    return { status: "unknown", connected_account_id: null };
  }

  try {
    const rawStatus = await getConnectedAccountStatus(connectedAccountId);
    let status: ProfileStatus["status"] = "unknown";
    if (rawStatus === "active" || rawStatus === "connected") {
      status = "active";
    } else if (rawStatus === "initiated" || rawStatus === "pending") {
      status = "initiated";
    } else if (rawStatus === "failed" || rawStatus === "error") {
      status = "failed";
    }
    return { status, connected_account_id: connectedAccountId };
  } catch (error) {
    logger.warn(
      { err: error, profileId },
      "[Composio] Failed to check connection status",
    );
    return { status: "unknown", connected_account_id: connectedAccountId };
  }
}

// ---------------------------------------------------------------------------
// Toolkit / Tool Discovery (proxied from client)
// ---------------------------------------------------------------------------

export async function listToolkits(params?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ toolkits: ComposioToolkit[]; total: number }> {
  return apiListToolkits(params);
}

export async function getToolkitDetails(
  slug: string,
): Promise<ComposioToolkitDetails> {
  return retrieveToolkit(slug);
}

export async function listToolsForToolkit(
  slug: string,
): Promise<ComposioTool[]> {
  return apiListTools(slug);
}
