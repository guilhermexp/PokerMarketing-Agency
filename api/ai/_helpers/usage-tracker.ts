/**
 * AI Usage Tracking Helper
 * Wraps AI operations to automatically log usage and calculate costs
 */

import type { NeonQueryFunction } from '@neondatabase/serverless';
import { getSql } from '../../db/_helpers/database.js';

// Types
export type AIProvider = 'google' | 'openrouter' | 'fal';
export type AIOperation = 'text' | 'image' | 'video' | 'speech' | 'flyer' | 'edit_image' | 'campaign';
export type UsageStatus = 'success' | 'failed' | 'timeout' | 'rate_limited';

export interface UsageContext {
  userId: string | null;
  organizationId: string | null;
  endpoint: string;
  operation: AIOperation;
  requestId: string;
}

export interface UsageMetrics {
  provider: AIProvider;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  imageSize?: string;
  aspectRatio?: string;
  videoDurationSeconds?: number;
  audioDurationSeconds?: number;
  characterCount?: number;
  latencyMs: number;
  status: UsageStatus;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

// Pricing cache (loaded from DB on first use)
let pricingCache: Map<string, PricingInfo> | null = null;
let pricingCacheTime = 0;
const PRICING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface PricingInfo {
  provider: string;
  model_id: string;
  input_cost_per_million_tokens: number | null;
  output_cost_per_million_tokens: number | null;
  cost_per_image_cents: number | null;
  cost_per_second_cents: number | null;
  cost_per_generation_cents: number | null;
  cost_per_million_characters: number | null;
}

/**
 * Load pricing from database
 */
async function loadPricing(sql: NeonQueryFunction<false, false>): Promise<Map<string, PricingInfo>> {
  const now = Date.now();
  if (pricingCache && now - pricingCacheTime < PRICING_CACHE_TTL) {
    return pricingCache;
  }

  try {
    const rows = await sql`
      SELECT
        provider, model_id,
        input_cost_per_million_tokens,
        output_cost_per_million_tokens,
        cost_per_image_cents,
        cost_per_second_cents,
        cost_per_generation_cents,
        cost_per_million_characters
      FROM model_pricing
      WHERE is_active = TRUE
        AND effective_from <= CURRENT_DATE
        AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
    `;

    pricingCache = new Map();
    for (const row of rows) {
      const key = `${row.provider}:${row.model_id}`;
      pricingCache.set(key, row as PricingInfo);
    }
    pricingCacheTime = now;

    return pricingCache;
  } catch (error) {
    console.warn('[UsageTracker] Failed to load pricing, using empty cache:', error);
    return new Map();
  }
}

/**
 * Calculate cost in cents based on usage metrics
 */
export async function calculateCost(
  sql: NeonQueryFunction<false, false>,
  metrics: UsageMetrics
): Promise<number> {
  const pricing = await loadPricing(sql);
  const key = `${metrics.provider}:${metrics.modelId}`;
  const priceInfo = pricing.get(key);

  if (!priceInfo) {
    console.warn(`[UsageTracker] No pricing found for ${key}`);
    return 0;
  }

  let costCents = 0;

  // Token-based pricing (text models)
  if (metrics.inputTokens && priceInfo.input_cost_per_million_tokens) {
    costCents += (metrics.inputTokens / 1_000_000) * priceInfo.input_cost_per_million_tokens;
  }
  if (metrics.outputTokens && priceInfo.output_cost_per_million_tokens) {
    costCents += (metrics.outputTokens / 1_000_000) * priceInfo.output_cost_per_million_tokens;
  }

  // Image pricing
  if (metrics.imageCount && priceInfo.cost_per_image_cents) {
    costCents += metrics.imageCount * priceInfo.cost_per_image_cents;
  }

  // Video pricing (per second)
  if (metrics.videoDurationSeconds && priceInfo.cost_per_second_cents) {
    costCents += metrics.videoDurationSeconds * priceInfo.cost_per_second_cents;
  }

  // Fixed per-generation cost
  if (priceInfo.cost_per_generation_cents) {
    costCents += priceInfo.cost_per_generation_cents;
  }

  // Speech pricing (per million characters)
  if (metrics.characterCount && priceInfo.cost_per_million_characters) {
    costCents += (metrics.characterCount / 1_000_000) * priceInfo.cost_per_million_characters;
  }

  return Math.round(costCents);
}

/**
 * Log usage to database
 */
export async function logUsage(
  context: UsageContext,
  metrics: UsageMetrics
): Promise<void> {
  try {
    const sql = getSql();
    const costCents = await calculateCost(sql, metrics);

    await sql`
      INSERT INTO api_usage_logs (
        user_id, organization_id, request_id, endpoint, operation,
        provider, model_id,
        input_tokens, output_tokens, total_tokens,
        image_count, image_size, aspect_ratio,
        video_duration_seconds, audio_duration_seconds, character_count,
        estimated_cost_cents, latency_ms,
        status, error_message, metadata
      ) VALUES (
        ${context.userId}::uuid,
        ${context.organizationId},
        ${context.requestId},
        ${context.endpoint},
        ${context.operation}::ai_operation,
        ${metrics.provider}::ai_provider,
        ${metrics.modelId},
        ${metrics.inputTokens || null},
        ${metrics.outputTokens || null},
        ${(metrics.inputTokens || 0) + (metrics.outputTokens || 0) || null},
        ${metrics.imageCount || null},
        ${metrics.imageSize || null},
        ${metrics.aspectRatio || null},
        ${metrics.videoDurationSeconds || null},
        ${metrics.audioDurationSeconds || null},
        ${metrics.characterCount || null},
        ${costCents},
        ${metrics.latencyMs},
        ${metrics.status}::usage_status,
        ${metrics.errorMessage || null},
        ${JSON.stringify(metrics.metadata || {})}::jsonb
      )
    `;

    // Update aggregated usage (async, don't wait)
    updateAggregatedUsage(sql, context, metrics, costCents).catch((err) => {
      console.error('[UsageTracker] Failed to update aggregated usage:', err);
    });

  } catch (error) {
    console.error('[UsageTracker] Failed to log usage:', error);
    // Don't throw - logging failures shouldn't break the API
  }
}

/**
 * Update daily aggregated usage
 */
async function updateAggregatedUsage(
  sql: NeonQueryFunction<false, false>,
  context: UsageContext,
  metrics: UsageMetrics,
  costCents: number
): Promise<void> {
  const isSuccess = metrics.status === 'success';

  await sql`
    INSERT INTO aggregated_usage (
      date, user_id, organization_id, provider, model_id, operation,
      request_count, success_count, failed_count,
      total_input_tokens, total_output_tokens,
      total_images, total_video_seconds, total_audio_seconds, total_characters,
      total_cost_cents, avg_latency_ms, max_latency_ms
    ) VALUES (
      CURRENT_DATE,
      ${context.userId}::uuid,
      ${context.organizationId},
      ${metrics.provider}::ai_provider,
      ${metrics.modelId},
      ${context.operation}::ai_operation,
      1,
      ${isSuccess ? 1 : 0},
      ${isSuccess ? 0 : 1},
      ${metrics.inputTokens || 0},
      ${metrics.outputTokens || 0},
      ${metrics.imageCount || 0},
      ${metrics.videoDurationSeconds || 0},
      ${metrics.audioDurationSeconds || 0},
      ${metrics.characterCount || 0},
      ${costCents},
      ${metrics.latencyMs},
      ${metrics.latencyMs}
    )
    ON CONFLICT (date, user_id, organization_id, provider, model_id, operation)
    DO UPDATE SET
      request_count = aggregated_usage.request_count + 1,
      success_count = aggregated_usage.success_count + ${isSuccess ? 1 : 0},
      failed_count = aggregated_usage.failed_count + ${isSuccess ? 0 : 1},
      total_input_tokens = aggregated_usage.total_input_tokens + ${metrics.inputTokens || 0},
      total_output_tokens = aggregated_usage.total_output_tokens + ${metrics.outputTokens || 0},
      total_images = aggregated_usage.total_images + ${metrics.imageCount || 0},
      total_video_seconds = aggregated_usage.total_video_seconds + ${metrics.videoDurationSeconds || 0},
      total_audio_seconds = aggregated_usage.total_audio_seconds + ${metrics.audioDurationSeconds || 0},
      total_characters = aggregated_usage.total_characters + ${metrics.characterCount || 0},
      total_cost_cents = aggregated_usage.total_cost_cents + ${costCents},
      avg_latency_ms = (aggregated_usage.avg_latency_ms * aggregated_usage.request_count + ${metrics.latencyMs}) / (aggregated_usage.request_count + 1),
      max_latency_ms = GREATEST(aggregated_usage.max_latency_ms, ${metrics.latencyMs}),
      updated_at = NOW()
  `;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Estimate tokens from text (rough approximation)
 * ~1 token per 3.5 characters for Portuguese/English
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Wrapper to track an AI operation
 * Use this to wrap AI calls for automatic tracking
 */
export async function trackAIOperation<T>(
  context: UsageContext,
  provider: AIProvider,
  modelId: string,
  operation: () => Promise<T>,
  extractMetrics: (result: T, latencyMs: number) => Partial<UsageMetrics>
): Promise<T> {
  const startTime = Date.now();
  let status: UsageStatus = 'success';
  let errorMessage: string | undefined;
  let result: T;

  try {
    result = await operation();
  } catch (error: unknown) {
    status = 'failed';
    errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage?.includes('timeout')) {
      status = 'timeout';
    } else if (errorMessage?.includes('rate') || (error as { status?: number })?.status === 429) {
      status = 'rate_limited';
    }

    // Log the failed attempt
    const latencyMs = Date.now() - startTime;
    logUsage(context, {
      provider,
      modelId,
      latencyMs,
      status,
      errorMessage,
    }).catch((err) => {
      console.error('[UsageTracker] Logging failed:', err);
    });

    throw error;
  }

  const latencyMs = Date.now() - startTime;

  const metrics: UsageMetrics = {
    provider,
    modelId,
    latencyMs,
    status,
    errorMessage,
    ...extractMetrics(result, latencyMs),
  };

  // Log asynchronously
  logUsage(context, metrics).catch((err) => {
    console.error('[UsageTracker] Logging failed:', err);
  });

  return result;
}

/**
 * Create a usage context from auth info
 */
export function createUsageContext(
  userId: string | null,
  organizationId: string | null,
  endpoint: string,
  operation: AIOperation
): UsageContext {
  return {
    userId,
    organizationId,
    endpoint,
    operation,
    requestId: generateRequestId(),
  };
}
