# Implementation Plan: Referrals Workflow Engine

## Overview

This implementation plan breaks down the Referrals Workflow Engine into small, independently testable tasks. Each task is designed to be completable in 1-2 hours with clear acceptance criteria.

## Tasks

### Phase 1: Database & Infrastructure

- [x] 1.1 Add EventOutbox and IdempotencyKey tables to Prisma schema
  - Create EventOutbox model with fields: id, eventId, eventType, aggregateId, payload, status, retryCount, lastAttemptAt, createdAt, publishedAt
  - Create EventOutboxStatus enum (PENDING, PUBLISHED, FAILED)
  - Create IdempotencyKey model with fields: id, key, requestHash, responseStatus, responseBody, expiresAt, createdAt
  - Add indexes for efficient querying
  - _Requirements: 17.7, 17.8, 15.4_
  - _Estimated time: 45 minutes_

- [ ]* 1.2 Write unit tests for EventOutbox and IdempotencyKey schema
  - Test model creation with valid data
  - Test index existence
  - Test enum constraints
  - _Requirements: 17.7, 17.8_
  - _Estimated time: 30 minutes_

- [x] 1.3 Add indexes to existing Referral table
  - Add composite index on [pipelineStage, workStatus, assignedTo]
  - Add index on [version]
  - Add index on [caseOutcome]
  - Add index on [billingStatus]
  - Add composite index on [site, state, legalEntity]
  - _Requirements: 16.4_
  - _Estimated time: 20 minutes_

- [x] 1.4 Add indexes to WorkflowTransition table
  - Add composite index on [referralId, transitionedAt]
  - Add composite index on [toStage, transitionedAt]
  - _Requirements: 16.5_
  - _Estimated time: 15 minutes_

- [x] 1.5 Generate and run Prisma migrations
  - Run `npx prisma migrate dev --name add-workflow-tables`
  - Verify migration success
  - Run `npx prisma generate` to update Prisma client
  - _Requirements: All schema changes_
  - _Estimated time: 30 minutes_

- [ ]* 1.6 Create database seed script for workflow test data
  - Create seed data for referrals in various pipeline stages
  - Create seed data for users with different roles and scopes
  - Create seed data for related records (appointments, encounters, notes)
  - Update seed.ts with workflow test data
  - _Requirements: Testing infrastructure_
  - _Estimated time: 1 hour_

### Phase 2: Core Constants and Configuration

- [x] 2.1 Create workflow configuration constants
  - Create `apps/api/src/modules/referrals/constants/workflow.constants.ts`
  - Define ALLOWED_TRANSITIONS mapping (fromStage → toStage[])
  - Define REQUIRED_FIELDS_PER_STAGE mapping (stage → field[])
  - Define STAGE_OWNERS mapping (stage → UserRole[])
  - Define WORK_STATUS_TRANSITIONS mapping (fromStatus → toStatus[])
  - _Requirements: 1.3, 1.4, 9.1, 10.10, 18.1-18.3_
  - _Estimated time: 45 minutes_

- [ ]* 2.2 Write unit tests for workflow constants
  - Test ALLOWED_TRANSITIONS covers all stages
  - Test REQUIRED_FIELDS_PER_STAGE has entries for all stages
  - Test STAGE_OWNERS has entries for all stages
  - Test WORK_STATUS_TRANSITIONS completeness
  - _Requirements: 18.10_
  - _Estimated time: 30 minutes_

- [x] 2.3 Create permission constants and role mappings
  - Create `apps/api/src/modules/referrals/constants/permissions.constants.ts`
  - Define action permissions (referrals.transition.*, referrals.review.*, notes.*)
  - Define ROLE_PERMISSIONS mapping (UserRole → permission[])
  - Export permission check helpers
  - _Requirements: 14.2, 14.6_
  - _Estimated time: 45 minutes_

### Phase 3: DTOs and Validation

- [x] 3.1 Create transition request DTOs
  - Create `apps/api/src/modules/referrals/dto/transition-request.dto.ts`
  - Define TransitionRequestDto with validation decorators
  - Add IsEnum, IsOptional, IsString, IsInt validators
  - _Requirements: 1.1-1.4_
  - _Estimated time: 30 minutes_

- [x] 3.2 Create transition response DTOs
  - Create `apps/api/src/modules/referrals/dto/transition-response.dto.ts`
  - Define TransitionResultDto
  - Define ValidationErrorDto with type, field, message, details
  - Define ErrorResponseDto
  - _Requirements: 13.1_
  - _Estimated time: 30 minutes_

- [x] 3.3 Create work status update DTOs
  - Create `apps/api/src/modules/referrals/dto/work-status.dto.ts`
  - Define UpdateWorkStatusDto with workStatus, reason, version
  - Add validation rules
  - _Requirements: 10.3-10.5_
  - _Estimated time: 20 minutes_

- [x] 3.4 Create assignment DTOs
  - Create `apps/api/src/modules/referrals/dto/assignment.dto.ts`
  - Define AssignmentRequestDto with userId, role, reason
  - Add validation rules
  - _Requirements: 9.3, 9.4_
  - _Estimated time: 20 minutes_

- [ ]* 3.5 Write unit tests for DTO validation
  - Test TransitionRequestDto validation rules
  - Test UpdateWorkStatusDto validation rules
  - Test AssignmentRequestDto validation rules
  - Test error message formats
  - _Requirements: DTO validation_
  - _Estimated time: 45 minutes_

### Phase 4: Validation Service

- [x] 4.1 Create ValidationService stub and module setup
  - Create `apps/api/src/modules/referrals/services/validation.service.ts`
  - Add @Injectable decorator
  - Inject PrismaService and RedisService
  - Create empty method stubs for all validation methods
  - _Requirements: Service structure_
  - _Estimated time: 30 minutes_

- [x] 4.2 Implement checkAuthorization() method
  - Implement permission checking logic
  - Use ROLE_PERMISSIONS mapping
  - Add Redis caching for permission lookups (5 min TTL)
  - Return boolean indicating authorization result
  - _Requirements: 1.1, 14.1-14.3, 14.9_
  - _Estimated time: 1 hour_

- [ ]* 4.3 Write unit tests for checkAuthorization()
  - Test with various role/permission combinations
  - Test permission caching behavior
  - Test ADMIN role bypass
  - Mock RedisService and test cache hits/misses
  - _Requirements: 14.1-14.3_
  - _Estimated time: 1 hour_

- [x] 4.4 Implement checkScope() method
  - Implement scope validation logic
  - Check site, state, legalEntity matching
  - Handle ADMIN role bypass
  - Return boolean indicating scope access
  - _Requirements: 1.2, 14.3-14.5_
  - _Estimated time: 45 minutes_

- [ ]* 4.5 Write unit tests for checkScope()
  - Test with matching scopes
  - Test with non-matching scopes
  - Test ADMIN bypass
  - Test null/undefined location fields
  - **Property 1: Authorization Enforcement**
  - **Validates: Requirements 1.1, 1.2, 14.1-14.5**
  - _Requirements: 1.2, 14.3-14.5_
  - _Estimated time: 45 minutes_

- [x] 4.6 Implement validateTransitionPath() method
  - Check if transition exists in ALLOWED_TRANSITIONS
  - Return boolean indicating valid path
  - _Requirements: 1.3_
  - _Estimated time: 20 minutes_

- [ ]* 4.7 Write unit tests for validateTransitionPath()
  - Test all valid transitions
  - Test invalid transitions
  - Test edge cases (same stage, null values)
  - **Property 2: Transition Validation (path component)**
  - **Validates: Requirements 1.3**
  - _Requirements: 1.3_
  - _Estimated time: 30 minutes_

- [x] 4.8 Implement validateVersion() method
  - Compare requested version with current referral version
  - Return ValidationResult with errors if mismatch
  - _Requirements: 1.7, 8.1-8.3_
  - _Estimated time: 20 minutes_

- [ ]* 4.9 Write unit tests for validateVersion()
  - Test matching versions
  - Test version mismatches
  - Test version conflict error structure
  - **Property 4: Version Conflict Detection**
  - **Validates: Requirements 1.7, 8.1-8.7**
  - _Requirements: 1.7, 8.1-8.3_
  - _Estimated time: 30 minutes_

### Phase 5: Gateway Check Service

- [x] 5.1 Create GatewayCheckService stub
  - Create `apps/api/src/modules/referrals/services/gateway-check.service.ts`
  - Add @Injectable decorator
  - Inject PrismaService
  - Create empty method stubs
  - _Requirements: Service structure_
  - _Estimated time: 20 minutes_

- [x] 5.2 Implement checkRequiredFields() method
  - Use REQUIRED_FIELDS_PER_STAGE mapping
  - Check if all required fields are present and non-null
  - Return ValidationResult with field-specific errors
  - _Requirements: 1.4, 2.2, 2.6_
  - _Estimated time: 1 hour_

- [ ]* 5.3 Write unit tests for checkRequiredFields()
  - Test with complete referrals
  - Test with missing required fields
  - Test error message format includes field names
  - **Property 2: Transition Validation (required fields component)**
  - **Validates: Requirements 1.4, 2.2**
  - _Requirements: 1.4, 2.2, 2.6_
  - _Estimated time: 45 minutes_

- [x] 5.4 Implement IntakeComplete gate checker
  - Check patientId, referralSource, insurancePayer, site, state present
  - Check coverageVerified is true
  - Return ValidationResult with specific gate errors
  - _Requirements: 2.2, 2.3_
  - _Estimated time: 30 minutes_

- [x] 5.5 Implement ClinicalAccept gate checker
  - Query for ClinicalReview record with decision=ACCEPT
  - Check record exists for current review cycle
  - Return ValidationResult
  - _Requirements: 3.2, 3.6_
  - _Estimated time: 30 minutes_

- [x] 5.6 Implement AppointmentConfirmed gate checker
  - Query for Appointment with confirmedAt populated
  - Check assigned nurse practitioner has valid role and scope
  - Return ValidationResult
  - _Requirements: 4.2, 4.3_
  - _Estimated time: 45 minutes_

- [x] 5.7 Implement VisitComplete gate checker
  - Query for Encounter with outcome=COMPLETED
  - Query for ClinicalNote with submittedAt populated
  - Check dateOfService present and servicesProvided non-empty
  - Return ValidationResult
  - _Requirements: 5.2_
  - _Estimated time: 45 minutes_

- [x] 5.8 Implement NoteApproved gate checker
  - Query for NoteReview with decision=APPROVE
  - Check billingStatus is READY
  - Verify note review references active clinical note revision
  - Return ValidationResult
  - _Requirements: 6.4_
  - _Estimated time: 45 minutes_

- [x] 5.9 Implement checkGatesForTransition() orchestrator method
  - Determine which gate to check based on transition
  - Call checkRequiredFields()
  - Call appropriate gate checker method
  - Combine validation results
  - Return aggregated ValidationResult
  - _Requirements: 1.4_
  - _Estimated time: 45 minutes_

- [x] 5.10 Write unit tests for all gate checkers
  - Test each gate with valid data
  - Test each gate with missing requirements
  - Test checkGatesForTransition() orchestration
  - **Property 2: Transition Validation (gateway component)**
  - **Validates: Requirements 1.4, 2.2, 2.3, 3.6, 4.2, 5.2, 6.4**
  - _Requirements: Gate validation_
  - _Estimated time: 1.5 hours_

### Phase 6: Event Service

- [x] 6.1 Create EventService stub
  - Create `apps/api/src/modules/referrals/services/event.service.ts`
  - Add @Injectable decorator
  - Inject PrismaService
  - Create method stubs
  - _Requirements: Service structure_
  - _Estimated time: 20 minutes_

- [x] 6.2 Implement enqueueEvent() method
  - Generate unique eventId using UUID
  - Accept Prisma transaction object as parameter
  - Insert into EventOutbox within transaction with status=PENDING
  - Include eventType, aggregateId, payload, createdAt
  - _Requirements: 1.10, 17.7, 17.8_
  - _Estimated time: 45 minutes_

- [x] 6.3 Write unit tests for enqueueEvent()
  - Test event insertion within transaction
  - Test event fields are correctly populated
  - Test transaction rollback behavior
  - Mock PrismaService transaction
  - _Requirements: 17.7, 17.8_
  - _Estimated time: 45 minutes_

- [x] 6.4 Implement processOutbox() background processor method
  - Query EventOutbox for status=PENDING ordered by createdAt, limit 100
  - For each event: publish to notification/WebSocket/dashboard (mocked for now)
  - Update status to PUBLISHED with publishedAt timestamp on success
  - Increment retryCount and update lastAttemptAt on failure
  - Mark status=FAILED after 5 retries
  - _Requirements: 17.9, 17.10_
  - _Estimated time: 1.5 hours_

- [x] 6.5 Write unit tests for processOutbox()
  - Test successful event publishing
  - Test retry logic with transient failures
  - Test dead letter (FAILED status) after max retries
  - Test batch processing
  - Mock external services
  - _Requirements: 17.9, 17.10_
  - _Estimated time: 1 hour_

- [x] 6.6 Create EventEmitter helper methods
  - Create emitStageChanged() method
  - Create emitAssignment() method
  - Create emitWorkStatusChanged() method
  - Each method constructs appropriate event payload
  - _Requirements: 17.1-17.5_
  - _Estimated time: 45 minutes_

### Phase 7: Assignment Service

- [x] 7.1 Create AssignmentService stub
  - Create `apps/api/src/modules/referrals/services/assignment.service.ts`
  - Add @Injectable decorator
  - Inject PrismaService
  - Create method stubs
  - _Requirements: Service structure_
  - _Estimated time: 20 minutes_

- [x] 7.2 Implement determineAssignment() method
  - Use STAGE_OWNERS mapping to determine role
  - Check metadata for return-to-originator scenarios
  - Return { role, userId? } object
  - _Requirements: 9.1, 9.2_
  - _Estimated time: 45 minutes_

- [x] 7.3 Implement assignToUser() method
  - Verify user has required role and scope
  - Close previous ReferralAssignment (set unassignedAt)
  - Create new ReferralAssignment record
  - Update Referral assignedTo and assignedRole
  - _Requirements: 9.3, 9.4, 9.5_
  - _Estimated time: 1 hour_

- [x] 7.4 Implement assignToRoleQueue() method
  - Create ReferralAssignment with role but no userId
  - Set Referral assignedRole and clear assignedTo
  - _Requirements: 9.2_
  - _Estimated time: 30 minutes_

- [x]* 7.5 Write unit tests for AssignmentService
  - Test determineAssignment() with various stages
  - Test assignToUser() creates correct records
  - Test assignToRoleQueue() clears assignedTo
  - Test assignment history preservation
  - **Property 7: Assignment Routing**
  - **Validates: Requirements 2.5, 9.1-9.9**
  - _Requirements: 9.1-9.5_
  - _Estimated time: 1 hour_

### Phase 8: Workflow Service Core

- [x] 8.1 Create WorkflowService stub
  - Create `apps/api/src/modules/referrals/services/workflow.service.ts`
  - Add @Injectable decorator
  - Inject PrismaService, ValidationService, GatewayCheckService, EventService, AssignmentService, RedisService
  - Create method stubs for executeTransition, validateTransition, updateWorkStatus, assignReferral, getWorkflowHistory
  - _Requirements: Service structure_
  - _Estimated time: 30 minutes_

- [x] 8.2 Implement validateTransition() method (validation only, no execution)
  - Call ValidationService.checkAuthorization()
  - Call ValidationService.checkScope()
  - Call ValidationService.validateTransitionPath()
  - Call ValidationService.validateVersion()
  - Call GatewayCheckService.checkGatesForTransition()
  - Aggregate all validation errors
  - Return ValidationResult
  - _Requirements: 1.1-1.4, 1.6_
  - _Estimated time: 1 hour_

- [x]* 8.3 Write unit tests for validateTransition()
  - Test successful validation (all checks pass)
  - Test authorization failure
  - Test scope failure
  - Test invalid transition path
  - Test version mismatch
  - Test gate validation failure
  - Test multiple simultaneous failures
  - Mock all injected services
  - _Requirements: 1.1-1.6_
  - _Estimated time: 1.5 hours_

- [x] 8.4 Implement executeTransition() method - transaction setup
  - Check idempotency key in Redis, return cached response if exists
  - Call validateTransition()
  - If validation fails, throw ValidationException with errors
  - Begin Prisma transaction with isolation level
  - Lock referral row (SELECT FOR UPDATE)
  - Re-check version within transaction
  - _Requirements: 1.5, 1.7, 1.9, 8.5, 15.1-15.3_
  - _Estimated time: 1.5 hours_

- [x] 8.5 Implement executeTransition() method - state updates
  - Increment version
  - Update pipelineStage to targetStage
  - Set workStatus to PENDING
  - Update updatedAt timestamp
  - Call prisma.referral.update() within transaction
  - _Requirements: 1.5_
  - _Estimated time: 30 minutes_

- [x] 8.6 Implement executeTransition() method - audit and events
  - Create WorkflowTransition record within transaction
  - Call AssignmentService.determineAssignment()
  - Call AssignmentService.assignToUser() or assignToRoleQueue() within transaction
  - Call EventService.enqueueEvent() within transaction
  - Commit transaction
  - _Requirements: 1.8, 1.10, 9.1_
  - _Estimated time: 1 hour_

- [x] 8.7 Implement executeTransition() method - post-commit actions
  - Invalidate Redis caches (dashboard metrics, referral lists)
  - Store idempotency response in Redis (24hr TTL)
  - Return TransitionResult with success, referral, transition
  - _Requirements: 15.4, 16.7_
  - _Estimated time: 30 minutes_

- [x] 8.8 Implement executeTransition() method - error handling
  - Wrap transaction in try-catch
  - Handle version conflicts (return 409 with current state)
  - Handle database errors (rollback automatic, return 500)
  - Log errors with context
  - Ensure idempotent behavior on retry
  - _Requirements: 1.9, 13.3, 13.4, 13.9_
  - _Estimated time: 1 hour_

- [x]* 8.9 Write unit tests for executeTransition() happy path
  - Test successful transition with all components
  - Verify version incremented
  - Verify stage and status updated
  - Verify WorkflowTransition created
  - Verify assignment updated
  - Verify event enqueued
  - Mock all dependencies
  - **Property 3: Transaction Safety (success case)**
  - **Validates: Requirements 1.5, 1.8, 1.10**
  - _Requirements: 1.5, 1.8, 1.10_
  - _Estimated time: 1.5 hours_

- [x]* 8.10 Write unit tests for executeTransition() error cases
  - Test validation failure (no state change)
  - Test version conflict (return 409, no state change)
  - Test database error (rollback, no state change)
  - Verify rollback behavior
  - **Property 3: Transaction Safety (failure case)**
  - **Validates: Requirements 1.6, 1.9, 13.3**
  - _Requirements: 1.6, 1.9, 13.3_
  - _Estimated time: 1.5 hours_

- [x]* 8.11 Write unit tests for executeTransition() idempotency
  - Test duplicate request with same idempotency key
  - Verify cached response returned
  - Verify no duplicate state changes
  - Verify no duplicate audit records
  - **Property 10: Idempotency**
  - **Validates: Requirements 15.1-15.10**
  - _Requirements: 15.1-15.10_
  - _Estimated time: 1 hour_

### Phase 9: Workflow Service Additional Methods

- [x] 9.1 Implement updateWorkStatus() method
  - Validate work status transition using WORK_STATUS_TRANSITIONS
  - Validate reason provided for BLOCKED_NEEDS_INFO and ON_HOLD
  - Check version for optimistic concurrency
  - Begin transaction
  - Update Referral workStatus within transaction
  - Create WorkflowTransition record (status change, no stage change)
  - Commit transaction
  - Return updated Referral
  - _Requirements: 10.3-10.10_
  - _Estimated time: 1.5 hours_

- [x]* 9.2 Write unit tests for updateWorkStatus()
  - Test valid status transitions
  - Test invalid status transitions
  - Test reason validation
  - Test version conflict handling
  - **Property 8: Work Status Transitions**
  - **Validates: Requirements 2.7, 2.8, 10.3-10.10**
  - _Requirements: 10.3-10.10_
  - _Estimated time: 1 hour_

- [x] 9.3 Implement assignReferral() method
  - Validate assignment request
  - Check user authorization for assignment operation
  - If userId provided, call AssignmentService.assignToUser()
  - If role provided without userId, call AssignmentService.assignToRoleQueue()
  - Emit assignment event
  - Return updated Referral
  - _Requirements: 9.3, 9.4_
  - _Estimated time: 1 hour_

- [x]* 9.4 Write unit tests for assignReferral()
  - Test user assignment
  - Test role queue assignment
  - Test authorization check
  - Mock AssignmentService
  - _Requirements: 9.3, 9.4_
  - _Estimated time: 45 minutes_

- [x] 9.5 Implement getWorkflowHistory() method
  - Query WorkflowTransition records for referralId
  - Check user authorization for audit queries
  - Order by transitionedAt descending
  - Support pagination
  - Return WorkflowTransition array
  - _Requirements: 12.8, 14.7_
  - _Estimated time: 45 minutes_

- [x]* 9.6 Write unit tests for getWorkflowHistory()
  - Test history query returns all transitions
  - Test ordering
  - Test pagination
  - Test authorization check
  - **Property 5: Audit Completeness**
  - **Validates: Requirements 1.8, 12.1-12.8**
  - _Requirements: 12.8, 14.7_
  - _Estimated time: 45 minutes_

### Phase 10: Referrals Module Setup

- [x] 10.1 Create ReferralsModule
  - Create `apps/api/src/modules/referrals/referrals.module.ts`
  - Import DatabaseModule, RedisModule
  - Register all services as providers
  - Export ReferralsService and WorkflowService
  - _Requirements: Module structure_
  - _Estimated time: 30 minutes_

- [x] 10.2 Create ReferralsService for CRUD operations
  - Create `apps/api/src/modules/referrals/services/referrals.service.ts`
  - Implement create() method
  - Implement findOne() method with authorization
  - Implement findMany() with filters and pagination
  - Implement update() method
  - _Requirements: Basic CRUD_
  - _Estimated time: 1.5 hours_

- [x]* 10.3 Write unit tests for ReferralsService
  - Test create operation
  - Test findOne with authorization
  - Test findMany with filters
  - Test update operation
  - Mock PrismaService
  - _Requirements: Basic CRUD_
  - _Estimated time: 1 hour_

### Phase 11: API Controllers and Guards

- [x] 11.1 Create ReferralsController
  - Create `apps/api/src/modules/referrals/referrals.controller.ts`
  - Add @Controller('referrals') decorator
  - Add @UseGuards(JwtAuthGuard, RbacGuard)
  - Create empty endpoint handlers
  - _Requirements: API structure_
  - _Estimated time: 30 minutes_

- [x] 11.2 Implement POST /api/referrals endpoint
  - Create CreateReferralDto
  - Add validation pipe
  - Call ReferralsService.create()
  - Return 201 Created with referral data
  - Add @Permissions decorator
  - _Requirements: Basic CRUD_
  - _Estimated time: 45 minutes_

- [x] 11.3 Implement GET /api/referrals endpoint
  - Create QueryReferralsDto with filters
  - Add pagination parameters
  - Call ReferralsService.findMany() with filters
  - Return 200 OK with paginated results
  - Filter by user scope
  - _Requirements: Basic CRUD_
  - _Estimated time: 1 hour_

- [x] 11.4 Implement GET /api/referrals/:id endpoint
  - Add @Param('id') parameter
  - Call ReferralsService.findOne()
  - Return 200 OK with referral
  - Return 404 if not found or no scope access
  - _Requirements: Basic CRUD_
  - _Estimated time: 30 minutes_

- [x] 11.5 Implement PATCH /api/referrals/:id endpoint
  - Create UpdateReferralDto
  - Add version field for optimistic concurrency
  - Call ReferralsService.update()
  - Return 200 OK with updated referral
  - Handle version conflicts (409)
  - _Requirements: Basic CRUD, 8.1_
  - _Estimated time: 1 hour_

- [x] 11.6 Implement POST /api/referrals/:id/transitions endpoint
  - Use TransitionRequestDto
  - Extract idempotency key from headers
  - Call WorkflowService.executeTransition()
  - Return 200 OK on success
  - Return 400 for validation errors
  - Return 403 for authorization errors
  - Return 409 for version conflicts
  - Add error handling middleware
  - _Requirements: 1.1-1.10_
  - _Estimated time: 1.5 hours_

- [x] 11.7 Implement PATCH /api/referrals/:id/work-status endpoint
  - Use UpdateWorkStatusDto
  - Call WorkflowService.updateWorkStatus()
  - Return 200 OK with updated referral
  - Handle errors appropriately
  - _Requirements: 10.3-10.10_
  - _Estimated time: 45 minutes_

- [x] 11.8 Implement POST /api/referrals/:id/assignments endpoint
  - Use AssignmentRequestDto
  - Call WorkflowService.assignReferral()
  - Return 200 OK with updated referral
  - Check assignment permissions
  - _Requirements: 9.3, 9.4_
  - _Estimated time: 45 minutes_

- [x] 11.9 Implement GET /api/referrals/:id/workflow-history endpoint
  - Add pagination query parameters
  - Call WorkflowService.getWorkflowHistory()
  - Return 200 OK with paginated history
  - Check audit query permissions
  - _Requirements: 12.8_
  - _Estimated time: 45 minutes_

- [x] 11.10 Create custom exception filters
  - Create ValidationExceptionFilter
  - Create VersionConflictExceptionFilter
  - Map exceptions to appropriate HTTP responses
  - Format error responses per ErrorResponseDto
  - _Requirements: 13.1, 13.2_
  - _Estimated time: 1 hour_

### Phase 12: Integration Tests

- [x] 12.1 Set up integration test infrastructure
  - Create test database configuration
  - Create test data fixtures
  - Set up beforeEach and afterEach hooks
  - Create helper functions for test data creation
  - _Requirements: Testing infrastructure_
  - _Estimated time: 1.5 hours_

- [x]* 12.2 Write integration test: INTAKE → CLINICAL_REVIEW transition
  - Create referral in INTAKE stage
  - Complete intake requirements
  - POST transition to CLINICAL_REVIEW
  - Verify referral updated correctly
  - Verify WorkflowTransition record created
  - Verify assignment to CLINICAL_REVIEWER
  - Verify event in EventOutbox
  - _Requirements: 2.1-2.10_
  - _Estimated time: 1.5 hours_

- [x]* 12.3 Write integration test: Clinical review accept flow
  - Create referral in CLINICAL_REVIEW
  - Create ClinicalReview with decision=ACCEPT
  - POST transition to SCHEDULING
  - Verify transition success
  - Verify assignment updated
  - _Requirements: 3.2, 3.6_
  - _Estimated time: 1 hour_

- [x]* 12.4 Write integration test: Clinical review return flow
  - Create referral in CLINICAL_REVIEW
  - POST transition back to INTAKE with reason
  - Verify referral in INTAKE with workStatus=BLOCKED_NEEDS_INFO
  - Verify ClinicalReview record created
  - Verify audit trail preserved
  - _Requirements: 3.3, 3.7_
  - _Estimated time: 1 hour_

- [x]* 12.5 Write integration test: Clinical review reject flow
  - Create referral in CLINICAL_REVIEW
  - POST reject decision
  - Verify caseOutcome=REJECTED
  - Verify forward transitions blocked
  - Verify audit history preserved
  - _Requirements: 3.4, 3.5, 11.6_
  - _Estimated time: 1 hour_

- [x]* 12.6 Write integration test: Version conflict handling
  - Two clients fetch same referral (version N)
  - Client A transitions successfully (version N+1)
  - Client B attempts transition with version N
  - Verify Client B receives 409 Conflict
  - Verify response includes current state
  - Verify referral unchanged after conflict
  - _Requirements: 1.7, 8.1-8.3_
  - _Estimated time: 1 hour_

- [x]* 12.7 Write integration test: Authorization failures
  - Create referral
  - Authenticate as user without required permission
  - Attempt transition
  - Verify 403 Forbidden response
  - Verify referral unchanged
  - _Requirements: 1.1, 14.1-14.3_
  - _Estimated time: 45 minutes_

- [x]* 12.8 Write integration test: Scope access denial
  - Create referral in site A
  - Authenticate as user with scope for site B only
  - Attempt transition
  - Verify 403 Forbidden response
  - Verify referral unchanged
  - _Requirements: 1.2, 14.4-14.5_
  - _Estimated time: 45 minutes_

- [x]* 12.9 Write integration test: Gate validation failures
  - Create referral in INTAKE with missing coverageVerified
  - Attempt transition to CLINICAL_REVIEW
  - Verify 400 Bad Request
  - Verify error includes specific field (coverageVerified)
  - Update coverageVerified and retry successfully
  - _Requirements: 2.3, 2.6_
  - _Estimated time: 1 hour_

- [x]* 12.10 Write integration test: Work status transitions
  - Create referral in any stage
  - PATCH work status to IN_PROGRESS
  - PATCH work status to BLOCKED_NEEDS_INFO with reason
  - PATCH work status to ON_HOLD with reason
  - Verify each transition creates audit record
  - _Requirements: 10.3-10.10_
  - _Estimated time: 1 hour_

- [x]* 12.11 Write integration test: Assignment operations
  - Create referral
  - POST assignment to specific user
  - Verify assignedTo updated
  - Verify ReferralAssignment record created
  - POST assignment to role queue
  - Verify assignedTo cleared, assignedRole set
  - _Requirements: 9.3, 9.4_
  - _Estimated time: 1 hour_

- [x]* 12.12 Write integration test: Workflow history query
  - Create referral
  - Execute multiple transitions
  - GET /workflow-history
  - Verify all transitions returned in order
  - Test pagination
  - _Requirements: 12.8_
  - _Estimated time: 45 minutes_

### Phase 13: Property-Based Tests

- [x] 13.1 Install and configure fast-check
  - Install fast-check: `npm install --save-dev fast-check`
  - Create test utilities for custom arbitraries
  - Create `apps/api/src/modules/referrals/test/arbitraries.ts`
  - _Requirements: PBT infrastructure_
  - _Estimated time: 30 minutes_

- [x] 13.2 Create custom arbitraries
  - Implement arbitraryReferral()
  - Implement arbitraryUser()
  - Implement arbitraryTransitionRequest()
  - Implement arbitraryPipelineStage()
  - Implement arbitraryWorkStatus()
  - _Requirements: PBT infrastructure_
  - _Estimated time: 1.5 hours_

- [x]* 13.3 Write property test: Authorization enforcement (Property 1)
  - Generate random referral and user combinations
  - Check authorization and scope independently
  - Assert validation result matches expected authorization
  - 100 test runs
  - **Property 1: Authorization Enforcement**
  - **Validates: Requirements 1.1, 1.2, 14.1-14.5**
  - _Requirements: 1.1, 1.2, 14.1-14.5_
  - _Estimated time: 1.5 hours_

- [x]* 13.4 Write property test: Transition validation (Property 2)
  - Generate random transition requests
  - Validate path, required fields, and gates
  - Assert only valid transitions pass all checks
  - 100 test runs
  - **Property 2: Transition Validation**
  - **Validates: Requirements 1.3, 1.4, 2.2, 2.3**
  - _Requirements: 1.3, 1.4_
  - _Estimated time: 2 hours_

- [x]* 13.5 Write property test: Transaction safety (Property 3)
  - Generate random transition executions
  - Mock database to randomly fail
  - Assert state is either fully committed or fully unchanged
  - Verify no partial updates
  - 100 test runs
  - **Property 3: Transaction Safety**
  - **Validates: Requirements 1.5, 1.6, 1.9, 13.3**
  - _Requirements: 1.5, 1.6, 1.9_
  - _Estimated time: 2 hours_

- [x]* 13.6 Write property test: Version conflict detection (Property 4)
  - Generate random version mismatches
  - Assert all version conflicts return 409
  - Assert current state included in response
  - Assert referral unchanged after conflict
  - 100 test runs
  - **Property 4: Version Conflict Detection**
  - **Validates: Requirements 1.7, 8.1-8.7**
  - _Requirements: 1.7, 8.1-8.7_
  - _Estimated time: 1 hour_

- [x]* 13.7 Write property test: Audit completeness (Property 5)
  - Generate random successful state changes
  - Assert WorkflowTransition record created for each
  - Assert all required fields present in audit record
  - 100 test runs
  - **Property 5: Audit Completeness**
  - **Validates: Requirements 1.8, 12.1-12.8**
  - _Requirements: 1.8, 12.1-12.8_
  - _Estimated time: 1 hour_

- [x]* 13.8 Write property test: Event emission (Property 6)
  - Generate random successful transitions
  - Assert EventOutbox entry created for each
  - Assert events written within same transaction
  - 100 test runs
  - **Property 6: Event Emission**
  - **Validates: Requirements 1.10, 17.1-17.9**
  - _Requirements: 1.10, 17.7-17.9_
  - _Estimated time: 1 hour_

### Phase 14: End-to-End Tests

- [ ]* 14.1 Write E2E test: Complete happy path workflow
  - Create patient and referral via API
  - POST INTAKE → CLINICAL_REVIEW
  - Create ClinicalReview via API
  - POST CLINICAL_REVIEW → SCHEDULING
  - Create Appointment via API
  - POST SCHEDULING → NP_VISIT
  - Create Encounter and ClinicalNote via API
  - POST NP_VISIT → NOTES_QA
  - Create NoteReview via API (billing status → READY)
  - POST NOTES_QA → BILLING
  - Create Claim via API
  - Verify complete audit trail
  - _Requirements: Complete workflow_
  - _Estimated time: 2 hours_

- [ ]* 14.2 Write E2E test: Return and resubmit cycle
  - Create referral in CLINICAL_REVIEW
  - POST return to INTAKE
  - Complete intake corrections
  - POST INTAKE → CLINICAL_REVIEW
  - Verify new review cycle allowed
  - Verify audit history preserved
  - _Requirements: 3.7, 3.8_
  - _Estimated time: 1.5 hours_

- [ ]* 14.3 Write E2E test: No-show flow
  - Create referral in NP_VISIT
  - Create Encounter with outcome=NO_SHOW via API
  - System transitions back to SCHEDULING
  - Verify referral in SCHEDULING
  - Verify encounter preserved
  - _Requirements: 5.3_
  - _Estimated time: 1 hour_

- [ ]* 14.4 Write E2E test: Note correction flow
  - Create referral in NOTES_QA
  - POST return to NP_VISIT with correction requirements
  - Verify assignment to original NP
  - Create corrected note (new revision)
  - POST NP_VISIT → NOTES_QA
  - Approve corrected note
  - _Requirements: 5.7, 5.8, 6.3, 6.6_
  - _Estimated time: 1.5 hours_

- [ ]* 14.5 Write E2E test: Concurrent transition handling
  - Spawn 10 concurrent POST requests to transition same referral
  - Verify only 1 succeeds
  - Verify other 9 receive 409 Conflict
  - Verify single WorkflowTransition record
  - Verify version incremented once
  - _Requirements: 8.5, 8.6_
  - _Estimated time: 1.5 hours_

- [ ]* 14.6 Write E2E test: Idempotency key handling
  - POST transition with idempotency key
  - Simulate network timeout
  - Retry with same idempotency key
  - Verify cached response returned
  - Verify no duplicate transition
  - _Requirements: 15.1-15.10_
  - _Estimated time: 1 hour_

- [ ]* 14.7 Write E2E test: Event outbox processing
  - Execute multiple transitions (create events)
  - Run EventService.processOutbox()
  - Verify events published
  - Verify status updated to PUBLISHED
  - Verify no duplicate events
  - _Requirements: 17.7-17.13_
  - _Estimated time: 1 hour_

### Phase 15: Terminal State Handling

- [ ] 15.1 Implement terminal state blocking logic
  - Add checkTerminalState() method to ValidationService
  - Check if caseOutcome is in [REJECTED, PATIENT_DECLINED, DUPLICATE, DISCHARGED, CLOSED]
  - Block forward transitions if terminal state
  - Return validation error with terminal state message
  - _Requirements: 3.5, 11.1-11.8_
  - _Estimated time: 45 minutes_

- [ ]* 15.2 Write unit tests for terminal state blocking
  - Test forward transition blocked for each terminal outcome
  - Test backward transitions still allowed (if applicable)
  - Test audit history preserved
  - **Property 9: Terminal State Enforcement**
  - **Validates: Requirements 3.5, 11.1-11.8**
  - _Requirements: 3.5, 11.1-11.8_
  - _Estimated time: 1 hour_

- [ ]* 15.3 Write integration test: Terminal state enforcement
  - Create referral
  - Set caseOutcome to REJECTED
  - Attempt forward transition
  - Verify 422 status
  - Verify error message indicates terminal state
  - _Requirements: 3.5, 11.6_
  - _Estimated time: 45 minutes_

### Phase 16: Performance and Caching

- [ ] 16.1 Implement permission caching in ValidationService
  - Cache user permissions in Redis with 5-minute TTL
  - Key format: `user:permissions:{userId}`
  - Implement cache-aside pattern
  - _Requirements: 14.9, 16.3, 16.7_
  - _Estimated time: 1 hour_

- [ ] 16.2 Implement dashboard metrics caching
  - Create getDashboardMetrics() method in ReferralsService
  - Cache results in Redis with 1-minute TTL
  - Key format: `dashboard:metrics:{userId}`
  - Invalidate on state changes
  - _Requirements: 16.4, 16.7_
  - _Estimated time: 1 hour_

- [ ] 16.3 Implement cache invalidation logic
  - Invalidate dashboard metrics on transition success
  - Invalidate referral list queries on state changes
  - Invalidate permissions on role/scope changes
  - Add cache invalidation to WorkflowService.executeTransition()
  - _Requirements: 16.7_
  - _Estimated time: 45 minutes_

- [ ]* 16.4 Write performance tests
  - Test single transition latency (target: P95 < 500ms)
  - Test concurrent transitions on different referrals
  - Test cache hit rates
  - Use artillery or k6 for load testing
  - _Requirements: 16.1, 16.2_
  - _Estimated time: 2 hours_

### Phase 17: Documentation and Deployment

- [ ] 17.1 Create API documentation
  - Document all endpoints with OpenAPI/Swagger decorators
  - Add example requests and responses
  - Document error codes and responses
  - _Requirements: Documentation_
  - _Estimated time: 1.5 hours_

- [ ] 17.2 Create workflow engine usage guide
  - Document transition flows
  - Document permission requirements
  - Document gate validation rules
  - Provide code examples
  - _Requirements: Documentation_
  - _Estimated time: 1 hour_

- [ ] 17.3 Set up outbox background processor
  - Create scheduled job using NestJS @Cron
  - Configure to run every 10 seconds
  - Add health check endpoint
  - Add monitoring/alerting for failed events
  - _Requirements: 17.9_
  - _Estimated time: 1 hour_

- [ ] 17.4 Create monitoring and alerting
  - Add logging for all state transitions
  - Add metrics for transition latency
  - Add alerts for failed events after 5 retries
  - Add alerts for version conflict rates
  - _Requirements: Monitoring_
  - _Estimated time: 1.5 hours_

- [ ] 17.5 Final checkpoint - Review and test all components
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.3", "3.1", "3.2", "3.3", "3.4"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.2", "3.5"] },
    { "id": 2, "tasks": ["1.5", "1.6"] },
    { "id": 3, "tasks": ["4.1", "5.1", "6.1", "7.1"] },
    { "id": 4, "tasks": ["4.2", "5.2"] },
    { "id": 5, "tasks": ["4.3", "5.3"] },
    { "id": 6, "tasks": ["4.4", "4.6", "5.4", "5.5", "5.6", "5.7", "5.8", "6.2", "7.2"] },
    { "id": 7, "tasks": ["4.5", "4.7", "5.10", "6.3", "7.3", "7.4"] },
    { "id": 8, "tasks": ["4.8", "5.9", "6.4"] },
    { "id": 9, "tasks": ["4.9", "6.5", "6.6", "7.5"] },
    { "id": 10, "tasks": ["8.1"] },
    { "id": 11, "tasks": ["8.2"] },
    { "id": 12, "tasks": ["8.3"] },
    { "id": 13, "tasks": ["8.4", "8.5"] },
    { "id": 14, "tasks": ["8.6", "8.7", "8.8"] },
    { "id": 15, "tasks": ["8.9", "8.10", "8.11"] },
    { "id": 16, "tasks": ["9.1", "9.3", "9.5"] },
    { "id": 17, "tasks": ["9.2", "9.4", "9.6"] },
    { "id": 18, "tasks": ["10.1", "10.2"] },
    { "id": 19, "tasks": ["10.3"] },
    { "id": 20, "tasks": ["11.1"] },
    { "id": 21, "tasks": ["11.2", "11.3", "11.4", "11.5", "11.10"] },
    { "id": 22, "tasks": ["11.6", "11.7", "11.8", "11.9"] },
    { "id": 23, "tasks": ["12.1"] },
    { "id": 24, "tasks": ["12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8", "12.9"] },
    { "id": 25, "tasks": ["12.10", "12.11", "12.12"] },
    { "id": 26, "tasks": ["13.1", "13.2"] },
    { "id": 27, "tasks": ["13.3", "13.4", "13.5", "13.6", "13.7", "13.8"] },
    { "id": 28, "tasks": ["14.1", "14.2", "14.3", "14.4"] },
    { "id": 29, "tasks": ["14.5", "14.6", "14.7"] },
    { "id": 30, "tasks": ["15.1"] },
    { "id": 31, "tasks": ["15.2", "15.3"] },
    { "id": 32, "tasks": ["16.1", "16.2"] },
    { "id": 33, "tasks": ["16.3", "16.4"] },
    { "id": 34, "tasks": ["17.1", "17.2", "17.3", "17.4"] },
    { "id": 35, "tasks": ["17.5"] }
  ]
}
```

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property-based tests (Phase 13) validate universal correctness properties
- Integration tests (Phase 12) validate specific workflows and scenarios
- E2E tests (Phase 14) validate complete system behavior
- The dependency graph ensures tasks can be parallelized where safe
- Version conflicts and concurrency are tested at multiple levels (unit, integration, E2E)
- Authorization and scope validation are tested comprehensively
- Terminal state handling is separated for clarity
- Performance and caching are addressed in dedicated phase
- All property tests include feature name and property reference for traceability
