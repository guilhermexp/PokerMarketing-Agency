/**
 * Cache helpers for Vercel Serverless Functions
 * Uses Upstash Redis for distributed caching
 * Falls back to no caching if Upstash is not configured
 */

// Cache for Upstash client
let redisClient: any = null;
let cacheConfigured: boolean | null = null;

/**
 * Check if Upstash cache is configured
 */
function isCacheConfigured(): boolean {
  if (cacheConfigured !== null) return cacheConfigured;

  cacheConfigured = !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  return cacheConfigured;
}

/**
 * Get or create Redis client
 */
async function getRedisClient(): Promise<any | null> {
  if (!isCacheConfigured()) return null;

  if (redisClient) return redisClient;

  try {
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    return redisClient;
  } catch (error) {
    console.warn('[Cache] Failed to initialize Redis:', error);
    return null;
  }
}

/**
 * Get a value from cache
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (!redis) return null;

  try {
    return await redis.get(key) as T | null;
  } catch (error) {
    console.warn('[Cache] Get failed:', error);
    return null;
  }
}

/**
 * Set a value in cache with TTL
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = 300
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    console.warn('[Cache] Set failed:', error);
  }
}

/**
 * Delete a value from cache
 */
export async function cacheDel(key: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    await redis.del(key);
  } catch (error) {
    console.warn('[Cache] Delete failed:', error);
  }
}

/**
 * Delete multiple values from cache by pattern
 */
export async function cacheDelByPattern(pattern: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.warn('[Cache] Delete by pattern failed:', error);
  }
}

// Cache key generators
export const CACHE_KEYS = {
  user: (userId: string) => `user:${userId}`,
  userIdByClerkId: (clerkId: string) => `user:clerk:${clerkId}`,
  brandProfile: (userId: string, orgId?: string | null) =>
    orgId ? `brand:org:${orgId}` : `brand:user:${userId}`,
  gallery: (userId: string, orgId?: string | null) =>
    orgId ? `gallery:org:${orgId}` : `gallery:user:${userId}`,
};

// Cache TTLs in seconds
export const CACHE_TTLS = {
  user: 300, // 5 minutes
  brandProfile: 300, // 5 minutes
  gallery: 60, // 1 minute
};

/**
 * Cache user ID lookup (Clerk ID → Internal UUID)
 */
export async function cacheUserId(clerkId: string, dbId: string): Promise<void> {
  await cacheSet(CACHE_KEYS.userIdByClerkId(clerkId), dbId, CACHE_TTLS.user);
}

/**
 * Get cached user ID
 */
export async function getCachedUserId(clerkId: string): Promise<string | null> {
  return cacheGet<string>(CACHE_KEYS.userIdByClerkId(clerkId));
}

/**
 * Invalidate user cache
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await cacheDel(CACHE_KEYS.user(userId));
}

/**
 * Invalidate brand profile cache
 */
export async function invalidateBrandProfileCache(
  userId: string,
  orgId?: string | null
): Promise<void> {
  await cacheDel(CACHE_KEYS.brandProfile(userId, orgId));
}
