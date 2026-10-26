/**
 * Workflow Engine Configuration Constants
 * 
 * This file defines the core workflow rules for the Referrals Workflow Engine:
 * - Stage transition paths (ALLOWED_TRANSITIONS)
 * - Required field validation per stage (REQUIRED_FIELDS_PER_STAGE)
 * - Stage ownership by role (STAGE_OWNERS)
 * - Work status transition rules (WORK_STATUS_TRANSITIONS)
 * 
 * These constants drive the validation logic in ValidationService and GatewayCheckService.
 * 
 * @see Requirements 1.3, 1.4, 9.1, 10.10, 18.1-18.3
 */

import { PipelineStage, WorkStatus, UserRole } from '@heals/types';

/**
 * ALLOWED_TRANSITIONS defines valid stage-to-stage transition paths.
 * 
 * The workflow supports both forward progression (toward BILLING) and backward
 * correction flows. An empty array indicates a terminal stage with no forward transitions.
 * 
 * Transition Matrix:
 * - INTAKE → CLINICAL_REVIEW (forward)
 * - CLINICAL_REVIEW → SCHEDULING (accept), INTAKE (return)
 * - SCHEDULING → NP_VISIT (confirmed), CLINICAL_REVIEW (reschedule needed)
 * - NP_VISIT → NOTES_QA (visit complete), SCHEDULING (no-show)
 * - NOTES_QA → BILLING (approved), NP_VISIT (correction needed)
 * - BILLING → (terminal stage)
 * 
 * @see Requirement 1.3: Forward transition validation against ALLOWED_TRANSITIONS
 * @see Design: State Machine Design - Stage Transition Matrix
 */
export const ALLOWED_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  [PipelineStage.INTAKE]: [
    PipelineStage.CLINICAL_REVIEW,
  ],
  [PipelineStage.CLINICAL_REVIEW]: [
    PipelineStage.SCHEDULING,  // Forward: clinical accept
    PipelineStage.INTAKE,      // Backward: clinical return
  ],
  [PipelineStage.SCHEDULING]: [
    PipelineStage.NP_VISIT,           // Forward: appointment confirmed
    PipelineStage.CLINICAL_REVIEW,    // Backward: reschedule needed
  ],
  [PipelineStage.NP_VISIT]: [
    PipelineStage.NOTES_QA,      // Forward: visit complete
    PipelineStage.SCHEDULING,    // Backward: no-show
  ],
  [PipelineStage.NOTES_QA]: [
    PipelineStage.BILLING,    // Forward: note approved
    PipelineStage.NP_VISIT,   // Backward: correction needed
  ],
  [PipelineStage.BILLING]: [
    // Terminal stage - no forward transitions
  ],
};

/**
 * REQUIRED_FIELDS_PER_STAGE defines fields that must be present and valid
 * before a referral can transition OUT of the specified stage.
 * 
 * Field validation is performed by GatewayCheckService.checkRequiredFields().
 * Field names correspond to Referral entity properties or related record existence.
 * 
 * Special field indicators:
 * - Direct referral fields: checked on Referral entity
 * - Related record fields: checked via database queries for related entities
 * 
 * @see Requirement 1.4: Required fields validation per REQUIRED_FIELDS_PER_STAGE
 * @see Requirement 2.2: Required fields for INTAKE→CLINICAL_REVIEW
 * @see Design: Workflow Gates section
 */
export const REQUIRED_FIELDS_PER_STAGE: Record<PipelineStage, string[]> = {
  [PipelineStage.INTAKE]: [
    'patientId',              // Patient must exist
    'referralSource',         // Referral source documented
    'insurancePayer',         // Insurance payer identified
    'coverageVerified',       // Coverage verification complete (must be true)
    'site',                   // Site location assigned
    'state',                  // State location assigned
  ],
  [PipelineStage.CLINICAL_REVIEW]: [
    'clinicalReviewDecision',  // ClinicalReview record with ACCEPT decision must exist
  ],
  [PipelineStage.SCHEDULING]: [
    'appointmentScheduled',         // Appointment record exists
    'appointmentConfirmed',         // Appointment.confirmedAt is populated
    'nursePractitionerAssigned',    // Appointment.nursePractitionerId is assigned
  ],
  [PipelineStage.NP_VISIT]: [
    'encounterComplete',        // Encounter with outcome=COMPLETED exists
    'dateOfService',           // Encounter.dateOfService is populated
    'clinicalNoteSubmitted',   // ClinicalNote with submittedAt exists
    'servicesProvided',        // Encounter.servicesProvided is non-empty
  ],
  [PipelineStage.NOTES_QA]: [
    'noteReviewApproval',  // NoteReview with decision=APPROVE exists
    'billingReady',        // billingStatus is READY (set by note approval)
  ],
  [PipelineStage.BILLING]: [
    // Terminal stage - no outgoing transition requirements
  ],
};

/**
 * STAGE_OWNERS defines which user roles are authorized to perform work
 * within each pipeline stage.
 * 
 * When a referral transitions to a new stage, it is assigned to the appropriate
 * role queue based on this mapping. Multiple roles indicate any of the listed
 * roles can work on referrals in that stage.
 * 
 * This configuration drives automatic assignment routing in AssignmentService.
 * 
 * @see Requirement 9.1: Assignment routing based on STAGE_OWNERS configuration
 * @see Requirement 18.1: Read stage owner configuration from STAGE_OWNERS at runtime
 * @see Design: Assignment Management section
 */
export const STAGE_OWNERS: Record<PipelineStage, UserRole[]> = {
  [PipelineStage.INTAKE]: [
    UserRole.INTAKE_SPECIALIST,
  ],
  [PipelineStage.CLINICAL_REVIEW]: [
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
  ],
  [PipelineStage.SCHEDULING]: [
    UserRole.SCHEDULER,
    UserRole.OFFICE_MANAGER,
  ],
  [PipelineStage.NP_VISIT]: [
    UserRole.NURSE_PRACTITIONER,
  ],
  [PipelineStage.NOTES_QA]: [
    UserRole.CLINICAL_REVIEWER,
    UserRole.CLINICAL_COORDINATOR,
  ],
  [PipelineStage.BILLING]: [
    UserRole.BILLING_COORDINATOR,
  ],
};

/**
 * WORK_STATUS_TRANSITIONS defines valid work status transition paths.
 * 
 * Work status operates independently from pipeline stage and tracks operational
 * state within a stage (PENDING, IN_PROGRESS, ON_HOLD, BLOCKED_NEEDS_INFO, COMPLETED).
 * 
 * Valid transitions:
 * - PENDING → IN_PROGRESS, BLOCKED_NEEDS_INFO, ON_HOLD
 * - IN_PROGRESS → COMPLETED, BLOCKED_NEEDS_INFO, ON_HOLD
 * - BLOCKED_NEEDS_INFO → IN_PROGRESS, ON_HOLD (after resolution)
 * - ON_HOLD → PENDING, IN_PROGRESS
 * - COMPLETED → (none, except when stage changes reset to PENDING)
 * 
 * Special rules:
 * - BLOCKED_NEEDS_INFO and ON_HOLD require reason documentation
 * - ON_HOLD requires next review date
 * - Stage transitions reset work status to PENDING (except terminal outcomes)
 * 
 * @see Requirement 10.10: Enforce valid work status transitions
 * @see Design: Work Status Transitions section
 */
export const WORK_STATUS_TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  [WorkStatus.PENDING]: [
    WorkStatus.IN_PROGRESS,
    WorkStatus.BLOCKED_NEEDS_INFO,
    WorkStatus.ON_HOLD,
  ],
  [WorkStatus.IN_PROGRESS]: [
    WorkStatus.COMPLETED,
    WorkStatus.BLOCKED_NEEDS_INFO,
    WorkStatus.ON_HOLD,
  ],
  [WorkStatus.BLOCKED_NEEDS_INFO]: [
    WorkStatus.IN_PROGRESS,  // After blocking issue resolved
    WorkStatus.ON_HOLD,      // Can be put on hold while blocked
  ],
  [WorkStatus.ON_HOLD]: [
    WorkStatus.PENDING,      // Resume from hold
    WorkStatus.IN_PROGRESS,  // Resume and start work immediately
  ],
  [WorkStatus.COMPLETED]: [
    // No transitions - work is done for this stage
    // Status resets to PENDING on stage transition
  ],
};

/**
 * REQUIRED_CONTEXT_FOR_STATUS defines additional context requirements
 * for specific work status transitions.
 * 
 * Some status transitions require documentation of the reason or additional
 * information to support audit and operational tracking.
 * 
 * @see Requirement 2.7: BLOCKED_NEEDS_INFO requires reason documentation
 * @see Requirement 2.8: ON_HOLD requires reason and next review date
 */
export const REQUIRED_CONTEXT_FOR_STATUS: Partial<Record<WorkStatus, string[]>> = {
  [WorkStatus.BLOCKED_NEEDS_INFO]: ['reason'],  // Must document what information is needed
  [WorkStatus.ON_HOLD]: ['reason', 'nextReviewDate'],  // Must document hold reason and review date
};

/**
 * BACKWARD_TRANSITION_REASONS provides context for why backward transitions occur.
 * 
 * These are used for audit trails and help distinguish different types of
 * backward flows in workflow reporting.
 */
export const BACKWARD_TRANSITION_REASONS = {
  CLINICAL_RETURN: 'Returned to intake for additional information',
  RESCHEDULE_NEEDED: 'Returned to clinical review for rescheduling evaluation',
  NO_SHOW: 'Patient no-show, returned to scheduling',
  NOTE_CORRECTION: 'Clinical note returned for correction',
} as const;

/**
 * GATEWAY_DESCRIPTIONS provides human-readable descriptions of gateway
 * requirements for error messages and user guidance.
 * 
 * Used by ValidationService to generate helpful error messages when
 * gateway validations fail.
 */
export const GATEWAY_DESCRIPTIONS: Record<string, string> = {
  IntakeComplete: 'All intake requirements must be completed including patient information, insurance details, and coverage verification',
  ClinicalAccept: 'Clinical review must be completed with ACCEPT decision',
  ClinicalReturn: 'Return reason must be documented',
  AppointmentConfirmed: 'Appointment must be scheduled and confirmed with assigned nurse practitioner',
  RescheduleNeeded: 'Reschedule reason must be documented',
  VisitComplete: 'Visit must be completed with documented encounter and submitted clinical note',
  NoShow: 'No-show must be documented in encounter outcome',
  NoteApproved: 'Clinical note must be approved by QA reviewer',
  NoteReturned: 'Specific correction instructions must be documented',
};
