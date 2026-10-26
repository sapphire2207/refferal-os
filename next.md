# HEALS ON WHEELS — BACKEND-FIRST COMPLETION & SECURITY MASTER PROMPT

## Mission

You are taking responsibility for the existing Heals on Wheels codebase at `D:\ReferralSystem`.

The Referral Workflow Engine has undergone substantial implementation work, but the other backend modules, authentication, security controls, and integrations may still be incomplete.

**Your immediate mission is to verify and complete the backend API before beginning frontend page implementation.**

Do not assume a module is complete because its directory, controller, service, or module file exists. Do not trust previous AI-generated summaries or unchecked task boxes. Inspect actual source code, execute tests, verify database behavior, and establish what genuinely works.

The existing files are the source of project requirements:

- `.kiro/specs/referrals-workflow-engine/requirements.md`
- `.kiro/specs/referrals-workflow-engine/design.md`
- `.kiro/specs/referrals-workflow-engine/tasks.md`
- `Core_Doc.pdf`
- `IMPLEMENTATION_GUIDE.md`
- `START_HERE.md`
- `BUILD_STATUS.md`
- Other relevant existing documentation.

Read the available specifications and inspect the actual repository.

**Do not start another documentation-generation loop. Do not rewrite the specifications. Begin with a concise source-code assessment, then implement the remaining backend functionality in verified, incremental slices.**

---

# 1. Establish the Real Backend Baseline

Inspect the complete `apps/api` application, including:

- Authentication, JWT strategies, guards, decorators, session handling, and role/permission mapping.
- User management and access-scope management.
- Patient CRUD and duplicate detection.
- Referral CRUD and workflow engine.
- Document upload, storage, extraction coordination, and download authorization.
- Clinical review decisions.
- Scheduling and appointment management.
- Encounters and clinical notes.
- Notes QA and immutable note revisions.
- Billing readiness, claims, rejection, denial, and payment tracking.
- Audit events, comments, tasks, notifications, and background processing.
- WebSocket authentication and authorization.
- Prisma schema, migrations, indexes, relations, foreign-key constraints, and seed scripts.
- Redis connection, rate limiting, caching, idempotency, and event outbox.
- Global validation, exception filters, logging, configuration, CORS, and security headers.
- Tests, build scripts, dependencies, environment variables, and deployment configuration.

For each feature, determine whether it is genuinely implemented, partially implemented, a placeholder, broken, or missing.

Run the relevant existing tests, type checks, and builds. Inspect whether the tests exercise real behavior or merely mock all meaningful functionality.

Record the verified baseline concisely. Immediately continue implementation after the assessment.

Do not recreate working infrastructure unnecessarily.

---

# 2. Implement Authentication and Session Security First

Authentication is foundational. Verify what already works before deciding what needs implementation.

Complete the required authentication features:

- Invite-only account provisioning.
- Login with secure password verification.
- Approved second-factor authentication/MFA and recovery flows.
- Strong session lifecycle and expiration.
- Access-token and refresh-token handling appropriate to the chosen architecture.
- Secure logout and session revocation.
- Password recovery and reset.
- User activation, suspension, deactivation, and access revocation.
- Rate-limited authentication attempts and abuse detection.
- Safe error messages that do not reveal whether an email account exists.
- Validation of active sessions and current authorization on protected requests.

Use an established, maintained authentication library where appropriate. Do not implement cryptographic primitives from scratch.

For browser authentication, evaluate secure, `HttpOnly`, `Secure`, appropriately configured `SameSite` cookies and their CSRF requirements. If bearer tokens are used, design storage and refresh behavior to reduce token theft risk.

Do not store passwords or sensitive tokens in plaintext. Hash passwords using an appropriate password-hashing algorithm and configuration.

Ensure logout, refresh-token rotation, revocation, password changes, and deactivation are coherent.

A JWT containing outdated permissions must not allow a suspended account or revoked privilege to retain access indefinitely.

Do not claim MFA works if it is merely described in the login UI.

---

# 3. Implement Complete RBAC and Scope Enforcement

The application must distinguish roles, permissions, assignments, and data-access scopes.

Inspect the existing role and permission definitions before extending them.

Implement authorization on every protected API operation, including:

- View, search, create, edit, archive, and delete.
- Clinical acceptance, return, and rejection.
- Appointment scheduling, cancellation, and reassignment.
- NP visit and note operations.
- Note approval and correction.
- Billing readiness and claim submission.
- User and permission administration.
- Document previews, downloads, and extraction results.
- Audit history, exports, comments, and notifications.
- Background and service-to-service operations.

Enforce the appropriate combination of role/action permission and site, state, tenant, or legal-entity scope.

Do not confuse destination-stage ownership with permission to perform a transition.

Never trust the frontend to enforce permissions. Hiding buttons is not a security control.

Verify that guessed or manipulated record IDs cannot expose another patient's data.

Admin access must follow explicit policy rather than relying on an uncontrolled blanket bypass.

---

# 4. Implement Rate Limiting and Abuse Protection

This is mandatory, not optional.

Use a configurable rate-limiting strategy appropriate to the deployment architecture.

Since Redis already exists in the project, evaluate a Redis-backed distributed limiter so limits remain consistent across multiple API instances.

Implement appropriate policies for:

- Global API traffic.
- Login and authentication attempts.
- MFA verification and recovery.
- Password resets and account invitations.
- Token refresh.
- Patient and referral search.
- Document upload and retrieval.
- AI extraction requests.
- Expensive database queries and reports.
- Administrative and sensitive operations.
- WebSocket connection attempts and message abuse, where applicable.

Requirements:

- Configure limits independently by endpoint category and environment.
- Consider source IP, authenticated user, account identifier, and relevant operation cost.
- Return HTTP `429 Too Many Requests` with appropriate `Retry-After` behavior when a limit is exceeded.
- Avoid trusting spoofable forwarding headers unless requests pass through a correctly configured trusted proxy.
- Avoid permanent account-lockout behavior that lets an attacker deny service to a legitimate user.
- Handle Redis outages deliberately. Sensitive endpoints must not silently become unlimited during failures.
- Prevent one application instance from bypassing limits enforced by another.
- Ensure rate-limit keys contain no sensitive patient information.
- Make thresholds configurable without scattered hardcoded numbers.
- Add unit and integration tests covering exceeded limits, reset windows, concurrent requests, distributed behavior, and backend failures.

Do not introduce aggressive limits that block legitimate operational use. Derive reasonable initial thresholds, make them configurable, and document the assumptions.

---

# 5. Complete API Security Controls

Inspect and implement the security controls appropriate to each endpoint.

## Request validation

- Validate all request bodies, path parameters, query parameters, headers, and uploaded file metadata.
- Reject unexpected fields where appropriate.
- Enforce strict DTO/schema validation and transformation.
- Validate enums, UUIDs, dates, numeric ranges, text lengths, pagination, and sorting.
- Prevent unvalidated mass assignment.
- Use parameterized database operations and Prisma safely.
- Avoid SQL injection, NoSQL-style query injection in any dynamic query layer, and unsafe raw queries.

## HTTP and browser security

- Configure restrictive, environment-specific CORS.
- Configure appropriate security headers.
- Enforce CSRF protections when required by the authentication design.
- Avoid unsafe redirects, untrusted URL fetching, and server-side request forgery.
- Do not expose secrets through client bundles, source maps, API responses, or error messages.
- Enforce HTTPS in production through the actual hosting and proxy configuration.
- Set suitable request-size limits, timeouts, and connection limits.

## Logging and errors

- Never log passwords, full tokens, credentials, complete medical documents, or unnecessary PHI.
- Sanitize logs, exceptions, request payloads, and monitoring events.
- Return consistent structured errors without internal stack traces.
- Record useful correlation/request IDs for debugging.
- Prevent sensitive information from appearing in URLs, browser analytics, or unsecured notifications.

## File and document security

- Enforce file size, file type, actual content, and permitted extension checks.
- Generate safe server-side storage identifiers.
- Prevent path traversal and arbitrary filesystem access.
- Keep files in private storage with authorized retrieval.
- Design for malware scanning and safely handle scanner failures.
- Use short-lived authorized download URLs when appropriate.
- Handle interrupted uploads, duplicate uploads, failed storage writes, and cleanup failures.
- Never expose the local `uploads/` directory publicly.
- Prevent the Python document processor from fetching arbitrary filesystem paths or URLs based on untrusted request data.

## Secrets and configuration

- Validate environment configuration at startup.
- Fail fast when mandatory production secrets are absent or insecure.
- Keep secrets out of source control.
- Use independent configuration for local, test, staging, and production environments.
- Restrict Swagger/API documentation access appropriately in production.
- Avoid exposing internal health diagnostics or infrastructure secrets publicly.

---

# 6. Complete the Remaining Domain Modules

The Referral Workflow Engine is the central workflow coordinator, not a replacement for domain services.

Implement missing or incomplete backend functionality module by module, following the existing requirements and database design.

## Users

Complete account lifecycle, role assignment, scope assignment, invitation, activation, suspension, and secure administrative operations.

Ensure deactivated or unauthorized assignees cannot retain active work improperly.

## Patients

Complete create, read, update, authorized search, duplicate detection, referral history, archival, and deletion restrictions.

Never automatically merge patient charts based on an uncertain identity match.

## Referrals

Verify that the existing CRUD and workflow endpoints are complete.

Implement authorized filtering, pagination, assignment, stage transitions, work-status changes, workflow history, search, and safe lifecycle operations.

Preserve stage, work status, outcome, and billing status as separate dimensions.

## Documents

Implement secure upload, private storage, metadata, access-controlled retrieval, extraction coordination, extraction history, human verification, retries, and cleanup.

AI extraction must never replace newer human-verified information or approve a clinical workflow independently.

## Clinical review

Implement accept, return, and reject decisions with appropriate permission checks, reviewer identity, timestamps, reasons, and review-cycle history.

## Appointments

Implement appointment creation, confirmation, cancellation, rescheduling, provider assignment, availability validation, and history preservation.

## Encounters and clinical notes

Implement visit outcomes, date of service, services provided, note submission, authentication requirements, immutable revisions, corrections, and the appropriate relationship between appointments, encounters, and notes.

## Notes QA

Implement authorized review, approval, correction requests, revision-specific approval, and return-to-NP assignment.

Never silently overwrite previously signed or approved clinical documentation.

## Billing

Implement billing readiness validation, claim submission coordination, submission references, status history, rejection, denial, payment tracking, and follow-up tasks.

Note approval must not bypass required billing checks.

Never blindly repeat a claim submission when the external result is unknown.

## Audit, notifications, comments, and tasks

Implement authorized access, appropriate event recording, task assignment, notification delivery, retries, pagination, and historical traceability.

Audit reads, document downloads, exports, permission changes, and sensitive workflow operations where required by policy.

Do not create fake or unconnected endpoints just to make the module appear complete.

---

# 7. Preserve and Verify the Referral Workflow Engine

Continue from the existing implementation rather than rewriting it.

Verify:

- Forward stage transitions.
- Explicit backward correction flows.
- Required stage gates.
- Action-based permission checks.
- Scope enforcement.
- Terminal outcomes.
- Work-status transition rules.
- Optimistic concurrency.
- Atomic transactions and rollback.
- Durable idempotency.
- Assignment history.
- Immutable note revisions and approval evidence.
- Prerequisite validation and safe state repair.
- Transactional outbox processing and event deduplication.
- Cache invalidation and delayed event handling.

Use accurate delivery guarantees: a transactional outbox generally provides reliable at-least-once event delivery, so consumers must be idempotent and deduplicate stable event identifiers.

The workflow engine must coordinate domain services through well-defined interfaces rather than placing every clinical, appointment, document, and billing rule in a single oversized service.

---

# 8. Data Integrity and Relationship Lifecycle

Inspect every important Prisma relation, foreign key, unique constraint, index, and deletion policy.

Implement safe behavior for:

- Patient records with dependent referrals.
- Referrals with appointments, clinical notes, documents, and claims.
- Documents referenced by approved clinical workflows.
- Signed notes and their revisions.
- Historical review and audit records.
- User deactivation and historical signatures.
- Duplicate referrals and authoritative patient records.
- Deleted, archived, detached, or invalidated prerequisites.
- Failed object-storage cleanup and delayed extraction jobs.

Never rely on accidental cascade behavior.

Use `RESTRICT`, `CASCADE`, or `SET NULL` deliberately according to the data's lifecycle and retention requirements.

Use non-destructive defaults wherever policy is unknown.

Important business operations must preserve referential integrity and historical evidence. Every destructive operation must require explicit authorization and appropriate auditing.

Never invent healthcare retention periods.

---

# 9. Transactions, Concurrency, and Reliable Side Effects

Implement state-changing business operations atomically.

Ensure that related updates to records, assignments, audit history, and outbox entries commit together.

Implement appropriate concurrency protection on workflow-critical fields and assignments.

Handle:

- Simultaneous edits.
- Stale client versions.
- Duplicate requests.
- Network timeouts after a committed operation.
- Process restarts.
- Database failures.
- Redis failures.
- Background-worker failures.
- Repeated events.
- Out-of-order results.
- Unknown external claim-submission outcomes.

Use durable idempotency controls for operations that cannot safely be repeated. Do not assume a cache lookup followed by an insert is atomic.

Use reliable background-job coordination and retry rules. Never retry irreversible external operations blindly.

Ensure cache invalidation failures cannot make stale permissions or incorrect workflow state authoritative.

---

# 10. Healthcare Security and Privacy

Build security into the application's actual behavior rather than treating it as a checklist.

Apply least privilege and minimum necessary access.

Protect patient data in:

- Database access.
- Document storage.
- API responses.
- Application logs.
- Error reporting.
- Caches.
- WebSocket events.
- Notifications.
- Exports and reports.
- Background-job payloads.
- Backups and operational tooling.

Use synthetic data throughout development and automated testing.

Verify contractual and service configuration requirements before sending real PHI to external AI or infrastructure vendors.

Do not claim HIPAA compliance solely because security features exist. Real production use requires applicable vendor agreements, risk assessments, operational policies, training, controls, and responsible compliance approval.

---

# 11. Automated Verification Is Mandatory

After implementing a feature, run the relevant checks and fix any failures.

## Unit tests

Cover business rules, authorization, validation, state transitions, rate limiting, assignment behavior, note revisions, idempotency, and error handling.

## Integration tests

Use a disposable test database and test the actual Prisma behavior, foreign keys, migrations, transactions, Redis integration where relevant, and authorization filters.

## End-to-end tests

Verify complete user and system journeys against the real API and appropriate test infrastructure.

Include:

- Authentication and revoked-session behavior.
- Unauthorized access and cross-scope denial.
- Rate limiting and recovery.
- Complete referral progression.
- Return-and-resubmit cycles.
- Appointment cancellation and no-show handling.
- Note revisions and re-approval.
- Billing readiness and safe claim retries.
- Concurrent update conflicts.
- Audit preservation.
- Deletion restrictions.
- AI extraction failures.
- Background event retries.
- Recovery from partial infrastructure failures.

Do not disable failing tests, weaken assertions to obtain a green result, or count mocked tests as proof of end-to-end functionality.

After relevant changes, run the API type checks, lint, tests, Prisma validation, migration checks, and production build.

Document actual test outcomes, not assumed results.

---

# 12. Deployment and Operational Readiness

Keep the frontend, backend, and Python document processor independently deployable.

Verify:

- NestJS API builds and starts independently.
- Python document processor installs and starts independently.
- PostgreSQL migrations are versioned and repeatable.
- Redis dependencies and failure behavior are understood.
- Secrets and environment configuration are validated.
- Health and readiness checks behave appropriately.
- Graceful shutdown and background-worker lifecycle are implemented.
- Persistent document storage is private and durable.
- Rate limiting works across backend instances.
- Logs and metrics avoid unnecessary PHI.
- Backups and restoration requirements are documented.
- Production configurations do not depend on localhost.

Do not deploy or use real patient information until the appropriate security and compliance gates are satisfied.

---

# 13. Implementation Execution Rules

Work directly from the existing task list.

1. Verify each task's real status.
2. Complete missing backend prerequisites first.
3. Implement features as small, integrated, testable slices.
4. Reuse the existing authentication, workflow, database, and shared infrastructure when correct.
5. Avoid duplicate services and redundant dependencies.
6. Run relevant tests and builds.
7. Fix root causes.
8. Inspect the final diff.
9. Mark tasks complete only after verification.
10. Continue to the next eligible task.

Do not spend credits repeatedly generating specifications or analysis reports.

Do not stop to ask about routine implementation details that can be decided through repository inspection and sound engineering practice.

Do not silently invent clinical policy or weaken security. If a genuine external decision is required, isolate it and continue other independent work.

## Current priority

Complete the backend API first.

Do not begin implementing all frontend pages while critical backend authentication, authorization, rate limiting, or required domain APIs are still missing.

Once the backend capabilities needed by the product are implemented and verified, document the actual available API contract and use it to drive frontend integration.

## Start now

Inspect the repository and task progress, determine the highest-priority missing backend capability, and start implementing it immediately.

**Deliver a secure, complete, tested backend—not merely a collection of modules, controllers, and optimistic completion summaries.**