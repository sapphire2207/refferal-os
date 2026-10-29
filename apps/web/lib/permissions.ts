import { UserRole, PipelineStage } from '@heals/types';

/**
 * Checks if user has any of the specified roles.
 * ADMIN has full operational access across general features,
 * with the exception of clinical note approvals which strictly
 * require licensed clinical credentials per Core_Doc.pdf.
 */
export function hasAnyRole(userRoles: UserRole[] | undefined, allowedRoles: UserRole[]): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  if (userRoles.includes(UserRole.ADMIN)) return true;
  return allowedRoles.some((role) => userRoles.includes(role));
}

/**
 * Determines whether user can operate or move referrals in the given pipeline stage.
 */
export function canManageStage(stage: PipelineStage, userRoles: UserRole[] | undefined): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  if (userRoles.includes(UserRole.ADMIN)) return true;

  switch (stage) {
    case PipelineStage.INTAKE:
      return userRoles.includes(UserRole.INTAKE_SPECIALIST) || userRoles.includes(UserRole.OFFICE_MANAGER);
    case PipelineStage.CLINICAL_REVIEW:
      return userRoles.includes(UserRole.CLINICAL_REVIEWER) || userRoles.includes(UserRole.CLINICAL_COORDINATOR);
    case PipelineStage.SCHEDULING:
      return userRoles.includes(UserRole.SCHEDULER) || userRoles.includes(UserRole.OFFICE_MANAGER);
    case PipelineStage.NP_VISIT:
      return userRoles.includes(UserRole.NURSE_PRACTITIONER);
    case PipelineStage.NOTES_QA:
      return userRoles.includes(UserRole.CLINICAL_COORDINATOR) || userRoles.includes(UserRole.CLINICAL_REVIEWER);
    case PipelineStage.BILLING:
      return userRoles.includes(UserRole.BILLING_COORDINATOR);
    default:
      return false;
  }
}

/**
 * Checks if user is permitted to transition a referral between two stages.
 */
export function canTransitionStage(
  fromStage: PipelineStage,
  toStage: PipelineStage,
  userRoles: UserRole[] | undefined,
): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  if (userRoles.includes(UserRole.ADMIN)) return true;

  // Forward transitions
  if (fromStage === PipelineStage.INTAKE && toStage === PipelineStage.CLINICAL_REVIEW) {
    return userRoles.includes(UserRole.INTAKE_SPECIALIST) || userRoles.includes(UserRole.OFFICE_MANAGER);
  }
  if (fromStage === PipelineStage.CLINICAL_REVIEW && toStage === PipelineStage.SCHEDULING) {
    return userRoles.includes(UserRole.CLINICAL_REVIEWER) || userRoles.includes(UserRole.CLINICAL_COORDINATOR);
  }
  if (fromStage === PipelineStage.SCHEDULING && toStage === PipelineStage.NP_VISIT) {
    return userRoles.includes(UserRole.SCHEDULER) || userRoles.includes(UserRole.OFFICE_MANAGER);
  }
  if (fromStage === PipelineStage.NP_VISIT && toStage === PipelineStage.NOTES_QA) {
    return userRoles.includes(UserRole.NURSE_PRACTITIONER);
  }
  if (fromStage === PipelineStage.NOTES_QA && toStage === PipelineStage.BILLING) {
    return userRoles.includes(UserRole.CLINICAL_COORDINATOR) || userRoles.includes(UserRole.CLINICAL_REVIEWER);
  }

  // Returns / Rollbacks
  if (fromStage === PipelineStage.CLINICAL_REVIEW && toStage === PipelineStage.INTAKE) {
    return userRoles.includes(UserRole.CLINICAL_REVIEWER) || userRoles.includes(UserRole.CLINICAL_COORDINATOR);
  }
  if (fromStage === PipelineStage.SCHEDULING && toStage === PipelineStage.CLINICAL_REVIEW) {
    return userRoles.includes(UserRole.SCHEDULER) || userRoles.includes(UserRole.OFFICE_MANAGER);
  }
  if (fromStage === PipelineStage.NP_VISIT && toStage === PipelineStage.SCHEDULING) {
    return userRoles.includes(UserRole.NURSE_PRACTITIONER);
  }
  if (fromStage === PipelineStage.NOTES_QA && toStage === PipelineStage.NP_VISIT) {
    return userRoles.includes(UserRole.CLINICAL_COORDINATOR) || userRoles.includes(UserRole.CLINICAL_REVIEWER);
  }
  if (fromStage === PipelineStage.BILLING && toStage === PipelineStage.NOTES_QA) {
    return userRoles.includes(UserRole.BILLING_COORDINATOR);
  }

  return false;
}

/**
 * Checks whether user can approve or return clinical notes.
 * Authoritative: Core_Doc.pdf pages 4 & 7 specify this is a licensed clinical function.
 * Admin and Office Manager are strictly excluded.
 */
export function canReviewNotes(userRoles: UserRole[] | undefined): boolean {
  if (!userRoles) return false;
  return userRoles.includes(UserRole.CLINICAL_COORDINATOR) || userRoles.includes(UserRole.CLINICAL_REVIEWER);
}

/**
 * Checks whether user can create superbill claims and adjudicate.
 */
export function canManageBilling(userRoles: UserRole[] | undefined): boolean {
  if (!userRoles) return false;
  return userRoles.includes(UserRole.ADMIN) || userRoles.includes(UserRole.BILLING_COORDINATOR);
}

/**
 * Checks whether user can schedule or dispatch mobile NP appointments.
 */
export function canManageAppointments(userRoles: UserRole[] | undefined): boolean {
  if (!userRoles) return false;
  return (
    userRoles.includes(UserRole.ADMIN) ||
    userRoles.includes(UserRole.SCHEDULER) ||
    userRoles.includes(UserRole.OFFICE_MANAGER)
  );
}

/**
 * Checks whether user can document and digitally sign mobile clinical evaluations.
 */
export function canSignVisits(userRoles: UserRole[] | undefined): boolean {
  if (!userRoles) return false;
  return userRoles.includes(UserRole.ADMIN) || userRoles.includes(UserRole.NURSE_PRACTITIONER);
}

/**
 * Checks whether user can create new referral intake records.
 */
export function canCreateReferrals(userRoles: UserRole[] | undefined): boolean {
  if (!userRoles) return false;
  return (
    userRoles.includes(UserRole.ADMIN) ||
    userRoles.includes(UserRole.INTAKE_SPECIALIST) ||
    userRoles.includes(UserRole.OFFICE_MANAGER)
  );
}

/**
 * Checks whether user can access administrative and audit tools.
 */
export function canAccessAdmin(userRoles: UserRole[] | undefined): boolean {
  if (!userRoles) return false;
  return userRoles.includes(UserRole.ADMIN) || userRoles.includes(UserRole.COMPLIANCE);
}

