/**
 * Rate limiting helpers for Vercel Serverless Functions
 * Uses Upstash Redis for distributed rate limiting
 * Falls back to no limiting if Upstash is not configured
 */

import type { VercelResponse } from '@vercel/node';

// Upstash types - dynamically imported to avoid build errors if not installed
interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  limit: number;
}

// Rate limit configuration
export interface RateLimitConfig {
  requests: number;
  window: string; // e.g., '1 m', '1 h', '1 d'
}

// Default rate limits
export const RATE_LIMITS = {
  // Standard database operations
  standard: { requests: 100, window: '1 m' },
  // AI operations (expensive)
  ai: { requests: 10, window: '1 m' },
  // Campaign generation
  campaign: { requests: 10, window: '1 h' },
  // Image generation
  image: { requests: 50, window: '1 h' },
  // Video generation (very expensive)
  video: { requests: 5, window: '1 h' },
  // Flyer generation
  flyer: { requests: 30, window: '1 h' },
  // Speech generation
  speech: { requests: 30, window: '1 h' },
} as const;

export type RateLimitType = keyof typeof RATE_LIMITS;

// Cache for Upstash client
let upstashClient: any = null;
let upstashConfigured: boolean | null = null;

/**
 * Check if Upstash is configured
 */
function isUpstashConfigured(): boolean {
  if (upstashConfigured !== null) return upstashConfigured;

  upstashConfigured = !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  return upstashConfigured;
}

/**
 * Get or create Upstash rate limiter
 */
async function getUpstashLimiter(type: RateLimitType): Promise<any | null> {
  if (!isUpstashConfigured()) return null;

  try {
    // Dynamic imports to avoid build errors if packages not installed
    const { Ratelimit } = await import('@upstash/ratelimit');
    const { Redis } = await import('@upstash/redis');

    if (!upstashClient) {
      upstashClient = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
    }

    const config = RATE_LIMITS[type];

    return new Ratelimit({
      redis: upstashClient,
      limiter: Ratelimit.slidingWindow(config.requests, config.window),
      prefix: `ratelimit:${type}`,
      analytics: true,
    });
  } catch (error) {
    console.warn('[RateLimit] Failed to initialize Upstash:', error);
    return null;
  }
}

/**
 * Check rate limit for an identifier (userId or orgId)
 */
export async function checkRateLimit(
  type: RateLimitType,
  identifier: string
): Promise<RateLimitResult> {
  const limiter = await getUpstashLimiter(type);

  if (!limiter) {
    // No rate limiting if Upstash not configured
    return {
      success: true,
      remaining: 999,
      reset: Date.now() + 60000,
      limit: 999,
    };
  }

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
      limit: result.limit,
    };
  } catch (error) {
    console.error('[RateLimit] Check failed:', error);
    // Allow request if rate limit check fails
    return {
      success: true,
      remaining: 999,
      reset: Date.now() + 60000,
      limit: 999,
    };
  }
}

/**
 * Apply rate limit and return 429 if exceeded
 */
export async function applyRateLimit(
  type: RateLimitType,
  identifier: string,
  res: VercelResponse
): Promise<boolean> {
  const result = await checkRateLimit(type, identifier);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', new Date(result.reset).toISOString());

  if (!result.success) {
    res.status(429).json({
      error: 'Rate limit exceeded',
      type,
      remaining: result.remaining,
      resetAt: new Date(result.reset).toISOString(),
    });
    return false;
  }

  return true;
}

/**
 * Create a rate limit key combining user and org
 */
export function createRateLimitKey(
  userId: string | null,
  orgId: string | null
): string {
  if (orgId) return `org:${orgId}`;
  if (userId) return `user:${userId}`;
  return 'anonymous';
}
