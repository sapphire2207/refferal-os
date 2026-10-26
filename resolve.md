# Kiro — Requirements Audit and Contradiction Resolution

Before generating the technical design or implementation task list, perform a rigorous engineering review of the existing Referrals Workflow Engine specification.

Read the complete current `requirements.md`, the original Heals on Wheels `Core_Doc.pdf` requirements, and the actual repository code, Prisma schema, shared types, constants, and existing architecture.

Your job is to improve the specification so implementation can proceed without contradictory business rules, ambiguous ownership, unsafe data handling, or missing failure paths.

## Rules

1. Do not implement the workflow engine yet.
2. Do not replace the document with a generic template.
3. Preserve valid existing requirements and their terminology.
4. Inspect the actual repository rather than assuming that the schema, constants, and services match the specification.
5. Distinguish requirements supported by the original product handoff, implementation recommendations, and unresolved product-owner or clinical-policy decisions.
6. Edit the existing `requirements.md` directly where appropriate. Do not create a competing replacement specification.
7. Do not invent clinical policies, legal retention periods, or billing rules.
8. Continue autonomously through the analysis and specification corrections that do not require external decisions.

## Mandatory review areas

### A. Authorization and stage ownership

Distinguish action authorization from destination-stage ownership. Verify that an authorized user can perform legitimate transitions without incorrectly needing to hold the destination stage's role.

Define permissions for forward transitions, returns, rejections, reassignment, work-status changes, administrative overrides, and reopening terminal cases.

Specify role, site, state, and legal-entity scope enforcement for every sensitive operation.

### B. Workflow correctness

Create a complete transition matrix covering all six stages, normal forward progression, permitted backward corrections, exceptional outcomes, terminal states, reopening, and invalid transitions.

For each transition, define the initiating action, authorized actor, preconditions, destination state, work status, assignment behavior, audit event, side effects, and failure behavior.

Keep `pipelineStage`, `workStatus`, `caseOutcome`, and `billingStatus` independent.

Resolve conflicting rules for cancellations, rescheduling, no-shows, interrupted visits, rejected referrals, and repeated correction cycles.

### C. Billing lifecycle

Resolve the conflict between clinical note approval and billing readiness.

Explicitly define when a case enters billing, when it can become READY, which billing checks must pass, and how submission, rejection, denial, and payment are tracked.

Prevent duplicate claim submissions and account for uncertain outcomes when an external billing system times out.

Do not allow changes to prerequisite clinical information to leave downstream approval and billing statuses incorrectly valid.

### D. Clinical documentation and approval history

Specify immutable note revisions and review records, correction requests, signatures, resubmissions, and approval of the correct revision.

Define what happens when a note or its supporting information changes after approval or billing readiness.

Protect prior decisions and audit evidence.

### E. Data relationships and lifecycle operations

Create a relationship and lifecycle policy for all relevant entities, including users, patients, referrals, documents, assignments, clinical reviews, appointments, encounters, notes, billing records, comments, tasks, and audit events.

Define deletion, archival, deactivation, detachment, replacement, and restoration behavior.

Inspect actual foreign-key relationships and cascades. Specify which operations must be restricted, which can be safely cascaded, and which records must be preserved.

Include dependency checks, safe failure messages, transactional changes, audit preservation, object-storage cleanup, stale job handling, and the consequences of deleting or changing a prerequisite record.

Add explicit requirements for these behaviors. Do not infer legal retention periods.

### F. Concurrency, transactions, retries, and events

Specify atomic version checking and state transitions, transaction rollback, idempotency-key behavior, duplicate request handling, and stale-client responses.

Ensure committed state changes cannot silently lose required downstream events. Specify a transactional outbox or another justified reliable-delivery design.

Define event deduplication, retries, ordering, idempotent consumers, and recovery from partial failures.

### G. Runtime configuration and structural changes

Distinguish runtime-configurable business rules from structural changes involving database schemas, enum definitions, APIs, and frontend contracts.

Define validation and safe rollout of rule changes, including invalid configurations and in-progress referrals.

Do not claim that adding a stage can always be accomplished through configuration alone.

### H. Performance and security

Make performance acceptance criteria testable by defining the expected workload, representative dataset, measured operations, and percentile target.

Review authorization cache invalidation, audit immutability, access-denied auditing, document protection, and permissions that change during active sessions.

Ensure security failures do not expose protected patient information.

## Required output before finishing

First, produce a concise contradiction and gap report referencing exact requirement numbers.

Then revise the existing requirements document to resolve inconsistencies and add missing acceptance criteria.

Preserve the existing 18-requirement structure where practical; add a separate requirement for entity lifecycle and dependency management if needed.

Finally, verify that:

- No requirements contradict each other without an explicit documented exception.
- All six stages and their backward paths are covered.
- Permissions are checked for the action being performed.
- Clinical approval and billing readiness cannot be confused.
- Note revisions and audit history are preserved.
- Every important entity has defined relationship and lifecycle behavior.
- Destructive actions and retries have safe, testable outcomes.
- External side effects cannot silently duplicate or disappear.
- Unresolved business-owner decisions are listed explicitly.
- Acceptance criteria are observable and testable.

Do not report a requirement as resolved unless the updated specification actually resolves it.

Stop after updating and validating the requirements. Do not generate the technical design yet.