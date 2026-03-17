/**
 * Organization Context Helper
 * Uses session orgId and orgRole for multi-tenant access
 *
 * Roles (mapped to org:admin / org:member for compatibility):
 * - org:admin: Full access to organization (Better Auth owner/admin)
 * - org:member: Limited access to organization (Better Auth member)
 */

// Available permissions
export const PERMISSIONS = {
  CREATE_CAMPAIGN: "create_campaign",
  EDIT_CAMPAIGN: "edit_campaign",
  DELETE_CAMPAIGN: "delete_campaign",
  CREATE_FLYER: "create_flyer",
  SCHEDULE_POST: "schedule_post",
  PUBLISH_POST: "publish_post",
  VIEW_GALLERY: "view_gallery",
  DELETE_GALLERY: "delete_gallery",
  MANAGE_BRAND: "manage_brand",
  MANAGE_MEMBERS: "manage_members",
  MANAGE_ROLES: "manage_roles",
  MANAGE_ORGANIZATION: "manage_organization",
  VIEW_ANALYTICS: "view_analytics",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type OrgRole = "org:admin" | "org:member" | null;

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
  PERMISSIONS.MANAGE_BRAND, // Allow members to create/edit brand profile
];

/**
 * Get permissions for an organization role
 */
export function getPermissionsForRole(orgRole: OrgRole): Permission[] {
  // Personal context (no org) = all permissions
  if (!orgRole) return ALL_PERMISSIONS;

  // Admin has all permissions
  if (orgRole === "org:admin") return ALL_PERMISSIONS;

  // Member has limited permissions
  if (orgRole === "org:member") return MEMBER_PERMISSIONS;

  // Unknown role - no permissions
  return [];
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(orgRole: OrgRole, permission: Permission): boolean {
  const permissions = getPermissionsForRole(orgRole);
  return permissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(orgRole: OrgRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(orgRole, p));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(orgRole: OrgRole, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(orgRole, p));
}

/**
 * Require a specific permission, throwing an error if not present
 */
export function requirePermission(orgRole: OrgRole, permission: Permission): void {
  if (!hasPermission(orgRole, permission)) {
    throw new PermissionDeniedError(permission);
  }
}

/**
 * Custom error for permission denied
 */
export class PermissionDeniedError extends Error {
  permission: Permission;
  statusCode: number;

  constructor(permission: Permission) {
    super(`Permission denied: ${permission}`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
    this.statusCode = 403;
  }
}

/**
 * Custom error for organization access denied
 */
export class OrganizationAccessError extends Error {
  statusCode: number;

  constructor(message = "Organization access denied") {
    super(message);
    this.name = "OrganizationAccessError";
    this.statusCode = 403;
  }
}

export interface OrgContext {
  userId: string | undefined;
  organizationId: string | null;
  isPersonal: boolean;
  orgRole: OrgRole;
  permissions: Permission[];
}

export interface AuthContextInput {
  userId?: string;
  orgId?: string | null;
  orgRole?: OrgRole;
}

/**
 * Create organization context from auth session
 */
export function createOrgContext(auth: AuthContextInput | null | undefined): OrgContext {
  const { userId, orgId, orgRole } = auth || {};

  return {
    userId,
    organizationId: orgId || null,
    isPersonal: !orgId,
    orgRole: orgRole || null,
    permissions: getPermissionsForRole(orgRole || null),
  };
}

/**
 * Check if user is admin of current organization
 */
export function isAdmin(orgRole: OrgRole): boolean {
  return !orgRole || orgRole === "org:admin"; // Personal context or admin
}

/**
 * Check if this is personal context (no organization)
 */
export function isPersonalContext(orgId: string | null | undefined): boolean {
  return !orgId;
}
