/**
 * BullMQ Job Queue for Background Image Generation
 * Uses Redis for job queue management
 */

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection - Railway provides REDIS_URL
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || 'redis://localhost:6379';

let connection = null;
let imageQueue = null;
let worker = null;

/**
 * Get or create Redis connection
 */
export function getRedisConnection() {
  if (!connection) {
    console.log('[JobQueue] Connecting to Redis:', REDIS_URL.replace(/\/\/.*@/, '//***@'));
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    connection.on('error', (err) => {
      console.error('[JobQueue] Redis error:', err.message);
    });

    connection.on('connect', () => {
      console.log('[JobQueue] Redis connected');
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
 * Initialize the worker with a processor function
 */
export function initializeWorker(processorFn) {
  if (worker) {
    console.log('[JobQueue] Worker already initialized');
    return worker;
  }

  const conn = getRedisConnection();

  worker = new Worker('image-generation', processorFn, {
    connection: conn,
    concurrency: 2, // Process 2 jobs at a time
  });

  worker.on('completed', (job, result) => {
    console.log(`[JobQueue] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[JobQueue] Job ${job?.id} failed:`, err.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[JobQueue] Job ${job.id} progress: ${progress}%`);
  });

  worker.on('error', (err) => {
    console.error('[JobQueue] Worker error:', err.message);
  });

  console.log('[JobQueue] Worker initialized with concurrency 2');
  return worker;
}

/**
 * Graceful shutdown
 */
export async function closeQueue() {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (imageQueue) {
    await imageQueue.close();
    imageQueue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
  console.log('[JobQueue] Queue closed');
}
