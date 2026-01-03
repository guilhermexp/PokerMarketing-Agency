/**
 * Scheduled Post Publisher
 * Checks for due posts and publishes them to Instagram via Rube MCP
 */

import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";

const DATABASE_URL = process.env.DATABASE_URL;
const RUBE_TOKEN = process.env.RUBE_TOKEN;
const MCP_URL = 'https://rube.app/mcp';
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID || '25281402468195799';

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
 * Call Rube MCP
 */
async function callRubeMCP(toolName, args) {
  if (!RUBE_TOKEN) {
    throw new Error('RUBE_TOKEN not configured');
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
      'Authorization': `Bearer ${RUBE_TOKEN}`,
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
 */
async function executeInstagramTool(toolSlug, args) {
  const result = await callRubeMCP('RUBE_MULTI_EXECUTE_TOOL', {
    tools: [{
      tool_slug: toolSlug,
      arguments: args
    }],
    sync_response_to_workbench: false,
    memory: {},
    session_id: 'scheduled_publisher',
    thought: `Auto-publishing: ${toolSlug}`
  });

  const nestedData = result?.data?.data;
  if (nestedData?.results && nestedData.results.length > 0) {
    const toolResult = nestedData.results[0];
    if (toolResult?.response?.error) {
      throw new Error(toolResult.response.error);
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
 */
async function createMediaContainer(contentType, mediaUrl, caption) {
  const args = {
    ig_user_id: INSTAGRAM_USER_ID,
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

  const result = await executeInstagramTool('INSTAGRAM_CREATE_MEDIA_CONTAINER', args);
  const containerId = result?.id || result?.creation_id || result?.container_id || result?.data?.id;

  if (!containerId) {
    throw new Error(`Failed to create container: ${JSON.stringify(result)}`);
  }

  return containerId;
}

/**
 * Get container status
 */
async function getContainerStatus(containerId) {
  const result = await executeInstagramTool('INSTAGRAM_GET_POST_STATUS', {
    creation_id: containerId
  });
  return result?.status_code || result?.status || 'IN_PROGRESS';
}

/**
 * Publish container
 */
async function publishContainer(containerId) {
  const result = await executeInstagramTool('INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', {
    ig_user_id: INSTAGRAM_USER_ID,
    creation_id: containerId
  });
  return result?.id || result?.data?.id;
}

/**
 * Publish a single post
 */
async function publishPost(post) {
  try {
    console.log(`[Publisher] Publishing post ${post.id}...`);

    // Ensure HTTP URL
    const httpUrl = await ensureHttpUrl(post.image_url);
    console.log(`[Publisher] Image URL ready: ${httpUrl.substring(0, 50)}...`);

    // Build caption with hashtags
    const hashtags = post.hashtags || [];
    const fullCaption = hashtags.length > 0
      ? `${post.caption}\n\n${hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}`
      : post.caption;

    // Create container
    const containerId = await createMediaContainer(
      post.instagram_content_type || 'photo',
      httpUrl,
      fullCaption
    );
    console.log(`[Publisher] Container created: ${containerId}`);

    // Wait for processing (max 60 seconds)
    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        status = await getContainerStatus(containerId);
      } catch (e) {
        console.warn('[Publisher] Status check failed, retrying...');
      }
      attempts++;
    }

    if (status === 'ERROR') {
      throw new Error('Instagram rejected the media');
    }

    // Publish
    const mediaId = await publishContainer(containerId);
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
 * Check and publish due posts
 * Called every minute by the BullMQ scheduler
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
    const nowMs = Date.now(); // scheduled_timestamp is BIGINT (milliseconds)

    // Get posts due for publishing
    const duePosts = await sql`
      SELECT * FROM scheduled_posts
      WHERE status = 'scheduled'
        AND scheduled_timestamp <= ${nowMs}
      ORDER BY scheduled_timestamp ASC
      LIMIT 5
    `;

    if (duePosts.length === 0) {
      return { published: 0, failed: 0 };
    }

    console.log(`[Publisher] Found ${duePosts.length} posts to publish`);

    let published = 0;
    let failed = 0;

    for (const post of duePosts) {
      // Mark as publishing
      await sql`
        UPDATE scheduled_posts
        SET status = 'publishing',
            publish_attempts = COALESCE(publish_attempts, 0) + 1,
            last_publish_attempt = NOW()
        WHERE id = ${post.id}
      `;

      // Publish
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
        // If failed 3+ times, mark as failed permanently
        const attempts = (post.publish_attempts || 0) + 1;
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
    return { published, failed };

  } catch (error) {
    console.error('[Publisher] Error:', error);
    return { published: 0, failed: 0, error: error.message };
  }
}
