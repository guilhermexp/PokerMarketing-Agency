import { describe, it, expect } from 'vitest';
import {
  roleHasPermission,
  getPermissionsForRole,
  PERMISSIONS,
  ADMIN_PERMISSIONS,
  MEMBER_PERMISSIONS,
} from '../permissions';

describe('permissions', () => {
  describe('roleHasPermission', () => {
    it('should grant all permissions for personal context (no role)', () => {
      expect(roleHasPermission(null, PERMISSIONS.CREATE_CAMPAIGN)).toBe(true);
      expect(roleHasPermission(undefined, PERMISSIONS.MANAGE_ORGANIZATION)).toBe(true);
    });

    it('should grant all permissions for org:admin', () => {
      expect(roleHasPermission('org:admin', PERMISSIONS.CREATE_CAMPAIGN)).toBe(true);
      expect(roleHasPermission('org:admin', PERMISSIONS.MANAGE_ORGANIZATION)).toBe(true);
    });

    it('should grant limited permissions for org:member', () => {
      expect(roleHasPermission('org:member', PERMISSIONS.CREATE_CAMPAIGN)).toBe(true);
      expect(roleHasPermission('org:member', PERMISSIONS.DELETE_CAMPAIGN)).toBe(false);
    });
  });

  describe('getPermissionsForRole', () => {
    it('should return all permissions for personal context', () => {
      const permissions = getPermissionsForRole(null);
      expect(permissions).toEqual(ADMIN_PERMISSIONS);
    });

    it('should return limited permissions for org:member', () => {
      const permissions = getPermissionsForRole('org:member');
      expect(permissions).toEqual(MEMBER_PERMISSIONS);
      expect(permissions.length).toBe(8);
    });
  });
});
