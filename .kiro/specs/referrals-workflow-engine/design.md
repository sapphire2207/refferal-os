# Design Document: Referrals Workflow Engine

## Overview

The Referrals Workflow Engine is a healthcare workflow management system managing the complete lifecycle of referrals through six pipeline stages (INTAKE → CLINICAL_REVIEW → SCHEDULING → NP_VISIT → NOTES_QA → BILLING). The engine enforces state transitions, validates workflow gates, manages authorization, maintains optimistic concurrency control, and ensures reliable event emission using the transactional outbox pattern.

### Design Principles

1. **Entity-Owned State**: Workflow state lives in the Referral entity, not in a separate workflow engine database
2. **Transaction Boundaries**: All state changes occur within database transactions with atomic rollback capability
3. **Immutable Audit Trail**: WorkflowTransition records are append-only and never modified
4. **Action-Based Authorization**: Permissions are tied to specific actions (e.g., `referrals.transition.to_billing`) rather than destination stage ownership
5. **Reliable Event Delivery**: Transactional outbox pattern ensures events are published exactly once
6. **Fail-Safe Design**: All validations occur before state mutation; failures leave entities in consistent state

### Key Architectural Decisions

**State Machine Pattern**: Rather than implementing a traditional FSM library, the design uses explicit transition validation through configuration-driven rules (ALLOWED_TRANSITIONS, REQUIRED_FIELDS_PER_STAGE, STAGE_OWNERS). This approach provides clarity for healthcare compliance auditing and allows business stakeholders to understand transition logic without decoding abstract state machine code.

**Optimistic Concurrency via Version Field**: The Referral entity includes a version field incremented on each transition. This prevents lost updates when multiple users attempt concurrent transitions without requiring pessimistic row locks that could impact system throughput.

**Transactional Outbox for Event Emission**: Events are written to an EventOutbox table within the same transaction as state changes. A separate background processor publishes events to notification, WebSocket, and dashboard systems. This ensures state changes and event emission are atomic, preventing scenarios where a transition commits but notification fails.

**Service Layer Separation**: Clear separation between WorkflowService (orchestrates transitions), ValidationService (checks gates and permissions), EventService (manages outbox), and ReferralsService (CRUD operations). This supports testability and future extensibility.

## Architecture

### Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ReferralsController                       │
│  ├─ POST   /api/referrals/:id/transitions                   │
│  ├─ GET    /api/referrals/:id/workflow-history              │
│  ├─ PATCH  /api/referrals/:id/work-status                   │
│  └─ POST   /api/referrals/:id/assignments                   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴─────────────┐
        ▼                          ▼
┌──────────────────┐      ┌──────────────────┐
│ WorkflowService  │      │ ReferralsService │
│ ├─ validate      │      │ ├─ findOne       │
│ ├─ execute       │      │ ├─ update        │
│ └─ assign        │      │ └─ query         │
└────┬─────────────┘      └──────────────────┘
     │
     ├──────────┬────────────┬──────────────┐
     ▼          ▼            ▼              ▼
┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐
│ Validat │ │ Gateway  │ │ Assignmt │ │ EventSvc    │
│ ionSvc  │ │ CheckSvc │ │ Svc      │ │ (Outbox)    │
└─────────┘ └──────────┘ └──────────┘ └─────────────┘
     │           │            │              │
     └───────────┴────────────┴──────────────┘
                     │
            ┌────────┴────────┐
            ▼                 ▼
    ┌──────────────┐   ┌──────────────┐
    │ PrismaService│   │ RedisService │
    └──────────────┘   └──────────────┘
```

**WorkflowService**: Orchestrates transition execution. Coordinates validation, gate checking, version control, database updates, audit record creation, and event emission.

**ValidationService**: Validates transition requests including authorization checks, scope verification, allowed transition verification, and prerequisite validation.

**GatewayCheckService**: Validates stage-specific gateway requirements (e.g., required fields, related records, approval states).

**AssignmentService**: Manages work assignment and reassignment including role queue assignment and user-specific assignment.

**EventService**: Manages transactional outbox writes and background event publishing.

**ReferralsService**: Standard CRUD operations for referrals with query building and filtering.

### Integration with Existing Systems

**Auth Integration**: Uses existing JwtAuthGuard and RbacGuard from `src/common/guards/`. Permission checks delegate to existing permission checking infrastructure with user scope validation from JWT token payload.

**Redis Integration**: Uses existing RedisService from `src/redis/` for caching user permissions (5 min TTL), dashboard metrics (1 min TTL), and idempotency keys (24 hour TTL).

**Database Integration**: Uses existing PrismaService from `src/database/` with transaction support via `prisma.$transaction()`.

**WebSocket Integration**: Emits events via existing WebSocketModule for real-time dashboard updates and notifications.

## State Machine Design

### Stage Transition Matrix

```
Current Stage       → Target Stage          | Type     | Required Gate
──────────────────────────────────────────────────────────────────────
INTAKE              → CLINICAL_REVIEW        | Forward  | IntakeComplete
CLINICAL_REVIEW     → SCHEDULING             | Forward  | ClinicalAccept
CLINICAL_REVIEW     → INTAKE                 | Backward | ClinicalReturn
SCHEDULING          → NP_VISIT               | Forward  | AppointmentConfirmed
SCHEDULING          → CLINICAL_REVIEW        | Backward | RescheduleNeeded
NP_VISIT            → NOTES_QA               | Forward  | VisitComplete
NP_VISIT            → SCHEDULING             | Backward | NoShow
NOTES_QA            → BILLING                | Forward  | NoteApproved
NOTES_QA            → NP_VISIT               | Backward | NoteReturned
BILLING             → (none)                 | Terminal | -
```

### Workflow Gates

Each transition type has specific validation requirements that must pass before the transition executes:

**IntakeComplete Gate**:
- Required fields: patientId, referralSource, insurancePayer, site, state
- Business rule: coverageVerified must be true
- Permission: user has `referrals.transition.to_clinical_review` or INTAKE_SPECIALIST role
- Scope: user scope includes referral's site, state, legal entity

**ClinicalAccept Gate**:
- Related record: ClinicalReview with decision=ACCEPT exists for current review cycle
- Permission: user has `referrals.review.accept` or CLINICAL_REVIEWER/CLINICAL_COORDINATOR role
- Scope: user scope matches referral scope

**ClinicalReturn Gate**:
- Business rule: reason field must be non-empty
- Permission: user has `referrals.transition.return_to_intake` or CLINICAL_REVIEWER/CLINICAL_COORDINATOR role
- Scope: user scope matches referral scope

**AppointmentConfirmed Gate**:
- Related record: Appointment with confirmedAt populated exists
- Business rule: assigned nurse practitioner has valid role and scope
- Permission: user has SCHEDULER or OFFICE_MANAGER role
- Scope: user scope matches referral scope

**VisitComplete Gate**:
- Related record: Encounter with outcome=COMPLETED exists
- Related record: ClinicalNote with submittedAt populated exists
- Business rule: dateOfService is present, servicesProvided array is non-empty
- Permission: user has NURSE_PRACTITIONER role and is assigned to referral
- Scope: user scope matches referral scope

**NoteApproved Gate**:
- Related record: NoteReview with decision=APPROVE exists for active clinical note revision
- Business rule: billing status is READY (set by note approval)
- Permission: user has BILLING_COORDINATOR role
- Scope: user scope matches referral scope

**Backward Transition Gates**:
- All backward transitions require explicit reason documentation
- NoShow sets encounter outcome and returns to SCHEDULING
- NoteReturned requires specific correction instructions

### Version-Based Concurrency Control Flow

```
1. Client fetches referral with current version N
2. User reviews and decides to transition
3. Client sends transition request with version N
4. WorkflowService begins transaction:
   a. SELECT referral WHERE id = :id FOR UPDATE
   b. Check if version matches N
   c. If mismatch: ROLLBACK, return 409 Conflict with current state
   d. Validate transition and gates
   e. If validation fails: ROLLBACK, return 400 Bad Request
   f. Update referral SET version = N+1, pipelineStage = newStage, ...
   g. INSERT WorkflowTransition record
   h. INSERT EventOutbox records
   i. COMMIT transaction
5. Return 200 OK with updated referral
```

### Work Status Transitions

Work status operates independently from pipeline stage:

```
PENDING ──────────┐
  │               │
  ├──> IN_PROGRESS ├──> COMPLETED
  │       │        │
  │       │        └──> BLOCKED_NEEDS_INFO ──┐
  │       │                                   │
  │       └────> ON_HOLD <───────────────────┘
  │                 │
  └─────────────────┘
```

**Transition Rules**:
- PENDING → IN_PROGRESS, BLOCKED_NEEDS_INFO, ON_HOLD
- IN_PROGRESS → COMPLETED, BLOCKED_NEEDS_INFO, ON_HOLD
- BLOCKED_NEEDS_INFO → IN_PROGRESS, ON_HOLD (after resolution documented)
- ON_HOLD → PENDING, IN_PROGRESS
- COMPLETED → (none, except when stage changes reset to PENDING)

**Stage Transition Defaults**:
- On stage transition, work status resets to PENDING
- Exception: terminal outcomes (REJECTED, CLOSED) keep COMPLETED status

## Components and Interfaces

### Core TypeScript Interfaces

```typescript
// Transition Request DTO
export class TransitionRequestDto {
  targetStage: PipelineStage;
  reason?: string;
  version: number;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

// Transition Result
export interface TransitionResult {
  success: boolean;
  referral: Referral;
  transition: WorkflowTransition;
  warnings?: string[];
}

// Validation Context
export interface ValidationContext {
  referral: Referral;
  targetStage: PipelineStage;
  user: AuthTokenPayload;
  reason?: string;
  metadata?: Record<string, any>;
}

// Validation Error
export interface ValidationError {
  type: 'permission' | 'scope' | 'gate' | 'transition' | 'version';
  field?: string;
  message: string;
  details?: Record<string, any>;
}

// Workflow Gate Interface
export interface WorkflowGate {
  name: string;
  check(context: ValidationContext): Promise<ValidationResult>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// Assignment Request
export interface AssignmentRequest {
  referralId: string;
  userId?: string;
  role?: UserRole;
  reason: string;
}

// Event Outbox Entry
export interface EventOutboxEntry {
  eventId: string;
  eventType: string;
  aggregateId: string;
  payload: any;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  retryCount: number;
  createdAt: Date;
  lastAttemptAt?: Date;
}
```

### Service Method Signatures

```typescript
// WorkflowService
export class WorkflowService {
  /**
   * Validates and executes a stage transition with full transaction support
   */
  async executeTransition(
    referralId: string,
    request: TransitionRequestDto,
    user: AuthTokenPayload
  ): Promise<TransitionResult>;

  /**
   * Validates a transition without executing it
   */
  async validateTransition(
    context: ValidationContext
  ): Promise<ValidationResult>;

  /**
   * Updates work status with validation
   */
  async updateWorkStatus(
    referralId: string,
    workStatus: WorkStatus,
    reason: string,
    user: AuthTokenPayload,
    version: number
  ): Promise<Referral>;

  /**
   * Assigns referral to user or role queue
   */
  async assignReferral(
    assignment: AssignmentRequest,
    user: AuthTokenPayload
  ): Promise<Referral>;

  /**
   * Queries workflow transition history
   */
  async getWorkflowHistory(
    referralId: string,
    user: AuthTokenPayload
  ): Promise<WorkflowTransition[]>;
}

// ValidationService
export class ValidationService {
  /**
   * Checks user authorization for transition action
   */
  async checkAuthorization(
    user: AuthTokenPayload,
    action: string,
    referral: Referral
  ): Promise<boolean>;

  /**
   * Validates user scope access to referral
   */
  async checkScope(
    user: AuthTokenPayload,
    referral: Referral
  ): Promise<boolean>;

  /**
   * Validates transition is allowed per ALLOWED_TRANSITIONS
   */
  validateTransitionPath(
    fromStage: PipelineStage,
    toStage: PipelineStage
  ): boolean;

  /**
   * Validates version for optimistic concurrency
   */
  validateVersion(
    referral: Referral,
    requestedVersion: number
  ): ValidationResult;
}

// GatewayCheckService
export class GatewayCheckService {
  /**
   * Checks all gates for a specific transition
   */
  async checkGatesForTransition(
    context: ValidationContext
  ): Promise<ValidationResult>;

  /**
   * Validates required fields for current stage
   */
  async checkRequiredFields(
    referral: Referral,
    stage: PipelineStage
  ): Promise<ValidationResult>;

  /**
   * Validates related records exist with proper state
   */
  async checkRelatedRecords(
    context: ValidationContext
  ): Promise<ValidationResult>;
}

// EventService
export class EventService {
  /**
   * Writes event to outbox within transaction
   */
  async enqueueEvent(
    eventType: string,
    aggregateId: string,
    payload: any,
    tx: PrismaTransaction
  ): Promise<void>;

  /**
   * Background processor: publishes pending events
   */
  async processOutbox(): Promise<void>;

  /**
   * Retries failed events with exponential backoff
   */
  async retryFailedEvents(): Promise<void>;
}

// AssignmentService
export class AssignmentService {
  /**
   * Assigns referral to specific user
   */
  async assignToUser(
    referralId: string,
    userId: string,
    reason: string,
    assignedBy: string
  ): Promise<void>;

  /**
   * Assigns referral to role queue (clears assignedTo)
   */
  async assignToRoleQueue(
    referralId: string,
    role: UserRole,
    reason: string
  ): Promise<void>;

  /**
   * Determines appropriate assignment on stage transition
   */
  async determineAssignment(
    referral: Referral,
    newStage: PipelineStage,
    metadata?: Record<string, any>
  ): Promise<{ role: UserRole; userId?: string }>;
}
```

## Data Models

### New Database Tables

**EventOutbox Table** (for transactional outbox pattern):

```prisma
model EventOutbox {
  id            String   @id @default(uuid())
  eventId       String   @unique @map("event_id")
  eventType     String   @map("event_type")
  aggregateId   String   @map("aggregate_id")
  payload       Json
  status        EventOutboxStatus @default(PENDING)
  retryCount    Int      @default(0) @map("retry_count")
  lastAttemptAt DateTime? @map("last_attempt_at")
  createdAt     DateTime @default(now()) @map("created_at")
  publishedAt   DateTime? @map("published_at")

  @@index([status, createdAt])
  @@index([aggregateId])
  @@map("event_outbox")
}

enum EventOutboxStatus {
  PENDING
  PUBLISHED
  FAILED
  @@map("event_outbox_status")
}
```

**IdempotencyKey Table** (for duplicate request handling):

```prisma
model IdempotencyKey {
  id              String   @id @default(uuid())
  key             String   @unique
  requestHash     String   @map("request_hash")
  responseStatus  Int      @map("response_status")
  responseBody    Json     @map("response_body")
  expiresAt       DateTime @map("expires_at")
  createdAt       DateTime @default(now()) @map("created_at")

  @@index([key])
  @@index([expiresAt])
  @@map("idempotency_keys")
}
```

### Required Indexes

Add to existing Referral table:
```prisma
@@index([pipelineStage, workStatus, assignedTo])
@@index([version])
@@index([caseOutcome])
@@index([billingStatus])
@@index([site, state, legalEntity])
```

Add to existing WorkflowTransition table:
```prisma
@@index([referralId, transitionedAt])
@@index([toStage, transitionedAt])
```

### Migration Strategy

1. **Phase 1**: Add EventOutbox and IdempotencyKey tables
2. **Phase 2**: Add indexes to Referral and WorkflowTransition
3. **Phase 3**: Deploy new service code with feature flag OFF
4. **Phase 4**: Enable feature flag for selected test sites
5. **Phase 5**: Monitor for 48 hours, rollout to all sites
6. **Phase 6**: Remove old transition logic after 30 day observation period

## API Design

### REST Endpoints

```typescript
// Transition a referral to a new stage
POST /api/referrals/:id/transitions
Authorization: Bearer <JWT>
Content-Type: application/json
Idempotency-Key: <optional-uuid>

Request Body:
{
  "targetStage": "CLINICAL_REVIEW",
  "reason": "Intake verification complete",
  "version": 5,
  "metadata": {}
}

Response 200 OK:
{
  "success": true,
  "data": {
    "referral": { /* full referral object */ },
    "transition": { /* workflow transition record */ }
  }
}

Response 400 Bad Request (validation failure):
{
  "success": false,
  "errors": [
    {
      "type": "gate",
      "message": "Coverage verification is required before clinical review",
      "details": { "field": "coverageVerified" }
    }
  ]
}

Response 403 Forbidden (authorization failure):
{
  "success": false,
  "message": "User lacks permission: referrals.transition.to_clinical_review"
}

Response 409 Conflict (version mismatch):
{
  "success": false,
  "message": "Version conflict detected",
  "data": {
    "requestedVersion": 5,
    "currentVersion": 7,
    "currentState": { /* current referral */ }
  }
}

// Update work status
PATCH /api/referrals/:id/work-status
Authorization: Bearer <JWT>

Request Body:
{
  "workStatus": "BLOCKED_NEEDS_INFO",
  "reason": "Waiting for updated insurance card from patient",
  "version": 5
}

Response 200 OK:
{
  "success": true,
  "data": { /* updated referral */ }
}

// Assign referral
POST /api/referrals/:id/assignments
Authorization: Bearer <JWT>

Request Body:
{
  "userId": "user-uuid",  // optional, omit for role queue assignment
  "role": "CLINICAL_REVIEWER",  // required for role queue
  "reason": "Reassigning due to reviewer unavailability"
}

Response 200 OK:
{
  "success": true,
  "data": { /* updated referral */ }
}

// Get workflow history
GET /api/referrals/:id/workflow-history
Authorization: Bearer <JWT>

Response 200 OK:
{
  "success": true,
  "data": [
    {
      "id": "transition-uuid",
      "fromStage": "INTAKE",
      "toStage": "CLINICAL_REVIEW",
      "fromStatus": "COMPLETED",
      "toStatus": "PENDING",
      "transitionedBy": "user-uuid",
      "transitionedAt": "2024-01-15T14:30:00Z",
      "reason": "Intake complete",
      "metadata": {}
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 8,
    "totalPages": 1
  }
}
```

### Error Response Format

All error responses follow this structure:

```typescript
interface ErrorResponse {
  success: false;
  message?: string;  // Human-readable summary
  errors?: ValidationError[];  // Detailed validation errors
  data?: any;  // Additional context (e.g., current state for version conflicts)
}
```

## Authorization Model

### Permission Structure

Permissions follow hierarchical dot notation:
- `referrals.view.{stage}` - View referrals in specific stage
- `referrals.transition.to_{stage}` - Transition referral to specific stage
- `referrals.transition.return_to_{stage}` - Return referral to previous stage
- `referrals.review.{action}` - Clinical review actions (accept, reject, return)
- `notes.review` - Review clinical notes
- `notes.approve` - Approve clinical notes

### Authorization Flow

```
1. Extract JWT from Authorization header
2. Validate token and extract AuthTokenPayload
3. Check action permission:
   a. Look up user's roles from JWT
   b. Map roles to permissions via ROLE_PERMISSIONS constant
   c. Check if required permission exists in user's permission set
   d. Cache result in Redis (5 min TTL)
4. Check scope access:
   a. Extract scopes (sites, states, legalEntities) from JWT
   b. Check if referral's site/state/legalEntity match user scopes
   c. ADMIN role bypasses scope checks
5. If both checks pass, allow operation
6. If either fails, return 403 Forbidden with specific reason
```

### Scope Validation Logic

```typescript
function validateScope(user: AuthTokenPayload, referral: Referral): boolean {
  // Admin bypasses scope checks
  if (user.roles.includes(UserRole.ADMIN)) {
    return true;
  }

  // Check site scope
  if (referral.site && !user.scopes.sites.includes(referral.site)) {
    return false;
  }

  // Check state scope
  if (referral.state && !user.scopes.states.includes(referral.state)) {
    return false;
  }

  // Check legal entity scope
  if (referral.legalEntity && 
      !user.scopes.legalEntities.includes(referral.legalEntity)) {
    return false;
  }

  return true;
}
```

## Data Flow

### Transition Execution Flow

```
1. Request arrives at ReferralsController.transition()
2. JwtAuthGuard validates JWT and extracts user
3. Controller validates DTO and extracts idempotency key
4. If idempotency key exists:
   a. Check Redis for cached response
   b. If found and not expired, return cached response
5. Call WorkflowService.executeTransition()
6. WorkflowService begins validation:
   a. Fetch referral with current version
   b. ValidationService.checkAuthorization()
   c. ValidationService.checkScope()
   d. ValidationService.validateTransitionPath()
   e. ValidationService.validateVersion()
   f. GatewayCheckService.checkGatesForTransition()
7. If validation fails, return structured error (no DB changes)
8. If validation passes, WorkflowService.execute():
   a. Begin Prisma transaction
   b. Lock referral row (SELECT FOR UPDATE)
   c. Re-check version within transaction
   d. Update referral (version++, stages, status, timestamps)
   e. Create WorkflowTransition record
   f. Determine new assignment via AssignmentService
   g. Create or update ReferralAssignment record
   h. EventService.enqueueEvent() writes to EventOutbox
   i. Commit transaction
9. If transaction succeeds:
   a. Invalidate relevant Redis caches
   b. Store idempotency response in Redis (24hr TTL)
   c. Return success with updated referral
10. If transaction fails:
   a. Rollback occurs automatically
   b. Log error details
   c. Return 500 error
```

### Event Emission Flow

**Write Phase** (within transaction):
```
1. EventService.enqueueEvent() called from WorkflowService
2. Generate unique eventId (UUID)
3. INSERT into EventOutbox with status=PENDING
4. Transaction commits or rolls back atomically
```

**Publish Phase** (background processor):
```
1. Scheduled job runs every 10 seconds
2. SELECT from EventOutbox WHERE status=PENDING ORDER BY createdAt LIMIT 100
3. For each event:
   a. Publish to WebSocket gateway
   b. Publish to notification service
   c. Publish to dashboard metrics service
   d. If all succeed: UPDATE status=PUBLISHED, publishedAt=NOW()
   e. If any fail: INCREMENT retryCount, UPDATE lastAttemptAt
   f. If retryCount > 5: UPDATE status=FAILED
4. Failed events trigger alert after 5 retries
5. Admin dashboard shows failed events for manual replay
```

### Cache Invalidation Strategy

**Cache Keys**:
- `user:permissions:{userId}` - User permission set (5 min TTL)
- `dashboard:metrics:{userId}` - Dashboard metrics (1 min TTL)
- `referral:list:{userId}:{filters}` - Referral list queries (30 sec TTL)
- `idempotency:{key}` - Idempotency response (24 hr TTL)

**Invalidation Triggers**:
- On transition success: invalidate `dashboard:metrics:*`, `referral:list:*`
- On assignment change: invalidate user-specific referral lists
- On permission grant/revoke: invalidate `user:permissions:{userId}`
- On work status change: invalidate dashboard metrics

## Error Handling

### Error Types and Codes

```typescript
export enum WorkflowErrorCode {
  // Authorization errors (403)
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  SCOPE_ACCESS_DENIED = 'SCOPE_ACCESS_DENIED',
  
  // Validation errors (400)
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  GATE_VALIDATION_FAILED = 'GATE_VALIDATION_FAILED',
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  INVALID_WORK_STATUS_TRANSITION = 'INVALID_WORK_STATUS_TRANSITION',
  
  // Concurrency errors (409)
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  
  // State errors (422)
  TERMINAL_STATE = 'TERMINAL_STATE',
  PREREQUISITE_INVALID = 'PREREQUISITE_INVALID',
  
  // System errors (500)
  DATABASE_ERROR = 'DATABASE_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
}
```

### Error Response Examples

**Gate Validation Failure**:
```json
{
  "success": false,
  "code": "GATE_VALIDATION_FAILED",
  "message": "Cannot transition to CLINICAL_REVIEW",
  "errors": [
    {
      "type": "gate",
      "field": "coverageVerified",
      "message": "Coverage verification is required before clinical review"
    },
    {
      "type": "gate",
      "field": "referralSource",
      "message": "Referral source must be specified"
    }
  ]
}
```

**Version Conflict**:
```json
{
  "success": false,
  "code": "VERSION_CONFLICT",
  "message": "Referral was modified by another user",
  "data": {
    "requestedVersion": 5,
    "currentVersion": 7,
    "currentState": {
      "id": "ref-123",
      "pipelineStage": "CLINICAL_REVIEW",
      "workStatus": "PENDING",
      "version": 7
    }
  }
}
```

**Permission Denied**:
```json
{
  "success": false,
  "code": "PERMISSION_DENIED",
  "message": "User lacks required permission",
  "errors": [
    {
      "type": "permission",
      "message": "Required permission: referrals.transition.to_billing",
      "details": {
        "userRoles": ["CLINICAL_REVIEWER"],
        "requiredPermission": "referrals.transition.to_billing"
      }
    }
  ]
}
```

### Error Recovery Strategies

**Transient Failures** (database connection, network timeout):
- Automatic retry with exponential backoff (3 attempts)
- Transaction rollback ensures consistent state
- Client receives 500 error and can retry

**Version Conflicts**:
- Client receives current state in error response
- Client refreshes local state
- User reviews changes and resubmits if desired
- No automatic retry (requires user decision)

**Validation Failures**:
- Client receives detailed error list
- UI displays specific field errors
- User corrects issues and resubmits
- No retry needed

**Event Publishing Failures**:
- Outbox processor retries with exponential backoff
- After 5 failures, event marked FAILED
- Admin dashboard alerts on failed events
- Manual replay capability for failed events

## Testing Strategy

### Unit Testing Approach

**WorkflowService Tests**:
- Mock PrismaService, ValidationService, GatewayCheckService, EventService
- Test executeTransition() with valid inputs returns success
- Test executeTransition() with invalid version throws version conflict
- Test executeTransition() with validation failure returns structured errors
- Test transaction rollback on database errors
- Test idempotency key handling

**ValidationService Tests**:
- Test checkAuthorization() with various role/permission combinations
- Test checkScope() with matching and non-matching scopes
- Test validateTransitionPath() with allowed and forbidden transitions
- Test validateVersion() with matching and mismatched versions

**GatewayCheckService Tests**:
- Test each gate implementation individually
- Test IntakeComplete gate with missing required fields
- Test ClinicalAccept gate without ClinicalReview record
- Test AppointmentConfirmed gate without confirmed appointment
- Test composite gate failures

**EventService Tests**:
- Test enqueueEvent() writes to outbox within transaction
- Test processOutbox() publishes events and updates status
- Test retry logic with exponential backoff
- Test dead letter handling after max retries

### Integration Testing Scenarios

**Happy Path Transition**:
1. Create referral in INTAKE stage
2. Complete intake requirements (add patient, insurance, coverage verification)
3. POST transition to CLINICAL_REVIEW with valid version
4. Verify referral updated to CLINICAL_REVIEW, version incremented
5. Verify WorkflowTransition record created
6. Verify EventOutbox entry created with status PENDING
7. Run outbox processor
8. Verify event published and status updated to PUBLISHED

**Version Conflict Scenario**:
1. Two clients fetch same referral (version 1)
2. Client A transitions to CLINICAL_REVIEW (version becomes 2)
3. Client B attempts transition with version 1
4. Verify Client B receives 409 Conflict
5. Verify referral unchanged at version 2
6. Client B refetches and retries successfully

**Authorization Failure**:
1. Create referral in INTAKE
2. Authenticate as BILLING_COORDINATOR (wrong role)
3. Attempt transition to CLINICAL_REVIEW
4. Verify 403 Forbidden response
5. Verify referral unchanged

**Gate Validation Failure**:
1. Create referral in INTAKE with missing coverageVerified
2. Attempt transition to CLINICAL_REVIEW
3. Verify 400 Bad Request with specific gate errors
4. Update coverageVerified = true
5. Retry transition successfully

**Backward Transition**:
1. Create referral in CLINICAL_REVIEW
2. Clinical reviewer returns to INTAKE with reason
3. Verify referral back in INTAKE with workStatus BLOCKED_NEEDS_INFO
4. Verify WorkflowTransition records both forward and backward transitions
5. Verify assignment updated to INTAKE_SPECIALIST

**No-Show Flow**:
1. Create referral in NP_VISIT with scheduled appointment
2. Create Encounter with outcome NO_SHOW
3. System transitions back to SCHEDULING automatically
4. Verify referral in SCHEDULING with PENDING status
5. Verify original Encounter preserved

### End-to-End Test Cases

**Complete Referral Lifecycle**:
1. Create patient and referral
2. Upload required documents
3. Complete intake verification
4. Transition to CLINICAL_REVIEW
5. Clinical reviewer accepts
6. Transition to SCHEDULING
7. Schedule and confirm appointment
8. Transition to NP_VISIT
9. Create encounter and clinical note
10. Submit clinical note
11. Transition to NOTES_QA
12. QA reviewer approves (billing status → READY)
13. Billing coordinator transitions to BILLING
14. Submit claim
15. Mark claim as PAID (case outcome → CLOSED)
16. Verify complete audit trail in WorkflowTransition table
17. Verify all events published successfully

**Concurrent Transition Handling**:
1. Create referral in INTAKE
2. Spawn 10 concurrent transition requests
3. Verify only 1 succeeds
4. Verify other 9 receive 409 Conflict
5. Verify database consistency (single transition record)
6. Verify version incremented once

**Event Delivery Guarantee**:
1. Transition referral with outbox
2. Simulate event publishing failure
3. Verify event remains in PENDING state
4. Retry outbox processor
5. Verify event eventually publishes
6. Verify no duplicate events published

**Idempotency Testing**:
1. Transition referral with idempotency key
2. Simulate network timeout (client doesn't receive response)
3. Client retries with same idempotency key
4. Verify cached response returned
5. Verify no duplicate transition occurred
6. Verify single WorkflowTransition record

**Cache Invalidation**:
1. User A loads dashboard (metrics cached)
2. User B transitions referral
3. User A refreshes dashboard
4. Verify User A sees updated metrics (cache invalidated)

### Performance Testing

**Concurrency Test**: 100 concurrent users each transitioning different referrals
- Target: 95th percentile < 500ms
- Verify: No deadlocks, version conflicts handled correctly

**Load Test**: 1000 transitions per minute sustained for 10 minutes
- Target: Success rate > 99%
- Verify: Database connection pool stable, no memory leaks

**Outbox Processing**: 10,000 pending events
- Target: Process within 5 minutes
- Verify: Events published in order, no duplicates

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Authorization Enforcement

*For any* referral transition request and user credential pair, the workflow engine SHALL allow the transition only when the user has both the required action permission AND scope access to the referral's location attributes (site, state, legal entity)

**Validates: Requirements 1.1, 1.2, 14.1-14.5**

### Property 2: Transition Validation

*For any* referral and target stage, the workflow engine SHALL allow the transition only when (a) the transition path exists in ALLOWED_TRANSITIONS for the current stage, (b) all required fields for the current stage are present per REQUIRED_FIELDS_PER_STAGE, and (c) all stage-specific gateway conditions are satisfied

**Validates: Requirements 1.3, 1.4, 2.2, 2.3**

### Property 3: Transaction Safety

*For any* transition execution, the workflow engine SHALL either (a) commit all state changes atomically (version increment, stage update, status update, audit record, event outbox entry) when validation succeeds, or (b) leave the referral in its original state with no partial updates when validation fails or database errors occur

**Validates: Requirements 1.5, 1.6, 1.9, 13.3**

### Property 4: Version Conflict Detection

*For any* transition request with version N on a referral currently at version M where N ≠ M, the workflow engine SHALL reject the request with 409 Conflict status, return the current referral state, and leave the referral unmodified

**Validates: Requirements 1.7, 8.1-8.7**

### Property 5: Audit Completeness

*For any* successful state change (stage transition, work status change, assignment change, case outcome change), the workflow engine SHALL create an immutable audit record containing fromState, toState, timestamp, acting user, and reason where applicable

**Validates: Requirements 1.8, 12.1-12.8**

### Property 6: Event Emission

*For any* successful stage transition, the workflow engine SHALL write event records to the EventOutbox table within the same database transaction, ensuring events are published exactly once after transaction commit

**Validates: Requirements 1.10, 17.1-17.9**

### Property 7: Assignment Routing

*For any* stage transition, the workflow engine SHALL assign the referral to the appropriate role queue based on STAGE_OWNERS configuration for the target stage, or to a specific user when metadata indicates a return-to-originator scenario

**Validates: Requirements 2.5, 9.1-9.9**

### Property 8: Work Status Transitions

*For any* work status change request, the workflow engine SHALL allow the transition only when it follows valid work status transition rules (PENDING→{IN_PROGRESS, BLOCKED_NEEDS_INFO, ON_HOLD}, etc.) and required context (reason, review date) is provided for status types that require it

**Validates: Requirements 2.7, 2.8, 10.3-10.10**

### Property 9: Terminal State Enforcement

*For any* referral with caseOutcome set to a terminal state (REJECTED, PATIENT_DECLINED, DUPLICATE, DISCHARGED, CLOSED), the workflow engine SHALL block all forward stage transitions while preserving complete audit history

**Validates: Requirements 3.5, 11.1-11.8**

### Property 10: Idempotency

*For any* transition request with an idempotency key that was previously processed successfully, the workflow engine SHALL return the cached response without executing the transition again or creating duplicate audit records

**Validates: Requirements 15.1-15.10**

### Property 11: Dependency Validation

*For any* deletion request on entities with dependent records (Patient with active Referrals, Referral with submitted Claims, Document referenced in approved reviews), the workflow engine SHALL reject the deletion and return structured errors listing the specific dependent records

**Validates: Requirements 19.1-19.20**

---

**Prework Analysis**: The following analysis was performed to derive the above properties from the acceptance criteria.

### Acceptance Criteria Testing Prework

#### Requirement 1: Stage Transition Validation and Execution

**1.1 Authorization check for transition action permission**
  Thoughts: This tests that authorization checks occur for all transitions. We can generate random referrals, random users with varying permission sets, and random target stages, then verify that transitions are only allowed when the user has the specific action permission. This is a universal property about authorization.
  Classification: PROPERTY
  Test Strategy: Generate random user permission sets and transition requests, verify authorization check occurs correctly for all combinations

**1.2 Scope access verification for referral's location attributes**
  Thoughts: This is about verifying scope matching works universally across all referrals and users. We can generate referrals with various site/state/legalEntity combinations and users with various scope configurations, then verify access is correctly granted or denied.
  Classification: PROPERTY
  Test Strategy: Generate random referral locations and user scopes, verify scope validation behaves correctly across all combinations

**1.3 Forward transition validation against ALLOWED_TRANSITIONS**
  Thoughts: This tests that transition path validation works for all possible stage combinations. We can generate all possible (fromStage, toStage) pairs and verify only allowed transitions succeed.
  Classification: PROPERTY
  Test Strategy: Enumerate all stage combinations, verify ALLOWED_TRANSITIONS rules enforced universally

**1.4 Required fields validation per REQUIRED_FIELDS_PER_STAGE**
  Thoughts: This tests that required field checking works for all stages and field combinations. We can generate referrals with random field presence/absence patterns and verify validation behaves correctly.
  Classification: PROPERTY
  Test Strategy: Generate referrals with various field completeness patterns, verify required field validation for each stage

**1.5 Atomic transaction updates on validation success**
  Thoughts: This tests transaction atomicity - that all updates happen together or none happen. This is a universal property about database transactions.
  Classification: PROPERTY
  Test Strategy: Execute transitions and verify version increment, stage update, status update, and transition record are all committed atomically

**1.6 Error return without state modification on validation failure**
  Thoughts: This tests that failed validations don't modify state. This is a universal property about transaction safety.
  Classification: PROPERTY
  Test Strategy: Generate invalid transition requests, verify referral state unchanged after validation failures

**1.7 Version mismatch handling with 409 status**
  Thoughts: This tests optimistic concurrency control works universally. We can generate concurrent update scenarios and verify version conflicts are detected and handled correctly.
  Classification: PROPERTY
  Test Strategy: Simulate concurrent updates with version mismatches, verify conflict detection and proper error responses

**1.8 WorkflowTransition record creation on success**
  Thoughts: This is a record-keeping property that should hold for all successful transitions. We can transition through various paths and verify audit records are always created with complete information.
  Classification: PROPERTY
  Test Strategy: Execute various transition paths, verify WorkflowTransition records created with all required fields

**1.9 Transaction rollback on database errors**
  Thoughts: This tests that database errors trigger rollback. We can simulate database failures and verify state remains consistent.
  Classification: INTEGRATION
  Test Strategy: Inject database failures, verify rollback preserves previous state (1-2 test cases with mock failures)

**1.10 Workflow event emission on successful transitions**
  Thoughts: This tests that events are emitted for all successful transitions. This is a universal property about event publishing.
  Classification: PROPERTY
  Test Strategy: Execute various transitions, verify events enqueued in outbox for all successes

#### Requirement 2: Intake Stage Completion

**2.1 Intake specialist role/permission verification**
  Thoughts: This is a specific instance of the general authorization property (1.1). Testing this specifically adds no unique value beyond the general authorization property.
  Classification: REDUNDANT (covered by 1.1)

**2.2 Required fields verification for INTAKE→CLINICAL_REVIEW**
  Thoughts: This is a specific instance of the general required fields property (1.4). Testing this specifically adds no unique value.
  Classification: REDUNDANT (covered by 1.4)

**2.3 Coverage verification blocking transition when false**
  Thoughts: This is a specific business rule gate. While it's a specific field, it's part of the general required field validation. Testing it separately adds minimal value.
  Classification: EDGE_CASE (include in field validation test generators)

**2.4 Successful transition to CLINICAL_REVIEW**
  Thoughts: This is covered by the general transition execution property (1.5). Testing specific stage transitions individually is redundant.
  Classification: REDUNDANT (covered by 1.5)

**2.5 Assignment to CLINICAL_REVIEWER role queue**
  Thoughts: This tests that assignment logic works correctly on stage transitions. This is a universal property about assignment routing.
  Classification: PROPERTY
  Test Strategy: Generate transitions to various stages, verify assignments routed to correct role queues

**2.6 Validation error listing specific missing fields**
  Thoughts: This tests error message completeness. This is a universal property about error reporting.
  Classification: PROPERTY
  Test Strategy: Generate invalid referrals with various missing fields, verify error messages list all missing fields

**2.7 BLOCKED_NEEDS_INFO requires reason documentation**
  Thoughts: This tests validation rules for work status changes. This is a universal property about work status validation.
  Classification: PROPERTY
  Test Strategy: Generate work status changes with/without reasons, verify validation enforces required reasons

**2.8 ON_HOLD requires reason and next review date**
  Thoughts: Similar to 2.7, this is part of work status validation rules.
  Classification: PROPERTY (same test as 2.7, combined)

**2.9 COMPLETED status without stage transition**
  Thoughts: This tests that work status can change independently from stage. This is a universal property about status independence.
  Classification: PROPERTY
  Test Strategy: Change work status without stage transition, verify stage remains unchanged but status updates

**2.10 Audit record for intake completion includes specialist ID and timestamp**
  Thoughts: This is covered by the general audit record property (1.8). Testing specific field presence is redundant.
  Classification: REDUNDANT (covered by 1.8)

#### Requirement 3: Clinical Review Decision Processing

**3.1 Clinical reviewer role/permission verification**
  Thoughts: Redundant with general authorization property (1.1)
  Classification: REDUNDANT (covered by 1.1)

**3.2 Accept decision creates record and transitions to SCHEDULING**
  Thoughts: This tests clinical review decision flow. This is a universal property about decision processing outcomes.
  Classification: PROPERTY
  Test Strategy: Generate various clinical decisions, verify correct records created and transitions executed

**3.3 Return decision with permission check, record creation, and INTAKE transition**
  Thoughts: Part of the same clinical review decision property as 3.2. Testing return separately is redundant.
  Classification: REDUNDANT (covered by 3.2 - decision property)

**3.4 Reject decision sets terminal outcome and requires reason**
  Thoughts: Part of the same clinical review decision property as 3.2.
  Classification: REDUNDANT (covered by 3.2 - decision property)

**3.5 Rejected referrals prevent forward stage transitions**
  Thoughts: This tests terminal state enforcement. This is a universal property about terminal states blocking transitions.
  Classification: PROPERTY
  Test Strategy: Set referrals to terminal states, attempt transitions, verify all blocked

**3.6 ClinicalReview record verification before SCHEDULING transition**
  Thoughts: This is a specific gate check, covered by general gateway validation property.
  Classification: REDUNDANT (covered by general gateway checking)

**3.7 Return to INTAKE preserves audit history**
  Thoughts: Audit preservation is covered by general audit immutability property (1.8).
  Classification: REDUNDANT (covered by 1.8)

**3.8 Resubmitted referral allows new review decision**
  Thoughts: This tests that prior decisions don't affect new decision cycles. This is a property about decision independence.
  Classification: PROPERTY
  Test Strategy: Execute return cycles (INTAKE→CLINICAL_REVIEW→INTAKE→CLINICAL_REVIEW), verify new decisions allowed

**3.9 Accept blocked with incomplete intake data**
  Thoughts: This is covered by general required field validation and gate checking.
  Classification: REDUNDANT (covered by 1.4 and gateway validation)

**3.10 Audit of all clinical review decisions**
  Thoughts: Covered by general audit property (1.8).
  Classification: REDUNDANT (covered by 1.8)

#### Requirement 4-7: Scheduling, NP Visit, QA, Billing

Following similar analysis, most criteria in these requirements fall into:
- **Redundant**: Covered by general authorization (1.1), required fields (1.4), audit (1.8), or transition execution (1.5) properties
- **Integration**: Testing specific AWS/external service behavior that doesn't vary with input
- **Example**: Specific workflow scenarios better tested with concrete examples

Key additional properties identified:
- **Backward transition reason requirement** (universal property about backward transitions)
- **Related record validation** (universal property about gateway checks for appointments, encounters, notes)
- **Note revision handling** (universal property about versioning clinical notes)

#### Requirements 8-20: Cross-Cutting Concerns

**Optimistic Concurrency (Req 8)**: Already identified as property 1.7

**Assignment Management (Req 9)**: Assignment routing property already identified as 2.5

**Work Status Management (Req 10)**: Work status transition validation already identified as 2.7/2.8

**Terminal States (Req 11)**: Terminal state blocking property already identified as 3.5

**Audit Trail (Req 12)**: Audit completeness property already identified as 1.8

**Error Handling (Req 13)**: Error structure and safety properties are appropriate for PBT

**Authorization (Req 14)**: Authorization property already identified as 1.1, scope property as 1.2

**Idempotency (Req 15)**: Idempotency is appropriate for PBT - duplicate requests should have no additional effect

**Performance (Req 16)**: Performance testing is NOT appropriate for PBT. Use load testing tools instead.
  Classification: NOT APPLICABLE TO PBT

**Integration Points (Req 17)**: Event outbox mechanics are infrastructure, not logic to test with PBT
  Classification: INTEGRATION

**Validation Configuration (Req 18)**: Configuration loading is setup, not runtime logic
  Classification: SMOKE

**Entity Lifecycle (Req 19)**: Dependency checking and cascading are appropriate for PBT

**Prerequisite Validation (Req 20)**: State repair is appropriate for PBT

#### Property Reflection and Consolidation

After analyzing all requirements, I identified these potential properties:

1. Authorization checks enforce action permissions (1.1)
2. Scope validation enforces location-based access (1.2)
3. Transition path validation enforces ALLOWED_TRANSITIONS (1.3)
4. Required field validation enforces REQUIRED_FIELDS_PER_STAGE (1.4)
5. Transaction atomicity on validation success (1.5)
6. State preservation on validation failure (1.6)
7. Version conflict detection (1.7)
8. Audit record creation (1.8)
9. Event emission (1.10)
10. Assignment routing (2.5)
11. Error completeness (2.6)
12. Work status validation (2.7, 2.8)
13. Status-stage independence (2.9)
14. Clinical review decision processing (3.2)
15. Terminal state blocking (3.5)
16. Decision cycle independence (3.8)
17. Backward transition requirements (general)
18. Related record validation (general)
19. Idempotency enforcement (Req 15)
20. Dependency validation (Req 19)
21. Prerequisite validation (Req 20)

**Redundancy elimination**:
- Properties 1-9: Core workflow engine properties, all unique
- Property 10 (assignment): Can be tested as part of transition execution (1.5), but assignment logic is complex enough to warrant separate property
- Property 11 (error completeness): Can be tested as part of validation failures (1.6), but error structure is important for API contract
- Properties 12-13 (work status): Unique validation logic for status transitions
- Property 14 (clinical decisions): This is application logic on top of transitions, but tests specific decision type enum handling - can be covered by gateway validation
- Property 15 (terminal states): Unique logic about outcome-based blocking
- Property 16 (decision independence): Covered by general state machine behavior - after return, system treats it as new cycle
- Properties 17-18: Covered by gateway validation (general pattern)
- Property 19: Unique idempotency logic
- Properties 20-21: Covered by gateway validation

**Consolidated properties**:
1. Authorization enforcement (action permissions + scope validation combined)
2. Transition validation (path + required fields + gateway checks combined)
3. Transaction safety (atomicity + state preservation on failure combined)
4. Version conflict detection
5. Audit completeness
6. Event emission
7. Assignment routing
8. Work status transitions
9. Terminal state enforcement
10. Idempotency
11. Dependency validation

## Error Handling

### Error Categories

**Authorization Errors (403)**:
- `PERMISSION_DENIED`: User lacks required action permission
- `SCOPE_ACCESS_DENIED`: User scope doesn't match referral location
- Logged as audit events for security monitoring

**Validation Errors (400)**:
- `INVALID_TRANSITION`: Requested transition not in ALLOWED_TRANSITIONS
- `GATE_VALIDATION_FAILED`: Stage-specific gateway requirements not met
- `REQUIRED_FIELD_MISSING`: Required fields per stage are absent
- `INVALID_WORK_STATUS_TRANSITION`: Work status change violates transition rules
- `MISSING_REQUIRED_CONTEXT`: Reason or other required context missing
- Return structured error arrays with field-level details

**Concurrency Errors (409)**:
- `VERSION_CONFLICT`: Version mismatch detected
- Include current state in response for client refresh
- Client should refresh and let user decide whether to retry

**State Errors (422)**:
- `TERMINAL_STATE`: Referral in terminal outcome, forward transitions blocked
- `PREREQUISITE_INVALID`: Required upstream conditions no longer valid
- `DEPENDENCY_EXISTS`: Deletion blocked by dependent records
- Indicate business logic violations requiring user intervention

**System Errors (500)**:
- `DATABASE_ERROR`: Database connection or query failures
- `TRANSACTION_FAILED`: Transaction rollback occurred
- Log full context for debugging, return safe message to client
- Automatic retry with exponential backoff where appropriate

### Error Handling Patterns

**Transaction Rollback Pattern**:
```typescript
try {
  const result = await this.prisma.$transaction(async (tx) => {
    // All state modifications here
    const referral = await tx.referral.update({ ... });
    await tx.workflowTransition.create({ ... });
    await tx.eventOutbox.create({ ... });
    return referral;
  });
  return { success: true, data: result };
} catch (error) {
  // Transaction automatically rolled back
  this.logger.error('Transaction failed', { error, referralId });
  throw new DatabaseException('Transaction failed', error);
}
```

**Validation Error Accumulation**:
```typescript
const errors: ValidationError[] = [];

if (!this.hasPermission(user, action)) {
  errors.push({
    type: 'permission',
    message: `Required permission: ${action}`,
    details: { userRoles: user.roles, requiredPermission: action }
  });
}

if (!this.hasScope(user, referral)) {
  errors.push({
    type: 'scope',
    message: 'User scope does not match referral location',
    details: { userScope: user.scopes, referralLocation: { ... } }
  });
}

if (errors.length > 0) {
  throw new ValidationException(errors);
}
```

**Idempotency Key Handling**:
```typescript
if (idempotencyKey) {
  const cached = await this.redis.get(`idempotency:${idempotencyKey}`);
  if (cached) {
    return JSON.parse(cached);  // Return cached response
  }
}

// Execute operation
const result = await this.executeTransition(...);

if (idempotencyKey) {
  await this.redis.setex(
    `idempotency:${idempotencyKey}`,
    86400,  // 24 hour TTL
    JSON.stringify(result)
  );
}

return result;
```

## Testing Strategy

The testing strategy uses a dual approach: property-based testing for universal correctness properties and example-based testing for specific workflows and integration points.

### Unit Testing with Property-Based Tests

Use **fast-check** library for TypeScript property-based testing.

**Installation**:
```bash
npm install --save-dev fast-check
```

**Property Test Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature and property reference
- Tests organized by service (WorkflowService, ValidationService, etc.)

**Example Property Test Structure**:
```typescript
import * as fc from 'fast-check';

describe('WorkflowService Properties', () => {
  describe('Property 1: Authorization Enforcement', () => {
    it('should only allow transitions when user has both permission and scope', async () => {
      /**
       * Feature: referrals-workflow-engine
       * Property 1: For any referral transition request and user credential pair,
       * the workflow engine SHALL allow the transition only when the user has both
       * the required action permission AND scope access to the referral's location.
       */
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            referral: arbitraryReferral(),
            user: arbitraryUser(),
            targetStage: fc.constantFrom(...Object.values(PipelineStage)),
          }),
          async ({ referral, user, targetStage }) => {
            const hasPermission = checkPermission(user, targetStage);
            const hasScope = checkScope(user, referral);
            
            const result = await workflowService.validateTransition({
              referral,
              targetStage,
              user,
            });
            
            if (hasPermission && hasScope) {
              // Should pass authorization checks (might fail on other validations)
              expect(result.errors.filter(e => 
                e.type === 'permission' || e.type === 'scope'
              )).toHaveLength(0);
            } else {
              // Should fail authorization
              expect(result.errors.some(e => 
                e.type === 'permission' || e.type === 'scope'
              )).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Property 3: Transaction Safety', () => {
    it('should commit all changes atomically or leave state unchanged', async () => {
      /**
       * Feature: referrals-workflow-engine
       * Property 3: For any transition execution, the workflow engine SHALL either
       * commit all state changes atomically or leave the referral in its original state.
       */
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            referral: arbitraryReferral(),
            request: arbitraryTransitionRequest(),
            shouldFail: fc.boolean(),
          }),
          async ({ referral, request, shouldFail }) => {
            const originalVersion = referral.version;
            const originalStage = referral.pipelineStage;
            
            // Mock database to fail if shouldFail is true
            if (shouldFail) {
              mockPrisma.toThrowOnCommit();
            }
            
            try {
              await workflowService.executeTransition(
                referral.id,
                request,
                mockUser
              );
              
              // Success case: verify all changes committed
              const updated = await prisma.referral.findUnique({
                where: { id: referral.id }
              });
              expect(updated.version).toBe(originalVersion + 1);
              expect(updated.pipelineStage).toBe(request.targetStage);
              
              // Verify audit record created
              const transitions = await prisma.workflowTransition.findMany({
                where: { referralId: referral.id }
              });
              expect(transitions).toHaveLength(1);
              
              // Verify event in outbox
              const events = await prisma.eventOutbox.findMany({
                where: { aggregateId: referral.id }
              });
              expect(events).toHaveLength(1);
              
            } catch (error) {
              // Failure case: verify no changes
              const unchanged = await prisma.referral.findUnique({
                where: { id: referral.id }
              });
              expect(unchanged.version).toBe(originalVersion);
              expect(unchanged.pipelineStage).toBe(originalStage);
              
              // Verify no audit record
              const transitions = await prisma.workflowTransition.findMany({
                where: { referralId: referral.id }
              });
              expect(transitions).toHaveLength(0);
              
              // Verify no event
              const events = await prisma.eventOutbox.findMany({
                where: { aggregateId: referral.id }
              });
              expect(events).toHaveLength(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Property 10: Idempotency', () => {
    it('should return cached response for duplicate requests with same idempotency key', async () => {
      /**
       * Feature: referrals-workflow-engine
       * Property 10: For any transition request with an idempotency key that was
       * previously processed successfully, the workflow engine SHALL return the
       * cached response without executing the transition again.
       */
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            referral: arbitraryReferral(),
            request: arbitraryTransitionRequest(),
            idempotencyKey: fc.uuid(),
          }),
          async ({ referral, request, idempotencyKey }) => {
            // First request
            const result1 = await workflowService.executeTransition(
              referral.id,
              { ...request, idempotencyKey },
              mockUser
            );
            
            const versionAfterFirst = result1.referral.version;
            
            // Duplicate request with same key
            const result2 = await workflowService.executeTransition(
              referral.id,
              { ...request, idempotencyKey },
              mockUser
            );
            
            // Should return same result
            expect(result2).toEqual(result1);
            
            // Version should not increment again
            const finalReferral = await prisma.referral.findUnique({
              where: { id: referral.id }
            });
            expect(finalReferral.version).toBe(versionAfterFirst);
            
            // Should only have one audit record
            const transitions = await prisma.workflowTransition.findMany({
              where: { referralId: referral.id }
            });
            expect(transitions).toHaveLength(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
```

**Custom Arbitraries for Test Data Generation**:
```typescript
function arbitraryReferral(): fc.Arbitrary<Referral> {
  return fc.record({
    id: fc.uuid(),
    patientId: fc.uuid(),
    pipelineStage: fc.constantFrom(...Object.values(PipelineStage)),
    workStatus: fc.constantFrom(...Object.values(WorkStatus)),
    caseOutcome: fc.constantFrom(...Object.values(CaseOutcome)),
    billingStatus: fc.constantFrom(...Object.values(BillingStatus)),
    priority: fc.constantFrom(...Object.values(Priority)),
    site: fc.option(fc.constantFrom('site-a', 'site-b', 'site-c')),
    state: fc.option(fc.constantFrom('CA', 'NY', 'TX')),
    legalEntity: fc.option(fc.constantFrom('entity-1', 'entity-2')),
    version: fc.integer({ min: 1, max: 100 }),
    coverageVerified: fc.boolean(),
    // ... other fields
  });
}

function arbitraryUser(): fc.Arbitrary<AuthTokenPayload> {
  return fc.record({
    userId: fc.uuid(),
    email: fc.emailAddress(),
    roles: fc.array(
      fc.constantFrom(...Object.values(UserRole)),
      { minLength: 1, maxLength: 3 }
    ),
    scopes: fc.record({
      sites: fc.array(fc.constantFrom('site-a', 'site-b', 'site-c')),
      states: fc.array(fc.constantFrom('CA', 'NY', 'TX')),
      legalEntities: fc.array(fc.constantFrom('entity-1', 'entity-2')),
    }),
    sessionId: fc.uuid(),
    iat: fc.integer(),
    exp: fc.integer(),
  });
}
```

### Unit Testing with Example-Based Tests

**Use cases for example-based tests**:
- Specific workflow scenarios (complete referral lifecycle)
- Edge cases (empty fields, null values, boundary conditions)
- Error message formatting
- Integration with mocked dependencies

**Example Test Structure**:
```typescript
describe('WorkflowService', () => {
  describe('executeTransition', () => {
    it('should transition from INTAKE to CLINICAL_REVIEW with valid data', async () => {
      const referral = createTestReferral({
        pipelineStage: PipelineStage.INTAKE,
        coverageVerified: true,
        patientId: 'patient-1',
        referralSource: 'Provider X',
        insurancePayer: 'Insurance Y',
        site: 'site-a',
        state: 'CA',
      });
      
      const user = createTestUser({
        roles: [UserRole.INTAKE_SPECIALIST],
        scopes: { sites: ['site-a'], states: ['CA'], legalEntities: [] }
      });
      
      const result = await workflowService.executeTransition(
        referral.id,
        {
          targetStage: PipelineStage.CLINICAL_REVIEW,
          reason: 'Intake complete',
          version: referral.version,
        },
        user
      );
      
      expect(result.success).toBe(true);
      expect(result.referral.pipelineStage).toBe(PipelineStage.CLINICAL_REVIEW);
      expect(result.referral.workStatus).toBe(WorkStatus.PENDING);
      expect(result.referral.version).toBe(referral.version + 1);
      expect(result.transition.fromStage).toBe(PipelineStage.INTAKE);
      expect(result.transition.toStage).toBe(PipelineStage.CLINICAL_REVIEW);
    });
    
    it('should reject transition when coverage is not verified', async () => {
      const referral = createTestReferral({
        pipelineStage: PipelineStage.INTAKE,
        coverageVerified: false,  // Invalid
      });
      
      await expect(
        workflowService.executeTransition(
          referral.id,
          { targetStage: PipelineStage.CLINICAL_REVIEW, version: 1 },
          mockUser
        )
      ).rejects.toThrow(ValidationException);
      
      // Verify error details
      try {
        await workflowService.executeTransition(...);
      } catch (error) {
        expect(error.errors).toContainEqual({
          type: 'gate',
          field: 'coverageVerified',
          message: 'Coverage verification is required before clinical review'
        });
      }
    });
  });
});
```

### Integration Testing

**Test database setup**:
- Use Docker PostgreSQL container for tests
- Seed with realistic test data
- Clean database between test suites

**Integration test scenarios**:
1. **Complete workflow**: INTAKE → CLINICAL_REVIEW → SCHEDULING → NP_VISIT → NOTES_QA → BILLING
2. **Backward flow**: CLINICAL_REVIEW → INTAKE (return) → CLINICAL_REVIEW (resubmit)
3. **No-show handling**: NP_VISIT (no-show) → SCHEDULING → NP_VISIT (complete)
4. **Note correction**: NOTES_QA (return) → NP_VISIT (correct) → NOTES_QA (approve)
5. **Concurrent transitions**: Multiple users attempt simultaneous transitions
6. **Event processing**: Verify outbox processor publishes events correctly
7. **Cache invalidation**: Verify Redis caches invalidate on state changes

### End-to-End Testing

**E2E test environment**:
- Full NestJS application running
- Real PostgreSQL database
- Real Redis instance
- Mock external services (if any)

**E2E test cases**:
1. **API contract tests**: Verify REST endpoints match OpenAPI spec
2. **Authorization flows**: Test JWT authentication and RBAC guards
3. **Error responses**: Verify HTTP status codes and error formats
4. **WebSocket events**: Verify real-time notifications emit correctly
5. **Performance**: Measure P95 latency under load
6. **Idempotency**: Test duplicate request handling with network simulation

### Test Coverage Targets

- **Line coverage**: > 80%
- **Branch coverage**: > 75%
- **Property tests**: All 11 properties implemented
- **Integration tests**: All 7 scenarios passing
- **E2E tests**: All 6 test cases passing
- **Performance**: P95 < 500ms for single transitions
