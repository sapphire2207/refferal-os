
## Resume Existing Work, Complete the System, and Verify Every Feature

You are taking over an existing software project previously developed using Kiro. You are now the primary engineering agent responsible for continuing the implementation.

Your mission is to continue from the repository's actual state, complete the existing tasks in order, and deliver reliable, production-oriented software.

Do not restart the project. Do not regenerate all the specifications. Do not blindly trust earlier AI-generated code or completion summaries. Do not waste development time producing repeated planning documents.

**Understand what exists, identify the next incomplete task, implement it correctly, test it, fix any issues, and continue.**

The objective is working software, not an impressive implementation report.

---

# 1. FIRST: LOAD THE ENTIRE PROJECT CONTEXT

Before changing code, inspect these existing specification files:

- `.kiro/specs/referrals-workflow-engine/requirements.md`
- `.kiro/specs/referrals-workflow-engine/design.md`
- `.kiro/specs/referrals-workflow-engine/tasks.md`

Also inspect the original Heals on Wheels `Core_Doc.pdf`, the existing implementation guides, and relevant repository documentation.

Read the complete files, not just their headings or summaries.

Understand:

1. The product requirements and business rules.
2. The architecture and design decisions.
3. The ordered implementation tasks and their dependencies.
4. The six-stage referral workflow.
5. Authentication, permissions, scopes, database relationships, audit requirements, and error handling.
6. Existing backend modules and their actual implementations.
7. The frontend, document-processing service, shared packages, and deployment boundaries.
8. Existing tests, migrations, build scripts, and environment configuration.

Then inspect the actual repository files.

For each task in `tasks.md`, determine whether it is:
- Fully implemented and verified.
- Partially implemented.
- Present only as a stub or placeholder.
- Implemented but defective.
- Not started.
- Blocked by an external dependency or unresolved business decision.

A file existing does not mean its feature is implemented. A function returning a hardcoded response does not count as completion. A test that only mocks all meaningful behavior does not establish integration correctness.

Inspect the existing Git state if available. Preserve existing user work, uncommitted changes, and useful implementations.

## IMPORTANT: RESUME, DO NOT RESTART

Maintain the existing `requirements.md`, `design.md`, and `tasks.md`.

Do not rewrite these documents unless a concrete implementation contradiction requires a minimal correction.

Do not generate additional requirements, redesign the entire architecture, or repeat an exhaustive analysis when the existing specifications provide sufficient direction.

Use the existing task list as the implementation roadmap. Verify completed tasks, then resume from the first incomplete task whose dependencies are satisfied.

If a task has been marked complete without adequate evidence, verify it and fix it as necessary. Do not blindly trust checkboxes.

After establishing the baseline, immediately continue implementation. Do not stop after producing an assessment.

---

# 2. PROJECT ARCHITECTURE — PRESERVE THE DEPLOYMENT BOUNDARIES

The project is Heals on Wheels, a healthcare referral workflow management system.

Inspect and preserve the existing architecture, including:

### Frontend: `apps/web`

- Next.js and TypeScript.
- Tailwind CSS and existing shadcn/ui components where appropriate.
- Role-aware dashboards, forms, tables, queues, and the six-stage Kanban.
- A configurable backend API URL.
- Independent production builds and Vercel deployment.

The frontend must not depend on local backend filesystem paths or expose secrets.

### Backend: `apps/api`

- NestJS and TypeScript.
- Prisma and PostgreSQL.
- Redis where genuinely needed.
- Authentication, authorization, workflow orchestration, domain services, auditing, event publishing, and APIs.

The backend is authoritative for all business rules, state changes, permissions, and data integrity.

### Document processor: `apps/document-processor`

- Python and FastAPI.
- OCR/document text extraction.
- Gemini integration using server-side credentials.
- Structured extraction, confidence reporting, source provenance, retries, and failure handling.

The document processor must be independently installable and deployable.

### Shared packages

Preserve the existing workspace structure, shared TypeScript types, constants, validation schemas, package scripts, and lockfile conventions.

### Deployment target

The Next.js frontend should build independently for Vercel.

The NestJS backend, Python document processor, PostgreSQL, Redis, and object storage must have appropriate independent service or infrastructure configurations.

Do not make Vercel responsible for running arbitrary persistent backend processes.

Do not collapse the frontend, API, and Python processor into one inseparable application.

Verify the actual versions and configurations before modifying dependencies.

---

# 3. PRIMARY OBJECTIVE: COMPLETE THE REFERRAL WORKFLOW ENGINE

The Referral Workflow Engine is the central coordinator of the business process.

Implement the existing specifications covering these six stages:

1. INTAKE
2. CLINICAL_REVIEW
3. SCHEDULING
4. NP_VISIT
5. NOTES_QA
6. BILLING

Preserve the four independent state dimensions:

- `pipelineStage`
- `workStatus`
- `caseOutcome`
- `billingStatus`

Use the exact existing enums and database field names after inspecting the repository.

Implement the workflow engine so that every state-changing operation uses authoritative server-side validation.

The engine must coordinate the appropriate domain services rather than absorbing every feature's business logic into one enormous service.

Responsibilities include:

- Transition validation.
- Action-based authorization and scope validation.
- Stage-specific workflow gates.
- Work-status transitions.
- Case outcomes and terminal-state handling.
- Assignment and reassignment.
- Optimistic concurrency.
- Transactional state changes.
- Immutable workflow history.
- Reliable event publishing.
- Idempotent request handling.
- Prerequisite validation and safe recovery.
- Actionable errors and consistent API contracts.

Follow the existing requirements and design while verifying their consistency against the implementation.

If a specific rule is contradictory, resolve the smallest necessary part and document the decision briefly. Do not use ambiguity as an excuse to redesign unrelated parts of the system.

---

# 4. FORWARD, BACKWARD, AND EXCEPTIONAL WORKFLOWS ARE EQUALLY IMPORTANT

Do not build only the happy path.

Every important operation must have explicit behavior for normal progression, correction, cancellation, failure, retry, and recovery.

Verify the following workflows:

- Intake completion and transition to clinical review.
- Clinical acceptance, return to intake, and rejection.
- Scheduling, appointment confirmation, cancellation, and rescheduling.
- NP visit completion and documentation submission.
- No-show handling and return to scheduling.
- Notes QA approval and return for correction.
- Creation and review of corrected note revisions.
- Billing readiness and explicit progression into billing.
- Claim submission and uncertain external submission outcomes.
- Claim rejection, denial, payment, and applicable follow-up.
- Terminal case outcomes and controlled reopening.
- Assignment changes, staff deactivation, and return-to-originator behavior.

For every workflow, verify that:

1. Only authorized actions are possible.
2. Prerequisites are validated on the server.
3. Required reasons and documentation are collected.
4. The correct stage, work status, outcome, and billing status are persisted.
5. Assignment routing is correct.
6. Related records are preserved.
7. Audit events are written.
8. Required downstream events are durably recorded.
9. Failures do not leave partially updated data.
10. Retries do not duplicate the business operation.

Never implement backward transitions as arbitrary reverse drag-and-drop.

Never treat a database status update as proof that an external operation was actually reversed.

Never allow a submitted claim to be treated as unsent merely because the referral moved backward.

---

# 5. PRIORITIZE DATA INTEGRITY AND ENTITY LIFECYCLES

Inspect the real Prisma relations and existing database constraints.

Implement the entity lifecycle behavior required by the existing specifications, especially Requirements 19 and 20.

Review the relationships among:

- Users, roles, scopes, sessions, and assignments.
- Patients and referrals.
- Referrals and documents.
- Clinical reviews and review cycles.
- Appointments and encounters.
- Clinical notes and immutable revisions.
- Note reviews and approval decisions.
- Billing cases, claims, and claim submission history.
- Tasks, comments, notifications, and audit records.
- Background jobs and extraction results.

For every entity, define or implement safe deletion, archival, deactivation, detachment, replacement, and restoration behavior as appropriate.

Examples that must be handled:

- A patient with multiple active referrals cannot be blindly deleted.
- A referral with a submitted claim cannot lose its claim history.
- A signed or approved note cannot be silently erased or overwritten.
- A document used by an approved clinical workflow cannot be destructively removed without the appropriate policy and authorization.
- A user who becomes inactive must not remain the active assignee for work they can no longer perform.
- Removing a role must not remove historical evidence identifying who made previous decisions.
- A deleted or archived prerequisite must not leave the referral incorrectly marked ready for billing.
- Object-storage deletion failures must be recoverable.
- Failed background jobs must not overwrite newer, verified information.

Use database constraints and deliberate referential behavior rather than relying on accidental cascading deletes.

Preserve audit records, historical clinical decisions, note revisions, and claim evidence. Do not invent retention periods or clinical policies.

Where policy is unknown, use the safest non-destructive behavior and isolate the unresolved decision.

Test these cases against the actual database wherever practical.

---

# 6. ENGINEERING CORRECTNESS: DO NOT INTRODUCE SUBTLE BUGS

Review every implementation for correctness beyond whether the code compiles.

## Concurrency

- Check versions atomically inside the database transaction.
- Prevent stale requests from overwriting newer workflow-critical changes.
- Use row locking or equivalent concurrency control where justified.
- Ensure only one competing transition can succeed against the same version.
- Apply concurrency controls to important field updates, assignments, work statuses, and billing state changes.
- Return useful HTTP 409 responses for genuine conflicts.

Do not assume that checking a version before opening a transaction is sufficient.

## Transactions

State changes, workflow history, assignment changes, and outbox records that belong to one business operation must commit atomically.

A failure halfway through the operation must not produce a partially committed business state.

Keep external network calls outside long-running database transactions where appropriate.

## Idempotency

Handle double-clicks, client retries, request timeouts, server restarts, and simultaneous duplicate requests.

Use durable, atomic idempotency handling where business correctness requires it. Do not assume an ordinary Redis cache lookup followed by a database write is race-safe.

Reusing an idempotency key with different request content must be rejected.

Expired idempotency records must not cause an already executed claim submission or workflow transition to execute a second time.

## Event delivery

Use the existing transactional outbox design when implementing reliable events.

Be accurate about delivery guarantees: an outbox normally supports reliable at-least-once delivery. Consumers must be idempotent and deduplicate using stable event identifiers.

Handle competing publishers, delayed events, retries, dead-letter handling, and replay safely.

Do not claim exactly-once delivery unless the complete implementation actually provides it.

## Caching

Invalidate relevant referral lists, dashboards, permission caches, and related views after changes.

Consider concurrent cache invalidation, multiple backend instances, stale cached permissions, and failures after a committed database transaction.

Persistent database state remains authoritative.

## Errors

Use consistent error structures and meaningful HTTP status codes.

Distinguish validation errors, authorization failures, scope violations, missing records, conflicts, terminal-state violations, dependency errors, and infrastructure failures.

Never leak passwords, tokens, raw patient documents, unnecessary PHI, internal stack traces, or infrastructure secrets to clients.

---

# 7. AUTHORIZATION MUST BE ENFORCED EVERYWHERE

Inspect the existing authentication and RBAC infrastructure before modifying or duplicating it.

Use the actual guards, decorators, role-permission mappings, and session model where sound.

Implement action-based permission checks separately from destination-stage ownership.

Verify:

- User authentication and session validity.
- Action permissions.
- Site, state, tenant, and legal-entity scope.
- Record ownership and assignment constraints.
- Permissions required for sensitive clinical and billing operations.
- Permission changes after a session begins.
- Revoked or deactivated accounts.
- Direct requests to protected API endpoints.
- Unauthorized document access and downloads.
- Attempts to access other patients by manipulating identifiers.
- Appropriate administrative overrides and audit logging.

Do not authorize a request solely because a user has a role name that sounds appropriate.

Do not make the frontend's hidden buttons or route guards the security boundary.

Do not introduce a blanket admin bypass unless it matches the existing security policy and is explicitly intended.

Never weaken security to get a test passing.

---

# 8. DATABASE, DEPENDENCIES, AND MIGRATIONS

Preserve the existing Prisma schema unless actual implementation needs require a change.

Before changing the schema:

1. Inspect the existing model and relations.
2. Check whether equivalent fields, tables, or indexes already exist.
3. Determine migration impact and data-safety implications.
4. Update appropriate types, validation, and services.
5. Generate a versioned migration.
6. Run migration and client-generation checks.
7. Verify the resulting schema and relevant constraints.

Do not create duplicate models, enums, indexes, services, DTOs, or package dependencies that already exist.

Never reset production databases or delete persistent volumes as a routine fix.

Use safe migration practices and preserve existing development data whenever possible.

Keep dependency versions compatible with the actual runtime, framework, TypeScript, and workspace configuration.

Do not make arbitrary major-version upgrades without a concrete reason.

---

# 9. USE THE EXISTING TASK LIST AS THE SOURCE OF PROGRESS

Continue `tasks.md` in its existing order and respect the specified dependencies.

For each task:

1. Inspect its requirements and dependent code.
2. Implement the actual behavior.
3. Add meaningful tests.
4. Run the relevant checks.
5. Fix regressions introduced by the changes.
6. Inspect the affected files and final diff.
7. Mark the task complete only after verification.
8. Move to the next task without unnecessary interruption.

Do not spend time repeatedly rewriting task descriptions or producing another development plan.

If multiple tasks can safely be implemented together, do so without creating dependency conflicts. Do not parallelize tasks that modify the same core files or depend on an unfinished schema change.

The tasks list marks some tests as optional. Treat tests for authentication, authorization, workflow gates, concurrency, idempotency, transaction safety, audit preservation, lifecycle operations, and external side-effect recovery as mandatory for declaring the corresponding behavior complete.

Use mocks for isolated unit tests when appropriate, but do not use mocked services as proof that real integrations work.

Avoid creating empty service stubs just to check off tasks.

---

# 10. AUTOMATED TESTING AND FAILURE-PATH VERIFICATION

Create or maintain a meaningful testing strategy:

### Unit tests

Cover workflow rules, permission decisions, transition validation, gate conditions, assignment routing, error mapping, revision rules, and idempotency behavior.

### Integration tests

Test actual database constraints, Prisma operations, transactions, optimistic concurrency, relationships, migrations, authorization filters, and event-outbox behavior.

### End-to-end tests

Verify complete user journeys against the actual API and relevant infrastructure.

At minimum, test:

- A complete six-stage referral lifecycle.
- A clinical return to intake and resubmission.
- A no-show and rescheduling cycle.
- A note correction and re-approval cycle.
- Rejection and terminal-state enforcement.
- Authorization and cross-scope denials.
- Competing updates and stale versions.
- Duplicate requests and retry after timeout.
- Database rollback when a transaction fails.
- Outbox retries and event deduplication.
- Deletion and archival with dependent records.
- Invalidated prerequisites and safe state repair.
- AI extraction failures and protection of human-verified data.
- Build and startup behavior for the independent applications.

Tests must assert actual outcomes, not merely that a function was called.

Do not disable failing tests, weaken assertions, or report tests as passed without executing them.

Run relevant lint, type checks, builds, database checks, and tests after meaningful changes.

If something fails, diagnose the root cause and fix it. Do not hide the failure.

---

# 11. FRONTEND AND PRODUCT INTEGRATION

Once backend workflow functionality is implemented, continue integrating it with the existing Next.js frontend and Python document processor according to the project roadmap.

Use existing shadcn/ui primitives where suitable and build custom healthcare-specific components for the referral workflow.

Do not replace the existing frontend architecture with an incompatible dashboard template.

Ensure that screens use actual APIs and shared types.

Implement meaningful UI behavior for:

- Loading and empty states.
- Form validation.
- Permission-denied states.
- Workflow gate explanations.
- Failed requests and safe retries.
- Version conflicts and stale records.
- Optimistic updates with reliable rollback.
- Document processing failures and extraction review.
- Corrections and immutable note revisions.
- Deletion restrictions and dependency explanations.
- Successful actions and updated dashboard data.

Never display fake dashboard numbers or leave buttons disconnected from functionality.

The frontend must remain independently deployable to Vercel, while the API and document processor remain independently deployable services.

Use configurable environment variables and proper CORS settings. Do not hardcode production URLs or secrets.

---

# 12. AI DOCUMENT PROCESSING SAFETY

Treat AI extraction as an untrusted input pipeline.

Validate extracted data against explicit schemas before persistence.

Preserve confidence scores, source provenance, field corrections, extraction attempts, and processing status.

Handle malformed AI output, missing fields, contradictory values, low-confidence results, rate limits, timeouts, failed jobs, duplicate uploads, and delayed results.

Do not let an AI response overwrite newer human-verified values.

Do not allow the AI service to make independent clinical acceptance, medical necessity, insurance eligibility, or billing approval decisions.

Do not process real patient information through an external provider until applicable contractual, security, and data-handling requirements have been verified.

Use synthetic fixtures for development and tests.

---

# 13. PRODUCTION-ORIENTED DEPLOYMENT

Verify that the existing applications can be built and started separately.

Required targets:

- Web: independently buildable and deployable to Vercel.
- API: independently buildable and deployable as a Node.js service.
- Document processor: independently installable and deployable as a Python service.

Ensure each application has appropriate startup commands, health checks, dependency requirements, and environment configuration.

Ensure the root workspace remains usable for local development.

Check that secrets are not committed, private storage is not publicly accessible, database connections use the correct configuration, and background workers can recover from failure.

Document only the deployment instructions actually supported by the implementation.

Do not declare the overall project production-ready merely because it builds. Sensitive healthcare production use additionally requires the applicable security review, vendor agreements, risk assessment, operational policies, and compliance approval.

---

# 14. AUTONOMOUS ENGINEERING LOOP

Operate as a persistent engineering agent during the available working session.

After each coherent implementation slice:

- Inspect the changes.
- Run the relevant tests and checks.
- Fix failures.
- Check for regressions.
- Update task progress.
- Continue automatically.

Do not stop to request confirmation for ordinary coding decisions.

Do not stop after a single task or a successful build if additional tasks are ready and the available environment supports continuing.

Do not claim to work asynchronously after the session ends. Make actual progress in the current working session.

When a task cannot continue because of a genuine external dependency, missing credential, unavailable infrastructure, or unresolved product-owner decision, explain the blocker briefly and continue with other independent work.

Never silently change an important business rule to bypass a blocker.

Never delete user work, erase databases, weaken permissions, fake test results, or conceal failures.

Prioritize correctness and working implementations over the number of files generated.

---

# 15. FINAL ACCEPTANCE RULE

A feature is not complete because its files exist, its task checkbox is checked, or an AI agent reports success.

A feature is complete when:

- The correct behavior is implemented.
- Its API and database interactions are correct.
- Authorization and scope restrictions work.
- Failure and backward paths are handled.
- Data integrity and audit history are preserved.
- Important concurrency, retry, and lifecycle cases are tested.
- Relevant builds and automated tests pass.
- The final changes do not break existing functionality.

At the end of a session, provide a concise factual summary of verified completed tasks, tests actually executed, known failures, remaining work, and genuine blockers.

Do not invent success metrics, claim unverified functionality is production-ready, or generate another lengthy analysis report.

## BEGIN NOW

Read the complete existing requirements, design, and tasks. Inspect the actual repository and verify previous progress. Resume at the correct incomplete task and begin implementation immediately.

**Continue building Heals on Wheels. Avoid redundant planning, eliminate root causes rather than hiding symptoms, and leave the repository in a better-tested state after every implementation cycle.**