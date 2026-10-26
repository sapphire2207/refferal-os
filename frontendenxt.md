# Heals on Wheels — Continue Frontend Development
## Role-Aware Workspaces, Dashboard, Kanban and Complete API Integration

You are continuing an existing project at `D:\ReferralSystem`.

Your objective is to complete the Next.js frontend into a functional, polished healthcare referral management application using the existing dashboard template, Kanban UI, backend API, shared types, and project requirements.

The repository already contains project documentation and architecture specifications. Read and use them. **Do not generate another requirements document, another design document, or another redundant implementation plan. Inspect the real code and continue building.**

Do not restart the project, replace working components unnecessarily, or assume that files and features work merely because they exist.

## 1. Inspect the existing implementation first

Inspect:

- `apps/web` and its existing Next.js App Router structure.
- The installed shadcn/ui `dashboard-01` template and component configuration.
- The existing referral Kanban and reusable UI components.
- Authentication and authorization implementations in `apps/api`.
- Actual API controllers, DTOs, response structures, endpoints, and shared TypeScript types.
- Existing npm workspaces, environment variables, routing, state management, and data-fetching libraries.
- The project specifications in `.kiro/specs/referrals-workflow-engine/`.
- `Core_Doc.pdf`, implementation guides, and other existing product documentation.

Verify what is already implemented and what is missing. Preserve working code and continue from the actual repository state.

After this initial inspection, start implementation immediately.

## 2. Implement a proper multiple-role workspace experience

This is a fundamental product requirement.

All employees use ONE login system and ONE application. Their available workspaces and routes depend on their actual assigned roles and permissions.

### Case A: User has exactly one role

Automatically select that role's workspace after authentication.

- Show the appropriate role-specific dashboard.
- Display only the modules and navigation the user is authorized to access.
- Do not display an unnecessary role switcher.
- Avoid asking the user to select a workspace when there is only one available.
- Direct the user to their relevant work queue and common actions.

Example: An Intake Specialist signs in and sees the Intake workspace, its queue, missing-document work, and intake-specific actions.

### Case B: User has multiple assigned roles

Display a workspace switcher in the top-right application header, near the user's profile.

The switcher must show only workspaces supported by the user's actual assigned roles.

Example:

- Clinical Review
- Scheduling
- Clinical QA

If an employee holds all three roles, they can switch between these workspaces without logging out, refreshing the entire application unnecessarily, or authenticating again.

When the selected workspace changes:

1. Update the active workspace in the application state.
2. Render the selected role's dashboard and operational queue.
3. Change the role-specific sidebar items and quick actions.
4. Refresh or invalidate data that belongs to the previous workspace.
5. Navigate to a suitable page in the new workspace if the current route is not available there.
6. Preserve the authenticated session.
7. Ensure previously loaded patient data does not accidentally appear in the new workspace.
8. Persist the workspace preference appropriately if useful, without persisting sensitive patient information.

The active workspace must be clearly visible so the employee understands which team's queue they are viewing.

Provide sensible defaults, such as the user's last valid workspace or a designated primary workspace when available.

If a saved workspace is no longer authorized, discard it and select an authorized workspace.

### Case C: User's permissions change

If a user is suspended, loses a role, loses a site scope, or has access revoked, the UI must respond to the actual authorization failure and refresh its session or permission state as appropriate.

Never continue displaying protected data as though access were still valid.

### Architecture rule

Build this using one shared application shell and reusable components. Do not create separate login pages, separate Next.js applications, or duplicated dashboards for each role.

Use an explicit role-to-workspace configuration and the actual permissions returned by the existing backend.

Do not hardcode each user's identity, assume that a role name guarantees every permission, or infer permissions from the currently selected workspace.

## 3. The workspace switcher is not a security mechanism

The selected workspace controls presentation and work context only.

The actual authorization system remains authoritative.

- Never grant permissions because a user selected a workspace.
- Never modify a JWT or assign client-side roles to simulate authorization.
- Never trust a role supplied by the browser as proof of authorization.
- Never display a sensitive record solely because it appeared in the previous workspace.
- The backend must continue checking permissions and location scopes on every protected operation.

When the user selects Clinical QA, for example, the interface should present the QA queue and appropriate actions. A user who does not possess billing permissions must not gain them through workspace switching.

Use the existing backend authentication and role assignments rather than inventing a second role-management mechanism in the frontend.

## 4. Use the installed dashboard and Kanban

Keep the existing shadcn/ui `dashboard-01` foundation.

Adapt the shared application shell to the Heals on Wheels brand and operational needs.

Use reusable components for:

- Sidebar and responsive navigation.
- Header, workspace selector, user profile, and notifications.
- Metric cards and dashboard sections.
- Data tables, filtering, pagination, and search.
- Forms, dialogs, dropdowns, badges, and confirmation dialogs.
- Loading, empty, error, unauthorized, and stale-data states.

Adapt the Kanban into the real six-stage referral pipeline:

1. INTAKE
2. CLINICAL_REVIEW
3. SCHEDULING
4. NP_VISIT
5. NOTES_QA
6. BILLING

Display accurate stage labels and separate work statuses. Include relevant assignment, priority, blocked reason, age, and next action where the user's permissions allow.

The Kanban must fetch actual API data and execute real transition requests. Handle optimistic updates, rollback, workflow gate failures, version conflicts, and authorization errors.

Never allow drag-and-drop to bypass backend validation.

## 5. Build role-specific dashboards

Use the existing product requirements and actual backend capabilities to build appropriate default dashboards for:

- Intake Specialist.
- Clinical Reviewer.
- Scheduler / Office Manager.
- Nurse Practitioner.
- Clinical QA Reviewer.
- Billing Coordinator.
- Admin / Compliance.

A person with multiple roles should see the appropriate workspaces and switch between them.

Do not force all users into an identical dashboard full of irrelevant metrics.

Each dashboard should prioritize that role's pending work, blocked items, overdue tasks, relevant metrics, and available actions.

Only display metrics that are obtained from actual API responses. Never retain template sample data or invent patient counts to make the interface appear complete.

The Office Manager's operational overview must not automatically grant unrestricted access to clinical notes or documents.

## 6. Complete the real frontend routes and CRUD operations

Use the existing requirements and actual API contracts to implement all required pages and workflows.

Include the appropriate equivalents of:

- `/login`
- `/dashboard`
- `/referrals`
- `/referrals/new`
- `/referrals/[id]`
- `/patients`
- `/patients/[id]`
- `/schedule`
- `/visits`
- `/notes-review`
- `/billing`
- `/notifications`
- `/admin/users`
- `/admin/audit`

Include document management and referral-specific document review, as appropriate to the existing routing structure.

Implement the actual CRUD and workflow interactions supported by the backend: create, view, update, search, assign, review, approve, return, schedule, submit notes, inspect billing readiness, and perform authorized lifecycle operations.

Build shared forms and detail components rather than duplicating implementations across pages.

Keep the scope aligned with the complete existing product specifications. Do not stop after building the landing dashboard.

## 7. Integrate every page with the real backend

Inspect the existing NestJS API rather than inventing endpoints or request shapes.

Implement a consistent API client, shared response/error handling, appropriate data-fetching patterns, and query invalidation.

Use environment variables for the backend API base URL. Keep secrets server-side.

Handle:

- Authentication expiration and logout.
- Loading and empty results.
- Field-level validation.
- HTTP 400 validation failures.
- HTTP 401 authentication failures.
- HTTP 403 permission failures.
- HTTP 404 missing records.
- HTTP 409 version conflicts.
- HTTP 422 invalid workflow state.
- HTTP 429 rate limiting.
- Network and server failures.
- Duplicate submissions and safe retries.

When a workflow action is rejected, show the actual reason returned by the backend and restore any optimistic UI state.

If an endpoint is genuinely missing or defective, identify the exact blocker and, where necessary, make a minimal, tested backend correction. Do not fake the API response or substitute local-only functionality.

Do not assume that the previous backend implementation report guarantees every endpoint works. Verify actual contracts and behavior.

## 8. Authentication and session handling

Use the existing backend authentication contract.

Implement the correct login, session restoration, logout, unauthorized state, and MFA flow where supported by the backend.

Handle authentication errors without exposing account existence or sensitive information.

Do not introduce competing authentication libraries or duplicate role and permission systems without a concrete need.

Ensure selected workspace state never grants or expands user privileges.

## 9. API-backed data and real-time behavior

Use existing WebSocket capabilities only after verifying their implementation and authorization behavior.

Handle reconnects, duplicate events, delayed events, stale queries, and session revocation.

Where real-time behavior is unavailable or unreliable, implement a correct refresh strategy rather than pretending the dashboard is synchronized.

The backend and database remain authoritative.

## 10. Verification and continuation

Implement incrementally, starting with:

1. Shared application shell and authentication.
2. Dynamic single-role and multi-role workspace selection.
3. Role-specific sidebar and dashboard.
4. Real API-backed referral Kanban.
5. Referral and patient search, CRUD, and detail pages.
6. Documents and AI extraction review.
7. Scheduling, NP visits, and notes QA.
8. Billing, administration, notifications, and audit views.
9. Integration, responsive checks, error handling, and production builds.

Preserve existing code and use the current specifications. Avoid redundant documentation.

After each meaningful implementation slice:

- Run relevant type checks, tests, and builds.
- Fix errors and regressions.
- Inspect the changed files.
- Verify actual API behavior.
- Continue to the next eligible feature.

Do not stop after producing a report or a visual mockup. Do not mark functionality complete without verifying it.

### Acceptance criteria

The feature is complete when:

- A single-role user sees their appropriate workspace without an unnecessary selector.
- A multi-role user sees a top-right workspace selector with only their authorized roles.
- Switching workspace changes the active dashboard, sidebar, queues, and relevant data without logging out.
- Workspace selection never expands permissions.
- Revoked access is handled correctly.
- The dashboard and Kanban use real backend data.
- CRUD pages and workflow actions operate against actual API contracts.
- Loading, failure, empty, validation, and conflict states are handled.
- The frontend remains independently buildable and deployable to Vercel.

**Start inspecting the existing repository now and implement the next incomplete frontend feature. Reuse the installed dashboard and Kanban, follow the existing product specifications, and prioritize working end-to-end functionality over generating more documents.**