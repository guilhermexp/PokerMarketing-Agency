/**
 * Jobs API - Background generation job operations
 *
 * Handles queueing, polling, and management of background generation jobs
 * processed by BullMQ.
 */

// =============================================================================
// Types
// =============================================================================

export interface GenerationJobConfig {
  brandName: string;
  brandDescription?: string;
  brandToneOfVoice: string;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  aspectRatio: string;
  model: string;
  imageSize?: string;
  logo?: string;
  collabLogo?: string;
  styleReference?: string;
  compositionAssets?: string[];
  source: string;
}

export interface GenerationJob {
  id: string;
  user_id: string;
  job_type: 'flyer' | 'flyer_daily' | 'post' | 'ad' | 'clip' | 'video' | 'image';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  result_url: string | null;
  result_gallery_id: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  attempts: number;
  context?: string; // Used to match job with UI component (e.g., "flyer-period-ALL", "video-scene-0")
}

export interface VideoJobConfig {
  model: 'veo-3.1' | 'sora-2';
  aspectRatio: string;
  imageUrl?: string;
  lastFrameUrl?: string;
  sceneDuration?: number;
  useInterpolation?: boolean;
}

export interface ImageJobConfig {
  model?: string;
  aspectRatio?: string;
  imageSize?: string;
  style?: string;
  mood?: string;
  source?: string;
  referenceImage?: string;
  sourceImage?: string; // For image editing
  systemPrompt?: string;
  productImages?: { base64: string; mimeType: string }[]; // Brand logo and other reference images
}

export interface QueueJobResult {
  success: boolean;
  jobId: string;
  messageId: string;
  status: string;
}

export type JobType = 'flyer' | 'flyer_daily' | 'post' | 'ad' | 'clip' | 'video' | 'image';

// =============================================================================
// Queue Operations
// =============================================================================

/**
 * Queue a new image generation job for background processing
 * Returns immediately, job runs in background via BullMQ
 */
export async function queueGenerationJob(
  userId: string,
  jobType: JobType,
  prompt: string,
  config: GenerationJobConfig | VideoJobConfig | ImageJobConfig,
  context?: string,
  organizationId?: string | null,
): Promise<QueueJobResult> {
  const response = await fetch('/api/generate/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      organizationId,
      jobType,
      prompt,
      config,
      context,
    }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Queue a video generation job for background processing
 * Returns immediately, job runs in background via BullMQ
 */
export async function queueVideoJob(
  userId: string,
  prompt: string,
  config: VideoJobConfig,
  context: string,
  organizationId?: string | null,
): Promise<QueueJobResult> {
  return queueGenerationJob(
    userId,
    'video',
    prompt,
    config,
    context,
    organizationId,
  );
}

/**
 * Queue an image generation job for background processing
 * Returns immediately, job runs in background via BullMQ
 */
export async function queueImageJob(
  userId: string,
  prompt: string,
  config: ImageJobConfig,
  context: string,
  organizationId?: string | null,
): Promise<QueueJobResult> {
  return queueGenerationJob(
    userId,
    'image',
    prompt,
    config as GenerationJobConfig,
    context,
    organizationId,
  );
}

// =============================================================================
// Status Operations
// =============================================================================

/**
 * Get status of a generation job
 */
export async function getGenerationJobStatus(
  jobId: string,
): Promise<GenerationJob> {
  const response = await fetch(`/api/generate/status?jobId=${jobId}`);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get all generation jobs for a user
 */
export async function getGenerationJobs(
  userId: string,
  options?: { status?: string; limit?: number; organizationId?: string | null },
): Promise<{ jobs: GenerationJob[]; total: number }> {
  const params = new URLSearchParams({ userId });
  if (options?.organizationId)
    params.append('organizationId', options.organizationId);
  if (options?.status) params.append('status', options.status);
  if (options?.limit) params.append('limit', options.limit.toString());

  const response = await fetch(`/api/generate/status?${params}`);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Poll a generation job until completion
 * @param jobId - The job ID to poll
 * @param onProgress - Callback for progress updates
 * @param pollInterval - How often to poll in ms (default 2000)
 * @param timeout - Max time to wait in ms (default 300000 = 5 min)
 */
export async function pollGenerationJob(
  jobId: string,
  onProgress?: (job: GenerationJob) => void,
  pollInterval = 2000,
  timeout = 300000,
): Promise<GenerationJob> {
  const startTime = Date.now();

  while (true) {
    const job = await getGenerationJobStatus(jobId);
    onProgress?.(job);

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    if (Date.now() - startTime > timeout) {
      throw new Error('Generation job timed out');
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

// =============================================================================
// Cancel Operations
// =============================================================================

/**
 * Cancel a specific generation job
 */
export async function cancelGenerationJob(jobId: string): Promise<void> {
  const response = await fetch(`/api/generate/job/${jobId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
}

/**
 * Cancel all pending jobs for a user
 */
export async function cancelAllGenerationJobs(userId: string): Promise<number> {
  const response = await fetch('/api/generate/cancel-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const result = await response.json();
  return result.cancelledCount;
}
