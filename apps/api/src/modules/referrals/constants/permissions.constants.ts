import { UserRole } from '@heals/types';

/**
 * Referral Workflow Action Permissions
 * 
 * Permissions are structured as hierarchical dot notation:
 * - referrals.view.{stage} - View referrals in specific stage
 * - referrals.transition.to_{stage} - Transition referral to specific stage
 * - referrals.transition.return_to_{stage} - Return referral to previous stage
 * - referrals.review.{action} - Clinical review actions
 * - notes.review - Review clinical notes
 * - notes.approve - Approve clinical notes
 * - referrals.{action} - General referral actions
 */

// ============================================================================
// Permission Constants
// ============================================================================

export const PERMISSIONS = {
  // Referral View Permissions
  REFERRALS_VIEW: 'referrals.view',
  REFERRALS_VIEW_INTAKE: 'referrals.view.intake',
  REFERRALS_VIEW_CLINICAL_REVIEW: 'referrals.view.clinical_review',
  REFERRALS_VIEW_SCHEDULING: 'referrals.view.scheduling',
  REFERRALS_VIEW_NP_VISIT: 'referrals.view.np_visit',
  REFERRALS_VIEW_NOTES_QA: 'referrals.view.notes_qa',
  REFERRALS_VIEW_BILLING: 'referrals.view.billing',

  // Stage Transition Permissions (Forward)
  REFERRALS_TRANSITION_TO_CLINICAL_REVIEW: 'referrals.transition.to_clinical_review',
  REFERRALS_TRANSITION_TO_SCHEDULING: 'referrals.transition.to_scheduling',
  REFERRALS_TRANSITION_TO_NP_VISIT: 'referrals.transition.to_np_visit',
  REFERRALS_TRANSITION_TO_NOTES_QA: 'referrals.transition.to_notes_qa',
  REFERRALS_TRANSITION_TO_BILLING: 'referrals.transition.to_billing',

  // Stage Transition Permissions (Backward)
  REFERRALS_TRANSITION_RETURN_TO_INTAKE: 'referrals.transition.return_to_intake',
  REFERRALS_TRANSITION_RETURN_TO_CLINICAL_REVIEW: 'referrals.transition.return_to_clinical_review',
  REFERRALS_TRANSITION_RETURN_TO_SCHEDULING: 'referrals.transition.return_to_scheduling',
  REFERRALS_TRANSITION_RETURN_TO_NP_VISIT: 'referrals.transition.return_to_np_visit',

  // Clinical Review Permissions
  REFERRALS_REVIEW: 'referrals.review',
  REFERRALS_REVIEW_ACCEPT: 'referrals.review.accept',
  REFERRALS_REVIEW_REJECT: 'referrals.review.reject',
  REFERRALS_REVIEW_RETURN: 'referrals.review.return',

  // Note Review Permissions
  NOTES_REVIEW: 'notes.review',
  NOTES_APPROVE: 'notes.approve',
  NOTES_RETURN_FOR_CORRECTION: 'notes.return_for_correction',

  // General Referral Actions
  REFERRALS_CREATE: 'referrals.create',
  REFERRALS_UPDATE: 'referrals.update',
  REFERRALS_DELETE: 'referrals.delete',
  REFERRALS_ASSIGN: 'referrals.assign',
  REFERRALS_UPDATE_WORK_STATUS: 'referrals.update_work_status',
  REFERRALS_UPDATE_PRIORITY: 'referrals.update_priority',

  // Assignment Permissions
  REFERRALS_ASSIGN_TO_SELF: 'referrals.assign.to_self',
  REFERRALS_ASSIGN_TO_OTHERS: 'referrals.assign.to_others',
  REFERRALS_REASSIGN: 'referrals.reassign',

  // Document Permissions
  DOCUMENTS_UPLOAD: 'documents.upload',
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_DELETE: 'documents.delete',
  DOCUMENTS_VERIFY: 'documents.verify',

  // Appointment Permissions
  APPOINTMENTS_CREATE: 'appointments.create',
  APPOINTMENTS_UPDATE: 'appointments.update',
  APPOINTMENTS_CANCEL: 'appointments.cancel',
  APPOINTMENTS_CONFIRM: 'appointments.confirm',

  // Encounter Permissions
  ENCOUNTERS_CREATE: 'encounters.create',
  ENCOUNTERS_UPDATE: 'encounters.update',
  ENCOUNTERS_COMPLETE: 'encounters.complete',

  // Clinical Note Permissions
  CLINICAL_NOTES_CREATE: 'clinical_notes.create',
  CLINICAL_NOTES_UPDATE: 'clinical_notes.update',
  CLINICAL_NOTES_SUBMIT: 'clinical_notes.submit',
  CLINICAL_NOTES_SIGN: 'clinical_notes.sign',

  // Claim Permissions
  CLAIMS_CREATE: 'claims.create',
  CLAIMS_SUBMIT: 'claims.submit',
  CLAIMS_UPDATE_STATUS: 'claims.update_status',

  // Audit Permissions
  AUDIT_VIEW: 'audit.view',
  AUDIT_EXPORT: 'audit.export',

  // Admin Permissions
  ADMIN_FULL_ACCESS: 'admin.full_access',
  ADMIN_USER_MANAGEMENT: 'admin.user_management',
  ADMIN_ROLE_MANAGEMENT: 'admin.role_management',
  ADMIN_SYSTEM_CONFIG: 'admin.system_config',

  // Compliance Permissions
  COMPLIANCE_VIEW_ALL: 'compliance.view_all',
  COMPLIANCE_AUDIT_ACCESS: 'compliance.audit_access',
  COMPLIANCE_EXPORT: 'compliance.export',
} as const;

// Type for permission string literals
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ============================================================================
// Role-Based Permission Mappings
// ============================================================================

/**
 * ROLE_PERMISSIONS maps each UserRole to its set of permissions.
 * 
 * Design Principle: Action-based authorization
 * - Users are granted permissions based on their role
 * - Permissions define what actions can be performed
 * - Stage ownership is separate from permission grants
 * 
 * Requirements: 14.2, 14.6
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.INTAKE_SPECIALIST]: [
    // View permissions
    PERMISSIONS.REFERRALS_VIEW,
    PERMISSIONS.REFERRALS_VIEW_INTAKE,
    PERMISSIONS.REFERRALS_VIEW_CLINICAL_REVIEW,

    // Transition permissions
    PERMISSIONS.REFERRALS_TRANSITION_TO_CLINICAL_REVIEW,

    // General actions
    PERMISSIONS.REFERRALS_CREATE,
    PERMISSIONS.REFERRALS_UPDATE,
    PERMISSIONS.REFERRALS_UPDATE_WORK_STATUS,
    PERMISSIONS.REFERRALS_UPDATE_PRIORITY,
    PERMISSIONS.REFERRALS_ASSIGN_TO_SELF,

    // Documents
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.DOCUMENTS_VERIFY,
  ],

  [UserRole.CLINICAL_REVIEWER]: [
    // View permissions
    PERMISSIONS.REFERRALS_VIEW,
    PERMISSIONS.REFERRALS_VIEW_INTAKE,
    PERMISSIONS.REFERRALS_VIEW_CLINICAL_REVIEW,
    PERMISSIONS.REFERRALS_VIEW_SCHEDULING,
    PERMISSIONS.REFERRALS_VIEW_NP_VISIT,
    PERMISSIONS.REFERRALS_VIEW_NOTES_QA,

    // Transition permissions
    PERMISSIONS.REFERRALS_TRANSITION_TO_SCHEDULING,
    PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_INTAKE,
    PERMISSIONS.REFERRALS_TRANSITION_TO_BILLING,
    PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_NP_VISIT,

    // Clinical review permissions
    PERMISSIONS.REFERRALS_REVIEW,
    PERMISSIONS.REFERRALS_REVIEW_ACCEPT,
    PERMISSIONS.REFERRALS_REVIEW_REJECT,
    PERMISSIONS.REFERRALS_REVIEW_RETURN,

    // Note review permissions
    PERMISSIONS.NOTES_REVIEW,
    PERMISSIONS.NOTES_APPROVE,
    PERMISSIONS.NOTES_RETURN_FOR_CORRECTION,

    // General actions
    PERMISSIONS.REFERRALS_UPDATE_WORK_STATUS,
    PERMISSIONS.REFERRALS_ASSIGN_TO_SELF,

    // Documents
    PERMISSIONS.DOCUMENTS_VIEW,
  ],

  [UserRole.CLINICAL_COORDINATOR]: [
    // View permissions (all stages)
    PERMISSIONS.REFERRALS_VIEW,
    PERMISSIONS.REFERRALS_VIEW_INTAKE,
    PERMISSIONS.REFERRALS_VIEW_CLINICAL_REVIEW,
    PERMISSIONS.REFERRALS_VIEW_SCHEDULING,
    PERMISSIONS.REFERRALS_VIEW_NP_VISIT,
    PERMISSIONS.REFERRALS_VIEW_NOTES_QA,
    PERMISSIONS.REFERRALS_VIEW_BILLING,

    // Transition permissions
    PERMISSIONS.REFERRALS_TRANSITION_TO_SCHEDULING,
    PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_INTAKE,
    PERMISSIONS.REFERRALS_TRANSITION_TO_BILLING,
    PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_NP_VISIT,

    // Clinical review permissions
    PERMISSIONS.REFERRALS_REVIEW,
    PERMISSIONS.REFERRALS_REVIEW_ACCEPT,
    PERMISSIONS.REFERRALS_REVIEW_REJECT,
    PERMISSIONS.REFERRALS_REVIEW_RETURN,

    // Note review permissions
    PERMISSIONS.NOTES_REVIEW,
    PERMISSIONS.NOTES_APPROVE,
    PERMISSIONS.NOTES_RETURN_FOR_CORRECTION,

    // General actions
    PERMISSIONS.REFERRALS_UPDATE,
    PERMISSIONS.REFERRALS_UPDATE_WORK_STATUS,
    PERMISSIONS.REFERRALS_UPDATE_PRIORITY,
    PERMISSIONS.REFERRALS_ASSIGN_TO_SELF,
    PERMISSIONS.REFERRALS_ASSIGN_TO_OTHERS,
    PERMISSIONS.REFERRALS_REASSIGN,

    // Documents
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.DOCUMENTS_UPLOAD,
  ],

  [UserRole.SCHEDULER]: [
    // View permissions
    PERMISSIONS.REFERRALS_VIEW,
    PERMISSIONS.REFERRALS_VIEW_CLINICAL_REVIEW,
    PERMISSIONS.REFERRALS_VIEW_SCHEDULING,
    PERMISSIONS.REFERRALS_VIEW_NP_VISIT,

    // Transition permissions
    PERMISSIONS.REFERRALS_TRANSITION_TO_NP_VISIT,

    // General actions
    PERMISSIONS.REFERRALS_UPDATE_WORK_STATUS,
    PERMISSIONS.REFERRALS_ASSIGN_TO_SELF,

    // Appointment permissions
    PERMISSIONS.APPOINTMENTS_CREATE,
    PERMISSIONS.APPOINTMENTS_UPDATE,
    PERMISSIONS.APPOINTMENTS_CANCEL,
    PERMISSIONS.APPOINTMENTS_CONFIRM,

    // Documents
    PERMISSIONS.DOCUMENTS_VIEW,
  ],

  [UserRole.OFFICE_MANAGER]: [
    // View permissions (broader access)
    PERMISSIONS.REFERRALS_VIEW,
    PERMISSIONS.REFERRALS_VIEW_INTAKE,
    PERMISSIONS.REFERRALS_VIEW_CLINICAL_REVIEW,
    PERMISSIONS.REFERRALS_VIEW_SCHEDULING,
    PERMISSIONS.REFERRALS_VIEW_NP_VISIT,
    PERMISSIONS.REFERRALS_VIEW_NOTES_QA,
    PERMISSIONS.REFERRALS_VIEW_BILLING,

    // Transition permissions
    PERMISSIONS.REFERRALS_TRANSITION_TO_NP_VISIT,
    PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_SCHEDULING,

    // General actions
    PERMISSIONS.REFERRALS_UPDATE,
    PERMISSIONS.REFERRALS_UPDATE_WORK_STATUS,
    PERMISSIONS.REFERRALS_UPDATE_PRIORITY,
    PERMISSIONS.REFERRALS_ASSIGN_TO_SELF,
    PERMISSIONS.REFERRALS_ASSIGN_TO_OTHERS,
    PERMISSIONS.REFERRALS_REASSIGN,

    // Appointment permissions
    PERMISSIONS.APPOINTMENTS_CREATE,
    PERMISSIONS.APPOINTMENTS_UPDATE,
    PERMISSIONS.APPOINTMENTS_CANCEL,
    PERMISSIONS.APPOINTMENTS_CONFIRM,

    // Documents
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.DOCUMENTS_UPLOAD,

    // Audit
    PERMISSIONS.AUDIT_VIEW,
  ],

  [UserRole.NURSE_PRACTITIONER]: [
    // View permissions
    PERMISSIONS.REFERRALS_VIEW,
    PERMISSIONS.REFERRALS_VIEW_SCHEDULING,
    PERMISSIONS.REFERRALS_VIEW_NP_VISIT,
    PERMISSIONS.REFERRALS_VIEW_NOTES_QA,

    // Transition permissions
    PERMISSIONS.REFERRALS_TRANSITION_TO_NOTES_QA,
    PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_SCHEDULING,

    // General actions
    PERMISSIONS.REFERRALS_UPDATE_WORK_STATUS,
    PERMISSIONS.REFERRALS_ASSIGN_TO_SELF,

    // Encounter permissions
    PERMISSIONS.ENCOUNTERS_CREATE,
    PERMISSIONS.ENCOUNTERS_UPDATE,
    PERMISSIONS.ENCOUNTERS_COMPLETE,

    // Clinical note permissions
    PERMISSIONS.CLINICAL_NOTES_CREATE,
    PERMISSIONS.CLINICAL_NOTES_UPDATE,
    PERMISSIONS.CLINICAL_NOTES_SUBMIT,
    PERMISSIONS.CLINICAL_NOTES_SIGN,

    // Documents
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.DOCUMENTS_UPLOAD,
  ],

  [UserRole.BILLING_COORDINATOR]: [
    // View permissions
    PERMISSIONS.REFERRALS_VIEW,
    PERMISSIONS.REFERRALS_VIEW_NOTES_QA,
    PERMISSIONS.REFERRALS_VIEW_BILLING,

    // Transition permissions
    PERMISSIONS.REFERRALS_TRANSITION_TO_BILLING,

    // General actions
    PERMISSIONS.REFERRALS_UPDATE_WORK_STATUS,
    PERMISSIONS.REFERRALS_ASSIGN_TO_SELF,

    // Claim permissions
    PERMISSIONS.CLAIMS_CREATE,
    PERMISSIONS.CLAIMS_SUBMIT,
    PERMISSIONS.CLAIMS_UPDATE_STATUS,

    // Documents
    PERMISSIONS.DOCUMENTS_VIEW,

    // Audit
    PERMISSIONS.AUDIT_VIEW,
  ],

  [UserRole.ADMIN]: [
    // Admin has all permissions
    PERMISSIONS.ADMIN_FULL_ACCESS,
    PERMISSIONS.ADMIN_USER_MANAGEMENT,
    PERMISSIONS.ADMIN_ROLE_MANAGEMENT,
    PERMISSIONS.ADMIN_SYSTEM_CONFIG,

    // All referral permissions
    PERMISSIONS.REFERRALS_VIEW,
    PERMISSIONS.REFERRALS_VIEW_INTAKE,
    PERMISSIONS.REFERRALS_VIEW_CLINICAL_REVIEW,
    PERMISSIONS.REFERRALS_VIEW_SCHEDULING,
    PERMISSIONS.REFERRALS_VIEW_NP_VISIT,
    PERMISSIONS.REFERRALS_VIEW_NOTES_QA,
    PERMISSIONS.REFERRALS_VIEW_BILLING,
    PERMISSIONS.REFERRALS_CREATE,
    PERMISSIONS.REFERRALS_UPDATE,
    PERMISSIONS.REFERRALS_DELETE,

    // All transition permissions
    PERMISSIONS.REFERRALS_TRANSITION_TO_CLINICAL_REVIEW,
    PERMISSIONS.REFERRALS_TRANSITION_TO_SCHEDULING,
    PERMISSIONS.REFERRALS_TRANSITION_TO_NP_VISIT,
    PERMISSIONS.REFERRALS_TRANSITION_TO_NOTES_QA,
    PERMISSIONS.REFERRALS_TRANSITION_TO_BILLING,
    PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_INTAKE,
    PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_CLINICAL_REVIEW,
    PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_SCHEDULING,
    PERMISSIONS.REFERRALS_TRANSITION_RETURN_TO_NP_VISIT,

    // All review permissions
    PERMISSIONS.REFERRALS_REVIEW,
    PERMISSIONS.REFERRALS_REVIEW_ACCEPT,
    PERMISSIONS.REFERRALS_REVIEW_REJECT,
    PERMISSIONS.REFERRALS_REVIEW_RETURN,
    PERMISSIONS.NOTES_REVIEW,
    PERMISSIONS.NOTES_APPROVE,
    PERMISSIONS.NOTES_RETURN_FOR_CORRECTION,

    // All assignment permissions
    PERMISSIONS.REFERRALS_ASSIGN_TO_SELF,
    PERMISSIONS.REFERRALS_ASSIGN_TO_OTHERS,
    PERMISSIONS.REFERRALS_REASSIGN,
    PERMISSIONS.REFERRALS_UPDATE_WORK_STATUS,
    PERMISSIONS.REFERRALS_UPDATE_PRIORITY,

    // All document permissions
    PERMISSIONS.DOCUMENTS_UPLOAD,
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.DOCUMENTS_DELETE,
    PERMISSIONS.DOCUMENTS_VERIFY,

    // All appointment permissions
    PERMISSIONS.APPOINTMENTS_CREATE,
    PERMISSIONS.APPOINTMENTS_UPDATE,
    PERMISSIONS.APPOINTMENTS_CANCEL,
    PERMISSIONS.APPOINTMENTS_CONFIRM,

    // All encounter permissions
    PERMISSIONS.ENCOUNTERS_CREATE,
    PERMISSIONS.ENCOUNTERS_UPDATE,
    PERMISSIONS.ENCOUNTERS_COMPLETE,

    // All clinical note permissions
    PERMISSIONS.CLINICAL_NOTES_CREATE,
    PERMISSIONS.CLINICAL_NOTES_UPDATE,
    PERMISSIONS.CLINICAL_NOTES_SUBMIT,
    PERMISSIONS.CLINICAL_NOTES_SIGN,

    // All claim permissions
    PERMISSIONS.CLAIMS_CREATE,
    PERMISSIONS.CLAIMS_SUBMIT,
    PERMISSIONS.CLAIMS_UPDATE_STATUS,

    // All audit permissions
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.AUDIT_EXPORT,
  ],

  [UserRole.COMPLIANCE]: [
    // Compliance has read-only access to everything
    PERMISSIONS.COMPLIANCE_VIEW_ALL,
    PERMISSIONS.COMPLIANCE_AUDIT_ACCESS,
    PERMISSIONS.COMPLIANCE_EXPORT,

    // View permissions (all stages)
    PERMISSIONS.REFERRALS_VIEW,
    PERMISSIONS.REFERRALS_VIEW_INTAKE,
    PERMISSIONS.REFERRALS_VIEW_CLINICAL_REVIEW,
    PERMISSIONS.REFERRALS_VIEW_SCHEDULING,
    PERMISSIONS.REFERRALS_VIEW_NP_VISIT,
    PERMISSIONS.REFERRALS_VIEW_NOTES_QA,
    PERMISSIONS.REFERRALS_VIEW_BILLING,

    // Documents (read-only)
    PERMISSIONS.DOCUMENTS_VIEW,

    // Audit
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.AUDIT_EXPORT,
  ],
};

// ============================================================================
// Permission Check Helpers
// ============================================================================

/**
 * Checks if a user has a specific permission based on their roles
 * @param userRoles Array of roles assigned to the user
 * @param requiredPermission The permission to check for
 * @returns true if the user has the permission, false otherwise
 */
export function hasPermission(
  userRoles: UserRole[],
  requiredPermission: Permission,
): boolean {
  // Admin always has all permissions
  if (userRoles.includes(UserRole.ADMIN)) {
    return true;
  }

  // Check if any of the user's roles grant the required permission
  return userRoles.some((role) => {
    const rolePermissions = ROLE_PERMISSIONS[role];
    return rolePermissions.includes(requiredPermission);
  });
}

/**
 * Gets all permissions for a set of roles
 * @param userRoles Array of roles assigned to the user
 * @returns Array of unique permissions
 */
export function getPermissionsForRoles(userRoles: UserRole[]): Permission[] {
  const permissions = new Set<Permission>();

  userRoles.forEach((role) => {
    const rolePermissions = ROLE_PERMISSIONS[role];
    rolePermissions.forEach((permission) => permissions.add(permission));
  });

  return Array.from(permissions);
}

/**
 * Checks if a user has any of the specified permissions
 * @param userRoles Array of roles assigned to the user
 * @param requiredPermissions Array of permissions (user needs at least one)
 * @returns true if the user has at least one of the permissions
 */
export function hasAnyPermission(
  userRoles: UserRole[],
  requiredPermissions: Permission[],
): boolean {
  return requiredPermissions.some((permission) =>
    hasPermission(userRoles, permission),
  );
}

/**
 * Checks if a user has all of the specified permissions
 * @param userRoles Array of roles assigned to the user
 * @param requiredPermissions Array of permissions (user needs all)
 * @returns true if the user has all of the permissions
 */
export function hasAllPermissions(
  userRoles: UserRole[],
  requiredPermissions: Permission[],
): boolean {
  return requiredPermissions.every((permission) =>
    hasPermission(userRoles, permission),
  );
}

/**
 * Gets the permission required for transitioning to a specific stage
 * @param targetStage The pipeline stage to transition to
 * @returns The permission string required for the transition
 */
export function getTransitionPermission(targetStage: string): Permission {
  const stageKey = targetStage.toLowerCase();
  const permissionKey = `REFERRALS_TRANSITION_TO_${targetStage}` as keyof typeof PERMISSIONS;
  
  if (permissionKey in PERMISSIONS) {
    return PERMISSIONS[permissionKey];
  }

  throw new Error(`No permission mapping found for stage: ${targetStage}`);
}

/**
 * Gets the permission required for returning to a specific stage
 * @param targetStage The pipeline stage to return to
 * @returns The permission string required for the backward transition
 */
export function getReturnPermission(targetStage: string): Permission {
  const permissionKey = `REFERRALS_TRANSITION_RETURN_TO_${targetStage}` as keyof typeof PERMISSIONS;
  
  if (permissionKey in PERMISSIONS) {
    return PERMISSIONS[permissionKey];
  }

  throw new Error(`No return permission mapping found for stage: ${targetStage}`);
}

/**
 * Validates that all roles in the system have permission mappings
 * Useful for startup validation
 * @returns Array of roles that are missing permission mappings
 */
export function validateRolePermissionMappings(): UserRole[] {
  const allRoles = Object.values(UserRole);
  const mappedRoles = Object.keys(ROLE_PERMISSIONS) as UserRole[];
  
  return allRoles.filter((role) => !mappedRoles.includes(role));
}
