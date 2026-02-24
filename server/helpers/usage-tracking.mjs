/**
 * AI Usage Tracking Helper
 * Logs all AI API calls to api_usage_logs table for admin dashboard
 */

import { randomUUID } from 'crypto';

// Model pricing configuration (in USD cents per million tokens/per item)
// Updated with actual pricing from providers
const MODEL_PRICING = {
  // Google Gemini Text Models (via OpenRouter)
  'google/gemini-3-flash-preview': {
    provider: 'google',
    inputPerMillion: 50,  // $0.50/1M = 50 cents
    outputPerMillion: 300  // $3/1M = 300 cents
  },
  // Legacy model IDs (kept for historical usage logs)
  'gemini-3-pro-preview': {
    provider: 'google',
    inputPerMillion: 200,
    outputPerMillion: 1200
  },
  'gemini-3-flash-preview': {
    provider: 'google',
    inputPerMillion: 50,
    outputPerMillion: 300
  },
  // Google Gemini Image Models — Pro
  'gemini-3-pro-image-preview': {
    provider: 'google',
    costPerImage: {
      '1K': 13.4,   // $0.134/image = 13.4 cents
      '2K': 13.4,
      '4K': 24      // $0.24/image = 24 cents
    }
  },
  // Google Gemini Image Models — Standard (flat rate; model outputs 1024px only)
  'gemini-2.5-flash-image': {
    provider: 'google',
    costPerImage: {
      '1K': 4,     // ~$0.039/image = 4 cents
      '2K': 4,
      '4K': 4
    }
  },
  // FAL.ai Image Models — Pro (Gemini 3 Pro Image via FAL)
  'fal-ai/gemini-3-pro-image-preview': {
    provider: 'fal',
    costPerImage: {
      '1K': 15,   // $0.15/image = 15 cents
      '2K': 15,
      '4K': 30    // $0.30/image = 30 cents
    }
  },
  'fal-ai/gemini-3-pro-image-preview/edit': {
    provider: 'fal',
    costPerImage: {
      '1K': 15,
      '2K': 15,
      '4K': 30
    }
  },
  // FAL.ai Image Models — Standard (Gemini 2.5 Flash Image via FAL; flat rate, 1024px only)
  'fal-ai/gemini-25-flash-image': {
    provider: 'fal',
    costPerImage: {
      '1K': 5,    // ~$0.05/image = 5 cents
      '2K': 5,
      '4K': 5
    }
  },
  'fal-ai/gemini-25-flash-image/edit': {
    provider: 'fal',
    costPerImage: {
      '1K': 5,
      '2K': 5,
      '4K': 5
    }
  },
  // Google TTS Models
  'gemini-2.5-flash-preview-tts': {
    provider: 'google',
    inputPerMillion: 50,    // $0.50/1M input
    outputPerMillion: 1000  // $10/1M output (audio)
  },
  'gemini-2.5-pro-preview-tts': {
    provider: 'google',
    inputPerMillion: 100,   // $1/1M input
    outputPerMillion: 2000  // $20/1M output (audio)
  },
  // OpenRouter Models
  'openai/gpt-5.2': {
    provider: 'openrouter',
    inputPerMillion: 175,   // $1.75/1M = 175 cents
    outputPerMillion: 1400  // $14/1M = 1400 cents
  },
  'x-ai/grok-4.1-fast': {
    provider: 'openrouter',
    inputPerMillion: 20,    // $0.20/1M = 20 cents
    outputPerMillion: 50    // $0.50/1M = 50 cents
  },
  // FAL Video Models
  'veo-3.1': {
    provider: 'fal',
    costPerSecond: 40       // $0.40/s = 40 cents
  },
  'veo-3.1-fast': {
    provider: 'fal',
    costPerSecond: 15       // $0.15/s = 15 cents
  },
  'fal-ai/veo3.1/fast': {
    provider: 'fal',
    costPerSecond: 15
  },
  'fal-ai/veo3.1/fast/image-to-video': {
    provider: 'fal',
    costPerSecond: 15
  },
  'sora-2': {
    provider: 'fal',
    costPerSecond: 10       // Estimated
  },
  'fal-ai/sora-2/text-to-video': {
    provider: 'fal',
    costPerSecond: 10
  },
  'fal-ai/sora-2/image-to-video': {
    provider: 'fal',
    costPerSecond: 10
  },
  // Replicate Image Models (Replicate charges ~2x Google direct pricing)
  'google/nano-banana-pro': {
    provider: 'replicate',
    costPerImage: {
      '1K': 31,   // ~$0.31/image via Replicate (Google direct: $0.155)
      '2K': 31,
      '4K': 48    // ~$0.48/image (Google direct: $0.24)
    }
  },
  'google/nano-banana': {
    provider: 'replicate',
    costPerImage: {
      '1K': 8,    // ~$0.08/image via Replicate (Google direct: $0.039)
      '2K': 8,
      '4K': 8
    }
  }
};

// Map operation types to database enum values
const OPERATION_TYPES = {
  'campaign': 'campaign',
  'text': 'text',
  'image': 'image',
  'video': 'video',
  'speech': 'speech',
  'flyer': 'flyer',
  'edit_image': 'edit_image'
};

/**
 * Calculate cost in cents based on model and usage
 */
function calculateCost({
  model,
  inputTokens = 0,
  outputTokens = 0,
  imageCount = 0,
  imageSize = '1K',
  videoDurationSeconds = 0,
  characterCount = 0
}) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    console.warn(`[UsageTracking] Unknown model for pricing: ${model}`);
    return 0;
  }

  let costCents = 0;

  // Text model pricing (per million tokens)
  if (pricing.inputPerMillion && inputTokens > 0) {
    costCents += (inputTokens / 1_000_000) * pricing.inputPerMillion;
  }
  if (pricing.outputPerMillion && outputTokens > 0) {
    costCents += (outputTokens / 1_000_000) * pricing.outputPerMillion;
  }

  // Image model pricing
  if (pricing.costPerImage && imageCount > 0) {
    const imageCost = pricing.costPerImage[imageSize] || pricing.costPerImage['1K'] || 13.4;
    costCents += imageCount * imageCost;
  }

  // Video model pricing (per second)
  if (pricing.costPerSecond && videoDurationSeconds > 0) {
    costCents += videoDurationSeconds * pricing.costPerSecond;
  }

  return Math.round(costCents * 100) / 100; // Round to 2 decimal places
}

/**
 * Get provider enum value from model ID
 */
function getProvider(model) {
  const pricing = MODEL_PRICING[model];
  if (pricing) return pricing.provider;

  // Fallback detection
  if (model.includes('gemini') || model.includes('imagen')) return 'google';
  if (model.includes('fal-ai/')) return 'fal';
  if (model.includes('replicate') || model.includes('nano-banana')) return 'replicate';
  if (model.includes('gpt') || model.includes('grok') || model.includes('claude')) return 'openrouter';
  if (model.includes('veo') || model.includes('sora') || model.includes('fal')) return 'fal';

  return 'google'; // Default
}

/**
 * Log AI usage to database
 * @param {object} sql - Postgres SQL client
 * @param {object} params - Usage parameters
 */
export async function logAiUsage(sql, {
  userId = null,
  organizationId = null,
  endpoint,
  operation,
  provider = null,
  model,
  inputTokens = 0,
  outputTokens = 0,
  imageCount = 0,
  imageSize = null,
  videoDurationSeconds = 0,
  audioDurationSeconds = 0,
  characterCount = 0,
  status = 'success',
  error = null,
  latencyMs = 0,
  metadata = {}
}) {
  const requestId = randomUUID();
  const detectedProvider = provider || getProvider(model);

  // Calculate cost
  const estimatedCostCents = calculateCost({
    model,
    inputTokens,
    outputTokens,
    imageCount,
    imageSize: imageSize || '1K',
    videoDurationSeconds,
    characterCount
  });

  // Map operation to enum
  const operationEnum = OPERATION_TYPES[operation] || 'text';

  try {
    await sql`
      INSERT INTO api_usage_logs (
        request_id,
        user_id,
        organization_id,
        endpoint,
        operation,
        provider,
        model_id,
        input_tokens,
        output_tokens,
        total_tokens,
        image_count,
        image_size,
        video_duration_seconds,
        audio_duration_seconds,
        character_count,
        estimated_cost_cents,
        latency_ms,
        status,
        error_message,
        metadata
      ) VALUES (
        ${requestId},
        ${userId},
        ${organizationId},
        ${endpoint},
        ${operationEnum}::ai_operation,
        ${detectedProvider}::ai_provider,
        ${model},
        ${inputTokens || null},
        ${outputTokens || null},
        ${inputTokens + outputTokens || null},
        ${imageCount || null},
        ${imageSize},
        ${videoDurationSeconds || null},
        ${audioDurationSeconds || null},
        ${characterCount || null},
        ${Math.round(estimatedCostCents)},
        ${latencyMs || null},
        ${status}::usage_status,
        ${error},
        ${JSON.stringify(metadata)}
      )
    `;

    console.log(`[UsageTracking] Logged ${operation} call to ${model} - Cost: $${(estimatedCostCents / 100).toFixed(4)}`);

    return { requestId, estimatedCostCents };
  } catch (err) {
    console.error('[UsageTracking] Failed to log usage:', err.message);
    // Don't throw - we don't want tracking failures to break the API
    return { requestId, estimatedCostCents, error: err.message };
  }
}

/**
 * Helper to extract token counts from Gemini response
 */
export function extractGeminiTokens(response) {
  try {
    const usage = response?.usageMetadata;
    if (usage) {
      return {
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0
      };
    }
  } catch (e) {
    // Ignore extraction errors
  }
  return { inputTokens: 0, outputTokens: 0 };
}

/**
 * Helper to extract token counts from OpenRouter response
 */
export function extractOpenRouterTokens(response) {
  try {
    const usage = response?.usage;
    if (usage) {
      return {
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0
      };
    }
  } catch (e) {
    // Ignore extraction errors
  }
  return { inputTokens: 0, outputTokens: 0 };
}

/**
 * Create a timer for measuring latency
 */
export function createTimer() {
  const start = Date.now();
  return () => Date.now() - start;
}

export { MODEL_PRICING, calculateCost, getProvider };
