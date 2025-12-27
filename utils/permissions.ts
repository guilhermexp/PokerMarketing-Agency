/**
 * Permission Mapping for Clerk Organizations
 *
 * Clerk free tier only has 2 roles: org:admin and org:member
 * This module maps our 13 custom permissions to these 2 roles
 */

import { useAuth } from '@clerk/clerk-react';

// All available permissions in the system
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

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Permissions granted to org:admin (all permissions)
export const ADMIN_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

// Permissions granted to org:member (limited set)
export const MEMBER_PERMISSIONS: Permission[] = [
  PERMISSIONS.CREATE_CAMPAIGN,
  PERMISSIONS.EDIT_CAMPAIGN,
  PERMISSIONS.CREATE_FLYER,
  PERMISSIONS.SCHEDULE_POST,
  PERMISSIONS.VIEW_GALLERY,
  PERMISSIONS.VIEW_ANALYTICS,
];

/**
 * Check if a role has a specific permission
 */
export function roleHasPermission(orgRole: string | null | undefined, permission: Permission): boolean {
  // Personal context (no org) = all permissions
  if (!orgRole) return true;

  // Admin has all permissions
  if (orgRole === 'org:admin') return true;

  // Member has limited permissions
  if (orgRole === 'org:member') {
    return MEMBER_PERMISSIONS.includes(permission);
  }

  return false;
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(orgRole: string | null | undefined): Permission[] {
  if (!orgRole) return ADMIN_PERMISSIONS; // Personal context
  if (orgRole === 'org:admin') return ADMIN_PERMISSIONS;
  if (orgRole === 'org:member') return MEMBER_PERMISSIONS;
  return [];
}

/**
 * Hook to check a single permission
 */
export function usePermission(permission: Permission): boolean {
  const { orgRole, orgId } = useAuth();

  // Personal context (no org) = all permissions
  if (!orgId) return true;

  return roleHasPermission(orgRole, permission);
}

/**
 * Hook to check multiple permissions (returns true if user has ALL)
 */
export function usePermissions(permissions: Permission[]): boolean {
  const { orgRole, orgId } = useAuth();

  // Personal context (no org) = all permissions
  if (!orgId) return true;

  return permissions.every(p => roleHasPermission(orgRole, p));
}

/**
 * Hook to check if user has any of the specified permissions
 */
export function useAnyPermission(permissions: Permission[]): boolean {
  const { orgRole, orgId } = useAuth();

  // Personal context (no org) = all permissions
  if (!orgId) return true;

  return permissions.some(p => roleHasPermission(orgRole, p));
}

/**
 * Convenience hooks for common permission checks
 */
export function useCanCreateContent(): boolean {
  return usePermission(PERMISSIONS.CREATE_CAMPAIGN);
}

export function useCanEditContent(): boolean {
  return usePermission(PERMISSIONS.EDIT_CAMPAIGN);
}

export function useCanDeleteContent(): boolean {
  return usePermission(PERMISSIONS.DELETE_CAMPAIGN);
}

export function useCanManageTeam(): boolean {
  return usePermission(PERMISSIONS.MANAGE_MEMBERS);
}

export function useCanManageOrganization(): boolean {
  return usePermission(PERMISSIONS.MANAGE_ORGANIZATION);
}

export function useIsAdmin(): boolean {
  const { orgRole, orgId } = useAuth();
  if (!orgId) return true; // Personal context = full access
  return orgRole === 'org:admin';
}
