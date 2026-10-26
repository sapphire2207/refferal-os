import {
  PipelineStage,
  WorkStatus,
  UserRole,
  ClinicalReviewDecision,
  NoteReviewDecision,
} from '@heals/types';

// Workflow Stage Configuration
export const STAGE_OWNERS: Record<PipelineStage, UserRole[]> = {
  [PipelineStage.INTAKE]: [UserRole.INTAKE_SPECIALIST],
  [PipelineStage.CLINICAL_REVIEW]: [
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
  ],
  [PipelineStage.SCHEDULING]: [UserRole.OFFICE_MANAGER, UserRole.SCHEDULER],
  [PipelineStage.NP_VISIT]: [UserRole.NURSE_PRACTITIONER],
  [PipelineStage.NOTES_QA]: [UserRole.CLINICAL_REVIEWER, UserRole.CLINICAL_COORDINATOR],
  [PipelineStage.BILLING]: [UserRole.BILLING_COORDINATOR],
};

// Stage Transition Rules
export const ALLOWED_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  [PipelineStage.INTAKE]: [PipelineStage.CLINICAL_REVIEW],
  [PipelineStage.CLINICAL_REVIEW]: [PipelineStage.SCHEDULING, PipelineStage.INTAKE], // Can return to intake
  [PipelineStage.SCHEDULING]: [PipelineStage.NP_VISIT, PipelineStage.CLINICAL_REVIEW], // Can reschedule
  [PipelineStage.NP_VISIT]: [PipelineStage.NOTES_QA, PipelineStage.SCHEDULING], // Can go back if no-show
  [PipelineStage.NOTES_QA]: [PipelineStage.BILLING, PipelineStage.NP_VISIT], // Can return for correction
  [PipelineStage.BILLING]: [], // Terminal stage for forward flow
};

// Required Fields Per Stage
export const REQUIRED_FIELDS_PER_STAGE: Record<PipelineStage, string[]> = {
  [PipelineStage.INTAKE]: [
    'patientId',
    'referralSource',
    'insurancePayer',
    'coverageVerified',
    'site',
    'state',
  ],
  [PipelineStage.CLINICAL_REVIEW]: ['clinicalReviewDecision'],
  [PipelineStage.SCHEDULING]: ['appointmentScheduled', 'nursePractitionerAssigned'],
  [PipelineStage.NP_VISIT]: ['visitOutcome', 'dateOfService'],
  [PipelineStage.NOTES_QA]: ['clinicalNoteSubmitted', 'noteReviewDecision'],
  [PipelineStage.BILLING]: ['billingChecksComplete'],
};

// Role Permissions Map
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.INTAKE_SPECIALIST]: [
    'referrals.view.intake',
    'referrals.create',
    'referrals.update.intake',
    'patients.view.limited',
    'patients.create',
    'patients.update',
    'documents.upload',
    'documents.view',
    'documents.verify',
  ],
  [UserRole.CLINICAL_REVIEWER]: [
    'referrals.view.clinical_review',
    'referrals.view.notes_qa',
    'referrals.review.accept',
    'referrals.review.reject',
    'referrals.review.return',
    'documents.view.clinical',
    'patients.view.clinical',
    'notes.review',
    'notes.approve',
  ],
  [UserRole.CLINICAL_COORDINATOR]: [
    'referrals.view.clinical_review',
    'referrals.view.notes_qa',
    'referrals.view.all',
    'referrals.review.accept',
    'referrals.review.reject',
    'referrals.review.return',
    'documents.view.clinical',
    'patients.view.clinical',
    'notes.review',
    'notes.approve',
    'reports.view.clinical',
  ],
  [UserRole.OFFICE_MANAGER]: [
    'referrals.view.all',
    'referrals.assign',
    'appointments.view',
    'appointments.create',
    'appointments.update',
    'appointments.cancel',
    'patients.view.limited',
    'reports.view.operational',
  ],
  [UserRole.SCHEDULER]: [
    'referrals.view.scheduling',
    'appointments.view',
    'appointments.create',
    'appointments.update',
    'appointments.cancel',
    'patients.view.limited',
  ],
  [UserRole.NURSE_PRACTITIONER]: [
    'referrals.view.np_visit',
    'encounters.create',
    'encounters.update',
    'notes.create',
    'notes.update',
    'notes.sign',
    'documents.upload.clinical',
    'patients.view.clinical',
  ],
  [UserRole.BILLING_COORDINATOR]: [
    'referrals.view.billing',
    'claims.view',
    'claims.create',
    'claims.submit',
    'claims.update',
    'patients.view.billing',
    'documents.view.billing',
    'reports.view.billing',
  ],
  [UserRole.ADMIN]: [
    'users.manage',
    'roles.manage',
    'system.configure',
    'audit.view',
    'reports.view.all',
  ],
  [UserRole.COMPLIANCE]: [
    'audit.view',
    'audit.export',
    'reports.view.compliance',
    'access_logs.view',
  ],
};

// SLA Configuration (in hours)
export const SLA_THRESHOLDS: Record<PipelineStage, number> = {
  [PipelineStage.INTAKE]: 24,
  [PipelineStage.CLINICAL_REVIEW]: 48,
  [PipelineStage.SCHEDULING]: 72,
  [PipelineStage.NP_VISIT]: 168, // 7 days
  [PipelineStage.NOTES_QA]: 24,
  [PipelineStage.BILLING]: 48,
};

// File Upload Configuration
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/bmp',
];

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

// Validation Constants
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;

// Rate Limiting
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 100;

// Session Configuration
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const JWT_EXPIRATION = '24h';
export const REFRESH_TOKEN_EXPIRATION = '7d';

// Pagination Defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// WebSocket Configuration
export const WS_HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
export const WS_RECONNECT_DELAY_MS = 3000; // 3 seconds

// Cache TTL (in seconds)
export const CACHE_TTL = {
  USER_PERMISSIONS: 300, // 5 minutes
  DASHBOARD_METRICS: 60, // 1 minute
  REFERRAL_LIST: 30, // 30 seconds
};

// Stage Display Names
export const STAGE_DISPLAY_NAMES: Record<PipelineStage, string> = {
  [PipelineStage.INTAKE]: 'Referral Intake',
  [PipelineStage.CLINICAL_REVIEW]: 'Clinical Review',
  [PipelineStage.SCHEDULING]: 'Scheduling',
  [PipelineStage.NP_VISIT]: 'NP Visit',
  [PipelineStage.NOTES_QA]: 'Notes Review',
  [PipelineStage.BILLING]: 'Billing',
};

// Work Status Display Names
export const STATUS_DISPLAY_NAMES: Record<WorkStatus, string> = {
  [WorkStatus.PENDING]: 'Pending',
  [WorkStatus.IN_PROGRESS]: 'In Progress',
  [WorkStatus.ON_HOLD]: 'On Hold',
  [WorkStatus.BLOCKED_NEEDS_INFO]: 'Blocked - Needs Info',
  [WorkStatus.COMPLETED]: 'Completed',
};

// Role Display Names
export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  [UserRole.INTAKE_SPECIALIST]: 'Intake Specialist',
  [UserRole.CLINICAL_REVIEWER]: 'Clinical Reviewer',
  [UserRole.CLINICAL_COORDINATOR]: 'Clinical Coordinator',
  [UserRole.OFFICE_MANAGER]: 'Office Manager',
  [UserRole.SCHEDULER]: 'Scheduler',
  [UserRole.NURSE_PRACTITIONER]: 'Nurse Practitioner',
  [UserRole.BILLING_COORDINATOR]: 'Billing Coordinator',
  [UserRole.ADMIN]: 'Administrator',
  [UserRole.COMPLIANCE]: 'Compliance Officer',
};
