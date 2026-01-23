/**
 * BullMQ Job Queue for Background Image Generation & Scheduled Post Publishing
 * Uses Redis for job queue management
 */

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection - Railway provides REDIS_URL
// In development without Redis, scheduled posts will use fallback polling
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || null;

let connection = null;
let imageQueue = null;
let scheduledPostsQueue = null;
let imageWorker = null;
let scheduledPostsWorker = null;
let redisAvailable = false;
let redisConnectPromise = null;

/**
 * Check if Redis is available
 */
export function isRedisAvailable() {
  return redisAvailable;
}

/**
 * Wait for Redis to connect (with timeout)
 * Returns true if connected, false if timeout/failed
 */
export async function waitForRedis(timeoutMs = 5000) {
  if (redisAvailable) return true;
  if (!REDIS_URL) return false;

  // Ensure connection is initiated
  getRedisConnection();

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
 * Returns null if Redis is not configured or unavailable
 */
export function getRedisConnection() {
  if (!REDIS_URL) {
    return null;
  }

  if (!connection) {
    console.log('[JobQueue] Connecting to Redis:', REDIS_URL.replace(/\/\/.*@/, '//***@'));
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) {
          console.log('[JobQueue] Redis connection failed after 3 attempts, giving up');
          redisAvailable = false;
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000);
      },
    });

    connection.on('error', (err) => {
      if (!err.message.includes('ECONNREFUSED')) {
        console.error('[JobQueue] Redis error:', err.message);
      }
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
    connection.connect().catch((err) => {
      console.log('[JobQueue] Redis not available (development mode OK, will use fallback)');
      redisAvailable = false;
    });
  }
  return connection;
}

/**
 * Get or create the image generation queue
 */
export function getImageQueue() {
  if (!imageQueue) {
    const conn = getRedisConnection();
    if (!conn) {
      return null;
    }
    imageQueue = new Queue('image-generation', {
      connection: conn,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          count: 50, // Keep last 50 failed jobs
        },
      },
    });
    console.log('[JobQueue] Image queue created');
  }
  return imageQueue;
}

/**
 * Add a job to the queue
 */
export async function addJob(jobId, data) {
  const queue = getImageQueue();

  const job = await queue.add('generate', {
    jobId,
    ...data,
  }, {
    jobId: jobId, // Use DB job ID as BullMQ job ID for easy lookup
  });

  console.log(`[JobQueue] Added job ${jobId} to queue`);
  return job;
}

/**
 * Get job status from queue
 */
export async function getQueueJobStatus(jobId) {
  const queue = getImageQueue();
  const job = await queue.getJob(jobId);

  if (!job) return null;

  const state = await job.getState();
  return {
    id: job.id,
    state,
    progress: job.progress,
    data: job.data,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
  };
}

/**
 * Add an image generation job to the queue
 * Returns null if Redis not available (caller should use fallback)
 */
export async function addImageJob(jobId, data) {
  const queue = getImageQueue();
  if (!queue) {
    console.log(`[JobQueue] Redis not available, job ${jobId} will use sync processing`);
    return null;
  }

  const job = await queue.add('generate', {
    jobId,
    ...data,
  }, {
    jobId: jobId,
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 3000,
    },
  });

  console.log(`[JobQueue] Added image job ${jobId} to queue`);
  return job;
}

/**
 * Initialize the image generation worker with a processor function
 */
export function initializeImageWorker(processorFn) {
  if (imageWorker) {
    console.log('[JobQueue] Image worker already initialized');
    return imageWorker;
  }

  const conn = getRedisConnection();
  if (!conn || !redisAvailable) {
    console.log('[JobQueue] Cannot initialize image worker - Redis not available');
    return null;
  }

  imageWorker = new Worker('image-generation', processorFn, {
    connection: conn,
    concurrency: 2, // Process 2 jobs at a time
  });

  imageWorker.on('completed', (job, result) => {
    console.log(`[JobQueue] Image job ${job.id} completed`);
  });

  imageWorker.on('failed', (job, err) => {
    console.error(`[JobQueue] Image job ${job?.id} failed:`, err.message);
  });

  imageWorker.on('progress', (job, progress) => {
    console.log(`[JobQueue] Image job ${job.id} progress: ${progress}%`);
  });

  imageWorker.on('error', (err) => {
    console.error('[JobQueue] Image worker error:', err.message);
  });

  console.log('[JobQueue] Image worker initialized with concurrency 2');
  return imageWorker;
}

/**
 * Get or create the scheduled posts queue
 */
export function getScheduledPostsQueue() {
  if (!scheduledPostsQueue) {
    const conn = getRedisConnection();
    if (!conn || !redisAvailable) {
      return null;
    }
    scheduledPostsQueue = new Queue('scheduled-posts', {
      connection: conn,
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
  const conn = getRedisConnection();

  if (!queue || !conn || !redisAvailable) {
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
    connection: conn,
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
  if (imageWorker) {
    await imageWorker.close();
    imageWorker = null;
  }
  if (scheduledPostsWorker) {
    await scheduledPostsWorker.close();
    scheduledPostsWorker = null;
  }
  if (imageQueue) {
    await imageQueue.close();
    imageQueue = null;
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
