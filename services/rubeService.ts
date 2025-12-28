/**
 * Rube MCP Service
 * Handles communication with Rube MCP for Instagram publishing
 * Uses JSON-RPC 2.0 protocol over HTTP
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
// Use proxy in dev/browser to avoid CORS, direct URL in prod/serverless
const MCP_URL = '/api/rube';
const INSTAGRAM_USER_ID = '25281402468195799'; // cpcpokeronline

// Get token - only needed for serverless function, browser uses proxy
const getToken = () => getEnv("VITE_RUBE_TOKEN") || getEnv("RUBE_TOKEN");

// Generate unique JSON-RPC ID
const generateId = () => `rube_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

interface RubeMCPResponse {
  jsonrpc: '2.0';
  id: string;
  result?: {
    content: Array<{ type: 'text'; text: string }>;
  };
  error?: {
    code: number;
    message: string;
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
 * Check if Rube is configured
 */
export const isRubeConfigured = (): boolean => {
  return Boolean(getToken());
};

/**
 * Parse SSE response from Rube MCP
 */
const parseSSEResponse = (text: string): any => {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const json = JSON.parse(line.substring(6));
        if (json.result?.content) {
          const textContent = json.result.content.find((c: any) => c.type === 'text');
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
  throw new Error('No valid data in SSE response');
};

/**
 * Core MCP call function
 */
export const callRubeMCP = async (
  toolName: string,
  args: Record<string, unknown>
): Promise<any> => {
  const request: RubeMCPRequest = {
    jsonrpc: '2.0',
    id: generateId(),
    method: 'tools/call',
    params: { name: toolName, arguments: args }
  };

  console.log(`[Rube MCP] Calling ${toolName}...`, args);

  // Uses proxy which adds Authorization header
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Autenticacao Rube falhou. Verifique seu RUBE_TOKEN.');
    }
    if (response.status === 429) {
      throw new Error('Limite de publicacoes atingido (25/dia). Tente novamente mais tarde.');
    }
    throw new Error(`Erro Rube MCP: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const data = parseSSEResponse(text);

  console.log(`[Rube MCP] Response:`, data);

  if (data.error) {
    throw new Error(`Erro Rube MCP: ${data.error}`);
  }

  return data;
};

/**
 * Execute a tool via RUBE_MULTI_EXECUTE_TOOL
 */
export const executeInstagramTool = async (
  toolSlug: string,
  args: Record<string, unknown>,
  sessionId: string = 'zulu'
): Promise<any> => {
  const result = await callRubeMCP('RUBE_MULTI_EXECUTE_TOOL', {
    tools: [{
      tool_slug: toolSlug,
      arguments: args
    }],
    sync_response_to_workbench: false,
    memory: {},
    session_id: sessionId,
    thought: `Executing ${toolSlug} for Instagram publishing`
  });

  // Parse the deeply nested Rube MCP response
  // Structure: result.data.data.results[0].response.data
  console.log(`[Rube MCP] Full response for ${toolSlug}:`, JSON.stringify(result, null, 2));

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
    console.log(`[Rube MCP] Extracted data for ${toolSlug}:`, JSON.stringify(actualData, null, 2));
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
 */
export const checkPublishingQuota = async (): Promise<PublishingQuota> => {
  try {
    const result = await executeInstagramTool('INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT', {
      ig_user_id: INSTAGRAM_USER_ID,
      fields: 'quota_usage,config'
    });

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
 */
export const createMediaContainer = async (
  contentType: 'photo' | 'video' | 'reel' | 'story',
  mediaUrl: string,
  caption: string
): Promise<string> => {
  const args: Record<string, unknown> = {
    ig_user_id: INSTAGRAM_USER_ID,
  };

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

  const result = await executeInstagramTool('INSTAGRAM_CREATE_MEDIA_CONTAINER', args);

  console.log('[Rube MCP] createMediaContainer result:', JSON.stringify(result, null, 2));

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

  console.log(`[Rube MCP] Container ID found: ${containerId}`);
  return containerId;
};

/**
 * Create carousel container with multiple items
 */
export const createCarouselContainer = async (
  mediaUrls: string[],
  caption: string
): Promise<string> => {
  // First, create individual carousel items
  const itemIds: string[] = [];

  for (const url of mediaUrls) {
    const isVideo = url.includes('.mp4') || url.includes('.mov') || url.includes('video');
    const args: Record<string, unknown> = {
      ig_user_id: INSTAGRAM_USER_ID,
      content_type: 'carousel_item',
      is_carousel_item: true
    };

    if (isVideo) {
      args.video_url = url;
    } else {
      args.image_url = url;
    }

    const result = await executeInstagramTool('INSTAGRAM_CREATE_MEDIA_CONTAINER', args);
    const itemId = result.id || result.data?.id;
    if (itemId) {
      itemIds.push(itemId);
    }
  }

  if (itemIds.length === 0) {
    throw new Error('Falha ao criar itens do carousel');
  }

  // Now create the carousel container
  const result = await executeInstagramTool('INSTAGRAM_CREATE_CAROUSEL_CONTAINER', {
    ig_user_id: INSTAGRAM_USER_ID,
    caption: caption,
    children: itemIds
  });

  return result.id || result.data?.id;
};

/**
 * Check container processing status
 */
export const getContainerStatus = async (containerId: string): Promise<string> => {
  const result = await executeInstagramTool('INSTAGRAM_GET_POST_STATUS', {
    creation_id: containerId
  });

  return result.status_code || result.data?.status_code || result.status || 'IN_PROGRESS';
};

/**
 * Publish a container (photo, video, reel)
 */
export const publishContainer = async (containerId: string): Promise<string> => {
  const result = await executeInstagramTool('INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', {
    ig_user_id: INSTAGRAM_USER_ID,
    creation_id: containerId
  });

  return result.id || result.data?.id;
};

/**
 * Publish a carousel
 */
export const publishCarousel = async (containerId: string): Promise<string> => {
  const result = await executeInstagramTool('INSTAGRAM_CREATE_POST', {
    ig_user_id: INSTAGRAM_USER_ID,
    creation_id: containerId
  });

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
 */
export const publishToInstagram = async (
  imageUrl: string,
  caption: string,
  contentType: InstagramContentType = 'photo',
  onProgress?: (progress: PublishProgress) => void
): Promise<InstagramPublishResult> => {
  try {
    // Step 1: Check quota
    onProgress?.({ step: 'uploading_image', message: 'Verificando limite de publicacoes...', progress: 5 });
    const quota = await checkPublishingQuota();
    if (quota.remaining <= 0) {
      throw new Error(`Limite de 25 publicacoes/dia atingido. Restam ${quota.remaining}.`);
    }

    // Step 2: Upload image to get HTTP URL
    onProgress?.({ step: 'uploading_image', message: 'Fazendo upload da imagem...', progress: 15 });
    const httpImageUrl = await uploadImageForInstagram(imageUrl);
    console.log(`[Rube MCP] Image uploaded: ${httpImageUrl}`);

    let containerId: string;
    let publishFn: (id: string) => Promise<string>;

    // Step 3: Create appropriate container based on content type
    onProgress?.({ step: 'creating_container', message: `Criando ${contentType}...`, progress: 30 });

    if (contentType === 'carousel') {
      // For carousel, we need multiple URLs - for now just use single image
      containerId = await createCarouselContainer([httpImageUrl], caption);
      publishFn = publishCarousel;
    } else if (contentType === 'story') {
      // Stories use media_type: 'STORIES'
      containerId = await createMediaContainer('story', httpImageUrl, caption);
      publishFn = publishContainer;
    } else {
      containerId = await createMediaContainer(
        contentType === 'reel' ? 'reel' : contentType === 'video' ? 'video' : 'photo',
        httpImageUrl,
        caption
      );
      publishFn = publishContainer;
    }

    console.log(`[Rube MCP] Container created: ${containerId}`);

    // Step 4: Poll for status until FINISHED
    onProgress?.({ step: 'checking_status', message: 'Processando midia...', progress: 45 });
    let status = 'IN_PROGRESS';
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout

    while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        status = await getContainerStatus(containerId);
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
    const mediaId = await publishFn(containerId);
    console.log(`[Rube MCP] Published! Media ID: ${mediaId}`);

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
 */
export const getInstagramUserInfo = async (): Promise<{ id: string; username: string }> => {
  try {
    const result = await executeInstagramTool('INSTAGRAM_GET_USER_INFO', {
      ig_user_id: INSTAGRAM_USER_ID
    });
    return {
      id: result.id || INSTAGRAM_USER_ID,
      username: result.username || 'cpcpokeronline'
    };
  } catch {
    return { id: INSTAGRAM_USER_ID, username: 'cpcpokeronline' };
  }
};
