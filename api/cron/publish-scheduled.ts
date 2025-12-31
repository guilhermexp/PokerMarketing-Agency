/**
 * Vercel Cron Job - Auto-publish Scheduled Posts
 * Runs every 5 minutes to check and publish due posts
 * Cron schedule: every 5 minutes
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const RUBE_TOKEN = process.env.RUBE_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const MCP_URL = 'https://rube.app/mcp';
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID || '25281402468195799';

// Types
interface ScheduledPost {
  id: string;
  user_id: string;
  content_type: string;
  content_id: string | null;
  image_url: string;
  caption: string;
  hashtags: string[];
  scheduled_date: string;
  scheduled_time: string;
  scheduled_timestamp: number;
  timezone: string;
  platforms: string;
  instagram_content_type: string;
  status: string;
  publish_attempts: number;
}

interface PublishResult {
  postId: string;
  success: boolean;
  mediaId?: string;
  error?: string;
}

// Get database connection
function getSql() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  return neon(DATABASE_URL);
}

// Generate unique JSON-RPC ID
const generateId = () => `cron_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Parse SSE response from Rube MCP
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
        console.error('[Cron] Failed to parse SSE response:', e);
      }
    }
  }
  throw new Error('No valid data in SSE response');
};

// Call Rube MCP directly (serverless version)
async function callRubeMCP(toolName: string, args: Record<string, unknown>): Promise<any> {
  const request = {
    jsonrpc: '2.0',
    id: generateId(),
    method: 'tools/call',
    params: { name: toolName, arguments: args }
  };

  console.log(`[Cron] Calling ${toolName}...`);

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
      throw new Error('Rate limit exceeded (25/day)');
    }
    throw new Error(`Rube MCP error: ${response.status}`);
  }

  const text = await response.text();
  const data = parseSSEResponse(text);

  if (data.error) {
    throw new Error(`Rube MCP error: ${data.error}`);
  }

  return data;
}

// Execute Instagram tool
async function executeInstagramTool(toolSlug: string, args: Record<string, unknown>): Promise<any> {
  const result = await callRubeMCP('RUBE_MULTI_EXECUTE_TOOL', {
    tools: [{
      tool_slug: toolSlug,
      arguments: args
    }],
    sync_response_to_workbench: false,
    memory: {},
    session_id: 'cron_publisher',
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

// Upload image to Vercel Blob (if it's a data URL)
async function ensureHttpUrl(imageUrl: string): Promise<string> {
  // If already HTTP URL, return as is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  // If data URL, upload to Vercel Blob
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

// Create media container
async function createMediaContainer(
  contentType: string,
  mediaUrl: string,
  caption: string
): Promise<string> {
  const args: Record<string, unknown> = {
    ig_user_id: INSTAGRAM_USER_ID,
  };

  if (contentType !== 'story') {
    args.caption = caption;
  }

  if (contentType === 'story') {
    args.image_url = mediaUrl;
    args.media_type = 'STORIES';
  } else if (contentType === 'photo') {
    args.image_url = mediaUrl;
  } else if (contentType === 'reel') {
    args.video_url = mediaUrl;
    args.media_type = 'REELS';
  } else {
    args.image_url = mediaUrl;
  }

  const result = await executeInstagramTool('INSTAGRAM_CREATE_MEDIA_CONTAINER', args);

  const containerId = result?.id
    || result?.data?.id
    || result?.creation_id
    || result?.container_id;

  if (!containerId) {
    throw new Error(`Failed to create container: ${JSON.stringify(result)}`);
  }

  return containerId;
}

// Get container status
async function getContainerStatus(containerId: string): Promise<string> {
  const result = await executeInstagramTool('INSTAGRAM_GET_POST_STATUS', {
    creation_id: containerId
  });

  return result?.status_code || result?.data?.status_code || result?.status || 'IN_PROGRESS';
}

// Publish container
async function publishContainer(containerId: string): Promise<string> {
  const result = await executeInstagramTool('INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', {
    ig_user_id: INSTAGRAM_USER_ID,
    creation_id: containerId
  });

  return result?.id || result?.data?.id;
}

// Publish a single post
async function publishPost(post: ScheduledPost): Promise<PublishResult> {
  try {
    console.log(`[Cron] Publishing post ${post.id}...`);

    // Ensure we have an HTTP URL for Instagram
    const httpUrl = await ensureHttpUrl(post.image_url);
    console.log(`[Cron] Image URL ready: ${httpUrl.substring(0, 50)}...`);

    // Create caption with hashtags
    const fullCaption = post.hashtags && post.hashtags.length > 0
      ? `${post.caption}\n\n${post.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}`
      : post.caption;

    // Create container
    const containerId = await createMediaContainer(
      post.instagram_content_type || 'photo',
      httpUrl,
      fullCaption
    );
    console.log(`[Cron] Container created: ${containerId}`);

    // Wait for processing (max 60 seconds)
    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        status = await getContainerStatus(containerId);
      } catch (e) {
        console.warn('[Cron] Status check failed, retrying...');
      }
      attempts++;
    }

    if (status === 'ERROR') {
      throw new Error('Instagram rejected the media');
    }

    // Publish
    const mediaId = await publishContainer(containerId);
    console.log(`[Cron] Published! Media ID: ${mediaId}`);

    return {
      postId: post.id,
      success: true,
      mediaId
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Cron] Failed to publish post ${post.id}:`, errorMessage);
    return {
      postId: post.id,
      success: false,
      error: errorMessage
    };
  }
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret - Vercel sends Authorization header for cron jobs
  const authHeader = req.headers.authorization;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';

  // Allow: Vercel cron, or manual call with correct secret
  if (!isVercelCron && CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    console.log('[Cron] Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check required config
  if (!DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }
  if (!RUBE_TOKEN) {
    return res.status(500).json({ error: 'RUBE_TOKEN not configured' });
  }

  console.log('[Cron] Starting scheduled post check...');

  try {
    const sql = getSql();
    const now = Math.floor(Date.now() / 1000);

    // Get posts that are due (scheduled_timestamp <= now and status = 'scheduled')
    const duePosts = await sql`
      SELECT * FROM scheduled_posts
      WHERE status = 'scheduled'
        AND scheduled_timestamp <= ${now}
      ORDER BY scheduled_timestamp ASC
      LIMIT 5
    ` as ScheduledPost[];

    console.log(`[Cron] Found ${duePosts.length} posts to publish`);

    if (duePosts.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No posts due for publishing',
        processed: 0
      });
    }

    const results: PublishResult[] = [];

    for (const post of duePosts) {
      // Mark as publishing
      await sql`
        UPDATE scheduled_posts
        SET status = 'publishing',
            publish_attempts = COALESCE(publish_attempts, 0) + 1,
            last_publish_attempt = ${now}
        WHERE id = ${post.id}
      `;

      // Publish
      const result = await publishPost(post);
      results.push(result);

      // Update status based on result
      if (result.success) {
        await sql`
          UPDATE scheduled_posts
          SET status = 'published',
              published_at = ${now},
              instagram_media_id = ${result.mediaId || null}
          WHERE id = ${post.id}
        `;
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
      }

      // Small delay between posts to avoid rate limiting
      if (duePosts.indexOf(post) < duePosts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[Cron] Completed: ${successful} published, ${failed} failed`);

    return res.status(200).json({
      success: true,
      message: `Processed ${results.length} posts`,
      processed: results.length,
      successful,
      failed,
      results
    });

  } catch (error) {
    console.error('[Cron] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
