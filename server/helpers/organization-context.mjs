/**
 * Organization Context Helper
 * Handles permission checking and context resolution for multi-tenant access
 */

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
};

// All permissions (for personal context)
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/**
 * @typedef {Object} OrganizationContext
 * @property {string} userId - The user's UUID
 * @property {string|null} organizationId - The organization ID or null for personal context
 * @property {string[]} permissions - Array of permission strings
 * @property {boolean} isPersonal - Whether this is personal context
 * @property {string|null} roleName - The role name (null for personal)
 */

/**
 * Resolve the organization context for a request
 * @param {Function} sql - Neon SQL function
 * @param {string} userId - The resolved user UUID
 * @param {string|null} organizationId - The organization ID or null/undefined for personal
 * @returns {Promise<OrganizationContext>}
 */
export async function resolveOrganizationContext(sql, userId, organizationId) {
  // If no organization, return personal context with all permissions
  if (!organizationId) {
    return {
      userId,
      organizationId: null,
      permissions: ALL_PERMISSIONS,
      isPersonal: true,
      roleName: null,
    };
  }

  // Get user's membership and permissions for this organization
  const result = await sql`
    SELECT
      om.id as member_id,
      om.status,
      r.name as role_name,
      r.permissions
    FROM organization_members om
    JOIN organization_roles r ON om.role_id = r.id
    WHERE om.organization_id = ${organizationId}
      AND om.user_id = ${userId}
      AND om.status = 'active'
    LIMIT 1
  `;

  if (result.length === 0) {
    throw new OrganizationAccessError('User is not a member of this organization');
  }

  const member = result[0];

  return {
    userId,
    organizationId,
    permissions: member.permissions || [],
    isPersonal: false,
    roleName: member.role_name,
  };
}

/**
 * Check if context has a specific permission
 * @param {OrganizationContext} context
 * @param {string} permission
 * @returns {boolean}
 */
export function hasPermission(context, permission) {
  // Personal context has all permissions
  if (context.isPersonal) return true;

  // Check if permission exists in array
  return Array.isArray(context.permissions) && context.permissions.includes(permission);
}

/**
 * Check if context has any of the specified permissions
 * @param {OrganizationContext} context
 * @param {string[]} permissions
 * @returns {boolean}
 */
export function hasAnyPermission(context, permissions) {
  return permissions.some(p => hasPermission(context, p));
}

/**
 * Check if context has all of the specified permissions
 * @param {OrganizationContext} context
 * @param {string[]} permissions
 * @returns {boolean}
 */
export function hasAllPermissions(context, permissions) {
  return permissions.every(p => hasPermission(context, p));
}

/**
 * Require a specific permission, throwing an error if not present
 * @param {OrganizationContext} context
 * @param {string} permission
 * @throws {PermissionDeniedError}
 */
export function requirePermission(context, permission) {
  if (!hasPermission(context, permission)) {
    throw new PermissionDeniedError(permission);
  }
}

/**
 * Get the SQL filter clause for data isolation
 * Returns either organization_id filter or user_id + null organization filter
 * @param {OrganizationContext} context
 * @returns {{ field: string, value: string }}
 */
export function getDataFilter(context) {
  if (context.isPersonal) {
    // Personal context: filter by user_id AND organization_id IS NULL
    return {
      useOrganization: false,
      userId: context.userId,
    };
  }

  // Organization context: filter by organization_id
  return {
    useOrganization: true,
    organizationId: context.organizationId,
  };
}

/**
 * Custom error for organization access denied
 */
export class OrganizationAccessError extends Error {
  constructor(message = 'Access denied to organization') {
    super(message);
    this.name = 'OrganizationAccessError';
    this.statusCode = 403;
  }
}

/**
 * Custom error for permission denied
 */
export class PermissionDeniedError extends Error {
  constructor(permission) {
    super(`Permission denied: ${permission}`);
    this.name = 'PermissionDeniedError';
    this.permission = permission;
    this.statusCode = 403;
  }
}

/**
 * Express middleware to resolve organization context
 * Adds ctx.orgContext to the request
 * @param {Function} sql - Neon SQL function
 */
export function organizationContextMiddleware(getSql) {
  return async (req, res, next) => {
    try {
      const sql = getSql();
      const userId = req.resolvedUserId; // Set by previous middleware
      const organizationId = req.query.organization_id || req.body?.organization_id || null;

      if (!userId) {
        return next(); // Let the route handle missing user
      }

      req.orgContext = await resolveOrganizationContext(sql, userId, organizationId);
      next();
    } catch (error) {
      if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      next(error);
    }
  };
}

/**
 * Generate random token for invites
 * @param {number} length - Token length (default 32)
 * @returns {string}
 */
export function generateInviteToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Generate slug from organization name
 * @param {string} name
 * @returns {string}
 */
export function generateSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')      // Replace non-alphanumeric with dash
    .replace(/^-+|-+$/g, '')          // Remove leading/trailing dashes
    .substring(0, 100);               // Limit length
}
