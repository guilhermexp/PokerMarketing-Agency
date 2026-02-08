/**
 * Organization Context Helper - Clerk Integration
 * Uses Clerk's orgId and orgRole from JWT for multi-tenant access
 *
 * Clerk free tier provides only 2 roles:
 * - org:admin: Full access to organization
 * - org:member: Limited access to organization
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
};

// All permissions (for personal context and admins)
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// Permissions granted to org:member (limited set)
export const MEMBER_PERMISSIONS = [
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
 * Get permissions for a Clerk role
 * @param {string|null|undefined} orgRole - Clerk role (org:admin, org:member)
 * @returns {string[]}
 */
export function getPermissionsForRole(orgRole) {
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
 * @param {string|null|undefined} orgRole - Clerk role
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(orgRole, permission) {
  const permissions = getPermissionsForRole(orgRole);
  return permissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 * @param {string|null|undefined} orgRole
 * @param {string[]} permissions
 * @returns {boolean}
 */
export function hasAnyPermission(orgRole, permissions) {
  return permissions.some((p) => hasPermission(orgRole, p));
}

/**
 * Check if a role has all of the specified permissions
 * @param {string|null|undefined} orgRole
 * @param {string[]} permissions
 * @returns {boolean}
 */
export function hasAllPermissions(orgRole, permissions) {
  return permissions.every((p) => hasPermission(orgRole, p));
}

/**
 * Require a specific permission, throwing an error if not present
 * @param {string|null|undefined} orgRole
 * @param {string} permission
 * @throws {PermissionDeniedError}
 */
export function requirePermission(orgRole, permission) {
  if (!hasPermission(orgRole, permission)) {
    throw new PermissionDeniedError(permission);
  }
}

/**
 * Custom error for permission denied
 */
export class PermissionDeniedError extends Error {
  constructor(permission) {
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
  constructor(message = "Organization access denied") {
    super(message);
    this.name = "OrganizationAccessError";
    this.statusCode = 403;
  }
}

/**
 * Create organization context from Clerk auth
 * @param {Object} auth - Clerk auth object from getAuth(req)
 * @returns {Object} Organization context
 */
export function createOrgContext(auth) {
  const { userId, orgId, orgRole } = auth || {};

  return {
    userId,
    organizationId: orgId || null,
    isPersonal: !orgId,
    orgRole: orgRole || null,
    permissions: getPermissionsForRole(orgRole),
  };
}

/**
 * Check if user is admin of current organization
 * @param {string|null|undefined} orgRole
 * @returns {boolean}
 */
export function isAdmin(orgRole) {
  return !orgRole || orgRole === "org:admin"; // Personal context or admin
}

/**
 * Check if this is personal context (no organization)
 * @param {string|null|undefined} orgId
 * @returns {boolean}
 */
export function isPersonalContext(orgId) {
  return !orgId;
}
