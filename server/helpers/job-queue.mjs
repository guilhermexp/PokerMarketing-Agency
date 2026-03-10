/**
 * BullMQ Job Queue for Scheduled Post Publishing & Image Generation
 * Uses Redis for job queue management
 */

import { Queue, Worker, FlowProducer } from 'bullmq';
import IORedis from 'ioredis';
import net from 'net';

// Redis connection - Railway provides REDIS_URL
// In development without Redis, scheduled posts will use fallback polling
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || null;

let connection = null;
let scheduledPostsQueue = null;
let scheduledPostsWorker = null;
let imageGenerationQueue = null;
let imageGenerationWorker = null;
let flowProducer = null;
let redisAvailable = false;
let redisGaveUp = false;

// Image generation config (env-controlled)
const IMAGE_GEN_CONCURRENCY = parseInt(process.env.IMAGE_GEN_CONCURRENCY || '2', 10);
const IMAGE_GEN_DELAY_MS = parseInt(process.env.IMAGE_GEN_DELAY_MS || '1500', 10);
const IMAGE_GEN_MAX_RETRIES = parseInt(process.env.IMAGE_GEN_MAX_RETRIES || '3', 10);

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

// ============================================================================
// IMAGE GENERATION QUEUE
// ============================================================================

let imageGenerationProcessor = null;

/**
 * Register the image generation processor function
 * This is called from the server initialization with the actual generate function
 */
export function registerImageGenerationProcessor(processorFn) {
  imageGenerationProcessor = processorFn;
  console.log('[ImageGenQueue] Processor registered');
}

/**
 * Get or create the image generation queue
 */
export function getImageGenerationQueue() {
  if (!imageGenerationQueue) {
    if (!connection || !redisAvailable) {
      return null;
    }
    imageGenerationQueue = new Queue('image-generation', {
      connection,
      defaultJobOptions: {
        attempts: IMAGE_GEN_MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5s, then 10s, 20s
        },
        removeOnComplete: {
          count: 200,
          age: 24 * 60 * 60 * 1000, // Keep for 24h
        },
        removeOnFail: {
          count: 100,
          age: 7 * 24 * 60 * 60 * 1000, // Keep failures for 7 days
        },
      },
    });
    console.log(`[ImageGenQueue] Created with concurrency=${IMAGE_GEN_CONCURRENCY}, delay=${IMAGE_GEN_DELAY_MS}ms`);
  }
  return imageGenerationQueue;
}

/**
 * Add an image generation job to the queue
 * Uses rate limiting via job delays to avoid provider rate limits
 */
export async function enqueueImageGeneration(jobData, options = {}) {
  const queue = getImageGenerationQueue();

  if (!queue) {
    throw new Error('Redis not available - cannot queue image generation');
  }

  const {
    userId,
    organizationId,
    prompt,
    brandProfile,
    aspectRatio = '1:1',
    imageSize = '1K',
    model,
    productImages,
    styleReferenceImage,
    personReferenceImage,
    jobId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  } = jobData;

  // Get current queue size to calculate delay
  const waitingCount = await queue.getWaitingCount();
  const activeCount = await queue.getActiveCount();
  
  // Add delay based on position in queue to avoid burst
  // Each job waits for the previous one + IMAGE_GEN_DELAY_MS
  const calculatedDelay = (waitingCount + activeCount) * IMAGE_GEN_DELAY_MS;
  const delay = options.delay !== undefined ? options.delay : calculatedDelay;

  const job = await queue.add('generate-image', {
    userId,
    organizationId,
    prompt,
    brandProfile,
    aspectRatio,
    imageSize,
    model,
    productImages,
    styleReferenceImage,
    personReferenceImage,
    queuedAt: Date.now(),
  }, {
    jobId,
    delay: Math.max(0, delay),
    priority: options.priority || 5, // 1-10, lower = higher priority
    ...options,
  });

  const estimatedStart = Date.now() + delay;
  console.log(`[ImageGenQueue] Job ${jobId} queued (delay=${delay}ms, position=${waitingCount + 1})`);

  return {
    jobId: job.id,
    status: 'queued',
    delay,
    estimatedStart: new Date(estimatedStart).toISOString(),
    queuePosition: waitingCount + 1,
  };
}

/**
 * Add multiple image generation jobs as a batch
 * Each job gets staggered delays automatically
 */
export async function enqueueImageGenerationBatch(jobsData, options = {}) {
  const queue = getImageGenerationQueue();

  if (!queue) {
    throw new Error('Redis not available - cannot queue image generation');
  }

  const results = [];
  
  for (let i = 0; i < jobsData.length; i++) {
    const jobData = jobsData[i];
    const jobOptions = {
      ...options,
      // Stagger delays: first job immediate, others spaced by IMAGE_GEN_DELAY_MS
      delay: i * IMAGE_GEN_DELAY_MS,
    };
    
    try {
      const result = await enqueueImageGeneration(jobData, jobOptions);
      results.push(result);
    } catch (error) {
      console.error(`[ImageGenQueue] Failed to queue batch job ${i}:`, error.message);
      results.push({ error: error.message, jobId: null });
    }
  }

  console.log(`[ImageGenQueue] Batch queued: ${results.filter(r => !r.error).length}/${jobsData.length} jobs`);
  return results;
}

/**
 * Get job status and progress
 */
export async function getImageGenerationJobStatus(jobId) {
  const queue = getImageGenerationQueue();
  if (!queue) return null;

  try {
    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = job.progress || 0;

    return {
      jobId: job.id,
      state, // 'waiting', 'active', 'completed', 'failed', 'delayed'
      progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  } catch (error) {
    console.error(`[ImageGenQueue] Error getting job status:`, error.message);
    return null;
  }
}

/**
 * Get all jobs for a user
 */
export async function getUserImageGenerationJobs(userId, organizationId = null, limit = 50) {
  const queue = getImageGenerationQueue();
  if (!queue) return [];

  try {
    // Get jobs from all states
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(0, limit),
      queue.getActive(0, limit),
      queue.getCompleted(0, limit),
      queue.getFailed(0, limit),
    ]);

    const allJobs = [...waiting, ...active, ...completed, ...failed];
    
    // Filter by user/organization
    return allJobs
      .filter(job => {
        if (organizationId) {
          return job.data.organizationId === organizationId;
        }
        return job.data.userId === userId && !job.data.organizationId;
      })
      .map(job => ({
        jobId: job.id,
        state: job.getState(),
        progress: job.progress || 0,
        prompt: job.data.prompt?.slice(0, 100) + '...',
        model: job.data.model,
        createdAt: job.timestamp,
        finishedOn: job.finishedOn,
        attemptsMade: job.attemptsMade,
      }))
      .slice(0, limit);
  } catch (error) {
    console.error(`[ImageGenQueue] Error getting user jobs:`, error.message);
    return [];
  }
}

/**
 * Initialize the image generation worker
 * Processes jobs with controlled concurrency and rate limiting
 */
export async function initializeImageGenerationWorker() {
  const queue = getImageGenerationQueue();

  if (!queue || !connection || !redisAvailable) {
    console.log('[ImageGenQueue] Redis not available, worker not started');
    return null;
  }

  if (!imageGenerationProcessor) {
    console.warn('[ImageGenQueue] No processor registered - worker will not process jobs');
    return null;
  }

  // Create worker with limited concurrency to avoid rate limits
  imageGenerationWorker = new Worker('image-generation', async (job) => {
    const startTime = Date.now();
    const { userId, organizationId, prompt, model, queuedAt } = job.data;
    
    console.log(`[ImageGenWorker] Processing job ${job.id} (waited ${Date.now() - queuedAt}ms)`);
    
    // Update progress
    await job.updateProgress(10);

    try {
      // Call the registered processor (the actual generate function)
      const result = await imageGenerationProcessor(job.data, (progress) => {
        job.updateProgress(10 + progress * 0.8); // 10-90% during generation
      });

      await job.updateProgress(100);
      
      const duration = Date.now() - startTime;
      console.log(`[ImageGenWorker] Job ${job.id} completed in ${duration}ms`);

      return {
        success: true,
        imageUrl: result.imageUrl,
        usedProvider: result.usedProvider,
        usedModel: result.usedModel,
        usedFallback: result.usedFallback,
        duration,
      };
    } catch (error) {
      console.error(`[ImageGenWorker] Job ${job.id} failed:`, error.message);
      throw error; // Let BullMQ handle retry
    }
  }, {
    connection,
    concurrency: IMAGE_GEN_CONCURRENCY, // Process N jobs simultaneously max
    limiter: {
      // Additional rate limiting: max 1 job per IMAGE_GEN_DELAY_MS per worker
      max: 1,
      duration: IMAGE_GEN_DELAY_MS,
    },
  });

  imageGenerationWorker.on('completed', (job, result) => {
    console.log(`[ImageGenWorker] ✓ ${job.id} completed (${result.usedProvider})`);
  });

  imageGenerationWorker.on('failed', (job, err) => {
    console.error(`[ImageGenWorker] ✗ ${job?.id} failed:`, err.message);
  });

  imageGenerationWorker.on('progress', (job, progress) => {
    console.log(`[ImageGenWorker] ${job.id} progress: ${progress}%`);
  });

  console.log(`[ImageGenWorker] Initialized (concurrency=${IMAGE_GEN_CONCURRENCY})`);
  return imageGenerationWorker;
}

/**
 * Cancel an image generation job
 */
export async function cancelImageGenerationJob(jobId) {
  const queue = getImageGenerationQueue();
  if (!queue) return false;

  try {
    const job = await queue.getJob(jobId);
    if (!job) return false;

    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      return false; // Already finished
    }

    await job.remove();
    console.log(`[ImageGenQueue] Job ${jobId} cancelled`);
    return true;
  } catch (error) {
    console.error(`[ImageGenQueue] Error cancelling job:`, error.message);
    return false;
  }
}

/**
 * Clean up old completed jobs
 */
export async function cleanupImageGenerationJobs(keepCompleted = 100, keepFailed = 50) {
  const queue = getImageGenerationQueue();
  if (!queue) return;

  try {
    await queue.clean(24 * 60 * 60 * 1000, 'completed', keepCompleted);
    await queue.clean(7 * 24 * 60 * 60 * 1000, 'failed', keepFailed);
    console.log('[ImageGenQueue] Cleaned up old jobs');
  } catch (error) {
    console.error('[ImageGenQueue] Cleanup error:', error.message);
  }
}

/**
 * Graceful shutdown
 */
export async function closeQueue() {
  if (imageGenerationWorker) {
    await imageGenerationWorker.close();
    imageGenerationWorker = null;
  }
  if (imageGenerationQueue) {
    await imageGenerationQueue.close();
    imageGenerationQueue = null;
  }
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
