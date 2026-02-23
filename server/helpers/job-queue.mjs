/**
 * BullMQ Job Queue for Scheduled Post Publishing
 * Uses Redis for job queue management
 *
 * NOTE: Image generation jobs were REMOVED (2026-01-25)
 * Images are now generated synchronously via /api/images endpoint
 */

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import net from 'net';

// Redis connection - Railway provides REDIS_URL
// In development without Redis, scheduled posts will use fallback polling
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || null;

let connection = null;
let scheduledPostsQueue = null;
let scheduledPostsWorker = null;
let redisAvailable = false;
let redisGaveUp = false;

/**
 * Check if Redis is available
 */
export function isRedisAvailable() {
  return redisAvailable;
}

/**
 * Quick TCP probe to check if host:port is reachable and stable.
 * Returns true only if we can connect AND the connection stays open for 1s.
 */
function probeRedis(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const port = parseInt(parsed.port, 10) || 6379;

      const socket = net.connect({ host, port, timeout: timeoutMs });
      let settled = false;
      const settle = (val) => { if (!settled) { settled = true; socket.destroy(); resolve(val); } };

      socket.on('connect', () => {
        // Wait briefly to detect immediate ECONNRESET (unstable proxy)
        setTimeout(() => settle(true), 500);
      });
      socket.on('error', () => settle(false));
      socket.on('timeout', () => settle(false));
      socket.on('close', () => { if (!settled) settle(false); });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Wait for Redis to connect (with timeout)
 * Returns true if connected, false if timeout/failed
 */
export async function waitForRedis(timeoutMs = 5000) {
  if (redisAvailable) return true;
  if (!REDIS_URL || redisGaveUp) return false;

  // Ensure connection is initiated
  await getRedisConnection();

  if (redisGaveUp) return false;

  // Wait for connection or timeout
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (redisAvailable) {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        console.log('[JobQueue] Redis connection timeout after', timeoutMs, 'ms');
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Get or create Redis connection
 * Returns null if Redis is not configured or unavailable.
 * Now async — probes host reachability before creating ioredis.
 */
export async function getRedisConnection() {
  if (!REDIS_URL || redisGaveUp) {
    return null;
  }

  if (!connection) {
    const maskedUrl = REDIS_URL.replace(/\/\/.*@/, '//***@');
    console.log('[JobQueue] Probing Redis:', maskedUrl);

    // Quick TCP probe — avoids all the ioredis/BullMQ error noise if host is dead
    const reachable = await probeRedis(REDIS_URL);
    if (!reachable) {
      console.log('[JobQueue] Redis not reachable, skipping (development mode OK, will use fallback)');
      redisGaveUp = true;
      return null;
    }

    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy: (times) => {
        if (times > 3) {
          console.log('[JobQueue] Redis connection failed after 3 attempts, giving up');
          redisAvailable = false;
          redisGaveUp = true;
          return null;
        }
        return Math.min(times * 100, 2000);
      },
    });

    // Suppress ALL error events — Redis is optional, errors are non-fatal
    connection.on('error', () => {
      redisAvailable = false;
    });

    connection.on('connect', () => {
      console.log('[JobQueue] Redis connected');
      redisAvailable = true;
    });

    connection.on('close', () => {
      redisAvailable = false;
    });

    // Try to connect
    connection.connect().catch(() => {
      console.log('[JobQueue] Redis not available (development mode OK, will use fallback)');
      redisAvailable = false;
    });
  }
  return connection;
}

/**
 * Get or create the scheduled posts queue
 */
export function getScheduledPostsQueue() {
  if (!scheduledPostsQueue) {
    if (!connection || !redisAvailable) {
      return null;
    }
    scheduledPostsQueue = new Queue('scheduled-posts', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: {
          count: 100,
        },
        removeOnFail: {
          count: 50,
        },
      },
    });
    console.log('[JobQueue] Scheduled posts queue created');
  }
  return scheduledPostsQueue;
}

/**
 * Schedule a post for publication at exact time
 * @param {string} postId - The post ID
 * @param {string} userId - The user ID
 * @param {Date|string|number} scheduledTime - When to publish
 */
export async function schedulePostForPublishing(postId, userId, scheduledTime) {
  const queue = getScheduledPostsQueue();

  if (!queue) {
    console.log(`[JobQueue] Redis not available, post ${postId} will be handled by fallback checker`);
    return { jobId: null, fallback: true };
  }

  // Calculate delay in milliseconds
  const targetTime = new Date(scheduledTime).getTime();
  const now = Date.now();
  const delay = Math.max(0, targetTime - now);

  // Create unique job ID based on post ID
  const jobId = `publish-${postId}`;

  // Remove existing job for this post (if rescheduling)
  try {
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove();
      console.log(`[JobQueue] Removed existing job for post ${postId}`);
    }
  } catch (e) {
    // Job doesn't exist, that's fine
  }

  // Add job with exact delay
  const job = await queue.add('publish-post', {
    postId,
    userId,
    scheduledTime: new Date(scheduledTime).toISOString(),
  }, {
    jobId,
    delay,
    removeOnComplete: true,
    removeOnFail: false,
  });

  const delayMinutes = Math.round(delay / 60000);
  console.log(`[JobQueue] Post ${postId} scheduled for ${new Date(targetTime).toISOString()} (in ${delayMinutes} min)`);

  return { jobId: job.id, delay, scheduledFor: new Date(targetTime).toISOString() };
}

/**
 * Cancel a scheduled post job
 * @param {string} postId - The post ID to cancel
 */
export async function cancelScheduledPost(postId) {
  const queue = getScheduledPostsQueue();

  if (!queue) {
    console.log(`[JobQueue] Redis not available, skipping job cancellation for post ${postId}`);
    return false;
  }

  const jobId = `publish-${postId}`;

  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[JobQueue] Cancelled scheduled job for post ${postId}`);
      return true;
    }
  } catch (e) {
    console.error(`[JobQueue] Error cancelling job for post ${postId}:`, e.message);
  }
  return false;
}

/**
 * Initialize the scheduled posts worker
 * Handles both:
 * - publish-post: Jobs with exact delay (primary method)
 * - check-scheduled: Fallback check every 5 min for missed posts
 */
export async function initializeScheduledPostsChecker(publishFn, publishSingleFn) {
  const queue = getScheduledPostsQueue();

  if (!queue || !connection || !redisAvailable) {
    console.log('[ScheduledPosts] Redis not available, using fallback-only mode (checks every 5min via database polling)');
    return null;
  }

  // Create worker for scheduled posts
  scheduledPostsWorker = new Worker('scheduled-posts', async (job) => {
    // Exact time job - publish single post
    if (job.name === 'publish-post') {
      const { postId, userId } = job.data;
      console.log(`[ScheduledPosts] Publishing post ${postId} (exact time)`);

      if (publishSingleFn) {
        const result = await publishSingleFn(postId, userId);
        return result;
      }
      return { skipped: true, reason: 'no publishSingleFn' };
    }

    // Fallback checker - catch any missed posts
    if (job.name === 'check-scheduled') {
      const result = await publishFn();
      if (result?.published > 0) {
        console.log(`[ScheduledPosts] Fallback caught ${result.published} missed posts`);
      }
      return result;
    }

    return { skipped: true };
  }, {
    connection,
    concurrency: 1, // One at a time to avoid race conditions
  });

  scheduledPostsWorker.on('completed', (job, result) => {
    if (job.name === 'publish-post' && result?.success) {
      console.log(`[ScheduledPosts] Post published successfully`);
    }
  });

  scheduledPostsWorker.on('failed', (job, err) => {
    console.error(`[ScheduledPosts] Job ${job?.name} failed:`, err.message);
  });

  // Setup fallback checker (every 5 minutes) - catches missed posts after server restart
  const existingJobs = await queue.getRepeatableJobs();
  const hasChecker = existingJobs.some(j => j.name === 'check-scheduled');

  if (!hasChecker) {
    await queue.add('check-scheduled', {}, {
      repeat: {
        every: 300000, // Every 5 minutes (fallback only)
      },
      jobId: 'scheduled-posts-fallback',
    });
    console.log('[ScheduledPosts] Fallback checker added (every 5 min)');
  }

  console.log('[ScheduledPosts] Worker initialized (exact time + 5min fallback)');
  return scheduledPostsWorker;
}

/**
 * Graceful shutdown
 */
export async function closeQueue() {
  if (scheduledPostsWorker) {
    await scheduledPostsWorker.close();
    scheduledPostsWorker = null;
  }
  if (scheduledPostsQueue) {
    await scheduledPostsQueue.close();
    scheduledPostsQueue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
  console.log('[JobQueue] All queues closed');
}
