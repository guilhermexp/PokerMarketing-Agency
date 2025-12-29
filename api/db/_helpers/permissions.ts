/**
 * Permission helpers for Vercel Serverless Functions
 * Uses Clerk's orgId and orgRole from JWT for multi-tenant access
 *
 * Clerk free tier provides only 2 roles:
 * - org:admin: Full access to organization
 * - org:member: Limited access to organization
 */

import type { AuthContext } from './auth';

// Available permissions
export const PERMISSIONS = {
  CREATE_CAMPAIGN: 'create_campaign',
  EDIT_CAMPAIGN: 'edit_campaign',
  DELETE_CAMPAIGN: 'delete_campaign',
  CREATE_FLYER: 'create_flyer',
  SCHEDULE_POST: 'schedule_post',
  PUBLISH_POST: 'publish_post',
  VIEW_GALLERY: 'view_gallery',
  DELETE_GALLERY: 'delete_gallery',
  MANAGE_BRAND: 'manage_brand',
  MANAGE_MEMBERS: 'manage_members',
  MANAGE_ROLES: 'manage_roles',
  MANAGE_ORGANIZATION: 'manage_organization',
  VIEW_ANALYTICS: 'view_analytics',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// All permissions (for personal context and admins)
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

// Permissions granted to org:member (limited set)
export const MEMBER_PERMISSIONS: Permission[] = [
  PERMISSIONS.CREATE_CAMPAIGN,
  PERMISSIONS.EDIT_CAMPAIGN,
  PERMISSIONS.CREATE_FLYER,
  PERMISSIONS.SCHEDULE_POST,
  PERMISSIONS.PUBLISH_POST,
  PERMISSIONS.VIEW_GALLERY,
  PERMISSIONS.VIEW_ANALYTICS,
];

/**
 * Get permissions for a Clerk role
 */
export function getPermissionsForRole(orgRole: string | null | undefined): Permission[] {
  // Personal context (no org) = all permissions
  if (!orgRole) return ALL_PERMISSIONS;

  // Admin has all permissions
  if (orgRole === 'org:admin') return ALL_PERMISSIONS;

  // Member has limited permissions
  if (orgRole === 'org:member') return MEMBER_PERMISSIONS;

  // Unknown role - no permissions
  return [];
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(orgRole: string | null | undefined, permission: Permission): boolean {
  const permissions = getPermissionsForRole(orgRole);
  return permissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(
  orgRole: string | null | undefined,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(orgRole, p));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(
  orgRole: string | null | undefined,
  permissions: Permission[]
): boolean {
  return permissions.every((p) => hasPermission(orgRole, p));
}

/**
 * Require a specific permission, throwing an error if not present
 */
export function requirePermission(
  orgRole: string | null | undefined,
  permission: Permission
): void {
  if (!hasPermission(orgRole, permission)) {
    throw new PermissionDeniedError(permission);
  }
}

/**
 * Custom error for permission denied
 */
export class PermissionDeniedError extends Error {
  public readonly permission: Permission;
  public readonly statusCode = 403;

  constructor(permission: Permission) {
    super(`Permission denied: ${permission}`);
    this.name = 'PermissionDeniedError';
    this.permission = permission;
  }
}

/**
 * Custom error for organization access denied
 */
export class OrganizationAccessError extends Error {
  public readonly statusCode = 403;

  constructor(message = 'Organization access denied') {
    super(message);
    this.name = 'OrganizationAccessError';
  }
}

/**
 * Organization context with permissions
 */
export interface OrgContext {
  userId: string | null;
  organizationId: string | null;
  isPersonal: boolean;
  orgRole: string | null;
  permissions: Permission[];
}

/**
 * Create organization context from auth
 */
export function createOrgContext(auth: AuthContext): OrgContext {
  return {
    userId: auth.userId,
    organizationId: auth.orgId || null,
    isPersonal: !auth.orgId,
    orgRole: auth.orgRole || null,
    permissions: getPermissionsForRole(auth.orgRole),
  };
}

/**
 * Check if user is admin of current organization
 */
export function isAdmin(orgRole: string | null | undefined): boolean {
  return !orgRole || orgRole === 'org:admin'; // Personal context or admin
}

/**
 * Check if this is personal context (no organization)
 */
export function isPersonalContext(orgId: string | null | undefined): boolean {
  return !orgId;
}
