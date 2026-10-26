import { UserRole } from '@repo/types';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  getPermissionsForRoles,
  hasAnyPermission,
  hasAllPermissions,
  getTransitionPermission,
  getReturnPermission,
  validateRolePermissionMappings,
} from './permissions.constants';

describe('Permission Constants', () => {
  describe('ROLE_PERMISSIONS', () => {
    it('should have mappings for all UserRole values', () => {
      const missingRoles = validateRolePermissionMappings();
      expect(missingRoles).toHaveLength(0);
    });

    it('should grant ADMIN role all permissions', () => {
      const adminPermissions = ROLE_PERMISSIONS[UserRole.ADMIN];
      
      // Admin should have full access
      expect(adminPermissions).toContain(PERMISSIONS.ADMIN_FULL_ACCESS);
      
      // Admin should have all transition permissions
      expect(adminPermissions).toContain(PERMISSIONS.REFERRALS_TRANSITION_TO_CLINICAL_REVIEW);
      expect(adminPermissions).toContain(PERMISSIONS.REFERRALS_TRANSITION_TO_SCHEDULING);
      expect(adminPermissions).toContain(PERMISSIONS.REFERRALS_TRANSITION_TO_NP_VISIT);
      expect(adminPermissions).toContain(PERMISSIONS.REFERRALS_TRANSITION_TO_NOTES_QA);
      expect(adminPermissions).toContain(PERMISSIONS.REFERRALS_TRANSITION_TO_BILLING);
    });

    it('should grant INTAKE_SPECIALIST permission to transition to clinical review', () => {
      const permissions = ROLE_PERMISSIONS[UserRole.INTAKE_SPECIALIST];
      expect(permissions).toContain(PERMISSIONS.REFERRALS_TRANSITION_TO_CLINICAL_REVIEW);
    });

    it('should grant CLINICAL_REVIEWER permission to accept/reject/return', () => {
      const permissions = ROLE_PERMISSIONS[UserRole.CLINICAL_REVIEWER];
      expect(permissions).toContain(PERMISSIONS.REFERRALS_REVIEW_ACCEPT);
      expect(permissions).toContain(PERMISSIONS.REFERRALS_REVIEW_REJECT);
      expect(permissions).toContain(PERMISSIONS.REFERRALS_REVIEW_RETURN);
    });

    it('should grant SCHEDULER permission to create appointments', () => {
      const permissions = ROLE_PERMISSIONS[UserRole.SCHEDULER];
      expect(permissions).toContain(PERMISSIONS.APPOINTMENTS_CREATE);
      expect(permissions).toContain(PERMISSIONS.APPOINTMENTS_CONFIRM);
    });

    it('should grant NURSE_PRACTITIONER permission to create clinical notes', () => {
      const permissions = ROLE_PERMISSIONS[UserRole.NURSE_PRACTITIONER];
      expect(permissions).toContain(PERMISSIONS.CLINICAL_NOTES_CREATE);
      expect(permissions).toContain(PERMISSIONS.CLINICAL_NOTES_SUBMIT);
      expect(permissions).toContain(PERMISSIONS.CLINICAL_NOTES_SIGN);
    });

    it('should grant BILLING_COORDINATOR permission to submit claims', () => {
      const permissions = ROLE_PERMISSIONS[UserRole.BILLING_COORDINATOR];
      expect(permissions).toContain(PERMISSIONS.CLAIMS_SUBMIT);
      expect(permissions).toContain(PERMISSIONS.REFERRALS_TRANSITION_TO_BILLING);
    });

    it('should grant COMPLIANCE read-only access', () => {
      const permissions = ROLE_PERMISSIONS[UserRole.COMPLIANCE];
      
      // Should have view permissions
      expect(permissions).toContain(PERMISSIONS.REFERRALS_VIEW);
      expect(permissions).toContain(PERMISSIONS.AUDIT_VIEW);
      
      // Should NOT have write permissions
      expect(permissions).not.toContain(PERMISSIONS.REFERRALS_CREATE);
      expect(permissions).not.toContain(PERMISSIONS.REFERRALS_UPDATE);
      expect(permissions).not.toContain(PERMISSIONS.REFERRALS_DELETE);
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has the required permission', () => {
      const roles = [UserRole.INTAKE_SPECIALIST];
      const result = hasPermission(roles, PERMISSIONS.REFERRALS_TRANSITION_TO_CLINICAL_REVIEW);
      expect(result).toBe(true);
    });

    it('should return false when user lacks the required permission', () => {
      const roles = [UserRole.INTAKE_SPECIALIST];
      const result = hasPermission(roles, PERMISSIONS.CLAIMS_SUBMIT);
      expect(result).toBe(false);
    });

    it('should return true for ADMIN role regardless of permission', () => {
      const roles = [UserRole.ADMIN];
      const result = hasPermission(roles, PERMISSIONS.CLAIMS_SUBMIT);
      expect(result).toBe(true);
    });

    it('should return true when user has multiple roles with required permission', () => {
      const roles = [UserRole.INTAKE_SPECIALIST, UserRole.SCHEDULER];
      const result = hasPermission(roles, PERMISSIONS.APPOINTMENTS_CREATE);
      expect(result).toBe(true);
    });
  });

  describe('getPermissionsForRoles', () => {
    it('should return all unique permissions for given roles', () => {
      const roles = [UserRole.INTAKE_SPECIALIST];
      const permissions = getPermissionsForRoles(roles);
      
      expect(permissions).toContain(PERMISSIONS.REFERRALS_VIEW);
      expect(permissions).toContain(PERMISSIONS.REFERRALS_TRANSITION_TO_CLINICAL_REVIEW);
      expect(permissions.length).toBeGreaterThan(0);
    });

    it('should not duplicate permissions when user has multiple roles', () => {
      const roles = [UserRole.CLINICAL_REVIEWER, UserRole.CLINICAL_COORDINATOR];
      const permissions = getPermissionsForRoles(roles);
      
      // Both roles have REFERRALS_VIEW, should only appear once
      const viewPermissionCount = permissions.filter(
        (p) => p === PERMISSIONS.REFERRALS_VIEW
      ).length;
      expect(viewPermissionCount).toBe(1);
    });

    it('should combine permissions from multiple roles', () => {
      const roles = [UserRole.INTAKE_SPECIALIST, UserRole.BILLING_COORDINATOR];
      const permissions = getPermissionsForRoles(roles);
      
      // Should have permissions from both roles
      expect(permissions).toContain(PERMISSIONS.REFERRALS_TRANSITION_TO_CLINICAL_REVIEW);
      expect(permissions).toContain(PERMISSIONS.CLAIMS_SUBMIT);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true when user has at least one of the required permissions', () => {
      const roles = [UserRole.INTAKE_SPECIALIST];
      const requiredPermissions = [
        PERMISSIONS.REFERRALS_TRANSITION_TO_CLINICAL_REVIEW,
        PERMISSIONS.CLAIMS_SUBMIT,
      ];
      const result = hasAnyPermission(roles, requiredPermissions);
      expect(result).toBe(true);
    });

    it('should return false when user has none of the required permissions', () => {
      const roles = [UserRole.INTAKE_SPECIALIST];
      const requiredPermissions = [
        PERMISSIONS.CLAIMS_SUBMIT,
        PERMISSIONS.NOTES_APPROVE,
      ];
      const result = hasAnyPermission(roles, requiredPermissions);
      expect(result).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true when user has all required permissions', () => {
      const roles = [UserRole.CLINICAL_REVIEWER];
      const requiredPermissions = [
        PERMISSIONS.REFERRALS_REVIEW_ACCEPT,
        PERMISSIONS.REFERRALS_REVIEW_REJECT,
      ];
      const result = hasAllPermissions(roles, requiredPermissions);
      expect(result).toBe(true);
    });

    it('should return false when user is missing one or more permissions', () => {
      const roles = [UserRole.INTAKE_SPECIALIST];
      const requiredPermissions = [
        PERMISSIONS.REFERRALS_VIEW,
        PERMISSIONS.CLAIMS_SUBMIT, // Not granted to intake specialist
      ];
      const result = hasAllPermissions(roles, requiredPermissions);
      expect(result).toBe(false);
    });
  });

  describe('getTransitionPermission', () => {
    it('should return correct permission for CLINICAL_REVIEW stage', () => {
      const permission = getTransitionPermission('CLINICAL_REVIEW');
      expect(permission).toBe(PERMISSIONS.REFERRALS_TRANSITION_TO_CLINICAL_REVIEW);
    });

    it('should return correct permission for SCHEDULING stage', () => {
      const permission = getTransitionPermission('SCHEDULING');
      expect(permission).toBe(PERMISSIONS.REFERRALS_TRANSITION_TO_SCHEDULING);
    });

    it('should return correct permission for NP_VISIT stage', () => {
      const permission = getTransitionPermission('NP_VISIT');
      expect(permission).toBe(PERMISSIONS.REFERRALS_TRANSITION_TO_NP_VISIT);
    });

    it('should return correct permission for NOTES_QA stage', () => {
      const permission = getTransitionPermission('NOTES_QA');
      expect(permission).toBe(PERMISSIONS.REFERRALS_TRANSITION_TO_NOTES_QA);
    });

    it('should return correct permission for BILLING stage', () => {
      const permission = getTransitionPermission('BILLING');
      expect(permission).toBe(PERMISSIONS.REFERRALS_TRANSITION_TO_BILLING);
    });

    it('should throw error for invalid stage', () => {
      expect(() => getTransitionPermission('INVALID_STAGE')).toThrow();
    });
  });

  describe('getReturnPermission', () => {
    it('should return correct permission for returning to INTAKE', () => {
      const permission = getReturnPermission('INTAKE');
      expect(permission).toBe(PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_INTAKE);
    });

    it('should return correct permission for returning to CLINICAL_REVIEW', () => {
      const permission = getReturnPermission('CLINICAL_REVIEW');
      expect(permission).toBe(PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_CLINICAL_REVIEW);
    });

    it('should return correct permission for returning to SCHEDULING', () => {
      const permission = getReturnPermission('SCHEDULING');
      expect(permission).toBe(PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_SCHEDULING);
    });

    it('should return correct permission for returning to NP_VISIT', () => {
      const permission = getReturnPermission('NP_VISIT');
      expect(permission).toBe(PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_NP_VISIT);
    });

    it('should throw error for invalid stage', () => {
      expect(() => getReturnPermission('INVALID_STAGE')).toThrow();
    });
  });

  describe('Permission Requirement Validation', () => {
    it('should ensure CLINICAL_REVIEWER can return referrals to INTAKE', () => {
      const roles = [UserRole.CLINICAL_REVIEWER];
      expect(hasPermission(roles, PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_INTAKE)).toBe(true);
    });

    it('should ensure CLINICAL_COORDINATOR has broader permissions than CLINICAL_REVIEWER', () => {
      const reviewerPerms = ROLE_PERMISSIONS[UserRole.CLINICAL_REVIEWER];
      const coordinatorPerms = ROLE_PERMISSIONS[UserRole.CLINICAL_COORDINATOR];
      
      // Coordinator should have at least as many permissions as reviewer
      expect(coordinatorPerms.length).toBeGreaterThanOrEqual(reviewerPerms.length);
      
      // Coordinator should have reassignment capabilities
      expect(coordinatorPerms).toContain(PERMISSIONS.REFERRALS_REASSIGN);
    });

    it('should ensure OFFICE_MANAGER has broader scheduling permissions than SCHEDULER', () => {
      const schedulerPerms = ROLE_PERMISSIONS[UserRole.SCHEDULER];
      const managerPerms = ROLE_PERMISSIONS[UserRole.OFFICE_MANAGER];
      
      // Manager should have all scheduler permissions
      const schedulerAppointmentPerms = schedulerPerms.filter(p => p.startsWith('appointments.'));
      schedulerAppointmentPerms.forEach(perm => {
        expect(managerPerms).toContain(perm);
      });
      
      // Manager should have reassignment capabilities
      expect(managerPerms).toContain(PERMISSIONS.REFERRALS_REASSIGN);
    });
  });
});
