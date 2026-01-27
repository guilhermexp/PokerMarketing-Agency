/**
 * Rube MCP Service
 * Handles communication with Rube MCP for Instagram publishing
 * Uses JSON-RPC 2.0 protocol over HTTP
 *
 * Supports multi-tenant mode via InstagramContext for per-user tokens
 *
 * Tested and verified tools:
 * - INSTAGRAM_CREATE_MEDIA_CONTAINER (for feed posts, reels)
 * - INSTAGRAM_CREATE_CAROUSEL_CONTAINER (for carousels)
 * - INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH (publish containers)
 * - INSTAGRAM_CREATE_POST (publish carousels)
 * - INSTAGRAM_GET_POST_STATUS (check container status)
 * - INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT (check quota)
 */

import { uploadDataUrlToBlob } from './blobService';
import type { InstagramPublishState } from '../types';
import { getEnv } from "../utils/env";

// MCP Configuration
// Use proxy to avoid CORS - proxy handles token from database
const MCP_URL = '/api/rube';

// Generate unique JSON-RPC ID
const generateId = () => `rube_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Multi-tenant context for Instagram operations
 * When provided, uses user-specific token from database
 * When not provided, falls back to global RUBE_TOKEN (dev mode)
 */
export interface InstagramContext {
  instagramAccountId: string;  // UUID from instagram_accounts table
  userId: string;              // Clerk user ID
  organizationId?: string;     // Clerk organization ID (for org-shared accounts)
}

// Types for Rube MCP
interface RubeMCPRequest {
  jsonrpc: '2.0';
  id: string;
  method: 'tools/call';
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

// Instagram content types
export type InstagramContentType = 'photo' | 'video' | 'reel' | 'story' | 'carousel';

export interface InstagramPublishResult {
  success: boolean;
  mediaId?: string;
  errorMessage?: string;
}

export interface PublishProgress {
  step: InstagramPublishState['step'];
  message: string;
  progress: number;
}

export interface PublishingQuota {
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Check if Rube is configured (requires InstagramContext - no fallback)
 */
export const isRubeConfigured = (context?: InstagramContext): boolean => {
  // Requires valid context - no fallback to global token
  return Boolean(context?.instagramAccountId && context?.userId);
};

// Dev-mode fallback helpers for single-tenant mode (deprecated)
// In production, always use InstagramContext
const getInstagramUserId = (): string => {
  return getEnv("VITE_INSTAGRAM_USER_ID") || "";
};

const getInstagramUsername = (): string => {
  return getEnv("VITE_INSTAGRAM_USERNAME") || "";
};

/**
 * Parse SSE response from Rube MCP
 */
const parseSSEResponse = (text: string): Record<string, unknown> | { error?: string } => {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const json = JSON.parse(line.substring(6));
        if (json.result?.content) {
          const textContent = json.result.content.find((c: { type: string; text?: string }) => c.type === 'text');
          if (textContent?.text) {
            return JSON.parse(textContent.text);
          }
        }
        return json;
      } catch (e) {
        console.error('[Rube MCP] Failed to parse SSE response:', e);
      }
    }
  }
  return { error: 'No valid data in SSE response' };
};

/**
 * Core MCP call function
 * @param toolName - The MCP tool to call
 * @param args - Tool arguments
 * @param context - Required multi-tenant context for user-specific tokens
 */
export const callRubeMCP = async (
  toolName: string,
  args: Record<string, unknown>,
  context: InstagramContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  if (!context?.instagramAccountId || !context?.userId) {
    throw new Error('Conecte sua conta Instagram em Configurações → Integrações para publicar.');
  }

  const request: RubeMCPRequest = {
    jsonrpc: '2.0',
    id: generateId(),
    method: 'tools/call',
    params: { name: toolName, arguments: args }
  };

  console.debug(`[Rube MCP] Calling ${toolName}...`, args);

  // Build request body with multi-tenant context
  const requestBody = {
    ...request,
    instagram_account_id: context.instagramAccountId,
    user_id: context.userId,
    organization_id: context.organizationId || undefined
  };

  // Uses proxy which handles token from database
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    if (response.status === 400) {
      throw new Error('Conecte sua conta Instagram em Configurações → Integrações.');
    }
    if (response.status === 401) {
      throw new Error('Token expirado. Reconecte sua conta Instagram em Configurações → Integrações.');
    }
    if (response.status === 403) {
      throw new Error('Conta Instagram não encontrada ou sem permissão. Reconecte em Configurações → Integrações.');
    }
    if (response.status === 429) {
      throw new Error('Limite de publicações atingido (25/dia). Tente novamente mais tarde.');
    }
    throw new Error(`Erro Rube MCP: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const data = parseSSEResponse(text);

  console.debug(`[Rube MCP] Response:`, data);

  if (data.error) {
    throw new Error(`Erro Rube MCP: ${data.error}`);
  }

  return data;
};

/**
 * Execute a tool via RUBE_MULTI_EXECUTE_TOOL
 * @param toolSlug - The Instagram tool to execute
 * @param args - Tool arguments
 * @param sessionId - Session ID for the tool execution
 * @param context - Optional multi-tenant context for user-specific tokens
 */
export const executeInstagramTool = async (
  toolSlug: string,
  args: Record<string, unknown>,
  sessionId: string = 'zulu',
  context?: InstagramContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  if (!context) {
    throw new Error('Instagram context is required for tool execution');
  }

  const result = await callRubeMCP('RUBE_MULTI_EXECUTE_TOOL', {
    tools: [{
      tool_slug: toolSlug,
      arguments: args
    }],
    sync_response_to_workbench: false,
    memory: {},
    session_id: sessionId,
    thought: `Executing ${toolSlug} for Instagram publishing`
  }, context);

  // Parse the deeply nested Rube MCP response
  // Structure: result.data.data.results[0].response.data
  console.debug(`[Rube MCP] Full response for ${toolSlug}:`, JSON.stringify(result, null, 2));

  // Navigate through the nested structure
  const nestedData = result?.data?.data;
  if (nestedData?.results && nestedData.results.length > 0) {
    const toolResult = nestedData.results[0];

    // Check for errors
    if (toolResult?.response?.error) {
      throw new Error(toolResult.response.error);
    }

    // Get the actual data from response.data
    const actualData = toolResult?.response?.data;
    console.debug(`[Rube MCP] Extracted data for ${toolSlug}:`, JSON.stringify(actualData, null, 2));
    return actualData;
  }

  // Fallback to old structure if new one doesn't match
  if (result.data?.results) {
    const toolResult = result.data.results[0];
    if (toolResult?.error) {
      throw new Error(toolResult.error);
    }
    return toolResult?.response?.data || toolResult?.data || toolResult;
  }

  return result;
};

/**
 * Check publishing quota (25 posts per 24 hours)
 * @param context - Optional multi-tenant context
 */
export const checkPublishingQuota = async (context?: InstagramContext): Promise<PublishingQuota> => {
  try {
    // In multi-tenant mode, ig_user_id is injected by the proxy
    const args: Record<string, unknown> = {
      fields: 'quota_usage,config'
    };

    // Only include ig_user_id in single-tenant mode
    if (!context) {
      args.ig_user_id = getInstagramUserId();
    }

    const result = await executeInstagramTool(
      'INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT',
      args,
      'zulu',
      context
    );

    // Result can be an array or object
    const quotaData = Array.isArray(result?.data) ? result.data[0] : (Array.isArray(result) ? result[0] : result);
    const quotaUsage = quotaData?.quota_usage || result?.quota_usage || 0;
    const config = quotaData?.config || result?.config || { quota_total: 25 };

    return {
      used: quotaUsage,
      limit: config.quota_total || 25,
      remaining: (config.quota_total || 25) - quotaUsage
    };
  } catch (e) {
    console.error('[Rube MCP] Failed to check quota:', e);
    return { used: 0, limit: 25, remaining: 25 };
  }
};

/**
 * Create media container for photo/video/reel
 * @param context - Optional multi-tenant context
 */
export const createMediaContainer = async (
  contentType: 'photo' | 'video' | 'reel' | 'story',
  mediaUrl: string,
  caption: string,
  context?: InstagramContext
): Promise<string> => {
  const args: Record<string, unknown> = {};

  // Only include ig_user_id in single-tenant mode (proxy injects it in multi-tenant)
  if (!context) {
    args.ig_user_id = getInstagramUserId();
  }

  // Stories don't support captions
  if (contentType !== 'story') {
    args.caption = caption;
  }

  // Determine media type and URL
  if (contentType === 'story') {
    args.image_url = mediaUrl;
    args.media_type = 'STORIES';
  } else if (contentType === 'photo') {
    args.image_url = mediaUrl;
  } else if (contentType === 'reel') {
    args.video_url = mediaUrl;
    args.media_type = 'REELS';
  } else {
    args.video_url = mediaUrl;
  }

  const result = await executeInstagramTool('INSTAGRAM_CREATE_MEDIA_CONTAINER', args, 'zulu', context);

  console.debug('[Rube MCP] createMediaContainer result:', JSON.stringify(result, null, 2));

  // Try multiple paths to find container ID
  const containerId = result?.id
    || result?.data?.id
    || result?.creation_id
    || result?.container_id
    || result?.media_container_id
    || (typeof result === 'string' ? result : null);

  if (!containerId) {
    console.error('[Rube MCP] Could not find container ID in result:', result);
    throw new Error(`Falha ao criar container: ${JSON.stringify(result)}`);
  }

  console.debug(`[Rube MCP] Container ID found: ${containerId}`);
  return containerId;
};

/**
 * Create carousel container with multiple items
 * Uses Rube's simplified API with child_image_urls
 * @param context - Optional multi-tenant context
 */
export const createCarouselContainer = async (
  mediaUrls: string[],
  caption: string,
  context?: InstagramContext
): Promise<string> => {
  // Separate images and videos
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];

  for (const url of mediaUrls) {
    const isVideo = url.includes('.mp4') || url.includes('.mov') || url.includes('video');
    if (isVideo) {
      videoUrls.push(url);
    } else {
      imageUrls.push(url);
    }
  }

  if (imageUrls.length + videoUrls.length < 2) {
    throw new Error('Carousel requer pelo menos 2 itens');
  }

  // Use Rube's simplified carousel API with child_image_urls
  const carouselArgs: Record<string, unknown> = {
    caption: caption
  };

  // Only include ig_user_id in single-tenant mode
  if (!context) {
    carouselArgs.ig_user_id = getInstagramUserId();
  }

  if (imageUrls.length > 0) {
    carouselArgs.child_image_urls = imageUrls;
  }
  if (videoUrls.length > 0) {
    carouselArgs.child_video_urls = videoUrls;
  }

  console.debug('[Rube MCP] Creating carousel with', imageUrls.length, 'images and', videoUrls.length, 'videos');
  const result = await executeInstagramTool('INSTAGRAM_CREATE_CAROUSEL_CONTAINER', carouselArgs, 'zulu', context);

  const containerId = result?.id || result?.data?.id || result?.creation_id || result?.container_id;

  if (!containerId) {
    console.error('[Rube MCP] Could not find carousel container ID in result:', result);
    throw new Error(`Falha ao criar carousel container: ${JSON.stringify(result)}`);
  }

  console.debug('[Rube MCP] Carousel container created:', containerId);
  return containerId;
};

/**
 * Check container processing status
 * @param context - Optional multi-tenant context
 */
export const getContainerStatus = async (containerId: string, context?: InstagramContext): Promise<string> => {
  const result = await executeInstagramTool('INSTAGRAM_GET_POST_STATUS', {
    creation_id: containerId
  }, 'zulu', context);

  return result.status_code || result.data?.status_code || result.status || 'IN_PROGRESS';
};

/**
 * Publish a container (photo, video, reel)
 * @param context - Optional multi-tenant context
 */
export const publishContainer = async (containerId: string, context?: InstagramContext): Promise<string> => {
  const args: Record<string, unknown> = {
    creation_id: containerId
  };

  if (!context) {
    args.ig_user_id = getInstagramUserId();
  }

  const result = await executeInstagramTool('INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', args, 'zulu', context);

  return result.id || result.data?.id;
};

/**
 * Publish a carousel
 * @param context - Optional multi-tenant context
 */
export const publishCarousel = async (containerId: string, context?: InstagramContext): Promise<string> => {
  const args: Record<string, unknown> = {
    creation_id: containerId
  };

  if (!context) {
    args.ig_user_id = getInstagramUserId();
  }

  const result = await executeInstagramTool('INSTAGRAM_CREATE_POST', args, 'zulu', context);

  return result.id || result.data?.id;
};

/**
 * Upload image and get HTTP URL for Instagram
 * Uses Vercel Blob for reliable public URL storage
 */
export const uploadImageForInstagram = async (dataUrl: string): Promise<string> => {
  // Use Vercel Blob for upload (handles both data URLs and HTTP URLs)
  return uploadDataUrlToBlob(dataUrl);
};

/**
 * Main function to publish to Instagram with progress tracking
 * @param imageUrl - Image URL or data URL to publish
 * @param caption - Post caption
 * @param contentType - Type of Instagram content
 * @param onProgress - Progress callback
 * @param context - Required multi-tenant context for user-specific tokens
 * @param carouselImageUrls - Optional array of URLs for carousel posts
 */
export const publishToInstagram = async (
  imageUrl: string,
  caption: string,
  contentType: InstagramContentType = 'photo',
  onProgress?: (progress: PublishProgress) => void,
  context?: InstagramContext,
  carouselImageUrls?: string[]
): Promise<InstagramPublishResult> => {
  // Require context - no fallback
  if (!context?.instagramAccountId || !context?.userId) {
    return {
      success: false,
      errorMessage: 'Conecte sua conta Instagram em Configurações → Integrações para publicar.'
    };
  }
  try {
    // Step 1: Check quota
    onProgress?.({ step: 'uploading_image', message: 'Verificando limite de publicacoes...', progress: 5 });
    const quota = await checkPublishingQuota(context);
    if (quota.remaining <= 0) {
      throw new Error(`Limite de 25 publicacoes/dia atingido. Restam ${quota.remaining}.`);
    }

    // Step 2: Upload image(s) to get HTTP URL(s)
    onProgress?.({ step: 'uploading_image', message: 'Fazendo upload da imagem...', progress: 15 });

    let containerId: string;
    let publishFn: (id: string, ctx?: InstagramContext) => Promise<string>;

    // Step 3: Create appropriate container based on content type
    onProgress?.({ step: 'creating_container', message: `Criando ${contentType}...`, progress: 30 });

    if (contentType === 'carousel' && carouselImageUrls && carouselImageUrls.length >= 2) {
      // Upload all carousel images
      const httpUrls: string[] = [];
      for (let i = 0; i < carouselImageUrls.length; i++) {
        onProgress?.({ step: 'uploading_image', message: `Fazendo upload ${i + 1}/${carouselImageUrls.length}...`, progress: 15 + (i * 10 / carouselImageUrls.length) });
        const httpUrl = await uploadImageForInstagram(carouselImageUrls[i]);
        httpUrls.push(httpUrl);
        console.debug(`[Rube MCP] Carousel image ${i + 1} uploaded: ${httpUrl}`);
      }
      containerId = await createCarouselContainer(httpUrls, caption, context);
      publishFn = publishCarousel;
    } else {
      // Single image - upload first
      const httpImageUrl = await uploadImageForInstagram(imageUrl);
      console.debug(`[Rube MCP] Image uploaded: ${httpImageUrl}`);

      if (contentType === 'story') {
        // Stories use media_type: 'STORIES'
        containerId = await createMediaContainer('story', httpImageUrl, caption, context);
        publishFn = publishContainer;
      } else {
        containerId = await createMediaContainer(
          contentType === 'reel' ? 'reel' : contentType === 'video' ? 'video' : 'photo',
          httpImageUrl,
          caption,
          context
        );
        publishFn = publishContainer;
      }
    }

    console.debug(`[Rube MCP] Container created: ${containerId}`);

    // Step 4: Poll for status until FINISHED
    onProgress?.({ step: 'checking_status', message: 'Processando midia...', progress: 45 });
    let status = 'IN_PROGRESS';
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout

    while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        status = await getContainerStatus(containerId, context);
      } catch (e) {
        // Status check might fail, continue polling
        console.warn('[Rube MCP] Status check failed, retrying...', e);
      }
      attempts++;
      onProgress?.({
        step: 'checking_status',
        message: `Processando midia... (${attempts}s)`,
        progress: 45 + (attempts / maxAttempts) * 25
      });
    }

    if (status === 'ERROR') {
      throw new Error('Instagram rejeitou a midia. Verifique formato e dimensoes.');
    }

    // Step 5: Publish
    onProgress?.({ step: 'publishing', message: 'Publicando no Instagram...', progress: 80 });
    const mediaId = await publishFn(containerId, context);
    console.debug(`[Rube MCP] Published! Media ID: ${mediaId}`);

    onProgress?.({ step: 'completed', message: 'Publicado com sucesso!', progress: 100 });
    return { success: true, mediaId };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error(`[Rube MCP] Error:`, error);
    onProgress?.({
      step: 'failed',
      message: errorMessage,
      progress: 0
    });
    return {
      success: false,
      errorMessage
    };
  }
};

/**
 * Get Instagram user info
 * @param context - Optional multi-tenant context
 */
export const getInstagramUserInfo = async (context?: InstagramContext): Promise<{ id: string; username: string }> => {
  try {
    const args: Record<string, unknown> = {};

    if (!context) {
      args.ig_user_id = getInstagramUserId();
    }

    const result = await executeInstagramTool('INSTAGRAM_GET_USER_INFO', args, 'zulu', context);
    return {
      id: result.id || getInstagramUserId(),
      username: result.username || getInstagramUsername()
    };
  } catch {
    return { id: getInstagramUserId(), username: getInstagramUsername() };
  }
};
