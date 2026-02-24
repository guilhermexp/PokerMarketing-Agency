/**
 * Scheduled Post Publisher
 * Checks for due posts and publishes them to Instagram via Rube MCP
 * Supports multi-tenant mode via instagram_account_id
 */

import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { validateContentType } from "../lib/validation/contentType.mjs";

const DATABASE_URL = process.env.DATABASE_URL;
const RUBE_TOKEN = process.env.RUBE_TOKEN; // Fallback for legacy posts
const MCP_URL = 'https://rube.app/mcp';

/**
 * Get database connection
 */
function getSql() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  return neon(DATABASE_URL);
}

/**
 * Generate unique JSON-RPC ID
 */
const generateId = () => `publisher_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Parse SSE response from Rube MCP
 */
const parseSSEResponse = (text) => {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const json = JSON.parse(line.substring(6));
        if (json.result?.content) {
          const textContent = json.result.content.find((c) => c.type === 'text');
          if (textContent?.text) {
            return JSON.parse(textContent.text);
          }
        }
        return json;
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
async function getInstagramCredentials(instagramAccountId) {
  if (!instagramAccountId) return null;

  try {
    const sql = getSql();
    const result = await sql`
      SELECT rube_token, instagram_user_id FROM instagram_accounts
      WHERE id = ${instagramAccountId} AND is_active = TRUE
      LIMIT 1
    `;
    return result[0] || null;
  } catch (error) {
    console.error('[Publisher] Failed to get Instagram credentials:', error);
    return null;
  }
}

/**
 * Call Rube MCP
 * @param token - Optional custom token (for multi-tenant)
 */
async function callRubeMCP(toolName, args, token = RUBE_TOKEN) {
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

  if (data.error) {
    throw new Error(`Rube error: ${data.error}`);
  }

  return data;
}

/**
 * Execute Instagram tool
 * @param token - Optional custom token (for multi-tenant)
 */
async function executeInstagramTool(toolSlug, args, token = RUBE_TOKEN) {
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

  const nestedData = result?.data?.data;
  if (nestedData?.results && nestedData.results.length > 0) {
    const toolResult = nestedData.results[0];
    if (toolResult?.response?.error) {
      throw new Error(toolResult.response.error);
    }
    if (toolResult?.error) {
      throw new Error(toolResult.error);
    }
    return toolResult?.response?.data;
  }

  if (result.data?.results) {
    const toolResult = result.data.results[0];
    if (toolResult?.error) {
      throw new Error(toolResult.error);
    }
    return toolResult?.response?.data || toolResult?.data || toolResult;
  }

  return result;
}

/**
 * Ensure image URL is HTTP (upload data URLs to blob)
 */
async function ensureHttpUrl(imageUrl) {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('data:')) {
    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid data URL format');
    }

    const mimeType = matches[1];

    // SECURITY: Validate content type BEFORE uploading to Vercel Blob
    // WHY: Data URLs can contain ANY content type, including malicious ones
    // - Attacker could craft data:text/html;base64,... with XSS payload
    // - When published to Instagram/stored in blob, could execute in user's browser
    // - validateContentType() rejects HTML, SVG, JavaScript, and executable MIME types
    // - Only safe static image/video formats pass validation
    validateContentType(mimeType);

    const base64Data = matches[2];
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
 * @param credentials - { token, instagramUserId }
 */
async function createMediaContainer(contentType, mediaUrl, caption, credentials) {
  const { token, instagramUserId } = credentials;
  const args = {
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

  const result = await executeInstagramTool('INSTAGRAM_CREATE_MEDIA_CONTAINER', args, token);
  const containerId = result?.id || result?.creation_id || result?.container_id || result?.data?.id;

  if (!containerId) {
    throw new Error(`Failed to create container: ${JSON.stringify(result)}`);
  }

  return containerId;
}

/**
 * Get container status
 * @param credentials - { token }
 */
async function getContainerStatus(containerId, credentials) {
  const { token } = credentials;
  const result = await executeInstagramTool('INSTAGRAM_GET_POST_STATUS', {
    creation_id: containerId
  }, token);
  return result?.status_code || result?.status || 'IN_PROGRESS';
}

/**
 * Publish container
 * @param credentials - { token, instagramUserId }
 */
async function publishContainer(containerId, credentials) {
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
 * @param credentials - { token, instagramUserId }
 */
async function createCarouselContainer(mediaUrls, caption, credentials) {
  const { token, instagramUserId } = credentials;

  console.log(`[Publisher] Creating carousel with ${mediaUrls.length} items...`);

  // Ensure all URLs are HTTP (upload data URLs to blob)
  const httpUrls = [];
  const videoUrls = [];

  for (let i = 0; i < mediaUrls.length; i++) {
    const url = mediaUrls[i];
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
  const carouselArgs = {
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
  const result = await executeInstagramTool('INSTAGRAM_CREATE_CAROUSEL_CONTAINER', carouselArgs, token);
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
 * @param credentials - { token, instagramUserId }
 */
async function publishCarousel(containerId, credentials) {
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
async function publishPost(post) {
  try {
    console.log(`[Publisher] Publishing post ${post.id}...`);

    // Get credentials - from database if instagram_account_id, else try to auto-resolve
    let credentials;
    let instagramAccountId = post.instagram_account_id;

    // Auto-resolve: if no instagram_account_id, find active account for this user/org
    if (!instagramAccountId) {
      console.log('[Publisher] No instagram_account_id on post, auto-resolving...');
      try {
        const sql = getSql();
        const orgFilter = post.organization_id
          ? sql`AND organization_id = ${post.organization_id}`
          : sql`AND (organization_id IS NULL OR organization_id = '')`;

        const accounts = await sql`
          SELECT id FROM instagram_accounts
          WHERE is_active = TRUE
            ${orgFilter}
          ORDER BY connected_at DESC
          LIMIT 1
        `;

        if (accounts.length > 0) {
          instagramAccountId = accounts[0].id;
          console.log(`[Publisher] Auto-resolved instagram account: ${instagramAccountId}`);
        }
      } catch (err) {
        console.error('[Publisher] Failed to auto-resolve instagram account:', err);
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
      if (!RUBE_TOKEN) {
        throw new Error('No Instagram account connected. Please connect in Settings → Integrations.');
      }
      credentials = {
        token: RUBE_TOKEN,
        instagramUserId: process.env.INSTAGRAM_USER_ID || '25281402468195799'
      };
      console.log('[Publisher] Warning: Using legacy global token');
    }

    // Build caption with hashtags
    const hashtags = post.hashtags || [];
    const fullCaption = hashtags.length > 0
      ? `${post.caption}\n\n${hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}`
      : post.caption;

    // Check if this is a carousel post
    const isCarousel = post.instagram_content_type === 'carousel' &&
      post.carousel_image_urls &&
      post.carousel_image_urls.length > 1;

    let containerId;
    let isCarouselPost = false;

    if (isCarousel) {
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
      } catch (e) {
        console.warn('[Publisher] Status check failed, retrying...');
      }
      attempts++;
    }

    if (status === 'ERROR') {
      throw new Error('Instagram rejected the media');
    }

    // Publish using appropriate method
    let mediaId;
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
export async function publishScheduledPostById(postId, userId) {
  if (!DATABASE_URL) {
    return { success: false, error: 'DATABASE_URL not configured' };
  }

  if (!RUBE_TOKEN) {
    return { success: false, error: 'RUBE_TOKEN not configured' };
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
    `;

    if (posts.length === 0) {
      return { success: false, error: 'Post not found' };
    }

    const post = posts[0];

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
    console.error(`[Publisher] Error publishing post ${postId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if current time in Brasilia is within publishing hours (7:00 - 23:59)
 */
function isWithinPublishingHours() {
  const now = new Date();
  // Get current hour in Brasilia timezone (America/Sao_Paulo)
  const brasiliaHour = parseInt(
    now.toLocaleString('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false
    })
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

/**
 * Check and publish due posts
 * Called every 5 min by the BullMQ scheduler
 * Only runs between 7:00 and 23:59 Brasilia time
 */
export async function checkAndPublishScheduledPosts() {
  // Check if within publishing hours (7am - midnight Brasilia)
  if (!isWithinPublishingHours()) {
    return { published: 0, failed: 0, outsideHours: true };
  }

  if (!DATABASE_URL) {
    console.log('[Publisher] DATABASE_URL not configured, skipping');
    return { published: 0, failed: 0, skipped: true };
  }

  if (!RUBE_TOKEN) {
    console.log('[Publisher] RUBE_TOKEN not configured, skipping');
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
    `;
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
    `;

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
    console.error('[Publisher] Error:', error);
    return { published: 0, failed: 0, error: error.message };
  }
}
