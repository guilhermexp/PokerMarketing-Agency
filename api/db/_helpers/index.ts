/**
 * Centralized exports for shared helpers
 * Import from this file to get all helper functions
 */

// Database helpers
export { getSql, resolveUserId, setRLSContext } from './database.js';

// Authentication helpers
export {
  getAuthContext,
  requireAuth,
  AuthenticationError,
  AuthorizationError,
  type AuthContext,
} from './auth.js';

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
} from './permissions.js';

// CORS helpers
export { setCorsHeaders, handleCorsPreflightIfNeeded, setupCors } from './cors.js';

// Rate limiting helpers
export {
  RATE_LIMITS,
  checkRateLimit,
  applyRateLimit,
  createRateLimitKey,
  type RateLimitConfig,
  type RateLimitType,
} from './rate-limit.js';

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
} from './cache.js';

// Activity logging helpers
export {
  logActivity,
  logActivityAsync,
  logCrudOperation,
  logError,
  logAIGeneration,
  logPublishing,
  logAdminAction,
  createLogContext,
  extractRequestContext,
  ACTIONS,
  type ActivityLogEntry,
  type ActivityCategory,
  type ActivitySeverity,
} from './activity-logger.js';
