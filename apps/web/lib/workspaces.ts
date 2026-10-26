import { UserRole } from '@heals/types';

export type WorkspaceId =
  | 'intake'
  | 'clinical_review'
  | 'scheduling'
  | 'np_visit'
  | 'clinical_qa'
  | 'billing'
  | 'office_ops'
  | 'admin'
  | 'compliance';

export interface WorkspaceConfig {
  id: WorkspaceId;
  name: string;
  badge: string;
  description: string;
  requiredRoles: UserRole[];
  defaultRoute: string;
  iconName: string;
  primaryStage?: string;
}

export const WORKSPACES: Record<WorkspaceId, WorkspaceConfig> = {
  intake: {
    id: 'intake',
    name: 'Intake Workspace',
    badge: 'Intake Queue',
    description: 'Document extraction, deduplication, patient intake and eligibility verification',
    requiredRoles: [UserRole.INTAKE_SPECIALIST, UserRole.ADMIN],
    defaultRoute: '/referrals?stage=INTAKE',
    iconName: 'Inbox',
    primaryStage: 'INTAKE',
  },
  clinical_review: {
    id: 'clinical_review',
    name: 'Clinical Review',
    badge: 'Clinical Triage',
    description: 'Clinical criteria assessment, acceptance gates, returns, and physician orders',
    requiredRoles: [UserRole.CLINICAL_REVIEWER, UserRole.ADMIN],
    defaultRoute: '/referrals?stage=CLINICAL_REVIEW',
    iconName: 'Stethoscope',
    primaryStage: 'CLINICAL_REVIEW',
  },
  scheduling: {
    id: 'scheduling',
    name: 'Scheduling Queue',
    badge: 'Dispatch & Booking',
    description: 'Provider territory dispatch, patient appointment booking and scheduling confirmation',
    requiredRoles: [UserRole.SCHEDULER, UserRole.OFFICE_MANAGER, UserRole.ADMIN],
    defaultRoute: '/schedule',
    iconName: 'Calendar',
    primaryStage: 'SCHEDULING',
  },
  np_visit: {
    id: 'np_visit',
    name: 'NP Visits & Encounters',
    badge: 'Mobile Provider',
    description: 'Mobile clinical visit documentation, SOAP notes drafting, and digital signatures',
    requiredRoles: [UserRole.NURSE_PRACTITIONER, UserRole.ADMIN],
    defaultRoute: '/visits',
    iconName: 'UserCheck',
    primaryStage: 'NP_VISIT',
  },
  clinical_qa: {
    id: 'clinical_qa',
    name: 'Notes QA & Review',
    badge: 'Clinical Quality',
    description: 'Encounter note review, clinical approval gates, and return-for-correction routing',
    requiredRoles: [UserRole.CLINICAL_COORDINATOR, UserRole.ADMIN],
    defaultRoute: '/notes-review',
    iconName: 'FileCheck',
    primaryStage: 'NOTES_QA',
  },
  billing: {
    id: 'billing',
    name: 'Billing & Claims',
    badge: 'Billing Ready',
    description: 'Claim readiness qualification, superbill generation, and adjudication status',
    requiredRoles: [UserRole.BILLING_COORDINATOR, UserRole.ADMIN],
    defaultRoute: '/billing',
    iconName: 'Receipt',
    primaryStage: 'BILLING',
  },
  office_ops: {
    id: 'office_ops',
    name: 'Office Operations',
    badge: 'Master Pipeline',
    description: 'Master referral lifecycle oversight, throughput metrics, and workload reassignments',
    requiredRoles: [UserRole.OFFICE_MANAGER, UserRole.ADMIN],
    defaultRoute: '/referrals',
    iconName: 'LayoutGrid',
  },
  admin: {
    id: 'admin',
    name: 'System Admin',
    badge: 'System Admin',
    description: 'User provisioning, role and geographic scope configuration, account security',
    requiredRoles: [UserRole.ADMIN],
    defaultRoute: '/admin/users',
    iconName: 'Shield',
  },
  compliance: {
    id: 'compliance',
    name: 'HIPAA Compliance',
    badge: 'Audit & Compliance',
    description: 'Centralized immutable audit logs, PHI access surveillance, and regulatory queries',
    requiredRoles: [UserRole.COMPLIANCE, UserRole.ADMIN],
    defaultRoute: '/admin/audit',
    iconName: 'ScrollText',
  },
};

/**
 * Derives available workspaces from user's actual roles.
 */
export function getAvailableWorkspaces(userRoles: UserRole[] = []): WorkspaceConfig[] {
  if (!userRoles || userRoles.length === 0) return [];
  const isAdmin = userRoles.includes(UserRole.ADMIN);

  return Object.values(WORKSPACES).filter((ws) => {
    if (isAdmin) return true;
    return ws.requiredRoles.some((role) => userRoles.includes(role));
  });
}
