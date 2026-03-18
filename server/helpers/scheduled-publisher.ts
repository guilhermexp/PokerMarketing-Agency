/**
 * Scheduled Post Publisher
 * Checks for due posts and publishes them to Instagram via Rube MCP
 * Supports multi-tenant mode via instagram_account_id
 */

import { put } from "@vercel/blob";
import { validateContentType } from "../lib/validation/contentType.js";
import { getSql, DATABASE_URL } from "../lib/db.js";

// =============================================================================
// Types
// =============================================================================

/** Instagram account credentials from database */
interface InstagramCredentials {
  rube_token: string;
  instagram_user_id: string;
}

/** Resolved credentials for API calls */
interface ResolvedCredentials {
  token: string;
  instagramUserId: string;
}

/** Scheduled post row from database */
interface ScheduledPostRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  content_type: string;
  content_id: string | null;
  image_url: string;
  caption: string;
  hashtags: string[] | null;
  scheduled_date: string;
  scheduled_time: string;
  scheduled_timestamp: number;
  timezone: string;
  platforms: string;
  instagram_content_type: string | null;
  instagram_account_id: string | null;
  status: string;
  published_at: Date | null;
  error_message: string | null;
  instagram_media_id: string | null;
  instagram_container_id: string | null;
  publish_attempts: number | null;
  last_publish_attempt: Date | null;
  created_from: string | null;
  carousel_image_urls: string[] | null;
  created_at: Date;
  updated_at: Date;
}

/** Instagram account row from database */
interface InstagramAccountRow {
  id: string;
}

/** Result of publishing a post */
interface PublishResult {
  success: boolean;
  mediaId?: string;
  error?: string;
}

/** Result of publishing by ID */
interface PublishByIdResult {
  success: boolean;
  mediaId?: string;
  error?: string;
  alreadyPublished?: boolean;
  retryLater?: boolean;
}

/** Result of checking and publishing scheduled posts */
interface CheckAndPublishResult {
  published: number;
  failed: number;
  outsideHours?: boolean;
  skipped?: boolean;
  expired?: number;
  error?: string;
}

/** JSON-RPC content item */
interface RpcContentItem {
  type: string;
  text?: string;
}

/** JSON-RPC result structure */
interface RpcResult {
  content?: RpcContentItem[];
}

/** JSON-RPC response structure */
interface RpcResponse {
  result?: RpcResult;
  error?: string;
}

/** Rube tool response result */
interface RubeToolResult {
  response?: {
    error?: string;
    data?: unknown;
  };
  error?: string;
  data?: unknown;
}

/** Rube tool execution results */
interface RubeToolResults {
  results?: RubeToolResult[];
  data?: RubeToolResults;
}

/** Rube MCP response data */
interface RubeMcpData {
  data?: RubeToolResults;
  results?: RubeToolResult[];
}

/** Media container arguments */
interface MediaContainerArgs {
  [key: string]: string | undefined;
  ig_user_id: string;
  caption?: string;
  image_url?: string;
  video_url?: string;
  media_type?: string;
}

/** Carousel container arguments */
interface CarouselContainerArgs {
  [key: string]: string | string[] | undefined;
  ig_user_id: string;
  caption: string;
  child_image_urls?: string[];
  child_video_urls?: string[];
}

const RUBE_TOKEN = process.env.RUBE_TOKEN; // Fallback for legacy posts
const MCP_URL = 'https://rube.app/mcp';

/**
 * Generate unique JSON-RPC ID
 */
const generateId = (): string => `publisher_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Parse SSE response from Rube MCP
 */
const parseSSEResponse = (text: string): RubeMcpData => {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const json = JSON.parse(line.substring(6)) as RpcResponse;
        if (json.result?.content) {
          const textContent = json.result.content.find((c: RpcContentItem) => c.type === 'text');
          if (textContent?.text) {
            return JSON.parse(textContent.text) as RubeMcpData;
          }
        }
        return json as unknown as RubeMcpData;
      } catch (e) {
        console.error('[Publisher] Failed to parse SSE:', e);
      }
    }
  }
  throw new Error('No valid data in SSE response');
};

/**
 * Get Instagram account credentials from database
 */
async function getInstagramCredentials(instagramAccountId: string): Promise<InstagramCredentials | null> {
  if (!instagramAccountId) return null;

  try {
    const sql = getSql();
    const result = await sql`
      SELECT rube_token, instagram_user_id FROM instagram_accounts
      WHERE id = ${instagramAccountId} AND is_active = TRUE
      LIMIT 1
    ` as InstagramCredentials[];
    if (!result[0]) {
      console.error(`[Publisher] Instagram account ${instagramAccountId} not found or inactive`);
    }
    return result[0] || null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Publisher] DB error fetching Instagram credentials for ${instagramAccountId}:`, errorMessage);
    return null;
  }
}

/**
 * Call Rube MCP
 * @param toolName - The tool to call
 * @param args - Arguments for the tool
 * @param token - Optional custom token (for multi-tenant)
 */
async function callRubeMCP(
  toolName: string,
  args: Record<string, unknown>,
  token: string | undefined = RUBE_TOKEN
): Promise<RubeMcpData> {
  if (!token) {
    throw new Error('No Rube token available');
  }

  const request = {
    jsonrpc: '2.0',
    id: generateId(),
    method: 'tools/call',
    params: { name: toolName, arguments: args }
  };

  console.log(`[Publisher] Calling ${toolName}...`);

  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Rube authentication failed');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }
    throw new Error(`Rube MCP error: ${response.status}`);
  }

  const text = await response.text();
  const data = parseSSEResponse(text);

  return data;
}

/** Media container or carousel response with ID */
interface MediaContainerResponse {
  id?: string;
  creation_id?: string;
  container_id?: string;
  data?: { id?: string };
  status_code?: string;
  status?: string;
}

/**
 * Execute Instagram tool
 * @param toolSlug - The Instagram tool slug
 * @param args - Arguments for the tool
 * @param token - Optional custom token (for multi-tenant)
 */
async function executeInstagramTool(
  toolSlug: string,
  args: Record<string, unknown>,
  token: string | undefined = RUBE_TOKEN
): Promise<MediaContainerResponse> {
  const result = await callRubeMCP('RUBE_MULTI_EXECUTE_TOOL', {
    tools: [{
      tool_slug: toolSlug,
      arguments: args
    }],
    sync_response_to_workbench: false,
    memory: {},
    session_id: 'scheduled_publisher',
    thought: `Auto-publishing: ${toolSlug}`
  }, token);

  const nestedData = result?.data?.data as RubeToolResults | undefined;
  if (nestedData?.results && nestedData.results.length > 0) {
    const toolResult = nestedData.results[0];
    if (toolResult?.response?.error) {
      throw new Error(toolResult.response.error);
    }
    if (toolResult?.error) {
      throw new Error(toolResult.error);
    }
    return toolResult?.response?.data as MediaContainerResponse;
  }

  if (result.data?.results) {
    const toolResult = result.data.results[0];
    if (toolResult?.error) {
      throw new Error(toolResult.error);
    }
    return (toolResult?.response?.data || toolResult?.data || toolResult) as MediaContainerResponse;
  }

  return result as unknown as MediaContainerResponse;
}

/**
 * Ensure image URL is HTTP (upload data URLs to blob)
 */
async function ensureHttpUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('data:')) {
    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid data URL format');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    if (!mimeType || !base64Data) {
      throw new Error('Invalid data URL: missing MIME type or data');
    }

    // SECURITY: Validate content type BEFORE uploading to Vercel Blob
    // WHY: Data URLs can contain ANY content type, including malicious ones
    // - Attacker could craft data:text/html;base64,... with XSS payload
    // - When published to Instagram/stored in blob, could execute in user's browser
    // - validateContentType() rejects HTML, SVG, JavaScript, and executable MIME types
    // - Only safe static image/video formats pass validation
    validateContentType(mimeType);

    const buffer = Buffer.from(base64Data, 'base64');
    const extension = mimeType.split('/')[1] || 'png';
    const filename = `instagram/${Date.now()}.${extension}`;

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: mimeType,
    });

    return blob.url;
  }

  throw new Error('Unsupported image URL format');
}

/**
 * Create media container
 * @param contentType - Type of Instagram content (photo, video, reel, story)
 * @param mediaUrl - URL of the media
 * @param caption - Post caption
 * @param credentials - Resolved credentials with token and instagramUserId
 */
async function createMediaContainer(
  contentType: string,
  mediaUrl: string,
  caption: string,
  credentials: ResolvedCredentials
): Promise<string> {
  const { token, instagramUserId } = credentials;
  const args: MediaContainerArgs = {
    ig_user_id: instagramUserId,
  };

  if (contentType !== 'story') {
    args.caption = caption;
  }

  if (contentType === 'story') {
    args.image_url = mediaUrl;
    args.media_type = 'STORIES';
  } else if (contentType === 'reel') {
    args.video_url = mediaUrl;
    args.media_type = 'REELS';
  } else {
    args.image_url = mediaUrl;
  }

  const result = await executeInstagramTool('INSTAGRAM_CREATE_MEDIA_CONTAINER', args as Record<string, unknown>, token);
  const containerId = result?.id || result?.creation_id || result?.container_id || result?.data?.id;

  if (!containerId) {
    throw new Error(`Failed to create container: ${JSON.stringify(result)}`);
  }

  return containerId;
}

/**
 * Get container status
 * @param containerId - The media container ID
 * @param credentials - Resolved credentials with token
 */
async function getContainerStatus(
  containerId: string,
  credentials: ResolvedCredentials
): Promise<string> {
  const { token } = credentials;
  const result = await executeInstagramTool('INSTAGRAM_GET_POST_STATUS', {
    creation_id: containerId
  }, token);
  return result?.status_code || result?.status || 'IN_PROGRESS';
}

/**
 * Publish container
 * @param containerId - The media container ID
 * @param credentials - Resolved credentials with token and instagramUserId
 */
async function publishContainer(
  containerId: string,
  credentials: ResolvedCredentials
): Promise<string | undefined> {
  const { token, instagramUserId } = credentials;
  const result = await executeInstagramTool('INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', {
    ig_user_id: instagramUserId,
    creation_id: containerId
  }, token);
  return result?.id || result?.data?.id;
}

/**
 * Create carousel container with multiple images
 * Uses Rube's simplified API with child_image_urls
 * @param mediaUrls - Array of image URLs
 * @param caption - Post caption
 * @param credentials - Resolved credentials with token and instagramUserId
 */
async function createCarouselContainer(
  mediaUrls: string[],
  caption: string,
  credentials: ResolvedCredentials
): Promise<string> {
  const { token, instagramUserId } = credentials;

  console.log(`[Publisher] Creating carousel with ${mediaUrls.length} items...`);

  // Ensure all URLs are HTTP (upload data URLs to blob)
  const httpUrls: string[] = [];
  const videoUrls: string[] = [];

  for (let i = 0; i < mediaUrls.length; i++) {
    const url = mediaUrls[i];
    if (!url) {
      throw new Error(`Invalid media URL at index ${i}`);
    }
    const httpUrl = await ensureHttpUrl(url);
    const isVideo = httpUrl.includes('.mp4') || httpUrl.includes('.mov') || httpUrl.includes('video');

    if (isVideo) {
      videoUrls.push(httpUrl);
    } else {
      httpUrls.push(httpUrl);
    }
    console.log(`[Publisher] Prepared item ${i + 1}/${mediaUrls.length}: ${httpUrl.substring(0, 50)}...`);
  }

  if (httpUrls.length + videoUrls.length < 2) {
    throw new Error('Carousel requires at least 2 items');
  }

  // Use Rube's simplified carousel API with child_image_urls
  const carouselArgs: CarouselContainerArgs = {
    ig_user_id: instagramUserId,
    caption
  };

  if (httpUrls.length > 0) {
    carouselArgs.child_image_urls = httpUrls;
  }
  if (videoUrls.length > 0) {
    carouselArgs.child_video_urls = videoUrls;
  }

  console.log(`[Publisher] Creating carousel container with ${httpUrls.length} images and ${videoUrls.length} videos...`);
  const result = await executeInstagramTool('INSTAGRAM_CREATE_CAROUSEL_CONTAINER', carouselArgs as Record<string, unknown>, token);
  const carouselId = result?.id || result?.creation_id || result?.container_id || result?.data?.id;

  if (!carouselId) {
    throw new Error(`Failed to create carousel container: ${JSON.stringify(result)}`);
  }

  console.log(`[Publisher] Carousel container created: ${carouselId}`);
  return carouselId;
}

/**
 * Publish carousel using INSTAGRAM_CREATE_POST
 * @param containerId - Carousel container ID
 * @param credentials - Resolved credentials with token and instagramUserId
 */
async function publishCarousel(
  containerId: string,
  credentials: ResolvedCredentials
): Promise<string | undefined> {
  const { token, instagramUserId } = credentials;
  const result = await executeInstagramTool('INSTAGRAM_CREATE_POST', {
    ig_user_id: instagramUserId,
    creation_id: containerId
  }, token);
  return result?.id || result?.data?.id;
}

/**
 * Publish a single post
 * Fetches Instagram credentials from database if instagram_account_id is set
 */
async function publishPost(post: ScheduledPostRow): Promise<PublishResult> {
  try {
    console.log(`[Publisher] Publishing post ${post.id}...`);

    // Get credentials - from database if instagram_account_id, else try to auto-resolve
    let credentials: ResolvedCredentials;
    let instagramAccountId = post.instagram_account_id;

    // Auto-resolve: if no instagram_account_id, find active account for this user/org
    if (!instagramAccountId) {
      console.log('[Publisher] No instagram_account_id on post, auto-resolving...');
      try {
        const sql = getSql();
        const accounts = post.organization_id
          ? await sql`
              SELECT id FROM instagram_accounts
              WHERE is_active = TRUE AND organization_id = ${post.organization_id}
              ORDER BY connected_at DESC
              LIMIT 1
            ` as InstagramAccountRow[]
          : await sql`
              SELECT id FROM instagram_accounts
              WHERE is_active = TRUE AND (organization_id IS NULL OR organization_id = '')
              ORDER BY connected_at DESC
              LIMIT 1
            ` as InstagramAccountRow[];

        const firstAccount = accounts[0];
        if (firstAccount) {
          instagramAccountId = firstAccount.id;
          console.log(`[Publisher] Auto-resolved instagram account: ${instagramAccountId}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[Publisher] Failed to auto-resolve instagram account:', errorMessage);
      }
    }

    if (instagramAccountId) {
      const dbCredentials = await getInstagramCredentials(instagramAccountId);
      if (!dbCredentials) {
        throw new Error('Instagram account not found or inactive. Please reconnect in Settings → Integrations.');
      }
      credentials = {
        token: dbCredentials.rube_token,
        instagramUserId: dbCredentials.instagram_user_id
      };
      console.log(`[Publisher] Using user token for Instagram: ${credentials.instagramUserId}`);
    } else {
      // Legacy: no instagram_account_id and no active accounts - use global token
      if (!RUBE_TOKEN || !process.env.INSTAGRAM_USER_ID) {
        throw new Error('No Instagram account connected. Please connect in Settings → Integrations.');
      }
      credentials = {
        token: RUBE_TOKEN,
        instagramUserId: process.env.INSTAGRAM_USER_ID
      };
      console.log('[Publisher] Warning: Using legacy global token');
    }

    // Build caption with hashtags
    const hashtags = post.hashtags || [];
    const fullCaption = hashtags.length > 0
      ? `${post.caption}\n\n${hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ')}`
      : post.caption;

    // Check if this is a carousel post
    const isCarousel = post.instagram_content_type === 'carousel' &&
      post.carousel_image_urls &&
      post.carousel_image_urls.length > 1;

    let containerId: string;
    let isCarouselPost = false;

    if (isCarousel && post.carousel_image_urls) {
      // Create carousel container with all images
      console.log(`[Publisher] Creating carousel with ${post.carousel_image_urls.length} images...`);
      isCarouselPost = true;
      containerId = await createCarouselContainer(
        post.carousel_image_urls,
        fullCaption,
        credentials
      );
    } else {
      // Single image post - ensure HTTP URL
      const httpUrl = await ensureHttpUrl(post.image_url);
      console.log(`[Publisher] Image URL ready: ${httpUrl.substring(0, 50)}...`);

      // Create single media container
      containerId = await createMediaContainer(
        post.instagram_content_type || 'photo',
        httpUrl,
        fullCaption,
        credentials
      );
    }
    console.log(`[Publisher] Container created: ${containerId}`);

    // Wait for processing (max 60 seconds for single, 120 for carousel)
    const maxAttempts = isCarouselPost ? 120 : 60;
    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        status = await getContainerStatus(containerId, credentials);
      } catch {
        console.warn('[Publisher] Status check failed, retrying...');
      }
      attempts++;
    }

    if (status === 'ERROR') {
      throw new Error('Instagram rejected the media');
    }

    // Publish using appropriate method
    let mediaId: string | undefined;
    if (isCarouselPost) {
      mediaId = await publishCarousel(containerId, credentials);
    } else {
      mediaId = await publishContainer(containerId, credentials);
    }
    console.log(`[Publisher] Published! Media ID: ${mediaId}`);

    return { success: true, mediaId };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Publisher] Failed to publish post ${post.id}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Publish a single scheduled post by ID
 * Called by the exact-time job
 */
export async function publishScheduledPostById(
  postId: string,
  _userId: string
): Promise<PublishByIdResult> {
  if (!DATABASE_URL) {
    return { success: false, error: 'DATABASE_URL not configured' };
  }

  // Check publishing hours
  if (!isWithinPublishingHours()) {
    console.log(`[Publisher] Post ${postId} outside publishing hours, will retry via fallback`);
    return { success: false, error: 'Outside publishing hours', retryLater: true };
  }

  try {
    const sql = getSql();

    // Get the post
    const posts = await sql`
      SELECT * FROM scheduled_posts
      WHERE id = ${postId}
      LIMIT 1
    ` as ScheduledPostRow[];

    const post = posts[0];
    if (!post) {
      return { success: false, error: 'Post not found' };
    }

    // Check if already published or cancelled
    if (post.status === 'published') {
      return { success: true, alreadyPublished: true };
    }
    if (post.status === 'cancelled') {
      return { success: false, error: 'Post was cancelled' };
    }

    // Mark as publishing
    await sql`
      UPDATE scheduled_posts
      SET status = 'publishing',
          publish_attempts = COALESCE(publish_attempts, 0) + 1,
          last_publish_attempt = NOW()
      WHERE id = ${postId}
    `;

    // Publish
    const result = await publishPost(post);

    if (result.success) {
      await sql`
        UPDATE scheduled_posts
        SET status = 'published',
            published_at = NOW(),
            instagram_media_id = ${result.mediaId || null}
        WHERE id = ${postId}
      `;
      console.log(`[Publisher] Post ${postId} published successfully`);
      return { success: true, mediaId: result.mediaId };
    } else {
      const attempts = (post.publish_attempts || 0) + 1;
      const newStatus = attempts >= 3 ? 'failed' : 'scheduled';

      await sql`
        UPDATE scheduled_posts
        SET status = ${newStatus},
            error_message = ${result.error || null}
        WHERE id = ${postId}
      `;
      return { success: false, error: result.error };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Publisher] Error publishing post ${postId}:`, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Check if current time in Brasilia is within publishing hours (7:00 - 23:59)
 */
function isWithinPublishingHours(): boolean {
  const now = new Date();
  // Get current hour in Brasilia timezone (America/Sao_Paulo)
  const brasiliaHour = parseInt(
    now.toLocaleString('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false
    }),
    10
  );

  // Don't publish between 00:00 and 06:59 (before 7am)
  return brasiliaHour >= 7;
}

/**
 * Maximum age (ms) for a scheduled post to still be eligible for publishing.
 * Posts older than this are marked as 'failed' instead of being published,
 * preventing a flood of stale posts on every server restart.
 */
const MAX_POST_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Expired post row from UPDATE RETURNING */
interface ExpiredPostRow {
  id: string;
}

/**
 * Check and publish due posts
 * Called every 5 min by the BullMQ scheduler
 * Only runs between 7:00 and 23:59 Brasilia time
 */
export async function checkAndPublishScheduledPosts(): Promise<CheckAndPublishResult> {
  // Check if within publishing hours (7am - midnight Brasilia)
  if (!isWithinPublishingHours()) {
    return { published: 0, failed: 0, outsideHours: true };
  }

  if (!DATABASE_URL) {
    console.log('[Publisher] DATABASE_URL not configured, skipping');
    return { published: 0, failed: 0, skipped: true };
  }

  try {
    const sql = getSql();
    const nowMs = Date.now();
    const cutoffMs = nowMs - MAX_POST_AGE_MS;

    // Expire stale posts (scheduled > 24h ago) so they don't pile up
    const expired = await sql`
      UPDATE scheduled_posts
      SET status = 'failed',
          error_message = 'Missed scheduling window (> 24 h)'
      WHERE status = 'scheduled'
        AND scheduled_timestamp <= ${cutoffMs}
      RETURNING id
    ` as ExpiredPostRow[];
    if (expired.length > 0) {
      console.log(`[Publisher] Expired ${expired.length} stale post(s)`);
    }

    // Atomic claim: only grab posts still in 'scheduled' status
    // The WHERE status='scheduled' + UPDATE status='publishing' acts as a lock
    const duePosts = await sql`
      UPDATE scheduled_posts
      SET status = 'publishing',
          publish_attempts = COALESCE(publish_attempts, 0) + 1,
          last_publish_attempt = NOW()
      WHERE id IN (
        SELECT id FROM scheduled_posts
        WHERE status = 'scheduled'
          AND scheduled_timestamp <= ${nowMs}
          AND scheduled_timestamp > ${cutoffMs}
        ORDER BY scheduled_timestamp ASC
        LIMIT 5
      )
      RETURNING *
    ` as ScheduledPostRow[];

    if (duePosts.length === 0) {
      return { published: 0, failed: 0, expired: expired.length };
    }

    console.log(`[Publisher] Found ${duePosts.length} posts to publish`);

    let published = 0;
    let failed = 0;

    for (const post of duePosts) {
      const result = await publishPost(post);

      if (result.success) {
        await sql`
          UPDATE scheduled_posts
          SET status = 'published',
              published_at = NOW(),
              instagram_media_id = ${result.mediaId || null}
          WHERE id = ${post.id}
        `;
        published++;
      } else {
        const attempts = post.publish_attempts || 1;
        const newStatus = attempts >= 3 ? 'failed' : 'scheduled';

        await sql`
          UPDATE scheduled_posts
          SET status = ${newStatus},
              error_message = ${result.error || null}
          WHERE id = ${post.id}
        `;
        failed++;
      }

      // Small delay between posts
      if (duePosts.indexOf(post) < duePosts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`[Publisher] Done: ${published} published, ${failed} failed`);
    return { published, failed, expired: expired.length };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Publisher] Error:', error);
    return { published: 0, failed: 0, error: errorMessage };
  }
}