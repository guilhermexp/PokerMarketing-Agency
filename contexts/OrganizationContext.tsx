/**
 * Organization Context
 * Manages the current organization/team context and permissions
 * Allows users to switch between personal workspace and organizations
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getOrganizations,
  createOrganization,
  getUserInvites,
  acceptOrganizationInvite,
  declineOrganizationInvite,
  type DbOrganization,
  type DbOrganizationInvite,
} from '../services/apiClient';
import { useAuth } from '../components/auth/AuthWrapper';

// Available permissions (must match backend)
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

interface OrganizationContextValue {
  // Current context
  currentOrganization: DbOrganization | null;
  organizations: DbOrganization[];
  pendingInvites: DbOrganizationInvite[];
  isLoading: boolean;

  // Whether we're in personal context (null org) or organization context
  isPersonalContext: boolean;

  // The current organization_id to use in API calls (null for personal)
  currentOrganizationId: string | null;

  // Current permissions (all permissions in personal context)
  permissions: string[];

  // Actions
  switchOrganization: (orgId: string | null) => void;
  refreshOrganizations: () => Promise<void>;
  createNewOrganization: (data: { name: string; description?: string; logo_url?: string }) => Promise<DbOrganization>;

  // Invite actions
  refreshInvites: () => Promise<void>;
  acceptInvite: (token: string) => Promise<DbOrganization>;
  declineInvite: (token: string) => Promise<void>;

  // Permission helpers
  hasPermission: (permission: Permission | string) => boolean;
  hasAnyPermission: (permissions: (Permission | string)[]) => boolean;
  hasAllPermissions: (permissions: (Permission | string)[]) => boolean;

  // Convenience permission checks
  canCreateContent: boolean;
  canEditContent: boolean;
  canDeleteContent: boolean;
  canManageTeam: boolean;
  canManageOrganization: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

const STORAGE_KEY = 'selectedOrganization';
const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();

  const [organizations, setOrganizations] = useState<DbOrganization[]>([]);
  const [pendingInvites, setPendingInvites] = useState<DbOrganizationInvite[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Get current organization object
  const currentOrganization = currentOrgId
    ? organizations.find(org => org.id === currentOrgId) || null
    : null;

  // Get permissions for current context
  const permissions = currentOrganization
    ? currentOrganization.permissions || []
    : ALL_PERMISSIONS;

  // Load saved organization from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved !== 'personal') {
      setCurrentOrgId(saved);
    }
    setInitialized(true);
  }, []);

  // Load organizations when userId is available
  const loadOrganizations = useCallback(async () => {
    if (!userId) {
      setOrganizations([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const orgs = await getOrganizations(userId);
      setOrganizations(orgs);

      // Validate that current org still exists
      if (currentOrgId && !orgs.find(org => org.id === currentOrgId)) {
        setCurrentOrgId(null);
        localStorage.setItem(STORAGE_KEY, 'personal');
      }
    } catch (error) {
      console.error('[OrganizationContext] Failed to load organizations:', error);
      setOrganizations([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId, currentOrgId]);

  // Load invites
  const loadInvites = useCallback(async () => {
    if (!userId) {
      setPendingInvites([]);
      return;
    }

    try {
      const invites = await getUserInvites(userId);
      setPendingInvites(invites);
    } catch (error) {
      console.error('[OrganizationContext] Failed to load invites:', error);
      setPendingInvites([]);
    }
  }, [userId]);

  useEffect(() => {
    if (initialized && userId) {
      loadOrganizations();
      loadInvites();
    }
  }, [initialized, userId, loadOrganizations, loadInvites]);

  // Switch organization
  const switchOrganization = useCallback((orgId: string | null) => {
    setCurrentOrgId(orgId);
    localStorage.setItem(STORAGE_KEY, orgId || 'personal');
  }, []);

  // Create new organization
  const createNewOrganization = useCallback(async (data: { name: string; description?: string; logo_url?: string }) => {
    if (!userId) throw new Error('Not authenticated');

    const org = await createOrganization(userId, data);
    await loadOrganizations();

    // Auto-switch to new organization
    switchOrganization(org.id);

    return org;
  }, [userId, loadOrganizations, switchOrganization]);

  // Accept invite
  const acceptInvite = useCallback(async (token: string) => {
    if (!userId) throw new Error('Not authenticated');

    const result = await acceptOrganizationInvite(userId, token);
    await loadOrganizations();
    await loadInvites();

    // Auto-switch to new organization
    switchOrganization(result.organization.id);

    return result.organization;
  }, [userId, loadOrganizations, loadInvites, switchOrganization]);

  // Decline invite
  const declineInvite = useCallback(async (token: string) => {
    if (!userId) throw new Error('Not authenticated');

    await declineOrganizationInvite(userId, token);
    await loadInvites();
  }, [userId, loadInvites]);

  // Permission check functions
  const hasPermission = useCallback((permission: Permission | string): boolean => {
    if (!currentOrganization) return true; // Personal context has all permissions
    return permissions.includes(permission);
  }, [currentOrganization, permissions]);

  const hasAnyPermission = useCallback((perms: (Permission | string)[]): boolean => {
    return perms.some(p => hasPermission(p));
  }, [hasPermission]);

  const hasAllPermissions = useCallback((perms: (Permission | string)[]): boolean => {
    return perms.every(p => hasPermission(p));
  }, [hasPermission]);

  // Convenience permission checks
  const canCreateContent = hasAnyPermission([
    PERMISSIONS.CREATE_CAMPAIGN,
    PERMISSIONS.CREATE_FLYER,
  ]);

  const canEditContent = hasAnyPermission([
    PERMISSIONS.EDIT_CAMPAIGN,
    PERMISSIONS.SCHEDULE_POST,
    PERMISSIONS.PUBLISH_POST,
  ]);

  const canDeleteContent = hasAnyPermission([
    PERMISSIONS.DELETE_CAMPAIGN,
    PERMISSIONS.DELETE_GALLERY,
  ]);

  const canManageTeam = hasPermission(PERMISSIONS.MANAGE_MEMBERS);
  const canManageOrganization = hasPermission(PERMISSIONS.MANAGE_ORGANIZATION);

  const value: OrganizationContextValue = {
    currentOrganization,
    organizations,
    pendingInvites,
    isLoading,
    isPersonalContext: !currentOrganization,
    currentOrganizationId: currentOrgId,
    permissions,
    switchOrganization,
    refreshOrganizations: loadOrganizations,
    createNewOrganization,
    refreshInvites: loadInvites,
    acceptInvite,
    declineInvite,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canCreateContent,
    canEditContent,
    canDeleteContent,
    canManageTeam,
    canManageOrganization,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

// Hook for checking permissions
export function usePermission(permission: Permission | string): boolean {
  const { hasPermission } = useOrganization();
  return hasPermission(permission);
}

// Hook for checking multiple permissions
export function usePermissions(permissions: (Permission | string)[]): {
  hasAll: boolean;
  hasAny: boolean;
  check: (permission: Permission | string) => boolean;
} {
  const { hasPermission, hasAllPermissions, hasAnyPermission } = useOrganization();

  return {
    hasAll: hasAllPermissions(permissions),
    hasAny: hasAnyPermission(permissions),
    check: hasPermission,
  };
}
