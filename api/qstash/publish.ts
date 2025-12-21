/**
 * QStash Callback Handler - Publish Scheduled Post
 * This endpoint is called by QStash at the scheduled time to publish a post
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Receiver } from '@upstash/qstash';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const RUBE_TOKEN = process.env.RUBE_TOKEN;
const MCP_URL = 'https://rube.app/mcp';
const INSTAGRAM_USER_ID = '25281402468195799';

// Initialize QStash Receiver for signature verification
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
});

// Types
interface PublishPayload {
  postId: string;
  userId: string;
}

// Get database connection
function getSql() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');
  return neon(DATABASE_URL);
}

// Generate unique JSON-RPC ID
const generateId = () => `qstash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
        console.error('[QStash] Failed to parse SSE:', e);
      }
    }
  }
  throw new Error('No valid data in SSE response');
};

// Call Rube MCP
async function callRubeMCP(toolName: string, args: Record<string, unknown>): Promise<any> {
  const request = {
    jsonrpc: '2.0',
    id: generateId(),
    method: 'tools/call',
    params: { name: toolName, arguments: args }
  };

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
    throw new Error(`Rube MCP error: ${response.status}`);
  }

  const text = await response.text();
  const data = parseSSEResponse(text);
  if (data.error) throw new Error(`Rube error: ${data.error}`);
  return data;
}

// Execute Instagram tool
async function executeInstagramTool(toolSlug: string, args: Record<string, unknown>): Promise<any> {
  const result = await callRubeMCP('RUBE_MULTI_EXECUTE_TOOL', {
    tools: [{ tool_slug: toolSlug, arguments: args }],
    sync_response_to_workbench: false,
    memory: {},
    session_id: 'qstash_publisher',
    thought: `Auto-publishing: ${toolSlug}`
  });

  const nestedData = result?.data?.data;
  if (nestedData?.results?.[0]) {
    const toolResult = nestedData.results[0];
    if (toolResult?.response?.error) throw new Error(toolResult.response.error);
    return toolResult?.response?.data;
  }
  return result;
}

// Upload image to Vercel Blob if needed
async function ensureHttpUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  if (imageUrl.startsWith('data:')) {
    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid data URL');

    const [, mimeType, base64Data] = matches;
    const buffer = Buffer.from(base64Data, 'base64');
    const extension = mimeType.split('/')[1] || 'png';

    const blob = await put(`instagram/${Date.now()}.${extension}`, buffer, {
      access: 'public',
      contentType: mimeType,
    });
    return blob.url;
  }

  throw new Error('Unsupported image URL format');
}

// Create media container
async function createMediaContainer(contentType: string, mediaUrl: string, caption: string): Promise<string> {
  const args: Record<string, unknown> = { ig_user_id: INSTAGRAM_USER_ID };

  if (contentType !== 'story') args.caption = caption;

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
  const containerId = result?.id || result?.creation_id || result?.container_id;
  if (!containerId) throw new Error('Failed to create container');
  return containerId;
}

// Get container status
async function getContainerStatus(containerId: string): Promise<string> {
  const result = await executeInstagramTool('INSTAGRAM_GET_POST_STATUS', { creation_id: containerId });
  return result?.status_code || result?.status || 'IN_PROGRESS';
}

// Publish container
async function publishContainer(containerId: string): Promise<string> {
  const result = await executeInstagramTool('INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', {
    ig_user_id: INSTAGRAM_USER_ID,
    creation_id: containerId
  });
  return result?.id || result?.data?.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify QStash signature
  const signature = req.headers['upstash-signature'] as string;
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  try {
    // Skip verification in development or if keys not set
    if (process.env.QSTASH_CURRENT_SIGNING_KEY) {
      await receiver.verify({
        signature,
        body,
        url: `https://${req.headers.host}${req.url}`,
      });
    }
  } catch (e) {
    console.error('[QStash] Signature verification failed:', e);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Check config
  if (!DATABASE_URL || !RUBE_TOKEN) {
    return res.status(500).json({ error: 'Missing configuration' });
  }

  try {
    const payload: PublishPayload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { postId, userId } = payload;

    if (!postId || !userId) {
      return res.status(400).json({ error: 'Missing postId or userId' });
    }

    console.log(`[QStash] Publishing post ${postId} for user ${userId}`);

    const sql = getSql();
    const now = Math.floor(Date.now() / 1000);

    // Get the post
    const posts = await sql`
      SELECT * FROM scheduled_posts
      WHERE id = ${postId} AND user_id = ${userId}
      LIMIT 1
    `;

    if (posts.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = posts[0];

    // Check if already published or cancelled
    if (post.status === 'published' || post.status === 'cancelled') {
      return res.status(200).json({
        success: true,
        message: `Post already ${post.status}`,
        postId
      });
    }

    // Mark as publishing
    await sql`
      UPDATE scheduled_posts
      SET status = 'publishing',
          publish_attempts = COALESCE(publish_attempts, 0) + 1,
          last_publish_attempt = ${now}
      WHERE id = ${postId}
    `;

    // Publish to Instagram
    const httpUrl = await ensureHttpUrl(post.image_url);

    const fullCaption = post.hashtags?.length > 0
      ? `${post.caption}\n\n${post.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ')}`
      : post.caption;

    const containerId = await createMediaContainer(
      post.instagram_content_type || 'photo',
      httpUrl,
      fullCaption
    );

    // Wait for processing
    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < 60) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        status = await getContainerStatus(containerId);
      } catch (e) {
        console.warn('[QStash] Status check failed, retrying...');
      }
      attempts++;
    }

    if (status === 'ERROR') {
      throw new Error('Instagram rejected the media');
    }

    // Publish
    const mediaId = await publishContainer(containerId);

    // Update as published
    await sql`
      UPDATE scheduled_posts
      SET status = 'published',
          published_at = ${now},
          instagram_media_id = ${mediaId}
      WHERE id = ${postId}
    `;

    console.log(`[QStash] Published! Post ${postId}, Media ID: ${mediaId}`);

    return res.status(200).json({
      success: true,
      postId,
      mediaId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[QStash] Error:', errorMessage);

    // Update as failed
    try {
      const sql = getSql();
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      await sql`
        UPDATE scheduled_posts
        SET status = 'failed',
            error_message = ${errorMessage}
        WHERE id = ${payload.postId}
      `;
    } catch (e) {
      console.error('[QStash] Failed to update status:', e);
    }

    return res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
}
