# Requirements Document

## Introduction

THE Referrals Workflow Engine SHALL manage the complete lifecycle of healthcare referrals through six distinct pipeline stages with comprehensive state management, authorization enforcement, and audit capabilities. THE System SHALL support both forward progression and backward correction flows while maintaining data integrity, concurrency control, and complete audit trails for compliance requirements.

This workflow engine is the core operational component of the Heals on Wheels referral management system, coordinating work across intake specialists, clinical reviewers, schedulers, nurse practitioners, clinical QA reviewers, and billing coordinators.

## Glossary

- **Referral_Case**: A single healthcare referral record progressing through the workflow pipeline
- **Pipeline_Stage**: The current workflow stage (INTAKE, CLINICAL_REVIEW, SCHEDULING, NP_VISIT, NOTES_QA, BILLING)
- **Work_Status**: The operational state within a stage (PENDING, IN_PROGRESS, ON_HOLD, BLOCKED_NEEDS_INFO, COMPLETED)
- **Case_Outcome**: The overall disposition (ACTIVE, REJECTED, PATIENT_DECLINED, DUPLICATE, DISCHARGED, CLOSED)
- **Billing_Status**: The billing lifecycle state (NOT_READY, READY, SUBMITTED, REJECTED, DENIED, PAID)
- **Workflow_Gate**: Required conditions that must be satisfied before a stage transition
- **Transition**: A change from one pipeline stage or work status to another
- **Forward_Transition**: Movement toward billing submission (INTAKE → BILLING)
- **Backward_Transition**: Return to a previous stage for correction or clarification
- **Terminal_State**: A case outcome that ends active workflow processing (REJECTED, CLOSED)
- **Stage_Owner**: User role authorized to perform work in a specific pipeline stage
- **Optimistic_Concurrency**: Version-based conflict detection for simultaneous edits
- **Workflow_Transition_Record**: Immutable audit record of a state change
- **Assignment**: Designation of a specific user or role responsible for current work
- **Scope**: Access boundary defined by site, state, or legal entity
- **Idempotent_Operation**: An operation that produces the same result when executed multiple times
- **Action_Permission**: Specific authorization to perform an operation (e.g., complete_intake, accept_referral)
- **Stage_Permission**: Authorization to work within a particular pipeline stage
- **Transition_Permission**: Authorization to initiate a transition between stages
- **Transactional_Outbox**: Reliable event publishing pattern where events are written to database in same transaction as state changes
- **Note_Revision**: A specific version of a clinical note with immutable content and approval status
- **Lifecycle_Policy**: Rules governing entity creation, modification, deletion, and archival
- **Prerequisite_Validation**: Verification that required upstream conditions remain valid
- **State_Repair**: Automated or manual correction of invalid workflow states

## Requirements

### Requirement 1: Stage Transition Validation and Execution

**User Story:** As a workflow engine, I want to validate and execute stage transitions with complete authorization and gate checking, so that referrals progress only when all requirements are satisfied.

#### Acceptance Criteria

1. WHEN a transition is requested, THE Workflow_Engine SHALL verify the requesting user has the required action permission for the specific transition being performed (not the destination stage ownership role)
2. WHEN a transition is requested, THE Workflow_Engine SHALL verify the requesting user has scope access to the referral's site, state, and legal entity
3. WHEN a forward transition is requested, THE Workflow_Engine SHALL verify the current pipeline stage allows transition to the requested target stage per ALLOWED_TRANSITIONS
4. WHEN a forward transition is requested, THE Workflow_Engine SHALL validate all required fields for the current stage are present and valid per REQUIRED_FIELDS_PER_STAGE
5. WHEN a transition validation succeeds, THE Workflow_Engine SHALL increment the version field, update the pipeline stage, set work status to PENDING, and record the transition in a database transaction
6. WHEN a transition validation fails, THE Workflow_Engine SHALL return a structured error indicating the specific validation failure without modifying the referral state
7. WHEN a version mismatch is detected, THE Workflow_Engine SHALL reject the transition with a 409 Conflict status and require the client to refresh
8. WHEN a transition succeeds, THE Workflow_Engine SHALL create a Workflow_Transition_Record with fromStage, toStage, fromStatus, toStatus, transitionedBy, reason, metadata, and timestamp
9. WHEN a transition fails mid-execution due to database error, THE Workflow_Engine SHALL roll back all changes and preserve the previous consistent state
10. FOR ALL successful transitions, THE Workflow_Engine SHALL emit a workflow event for notification and assignment processing

### Requirement 2: Intake Stage Completion and Forward Progression

**User Story:** As an intake specialist, I want to complete intake verification and progress referrals to clinical review, so that verified cases enter the clinical approval workflow.

#### Acceptance Criteria

1. WHEN an intake specialist completes verification, THE Workflow_Engine SHALL validate the user has INTAKE_SPECIALIST role or explicit referrals.transition.to_clinical_review permission
2. WHEN transitioning from INTAKE to CLINICAL_REVIEW, THE Workflow_Engine SHALL verify patientId, referralSource, insurancePayer, coverageVerified, site, and state fields are present
3. WHEN coverage verification is false, THE Workflow_Engine SHALL block the transition with message "Coverage verification is required before clinical review"
4. WHEN all intake requirements are satisfied, THE Workflow_Engine SHALL transition the referral to CLINICAL_REVIEW stage with work status PENDING
5. WHEN the transition to CLINICAL_REVIEW succeeds, THE Workflow_Engine SHALL assign the referral to the CLINICAL_REVIEWER or CLINICAL_COORDINATOR role queue
6. WHEN required intake fields are missing, THE Workflow_Engine SHALL return a validation error listing the specific missing fields
7. WHEN a referral in INTAKE has work status BLOCKED_NEEDS_INFO, THE Workflow_Engine SHALL require a reason documenting what information is needed
8. WHEN intake work is marked ON_HOLD, THE Workflow_Engine SHALL require a hold reason and next review date
9. WHEN an intake specialist marks work status as COMPLETED without transitioning stages, THE Workflow_Engine SHALL validate all required fields but keep the referral in INTAKE stage
10. FOR ALL intake-to-clinical-review transitions, THE Workflow_Engine SHALL record the intake specialist's user ID and completion timestamp

### Requirement 3: Clinical Review Decision Processing

**User Story:** As a clinical reviewer, I want to accept, return, or reject referrals with documented reasons, so that only clinically appropriate referrals progress to scheduling.

#### Acceptance Criteria

1. WHEN a clinical reviewer processes a referral, THE Workflow_Engine SHALL verify the user has CLINICAL_REVIEWER or CLINICAL_COORDINATOR role or explicit referrals.review permission
2. WHEN a clinical reviewer accepts a referral, THE Workflow_Engine SHALL create a ClinicalReview record with decision ACCEPT, transition the referral to SCHEDULING stage, and record the reviewer's identity and timestamp
3. WHEN a clinical reviewer returns a referral, THE Workflow_Engine SHALL verify user has referrals.transition.return_to_intake permission, create a ClinicalReview record with decision RETURN, transition the referral back to INTAKE stage with work status BLOCKED_NEEDS_INFO, and require a reason documenting what is needed
4. WHEN a clinical reviewer rejects a referral, THE Workflow_Engine SHALL create a ClinicalReview record with decision REJECT, set case outcome to REJECTED, preserve the current pipeline stage, and require a rejection reason
5. WHEN a referral is rejected, THE Workflow_Engine SHALL prevent all future forward stage transitions while preserving the complete audit history
6. WHEN transitioning from CLINICAL_REVIEW to SCHEDULING, THE Workflow_Engine SHALL verify a ClinicalReview record exists with decision ACCEPT for the current review cycle
7. WHEN a referral is returned to INTAKE from CLINICAL_REVIEW, THE Workflow_Engine SHALL preserve all previous workflow transition records and clinical review records
8. WHEN a returned referral is resubmitted from INTAKE to CLINICAL_REVIEW, THE Workflow_Engine SHALL allow a new clinical review decision without reference to the previous return
9. IF a clinical reviewer attempts to accept a referral with missing required intake fields, THEN THE Workflow_Engine SHALL block the transition with message "Cannot accept referral with incomplete intake data"
10. FOR ALL clinical review decisions, THE Workflow_Engine SHALL audit the decision, reason, notes, and reviewer identity

### Requirement 4: Scheduling and Appointment Management

**User Story:** As a scheduler, I want to assign nurse practitioners and schedule appointments with proper validation, so that accepted referrals are prepared for clinical visits.

#### Acceptance Criteria

1. WHEN a scheduler works on a referral, THE Workflow_Engine SHALL verify the user has SCHEDULER or OFFICE_MANAGER role
2. WHEN transitioning from SCHEDULING to NP_VISIT, THE Workflow_Engine SHALL verify an Appointment record exists with a confirmed scheduled date and assigned nurse practitioner
3. WHEN an appointment is scheduled, THE Workflow_Engine SHALL validate the assigned nurse practitioner has NURSE_PRACTITIONER role and appropriate site scope
4. WHEN a scheduled appointment is cancelled, THE Workflow_Engine SHALL keep the referral in SCHEDULING stage with work status PENDING and record the cancellation reason
5. WHEN a referral enters SCHEDULING stage, THE Workflow_Engine SHALL set the assigned role to SCHEDULER or OFFICE_MANAGER per site policy
6. WHEN an appointment is rescheduled, THE Workflow_Engine SHALL preserve the original appointment record, create a new appointment record with rescheduledFromId reference, and maintain SCHEDULING stage
7. IF a scheduler attempts to transition to NP_VISIT without a confirmed appointment, THEN THE Workflow_Engine SHALL block the transition with message "Appointment must be scheduled and confirmed"
8. WHEN scheduling work is marked BLOCKED_NEEDS_INFO due to patient unavailability, THE Workflow_Engine SHALL require documentation of contact attempts and next follow-up date
9. WHEN a referral returns to SCHEDULING from NP_VISIT due to no-show, THE Workflow_Engine SHALL preserve the encounter record and previous appointment records
10. FOR ALL appointment scheduling actions, THE Workflow_Engine SHALL audit the scheduler identity, appointment details, and any changes

### Requirement 5: NP Visit Documentation and Progression

**User Story:** As a nurse practitioner, I want to document visit outcomes and submit clinical notes, so that completed visits advance to quality assurance review.

#### Acceptance Criteria

1. WHEN a nurse practitioner documents a visit, THE Workflow_Engine SHALL verify the user has NURSE_PRACTITIONER role and is assigned to the referral
2. WHEN transitioning from NP_VISIT to NOTES_QA, THE Workflow_Engine SHALL verify an Encounter record exists with outcome COMPLETED, a valid date of service, and a submitted ClinicalNote
3. WHEN a visit outcome is NO_SHOW, THE Workflow_Engine SHALL transition the referral back to SCHEDULING stage with work status PENDING and preserve the encounter record
4. WHEN a visit outcome is CANCELLED or RESCHEDULED, THE Workflow_Engine SHALL maintain the referral in NP_VISIT stage until a completed visit is documented
5. WHEN a clinical note is submitted, THE Workflow_Engine SHALL record the note creation timestamp, creator identity, and submission timestamp
6. IF a nurse practitioner attempts to progress to NOTES_QA without a submitted clinical note, THEN THE Workflow_Engine SHALL block the transition with message "Clinical note must be submitted before quality review"
7. WHEN a referral returns to NP_VISIT from NOTES_QA for correction, THE Workflow_Engine SHALL preserve the original clinical note as a locked revision and create a ReferralAssignment linking the correction request to the note
8. WHEN a nurse practitioner corrects and resubmits a note, THE Workflow_Engine SHALL create a new ClinicalNote record with previousNoteId referencing the original, record the correction context, and mark the new note as the active revision
9. WHEN multiple services are provided in an encounter, THE Workflow_Engine SHALL validate the servicesProvided array is populated before allowing transition
10. WHEN a clinical note exists in multiple revisions, THE Workflow_Engine SHALL ensure NoteReview records reference the specific ClinicalNote ID being reviewed
11. FOR ALL visit documentation actions, THE Workflow_Engine SHALL audit the nurse practitioner identity, visit outcome, services provided, note submission, and revision history

### Requirement 6: Clinical Notes Quality Assurance Review

**User Story:** As a clinical QA reviewer, I want to approve or return clinical notes with specific correction requirements, so that only complete documentation progresses to billing.

#### Acceptance Criteria

1. WHEN a QA reviewer processes a clinical note, THE Workflow_Engine SHALL verify the user has CLINICAL_REVIEWER or CLINICAL_COORDINATOR role with notes review permissions
2. WHEN a QA reviewer approves a note, THE Workflow_Engine SHALL create a NoteReview record with decision APPROVE referencing the specific ClinicalNote ID, set billing status to READY while keeping pipeline stage as NOTES_QA, and record the reviewer identity and approval timestamp
3. WHEN a QA reviewer returns a note for correction, THE Workflow_Engine SHALL create a NoteReview record with decision RETURN_FOR_CORRECTION, transition the referral back to NP_VISIT stage with work status BLOCKED_NEEDS_INFO, and require specific correction instructions
4. WHEN a billing coordinator explicitly transitions from NOTES_QA to BILLING, THE Workflow_Engine SHALL verify billing status is READY and a NoteReview record exists with decision APPROVE for the current active clinical note revision
5. WHEN a note is returned for correction, THE Workflow_Engine SHALL assign the referral back to the original nurse practitioner
6. WHEN a corrected note is resubmitted, THE Workflow_Engine SHALL allow the same or different QA reviewer to perform a new review on the new ClinicalNote revision
7. IF a QA reviewer attempts multiple sequential returns without documenting specific corrections, THE Workflow_Engine SHALL enforce the correction requirement validation
8. WHEN a clinical note requires signature verification, THE Workflow_Engine SHALL validate the signedAt and signedById fields before allowing approval
9. WHEN billing readiness depends on multiple clinical notes, THE Workflow_Engine SHALL verify all active note revisions are approved before setting billing status to READY
10. WHEN an approved clinical note is modified or a new revision is created after billing status is READY, THE Workflow_Engine SHALL reset billing status to NOT_READY and require re-approval
11. FOR ALL note review decisions, THE Workflow_Engine SHALL audit the reviewer identity, decision, specific ClinicalNote ID reviewed, reason, correction requirements, and timestamps

### Requirement 7: Billing Readiness and Claim Submission

**User Story:** As a billing coordinator, I want to validate billing readiness and track claim submissions, so that approved cases are properly submitted and monitored.

#### Acceptance Criteria

1. WHEN a billing coordinator works on a referral, THE Workflow_Engine SHALL verify the user has BILLING_COORDINATOR role
2. WHEN a referral enters BILLING stage through explicit transition, THE Workflow_Engine SHALL verify billing status is already READY (set by prior note approval)
3. WHEN a billing coordinator submits a claim, THE Workflow_Engine SHALL create a Claim record with submission timestamp, submitted by user ID, and external reference
4. WHEN a claim is submitted, THE Workflow_Engine SHALL update billing status to SUBMITTED and set work status to COMPLETED
5. WHEN a claim is rejected by the external system, THE Workflow_Engine SHALL update billing status to REJECTED, keep the referral in BILLING stage, and require documentation of the rejection reason
6. WHEN a claim is denied, THE Workflow_Engine SHALL update billing status to DENIED, create an audit record, and allow follow-up tasks
7. WHEN a claim is paid, THE Workflow_Engine SHALL update billing status to PAID, record the paid amount and payment date, and set case outcome to CLOSED
8. IF required clinical documentation becomes invalid after billing status is READY, THE Workflow_Engine SHALL reset billing status to NOT_READY and require re-validation
9. WHEN billing checks fail validation, THE Workflow_Engine SHALL set work status to BLOCKED_NEEDS_INFO and document the specific missing requirements
10. WHEN claim submission to external system times out with unknown outcome, THE Workflow_Engine SHALL mark the claim with status PENDING_VERIFICATION and prevent duplicate submissions until verification completes
11. FOR ALL billing actions, THE Workflow_Engine SHALL audit the coordinator identity, claim submission details, status changes, and outcomes

### Requirement 8: Optimistic Concurrency Control

**User Story:** As a workflow engine, I want to detect and prevent conflicting concurrent updates, so that simultaneous edits by multiple users do not result in data loss or inconsistent state.

#### Acceptance Criteria

1. WHEN a transition request is received, THE Workflow_Engine SHALL validate the provided version matches the current database version
2. WHEN a version mismatch is detected, THE Workflow_Engine SHALL reject the request with HTTP 409 Conflict status and return the current version and state
3. WHEN a transition succeeds, THE Workflow_Engine SHALL increment the version field atomically within the same database transaction
4. WHEN a client receives a version conflict, THE Workflow_Engine SHALL include the current referral state in the error response to enable intelligent retry
5. WHEN multiple simultaneous transitions are attempted, THE Workflow_Engine SHALL process them serially with database-level isolation and only allow the first valid transition to succeed
6. WHEN a stale client attempts to transition based on outdated data, THE Workflow_Engine SHALL prevent the transition and require the client to refresh from the current state
7. IF two users attempt to transition the same referral to different stages simultaneously, THEN THE Workflow_Engine SHALL allow only the first committed transition and reject the second
8. WHEN field updates occur without stage transitions, THE Workflow_Engine SHALL enforce version checking on all state-affecting fields (assignedTo, workStatus, priority, billingStatus, caseOutcome) to prevent lost updates
9. WHEN read-modify-write operations span multiple database queries, THE Workflow_Engine SHALL use transaction isolation levels that prevent phantom reads and non-repeatable reads
10. WHEN concurrent updates affect different non-conflicting fields, THE Workflow_Engine SHALL allow both updates to succeed if they operate on the same version and neither modifies workflow-critical state
11. FOR ALL concurrent update scenarios, THE Workflow_Engine SHALL preserve data integrity and provide clear error messages for retry guidance

### Requirement 9: Assignment Management and Routing

**User Story:** As a workflow engine, I want to automatically assign and reassign work to appropriate users and roles, so that referrals have clear ownership and accountability.

#### Acceptance Criteria

1. WHEN a referral transitions to a new stage, THE Workflow_Engine SHALL determine the appropriate assigned role from STAGE_OWNERS configuration
2. WHEN a referral is assigned to a role queue, THE Workflow_Engine SHALL set assignedRole to the target role and clear assignedTo unless a specific user is designated
3. WHEN a referral is assigned to a specific user, THE Workflow_Engine SHALL verify the user has the required role and scope access
4. WHEN a user is assigned to a referral, THE Workflow_Engine SHALL create a ReferralAssignment record with assignment timestamp, assigning user, and assignment reason
5. WHEN a referral is reassigned, THE Workflow_Engine SHALL close the previous ReferralAssignment with unassignment timestamp and reason, then create a new assignment record
6. WHEN an assigned user becomes inactive or loses required permissions, THE Workflow_Engine SHALL detect the invalid assignment and route to the role queue
7. WHEN a backward transition occurs, THE Workflow_Engine SHALL assign the referral to the appropriate role for the target stage
8. WHEN a note is returned to an NP for correction, THE Workflow_Engine SHALL reassign to the original documenting nurse practitioner where possible
9. WHEN assignment notifications are triggered, THE Workflow_Engine SHALL emit assignment events with referral context and assigned user information
10. FOR ALL assignment changes, THE Workflow_Engine SHALL audit the assignment history, assigned users, roles, and reasons

### Requirement 10: Workflow State Management

**User Story:** As a workflow engine, I want to manage work status independently from pipeline stage, so that operational states like holds, blocks, and progress are accurately tracked.

#### Acceptance Criteria

1. THE Workflow_Engine SHALL maintain work status as an independent dimension from pipeline stage
2. WHEN a referral enters a new pipeline stage, THE Workflow_Engine SHALL set work status to PENDING by default
3. WHEN work begins on a referral, THE Workflow_Engine SHALL allow authorized users to update work status to IN_PROGRESS
4. WHEN work encounters missing information, THE Workflow_Engine SHALL allow work status to be set to BLOCKED_NEEDS_INFO with a required reason documenting what is missing
5. WHEN work is temporarily paused, THE Workflow_Engine SHALL allow work status to be set to ON_HOLD with a required hold reason and next review date
6. WHEN stage requirements are completed but the referral remains in the current stage, THE Workflow_Engine SHALL allow work status to be set to COMPLETED
7. WHEN a work status change is requested, THE Workflow_Engine SHALL validate the requesting user has appropriate permissions for the current pipeline stage
8. WHEN work status changes from BLOCKED_NEEDS_INFO to IN_PROGRESS, THE Workflow_Engine SHALL verify that blocking issues have been documented as resolved
9. WHEN a referral is ON_HOLD past the review date, THE Workflow_Engine SHALL support automated escalation or notification
10. WHEN work status transitions are requested, THE Workflow_Engine SHALL enforce valid state transitions per WORK_STATUS_TRANSITIONS: PENDING may transition to IN_PROGRESS, BLOCKED_NEEDS_INFO, or ON_HOLD; IN_PROGRESS may transition to COMPLETED, BLOCKED_NEEDS_INFO, or ON_HOLD; BLOCKED_NEEDS_INFO may transition to IN_PROGRESS or ON_HOLD after resolution; ON_HOLD may transition to PENDING or IN_PROGRESS; COMPLETED may not transition to other statuses except when stage changes
11. FOR ALL work status changes, THE Workflow_Engine SHALL record the status change in workflow transition records with timestamps and responsible users

### Requirement 11: Terminal State and Case Outcome Management

**User Story:** As a workflow engine, I want to manage terminal case outcomes while preserving complete audit history, so that rejected, declined, and closed cases are properly finalized without data loss.

#### Acceptance Criteria

1. WHEN a clinical reviewer rejects a referral, THE Workflow_Engine SHALL set case outcome to REJECTED and prevent all forward stage transitions
2. WHEN a patient declines services, THE Workflow_Engine SHALL allow authorized users to set case outcome to PATIENT_DECLINED with required documentation
3. WHEN a referral is identified as a duplicate, THE Workflow_Engine SHALL allow authorized users to set case outcome to DUPLICATE and link to the authoritative referral
4. WHEN a patient is discharged from services, THE Workflow_Engine SHALL allow authorized users to set case outcome to DISCHARGED with discharge date and reason
5. WHEN billing is completed and claim is paid, THE Workflow_Engine SHALL set case outcome to CLOSED
6. WHEN a case outcome is set to a terminal state, THE Workflow_Engine SHALL preserve all pipeline stage, work status, billing status, and audit records
7. IF a terminal case needs to be reopened, THEN THE Workflow_Engine SHALL require authorized approval, document the reopening reason, and create a workflow transition record
8. WHEN a case is closed, THE Workflow_Engine SHALL prevent further clinical or billing transitions unless explicitly reopened
9. WHEN filtering referrals by active status, THE Workflow_Engine SHALL exclude referrals with terminal case outcomes unless specifically requested
10. FOR ALL terminal state transitions, THE Workflow_Engine SHALL audit the user, reason, timestamp, and previous state

### Requirement 12: Audit Trail Completeness

**User Story:** As a compliance officer, I want complete immutable audit trails of all workflow state changes, so that regulatory requirements are met and historical actions are traceable.

#### Acceptance Criteria

1. WHEN any pipeline stage transition occurs, THE Workflow_Engine SHALL create a WorkflowTransition record with fromStage, toStage, fromStatus, toStatus, transitionedBy, reason, metadata, and timestamp
2. WHEN a backward transition occurs, THE Workflow_Engine SHALL require a reason field and record it in the workflow transition
3. WHEN work status changes without stage transition, THE Workflow_Engine SHALL create a workflow transition record documenting the status change
4. WHEN assignment changes occur, THE Workflow_Engine SHALL record both unassignment and new assignment with timestamps and reasons
5. WHEN clinical decisions are recorded, THE Workflow_Engine SHALL create immutable clinical review or note review records with reviewer identity and decision timestamp
6. WHEN version conflicts occur, THE Workflow_Engine SHALL log the conflict attempt with requesting user, attempted changes, and conflict resolution
7. THE Workflow_Engine SHALL never delete or modify existing workflow transition records
8. WHEN querying audit history for a referral, THE Workflow_Engine SHALL return all workflow transitions in chronological order
9. WHEN audit queries are performed, THE Workflow_Engine SHALL verify the requesting user has appropriate compliance or audit permissions
10. FOR ALL state-changing operations, THE Workflow_Engine SHALL ensure audit records are created within the same database transaction as the state changes

### Requirement 13: Error Handling and Recovery

**User Story:** As a workflow engine, I want to handle errors gracefully and provide clear recovery paths, so that transient failures do not corrupt referral state and users receive actionable error messages.

#### Acceptance Criteria

1. WHEN a validation error occurs, THE Workflow_Engine SHALL return a structured error response with error type, field name where applicable, and user-friendly message
2. WHEN authorization fails, THE Workflow_Engine SHALL return HTTP 403 Forbidden with message indicating the required permission
3. WHEN a database transaction fails, THE Workflow_Engine SHALL roll back all changes and return HTTP 500 with a safe error message that does not expose system internals
4. WHEN external service dependencies fail during transition, THE Workflow_Engine SHALL maintain referral state consistency and provide retry capability
5. WHEN a version conflict is detected, THE Workflow_Engine SHALL return HTTP 409 Conflict with the current referral version and state for intelligent retry
6. WHEN required related records are missing, THE Workflow_Engine SHALL return a validation error specifying which records must be created first
7. WHEN invalid state transitions are attempted, THE Workflow_Engine SHALL return an error explaining the allowed transitions from the current state
8. WHEN network timeouts occur during transition processing, THE Workflow_Engine SHALL ensure idempotency so duplicate retries do not create duplicate audit records
9. WHEN critical failures occur, THE Workflow_Engine SHALL log detailed error context for debugging while returning safe messages to clients
10. FOR ALL error scenarios, THE Workflow_Engine SHALL preserve the referral in its last known consistent state

### Requirement 14: Authorization and Permission Enforcement

**User Story:** As a security-conscious workflow engine, I want to enforce role-based and scope-based authorization at every operation, so that users can only perform actions they are authorized for on referrals within their scope.

#### Acceptance Criteria

1. WHEN any transition is requested, THE Workflow_Engine SHALL verify the requesting user's authentication token is valid and not expired
2. WHEN a stage transition is requested, THE Workflow_Engine SHALL verify the user has the required action permission (e.g., referrals.transition.to_billing) rather than checking destination stage ownership role
3. WHEN a referral operation is requested, THE Workflow_Engine SHALL verify the user's site scope includes the referral's site
4. WHEN a referral operation is requested, THE Workflow_Engine SHALL verify the user's state scope includes the referral's state
5. WHEN a referral operation is requested, THE Workflow_Engine SHALL verify the user's legal entity scope includes the referral's legal entity
6. WHEN assignment operations are performed, THE Workflow_Engine SHALL verify the assigning user has appropriate assignment permissions
7. WHEN audit queries are performed, THE Workflow_Engine SHALL restrict results to referrals within the user's authorized scope
8. WHEN administrative overrides are needed, THE Workflow_Engine SHALL require explicit ADMIN role and log the override action
9. IF a user's permissions change mid-session, THE Workflow_Engine SHALL validate current permissions on each request rather than caching
10. FOR ALL authorization failures, THE Workflow_Engine SHALL audit the denied access attempt with user identity, requested action, and denial reason

### Requirement 15: Idempotency and Duplicate Request Handling

**User Story:** As a workflow engine, I want to handle duplicate transition requests safely, so that network retries and accidental double-clicks do not create duplicate state changes or audit records.

#### Acceptance Criteria

1. WHEN identical transition requests arrive within a short time window, THE Workflow_Engine SHALL detect potential duplicates using request fingerprinting
2. WHEN a transition has already been successfully processed, THE Workflow_Engine SHALL return the existing result rather than processing again
3. WHEN a client retries a transition after network timeout, THE Workflow_Engine SHALL safely determine if the previous attempt succeeded
4. WHEN using idempotency keys, THE Workflow_Engine SHALL track the key, request signature, response, and expiration time
5. WHEN an idempotency key is reused with different request content, THE Workflow_Engine SHALL reject the request as a conflict
6. WHEN processing duplicate requests, THE Workflow_Engine SHALL not create duplicate workflow transition records
7. WHEN notification events are triggered, THE Workflow_Engine SHALL ensure deduplication so recipients do not receive duplicate notifications
8. WHEN idempotency cache entries expire, THE Workflow_Engine SHALL safely handle replayed old requests based on actual state verification and return appropriate response based on current state
9. IF a duplicate transition request arrives after the referral has moved beyond the target state, THEN THE Workflow_Engine SHALL return HTTP 200 with current referral state and indication that the operation was previously completed successfully
10. WHEN an idempotency key expires but the operation had succeeded, THE Workflow_Engine SHALL detect the completed state and return success response rather than re-executing
11. FOR ALL idempotent operations, THE Workflow_Engine SHALL balance safety against cache memory usage with appropriate expiration policies

### Requirement 16: Performance and Scalability

**User Story:** As a workflow engine serving multiple concurrent users, I want to process transitions efficiently with low latency, so that user experience is responsive and the system scales to organizational usage.

#### Acceptance Criteria

1. WHEN processing a single transition, THE Workflow_Engine SHALL complete the operation in less than 500ms at the 95th percentile under normal load
2. WHEN multiple concurrent transitions are requested for different referrals, THE Workflow_Engine SHALL process them in parallel without blocking
3. WHEN transitions involve complex validation, THE Workflow_Engine SHALL cache frequently accessed reference data with appropriate TTL
4. WHEN querying referral state for dashboard metrics, THE Workflow_Engine SHALL use database indexes on pipeline stage, work status, and assigned user
5. WHEN audit trail queries are performed, THE Workflow_Engine SHALL support pagination and filtering to handle referrals with extensive history
6. WHEN the system is under high load, THE Workflow_Engine SHALL maintain transaction isolation without causing excessive lock contention
7. WHEN caching is used for permissions or scope data, THE Workflow_Engine SHALL implement cache invalidation when user permissions change
8. WHEN database connections are pooled, THE Workflow_Engine SHALL handle connection exhaustion gracefully with appropriate timeouts and retries
9. WHEN processing batches of transitions, THE Workflow_Engine SHALL support bulk validation with transaction batching where safe
10. FOR ALL performance-critical paths, THE Workflow_Engine SHALL include appropriate logging for latency monitoring and troubleshooting

### Requirement 17: Integration Points and Event Emission

**User Story:** As a workflow engine integrated with notifications, assignments, and dashboard systems, I want to emit structured events for state changes, so that dependent systems can react appropriately.

#### Acceptance Criteria

1. WHEN a stage transition succeeds, THE Workflow_Engine SHALL emit a referral.stage_changed event with referral ID, previous stage, new stage, and transition timestamp
2. WHEN assignment changes occur, THE Workflow_Engine SHALL emit a referral.assigned event with referral ID, assigned user, assigned role, and assignment reason
3. WHEN work status changes to BLOCKED_NEEDS_INFO or ON_HOLD, THE Workflow_Engine SHALL emit events for escalation and notification systems
4. WHEN clinical decisions are recorded, THE Workflow_Engine SHALL emit appropriate events for notification to relevant users
5. WHEN billing status changes, THE Workflow_Engine SHALL emit events for billing dashboard updates
6. WHEN events are emitted, THE Workflow_Engine SHALL include sufficient context for event consumers to take action without additional database queries where possible
7. WHEN event publishing must be reliable, THE Workflow_Engine SHALL use a transactional outbox pattern where events are written to an EventOutbox table within the same database transaction as the state change, then published by a separate background process
8. WHEN using transactional outbox, THE EventOutbox record SHALL include event ID, event type, aggregate ID (referralId), payload JSON, creation timestamp, processing status (PENDING, PUBLISHED, FAILED), retry count, and last attempt timestamp
9. WHEN the outbox publisher processes events, THE Workflow_Engine SHALL mark events as PUBLISHED, implement exponential backoff for transient failures, enforce maximum retry limits, and enable deduplication at consumer level using event IDs
10. WHEN event publishing fails after state changes commit, THE Workflow_Engine SHALL preserve events in outbox for retry rather than silently losing notifications
11. WHEN multiple events result from a single transition, THE Workflow_Engine SHALL write them to outbox with consistent ordering and correlation identifiers
12. WHEN event consumers are slow or unavailable, THE Workflow_Engine SHALL not block the primary transition transaction
13. FOR ALL emitted events, THE Workflow_Engine SHALL include event timestamp, triggering user, and referral version for consistency tracking

### Requirement 18: Validation Rule Configuration and Extensibility

**User Story:** As a system administrator, I want workflow validation rules to be configurable without code changes, so that organizational policy changes can be accommodated efficiently.

#### Acceptance Criteria

1. THE Workflow_Engine SHALL read stage owner configuration from STAGE_OWNERS constant at runtime
2. THE Workflow_Engine SHALL read allowed transition rules from ALLOWED_TRANSITIONS constant at runtime
3. THE Workflow_Engine SHALL read required field validation from REQUIRED_FIELDS_PER_STAGE constant at runtime
4. WHEN configuration constants are updated, THE Workflow_Engine SHALL apply new rules to subsequent transitions without restart where possible
5. WHEN custom validation rules are needed per site or legal entity, THE Workflow_Engine SHALL support scope-specific rule overrides
6. WHEN new pipeline stages are added, THE Workflow_Engine SHALL accommodate them through configuration updates
7. WHEN SLA thresholds need adjustment, THE Workflow_Engine SHALL support configuration updates without code deployment
8. WHEN workflow business rules evolve, THE Workflow_Engine SHALL provide extension points for custom validation logic
9. WHEN testing new workflow rules, THE Workflow_Engine SHALL support feature flags for gradual rollout
10. FOR ALL configuration-driven validation, THE Workflow_Engine SHALL validate configuration consistency at startup and provide clear error messages for invalid configurations



### Requirement 19: Entity Lifecycle and Dependency Management

**User Story:** As a workflow engine managing healthcare data with strict regulatory requirements, I want to enforce safe entity lifecycle policies and dependency checking, so that data integrity is preserved and audit history remains complete.

#### Acceptance Criteria

1. WHEN a Patient deletion is requested, THE Workflow_Engine SHALL verify no active Referrals (caseOutcome = ACTIVE) exist for the patient before allowing deletion
2. WHEN a Patient has only terminal Referrals (caseOutcome IN (REJECTED, CLOSED)), THE Workflow_Engine SHALL allow soft deletion (isDeleted = true) while preserving all related records for audit compliance
3. WHEN a Referral deletion is requested, THE Workflow_Engine SHALL verify no Claims exist with billingStatus IN (SUBMITTED, PENDING_VERIFICATION) before allowing deletion
4. WHEN a Referral is soft-deleted, THE Workflow_Engine SHALL preserve all related Documents, WorkflowTransitions, ClinicalReviews, NoteReviews, Appointments, Encounters, ClinicalNotes, and Claims with foreign key integrity maintained
5. WHEN a User deactivation is requested, THE Workflow_Engine SHALL reassign all active Referrals where the user is assignedTo to the appropriate role queue
6. WHEN a User is deactivated, THE Workflow_Engine SHALL preserve all audit records (WorkflowTransitions, ClinicalReviews, NoteReviews) referencing the user's identity with RESTRICT foreign key behavior
7. WHEN a User who signed ClinicalNotes is deactivated, THE Workflow_Engine SHALL preserve the signedBy reference and prevent hard deletion of the User record
8. WHEN a Document deletion is requested, THE Workflow_Engine SHALL verify the document is not referenced in any approved ClinicalReview or NoteReview before allowing deletion
9. WHEN a Document is deleted, THE Workflow_Engine SHALL also delete the associated object storage file and any ExtractionData records using CASCADE behavior
10. WHEN an Appointment is deleted, THE Workflow_Engine SHALL verify no completed Encounter references the appointment or allow CASCADE deletion of the Encounter if explicitly confirmed
11. WHEN a ClinicalNote deletion is requested, THE Workflow_Engine SHALL verify the note is not approved (no NoteReview with decision = APPROVE) before allowing deletion
12. WHEN a ClinicalNote is part of an approved billing cycle, THE Workflow_Engine SHALL prevent deletion and require explicit note revision workflow instead
13. WHEN a Claim with billingStatus = SUBMITTED is requested for deletion, THE Workflow_Engine SHALL reject the deletion and require explicit status update to CANCELLED with audit justification
14. WHEN WorkflowTransition audit records are queried for a deleted entity, THE Workflow_Engine SHALL preserve and return the audit trail regardless of parent entity deletion status
15. WHEN cascading deletes are configured in schema (e.g., Referral → ReferralAssignment), THE Workflow_Engine SHALL log all cascaded deletions in audit events for compliance tracking
16. WHEN a related record becomes invalid after approval (e.g., coverage verification expires after clinical acceptance), THE Workflow_Engine SHALL detect the invalid state and emit a prerequisite_invalidated event for manual review
17. WHEN prerequisite validation detects invalidated approvals, THE Workflow_Engine SHALL set work status to BLOCKED_NEEDS_INFO and require re-validation of affected gates
18. WHEN object storage cleanup is performed for deleted Documents, THE Workflow_Engine SHALL use asynchronous background jobs with retry logic and failure tracking
19. WHEN deletion operations fail due to dependency constraints, THE Workflow_Engine SHALL return a structured error listing the specific dependent records and their types
20. FOR ALL destructive operations (delete, hard delete, cascade), THE Workflow_Engine SHALL require explicit permissions (e.g., referrals.delete, users.delete), verify authorization, and create comprehensive audit records with before-state snapshots

### Requirement 20: Prerequisite Validation and State Repair

**User Story:** As a workflow engine ensuring data quality, I want to detect when prerequisite conditions become invalid and provide repair workflows, so that referrals maintain valid state throughout their lifecycle.

#### Acceptance Criteria

1. WHEN a referral's coverage verification expires or is revoked, THE Workflow_Engine SHALL detect the invalidation through periodic validation jobs
2. WHEN prerequisite validation detects that coverageVerified has changed from true to false after clinical approval, THE Workflow_Engine SHALL emit a prerequisite_invalidated event and set work status to BLOCKED_NEEDS_INFO
3. WHEN an assigned User loses required role or scope permissions, THE Workflow_Engine SHALL detect the invalid assignment and automatically reassign to the appropriate role queue
4. WHEN a scheduled Appointment is cancelled but referral remains in NP_VISIT stage, THE Workflow_Engine SHALL detect the inconsistency and transition back to SCHEDULING with work status PENDING
5. WHEN a ClinicalNote supporting document is deleted after note approval, THE Workflow_Engine SHALL detect the missing document and reset billing status to NOT_READY
6. WHEN billing status is READY but the approved ClinicalNote is deleted or a new revision is created, THE Workflow_Engine SHALL automatically reset billing status to NOT_READY
7. WHEN insurance information changes after billing status is READY, THE Workflow_Engine SHALL reset billing status and require re-validation of billing readiness checks
8. WHEN prerequisite validation jobs run, THE Workflow_Engine SHALL process referrals in batches, limit validation to active referrals (caseOutcome = ACTIVE), and prioritize referrals closer to billing submission
9. WHEN state repair operations are performed, THE Workflow_Engine SHALL create WorkflowTransition audit records with reason "System: prerequisite validation detected invalid state" and include details of what changed
10. WHEN manual state repair is requested by administrators, THE Workflow_Engine SHALL require ADMIN role, document repair reason, and preserve complete audit trail of the manual intervention
11. WHEN prerequisite validation cannot automatically repair a detected issue, THE Workflow_Engine SHALL create a Task assigned to appropriate role with repair instructions and escalation rules
12. FOR ALL prerequisite validation and state repair operations, THE Workflow_Engine SHALL ensure idempotency so repeated validation runs do not create duplicate audit records or notifications
