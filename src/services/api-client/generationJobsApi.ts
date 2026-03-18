import { getApiErrorMessage, parseApiResponse } from "../api/response";
import { clearCsrfToken, getCsrfToken, getCurrentCsrfToken } from "./base";

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
  productImages?: string[];
  source: string;
  weekScheduleId?: string;
  dailyFlyerPeriod?: string;
  dailyFlyerDay?: string;
}

export interface GenerationJob {
  id: string;
  user_id: string;
  job_type: "flyer" | "flyer_daily" | "post" | "ad" | "clip" | "video" | "image";
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  result_url: string | null;
  result_gallery_id: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  attempts: number;
  context?: string;
}

export interface VideoJobConfig {
  model: "veo-3.1" | "sora-2";
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
  sourceImage?: string;
  productImages?: string[];
  systemPrompt?: string;
}

export interface QueueJobResult {
  success: boolean;
  jobId: string;
  messageId: string;
  status: string;
}

type JobType = GenerationJob["job_type"];

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const requiresCsrf = method !== "GET" && method !== "HEAD";

  if (requiresCsrf && !getCurrentCsrfToken()) {
    await getCsrfToken();
  }

  const headers = new Headers(options.headers);
  if (requiresCsrf && getCurrentCsrfToken()) {
    headers.set("X-CSRF-Token", getCurrentCsrfToken()!);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 403 && requiresCsrf) {
    clearCsrfToken();
  }

  return response;
}

export async function queueGenerationJob(
  userId: string,
  jobType: JobType,
  prompt: string,
  config: GenerationJobConfig | VideoJobConfig | ImageJobConfig,
  context?: string,
  organizationId?: string | null,
): Promise<QueueJobResult> {
  const response = await fetchWithAuth("/api/generate/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, organizationId, jobType, prompt, config, context }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(getApiErrorMessage(error, `HTTP ${response.status}`));
  }

  return parseApiResponse<QueueJobResult>(response);
}

export async function queueVideoJob(
  userId: string,
  prompt: string,
  config: VideoJobConfig,
  context: string,
  organizationId?: string | null,
): Promise<QueueJobResult> {
  return queueGenerationJob(userId, "video", prompt, config, context, organizationId);
}

export async function queueImageJob(
  userId: string,
  prompt: string,
  config: ImageJobConfig,
  context: string,
  organizationId?: string | null,
): Promise<QueueJobResult> {
  return queueGenerationJob(userId, "image", prompt, config, context, organizationId);
}

export async function getGenerationJobStatus(jobId: string): Promise<GenerationJob> {
  const response = await fetchWithAuth(`/api/generate/status?jobId=${jobId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(getApiErrorMessage(error, `HTTP ${response.status}`));
  }
  return parseApiResponse<GenerationJob>(response);
}

export async function getGenerationJobs(
  userId: string,
  options?: { status?: string; limit?: number; organizationId?: string | null },
): Promise<{ jobs: GenerationJob[]; total: number }> {
  const params = new URLSearchParams({ userId });
  if (options?.organizationId) params.append("organizationId", options.organizationId);
  if (options?.status) params.append("status", options.status);
  if (options?.limit) params.append("limit", options.limit.toString());

  const response = await fetchWithAuth(`/api/generate/status?${params}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(getApiErrorMessage(error, `HTTP ${response.status}`));
  }

  return parseApiResponse<{ jobs: GenerationJob[]; total: number }>(response);
}

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

    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    if (Date.now() - startTime > timeout) {
      throw new Error("Generation job timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

export async function cancelGenerationJob(jobId: string): Promise<void> {
  const response = await fetchWithAuth(`/api/generate/job/${jobId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(getApiErrorMessage(error, `HTTP ${response.status}`));
  }
}

export async function cancelAllGenerationJobs(userId: string): Promise<number> {
  const response = await fetchWithAuth("/api/generate/cancel-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(getApiErrorMessage(error, `HTTP ${response.status}`));
  }

  const result = await parseApiResponse<{ cancelledCount: number }>(response);
  return result.cancelledCount;
}
