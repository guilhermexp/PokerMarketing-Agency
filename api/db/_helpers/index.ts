/**
 * Centralized exports for shared helpers
 * Import from this file to get all helper functions
 */

// Database helpers
export { getSql, resolveUserId, setRLSContext } from './database';

// Authentication helpers
export {
  getAuthContext,
  requireAuth,
  AuthenticationError,
  AuthorizationError,
  type AuthContext,
} from './auth';

// Permission helpers
export {
  PERMISSIONS,
  ALL_PERMISSIONS,
  MEMBER_PERMISSIONS,
  getPermissionsForRole,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  requirePermission,
  PermissionDeniedError,
  OrganizationAccessError,
  createOrgContext,
  isAdmin,
  isPersonalContext,
  type Permission,
  type OrgContext,
} from './permissions';

// CORS helpers
export { setCorsHeaders, handleCorsPreflightIfNeeded, setupCors } from './cors';

// Rate limiting helpers
export {
  RATE_LIMITS,
  checkRateLimit,
  applyRateLimit,
  createRateLimitKey,
  type RateLimitConfig,
  type RateLimitType,
} from './rate-limit';

// Cache helpers
export {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelByPattern,
  CACHE_KEYS,
  CACHE_TTLS,
  cacheUserId,
  getCachedUserId,
  invalidateUserCache,
  invalidateBrandProfileCache,
} from './cache';
