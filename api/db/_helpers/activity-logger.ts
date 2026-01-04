/**
 * Activity Logger Helper
 * Provides async logging for all significant activities
 */

import type { VercelRequest } from '@vercel/node';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { getSql } from './database.js';

export type ActivityCategory =
  | 'auth'
  | 'crud'
  | 'ai_generation'
  | 'publishing'
  | 'settings'
  | 'admin'
  | 'system'
  | 'error';

export type ActivitySeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ActivityLogEntry {
  // WHO
  userId?: string | null;
  organizationId?: string | null;
  actorEmail?: string;
  actorName?: string;

  // WHAT
  category: ActivityCategory;
  action: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;

  // DETAILS
  details?: Record<string, unknown>;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;

  // WHERE
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;

  // STATUS
  severity?: ActivitySeverity;
  success?: boolean;
  errorMessage?: string;
  errorStack?: string;

  // PERFORMANCE
  durationMs?: number;
}

/**
 * Extract request context for logging
 */
export function extractRequestContext(req: VercelRequest): {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
} {
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : (req.socket?.remoteAddress || null);

  return {
    ipAddress,
    userAgent: (req.headers['user-agent'] as string) || null,
    requestId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
  };
}

/**
 * Pre-defined action constants
 */
export const ACTIONS = {
  // Auth
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_SESSION_REFRESH: 'auth.session_refresh',

  // Campaigns
  CAMPAIGN_CREATE: 'campaign.create',
  CAMPAIGN_UPDATE: 'campaign.update',
  CAMPAIGN_DELETE: 'campaign.delete',
  CAMPAIGN_VIEW: 'campaign.view',

  // Posts
  POST_CREATE: 'post.create',
  POST_UPDATE: 'post.update',
  POST_DELETE: 'post.delete',
  POST_SCHEDULE: 'post.schedule',
  POST_PUBLISH: 'post.publish',
  POST_PUBLISH_FAILED: 'post.publish_failed',

  // Brand Profile
  BRAND_PROFILE_CREATE: 'brand_profile.create',
  BRAND_PROFILE_UPDATE: 'brand_profile.update',

  // Gallery
  GALLERY_IMAGE_CREATE: 'gallery.image_create',
  GALLERY_IMAGE_DELETE: 'gallery.image_delete',

  // AI Generation
  AI_CAMPAIGN_GENERATE: 'ai.campaign_generate',
  AI_IMAGE_GENERATE: 'ai.image_generate',
  AI_FLYER_GENERATE: 'ai.flyer_generate',
  AI_VIDEO_GENERATE: 'ai.video_generate',
  AI_SPEECH_GENERATE: 'ai.speech_generate',
  AI_TEXT_GENERATE: 'ai.text_generate',

  // Instagram
  INSTAGRAM_ACCOUNT_CONNECT: 'instagram.account_connect',
  INSTAGRAM_ACCOUNT_DISCONNECT: 'instagram.account_disconnect',
  INSTAGRAM_POST_PUBLISH: 'instagram.post_publish',
  INSTAGRAM_POST_FAILED: 'instagram.post_failed',

  // Settings
  SETTINGS_UPDATE: 'settings.update',

  // Admin
  ADMIN_USER_UPDATE: 'admin.user_update',
  ADMIN_USER_DEACTIVATE: 'admin.user_deactivate',
  ADMIN_PRICING_UPDATE: 'admin.pricing_update',

  // System
  SYSTEM_CRON_RUN: 'system.cron_run',
  SYSTEM_CLEANUP: 'system.cleanup',

  // Errors
  ERROR_API: 'error.api',
  ERROR_DATABASE: 'error.database',
  ERROR_EXTERNAL_SERVICE: 'error.external_service',
} as const;

/**
 * Log activity asynchronously (fire-and-forget)
 * Does not block the main request
 */
export function logActivityAsync(
  entry: ActivityLogEntry
): void {
  // Fire and forget - don't await
  logActivity(entry).catch((err) => {
    console.error('[ActivityLogger] Failed to log activity:', err);
  });
}

/**
 * Log activity with await (when you need confirmation)
 */
export async function logActivity(
  entry: ActivityLogEntry
): Promise<void> {
  try {
    const sql = getSql();

    await sql`
      INSERT INTO activity_logs (
        user_id, organization_id, actor_email, actor_name,
        category, action, entity_type, entity_id, entity_name,
        details, before_state, after_state,
        ip_address, user_agent, request_id,
        severity, success, error_message, error_stack,
        duration_ms
      ) VALUES (
        ${entry.userId || null}::uuid,
        ${entry.organizationId || null},
        ${entry.actorEmail || null},
        ${entry.actorName || null},
        ${entry.category}::activity_category,
        ${entry.action},
        ${entry.entityType || null},
        ${entry.entityId || null}::uuid,
        ${entry.entityName || null},
        ${JSON.stringify(entry.details || {})}::jsonb,
        ${entry.beforeState ? JSON.stringify(entry.beforeState) : null}::jsonb,
        ${entry.afterState ? JSON.stringify(entry.afterState) : null}::jsonb,
        ${entry.ipAddress || null}::inet,
        ${entry.userAgent || null},
        ${entry.requestId || null},
        ${entry.severity || 'info'}::activity_severity,
        ${entry.success !== false},
        ${entry.errorMessage || null},
        ${entry.errorStack || null},
        ${entry.durationMs || null}
      )
    `;
  } catch (error) {
    // Never throw from logger - just log to console
    console.error('[ActivityLogger] Insert failed:', error);
  }
}

/**
 * Create a logger context from auth and request
 */
export function createLogContext(
  userId: string | null | undefined,
  organizationId: string | null | undefined,
  req: VercelRequest,
  userInfo?: { email?: string; name?: string }
): Pick<ActivityLogEntry, 'userId' | 'organizationId' | 'actorEmail' | 'actorName' | 'ipAddress' | 'userAgent' | 'requestId'> {
  const reqContext = extractRequestContext(req);
  return {
    userId: userId || null,
    organizationId: organizationId || null,
    actorEmail: userInfo?.email,
    actorName: userInfo?.name,
    ...reqContext,
  };
}

/**
 * Wrapper to log CRUD operations with before/after state
 */
export function logCrudOperation(
  context: Pick<ActivityLogEntry, 'userId' | 'organizationId' | 'ipAddress' | 'userAgent' | 'requestId'>,
  operation: 'create' | 'update' | 'delete',
  entityType: string,
  entityId: string,
  entityName?: string,
  beforeState?: Record<string, unknown>,
  afterState?: Record<string, unknown>
): void {
  logActivityAsync({
    ...context,
    category: 'crud',
    action: `${entityType}.${operation}`,
    entityType,
    entityId,
    entityName,
    beforeState,
    afterState,
    severity: 'info',
    success: true,
  });
}

/**
 * Wrapper to log errors
 */
export function logError(
  context: Pick<ActivityLogEntry, 'userId' | 'organizationId' | 'ipAddress' | 'userAgent' | 'requestId'>,
  action: string,
  error: Error,
  details?: Record<string, unknown>
): void {
  logActivityAsync({
    ...context,
    category: 'error',
    action,
    details,
    severity: 'error',
    success: false,
    errorMessage: error.message,
    errorStack: error.stack,
  });
}

/**
 * Wrapper to log AI generation
 */
export function logAIGeneration(
  context: Pick<ActivityLogEntry, 'userId' | 'organizationId' | 'ipAddress' | 'userAgent' | 'requestId'>,
  action: string,
  success: boolean,
  details?: Record<string, unknown>,
  durationMs?: number,
  errorMessage?: string
): void {
  logActivityAsync({
    ...context,
    category: 'ai_generation',
    action,
    details,
    severity: success ? 'info' : 'error',
    success,
    errorMessage,
    durationMs,
  });
}

/**
 * Wrapper to log publishing events
 */
export function logPublishing(
  context: Pick<ActivityLogEntry, 'userId' | 'organizationId' | 'ipAddress' | 'userAgent' | 'requestId'>,
  action: string,
  entityType: string,
  entityId: string,
  success: boolean,
  details?: Record<string, unknown>,
  errorMessage?: string
): void {
  logActivityAsync({
    ...context,
    category: 'publishing',
    action,
    entityType,
    entityId,
    details,
    severity: success ? 'info' : 'error',
    success,
    errorMessage,
  });
}

/**
 * Wrapper to log admin actions
 */
export function logAdminAction(
  context: Pick<ActivityLogEntry, 'userId' | 'organizationId' | 'ipAddress' | 'userAgent' | 'requestId'>,
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
  beforeState?: Record<string, unknown>,
  afterState?: Record<string, unknown>
): void {
  logActivityAsync({
    ...context,
    category: 'admin',
    action,
    entityType,
    entityId,
    details,
    beforeState,
    afterState,
    severity: 'info',
    success: true,
  });
}
