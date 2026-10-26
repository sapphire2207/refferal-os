# Heals on Wheels — Full Application Hardening, Security & UX Quality Pass

## Your mission

You are the senior engineer responsible for making the existing Heals on Wheels application secure, reliable, responsive, understandable, and pleasant to use.

The application already contains a Next.js frontend, shadcn/ui dashboard, referral Kanban, role-aware workspaces, a NestJS API, PostgreSQL, Redis, authentication, document processing, and multiple healthcare workflow modules.

These capabilities have been implemented to varying degrees. Do not assume they work correctly merely because the previous agent reported a successful build.

**Inspect the existing code, identify real problems, fix them, and verify the fixes through meaningful tests.**

This is a hardening and completion phase, not an architecture rewrite.

Do not regenerate requirements, design documents, or large audit reports. Do not replace existing components unnecessarily. Do not install new libraries when existing ones can solve the problem cleanly.

Use the existing product specifications and source code as your foundation. Keep working autonomously through the available implementation tasks.

---

# 1. Start by examining the actual application

Inspect the complete frontend and backend code involved in:

- Authentication, session handling, MFA, roles and permissions.
- Workspace switching and protected routes.
- Every page, form, input field, modal, dropdown, table and interactive component.
- API client, request interceptors and response handling.
- TanStack Query configuration, cache keys, mutations and invalidation.
- WebSocket connections and event handling.
- NestJS controllers, services, DTOs, guards, interceptors and exception filters.
- Redis caching and rate limiting.
- Prisma models, queries, relations and migrations.
- Document uploads, downloads, extraction and private storage.
- Patients, referrals, clinical reviews, scheduling, encounters, notes, billing, audit and notifications.
- Environment configuration, logs, health checks and deployment settings.
- Existing tests, failing tests, incomplete handlers, TODOs and placeholder responses.

Run the existing checks before making substantial changes.

Create a small internal checklist of verified defects and high-risk areas. Then start fixing them immediately. Do not stop after writing the checklist.

Prioritize exploitable security vulnerabilities, data-integrity problems, authentication failures and broken core user journeys before cosmetic improvements.

# 2. Secure every input field

Review every input across the frontend and backend, not just login and referral creation.

This includes text fields, email addresses, phone numbers, dates, IDs, numeric values, search boxes, URLs, notes, comments, query parameters, uploaded files and administrative forms.

For every field, verify:

- Required versus optional behavior.
- Correct data type and format.
- Minimum and maximum lengths or values.
- Reasonable limits on user-provided text and request size.
- Correct handling of whitespace, empty strings, null values and missing fields.
- Correct date, time, timezone and date-of-service handling.
- Appropriate errors shown next to the field.
- Protection against malformed or unexpected values.
- Correct server-side validation even when the browser is bypassed.

Use the existing validation libraries and shared schemas where appropriate. Keep validation rules consistent across the frontend and backend.

Client-side validation improves usability; server-side validation enforces correctness and security. Both are required.

Do not silently convert invalid values into seemingly valid data.

## Specific checks

**Email:** Verify valid format, normalization and sensible length limits.

**Phone numbers:** Validate according to the intended country or configured business requirements. Do not assume every phone number has the same length.

**Dates:** Reject impossible dates and invalid formats. Validate future dates and date-of-service rules according to the applicable workflow.

**Numbers:** Reject non-numeric, non-finite, negative or out-of-range values where inappropriate.

**IDs:** Validate identifier formats and verify that referenced records actually exist and are accessible to the current user.

**URLs:** For any feature accepting a URL, explicitly allow appropriate schemes such as HTTPS where required. Reject unsafe schemes such as `javascript:` and prevent dangerous URL handling. If the backend fetches URLs, protect against requests to internal networks, cloud metadata addresses, localhost and other SSRF targets. Avoid fetching arbitrary URLs when the feature does not require it.

**Text, comments and notes:** Enforce length limits, safely render content, and prevent executable HTML or script injection. Preserve legitimate clinical text rather than breaking its formatting unnecessarily.

**Search and filters:** Validate query lengths, allowed sort fields, pagination limits and filter values. Prevent expensive or unbounded database queries.

**Uploads:** Check size, file signatures, actual content, allowed formats and storage paths. Do not rely only on filename extensions or browser-supplied MIME types.

**Sensitive fields:** Do not reveal full insurance identifiers, patient details or other protected information in error messages, URLs or logs unnecessarily.

Use clear, natural error messages that explain how the user can correct their input.

# 3. Review the entire security boundary

Inspect both the frontend and backend for security weaknesses.

Investigate and fix issues involving:

- Authentication bypass.
- Broken role or permission checks.
- Cross-patient and cross-site access.
- IDOR, where changing a record ID exposes another user's information.
- Incorrect workspace access.
- Stale sessions and revoked tokens.
- Insecure refresh-token behavior.
- CSRF where applicable to the authentication design.
- XSS and unsafe HTML rendering.
- SQL injection and unsafe raw database queries.
- SSRF and unsafe URL fetching.
- Path traversal and arbitrary file access.
- Insecure file downloads or public document storage.
- Mass assignment and unvalidated updates.
- Open CORS policies.
- Missing security headers.
- Unnecessary sensitive information returned by APIs.
- Credentials or secrets exposed in browser bundles.
- Sensitive information in logs, crash reports or notifications.
- Unsafe redirects and untrusted external links.
- Missing request, timeout and payload-size limits.

Use the established authentication and security libraries already installed where suitable.

Never fix a failing workflow by weakening authorization, disabling validation, exposing data, or allowing unrestricted access.

## Role and workspace security

Verify the single-role and multi-role experiences.

A single-role user should see their appropriate workspace without an unnecessary switcher. A multi-role user should be able to switch among their assigned workspaces without logging out.

However, workspace selection is presentation state, not authorization.

The backend must independently authorize every operation. A browser-provided role or workspace identifier must never grant privileges.

When a user loses a role or scope, becomes suspended, or has their session revoked, ensure protected data is no longer accessible.

Remove any development-only demo persona or simulated role-switching mechanism from production authentication paths. Never allow a production user to impersonate another role through a frontend shortcut.

# 4. Rate limiting and request abuse protection

Inspect the actual rate-limiting implementation in NestJS and verify that it works across multiple API instances.

Use the existing Redis integration if it supports reliable distributed limiting.

Review limits for:

- Login and MFA.
- Password reset and account recovery.
- Session and token refresh.
- Search and filtering.
- Patient and referral creation.
- Document upload and download.
- AI extraction and expensive processing.
- Reports, exports and administrative operations.
- Public and authenticated endpoints.
- WebSocket connections and abusive message traffic.

Check that rate limits cannot be bypassed by sending many simultaneous requests, changing a client-side identifier, or switching API instances.

Return appropriate HTTP 429 responses with useful retry information.

Handle proxy IP information correctly. Do not trust arbitrary forwarded headers from untrusted sources.

Avoid permanent account lockouts that allow an attacker to deny access to legitimate users.

Make limits configurable rather than scattering numbers throughout the code.

Sensitive endpoints must not silently become unlimited if Redis fails. Define and test appropriate failure behavior.

Apply request-size limits and timeouts as well as request-count limits.

Use reasonable limits that preserve normal staff workflows. Do not make every endpoint unnecessarily restrictive.

# 5. Make the application feel fast

Review the existing frontend's data-fetching and rendering behavior before changing its caching architecture.

We want immediate visual feedback without unnecessary requests or misleading UI.

## Global loading behavior

Implement a consistent loading experience across the application.

Where appropriate, provide:

- Immediate loading feedback after navigation or user actions.
- Skeleton layouts for pages, cards, tables and Kanban columns.
- Small spinners for actions such as save, submit, upload, approve and assign.
- Disabled submit buttons while a request is in progress.
- Progress indicators for lengthy document processing or uploads.
- Clear empty states when no records exist.
- Useful error states when requests fail.

Use Next.js loading boundaries and existing shared loading components where appropriate. Establish reusable loading patterns rather than implementing unrelated spinners on every page.

If compatible cached data is already available, consider displaying it immediately while refreshing it in the background. Make stale-data behavior explicit where it matters.

Do not show a page-wide loading screen for every small mutation. Prefer loading feedback in the affected area.

Avoid skeletons flashing unnecessarily when cached data is already ready.

## Reduce unnecessary API requests

Inspect the actual network flow and TanStack Query configuration.

Look for:

- Duplicate requests triggered by multiple components.
- Unnecessary refetches after mounting or workspace changes.
- Search requests firing on every keystroke.
- Repeated requests caused by unstable query keys.
- Redundant invalidation of every cache after one small mutation.
- Excessive polling.
- WebSocket events triggering duplicate queries.
- Requests made before required authentication or parameters are ready.
- Components repeatedly fetching identical data.
- Dashboard pages requesting data already provided by a summary endpoint.
- Large responses loading more patient information than necessary.

Use request debouncing for search, cancellation for obsolete requests, appropriate pagination, stable query keys and targeted cache invalidation.

Use existing backend filtering and summary endpoints rather than loading all records into the browser.

Do not add caching blindly. Protected healthcare data must never leak through shared, public or incorrectly scoped caches.

On logout, account changes or permission changes, clear or invalidate the relevant user-specific data. Prevent one user's data from appearing in another user's workspace or session.

Verify that the caching strategy works correctly with real API responses and concurrent updates.

# 6. Fix all loading, error, success and dead-end states

Every important button and interaction must have a defined outcome.

Review for:

- Buttons that do nothing.
- Forms that submit but never show the result.
- Modal dialogs that cannot be closed safely.
- Broken back navigation.
- Dead-end routes.
- Missing not-found pages.
- Unauthorized routes that display blank screens.
- Stale lists after a successful update.
- Failed mutations that leave optimistic state in place.
- Duplicate submissions caused by rapid clicks.
- Missing confirmation for destructive actions.
- Errors that disappear without explanation.
- Infinite loading states.
- Missing empty states.
- Unsupported filters that silently do nothing.
- API failures that crash a whole page.
- Incorrect redirects when switching workspaces.
- Expired sessions that leave protected information visible.

After a failed operation, show a useful explanation and provide a safe recovery path.

After a successful operation, update the relevant UI and navigate appropriately.

Do not show success before the server confirms a consequential action.

# 7. Fix workflow and relationship edge cases

Test the actual application behavior for:

- Two users editing the same referral.
- Stale versions and 409 conflicts.
- Simultaneous assignment changes.
- Clinical reviews returned for correction.
- Missing supporting documents.
- Cancelled and rescheduled appointments.
- No-shows.
- Notes returned repeatedly.
- New note revisions after approval.
- Billing readiness invalidated by changes to supporting information.
- Duplicate claim submission attempts.
- Unknown external claim-submission outcomes.
- Patients with multiple dependent referrals.
- Deactivation of a user who owns active work.
- Records that must not be deleted because historical clinical or billing evidence exists.
- Delayed AI extraction results.
- Background processing failures.
- Duplicate and delayed WebSocket events.
- Retries after network timeouts.

Preserve history, respect workflow gates, and prevent unsafe downstream state.

Do not invent clinical or legal rules. Follow the existing product requirements, and isolate genuine policy questions.

# 8. Improve usability without making the interface childish or complicated

Keep the existing shadcn/ui design system and dashboard.

Improve clarity rather than adding decoration.

Provide:

- Consistent field labels and helpful placeholders.
- Brief descriptions for confusing business fields.
- Tooltips for unfamiliar icons and actions.
- Accessible keyboard navigation and focus indicators.
- Appropriate disabled-state explanations.
- Confirmation dialogs for consequential actions.
- Helpful wording for workflow errors.
- Clear status labels that do not rely on color alone.
- Responsive layouts for desktop and tablet use.
- Accessible contrast and readable text.
- Consistent buttons, badges, cards and spacing.
- Clear distinction between clinical workflow status and billing status.

Use tooltips where an explanation genuinely helps; do not add one to every element.

Use plain English. Avoid overly technical messages such as "OCC invariant violation" when the user needs to know that someone else changed the referral and they must refresh.

Keep internal error details in appropriately protected logs and present a useful, safe message to the user.

# 9. Improve documentation and developer guidance

Documentation should be short, accurate and useful.

Update existing documentation when actual behavior changes.

Document:

- Environment variables and required configuration.
- Local startup and troubleshooting.
- Authentication and session behavior.
- API conventions and error responses.
- Rate-limit behavior where relevant.
- Deployment boundaries.
- Health checks and operational diagnostics.
- How to run tests.
- Known limitations and production blockers.

Use concise comments for non-obvious business rules. Avoid redundant comments that merely repeat the code.

Do not generate multiple overlapping documentation files or another massive implementation guide.

Never document behavior that the code does not actually implement.

# 10. Test the real application

Add or improve tests according to the risks found in the source code.

## Frontend tests

Test validation, login states, workspace switching, protected routes, form submission, loading states, error handling, optimistic updates and safe recovery.

## Backend tests

Test authentication, permission enforcement, input validation, rate limits, document access, workflow gates, concurrency and data lifecycle rules.

## Integration and end-to-end tests

Verify actual user journeys against real API behavior and appropriate test infrastructure.

Test both allowed and denied operations.

Where an integration relies on Redis, PostgreSQL, object storage or a background processor, test the relevant failure behavior instead of assuming a mocked unit test proves it works.

Use synthetic test data only.

Do not disable failing tests or weaken assertions simply to produce a green result.

Run the relevant tests, lint checks, type checks and production builds. Fix failures introduced by your changes.

# 11. Work in a sensible order

Prioritize work in this order:

1. Critical security vulnerabilities and authorization failures.
2. Data integrity, authentication and session handling.
3. Input validation and abuse protection.
4. Broken end-to-end workflows and data exposure.
5. Duplicate requests, caching and network efficiency.
6. Global loading and error behavior.
7. Accessibility and usability improvements.
8. Documentation and final regression verification.

Fix complete issues in small, testable batches. Continue to the next item without stopping to produce another large report.

Preserve working code. Avoid unnecessary dependency upgrades, wholesale rewrites and unrelated cosmetic changes.

If a specific issue depends on a missing external service or unresolved business decision, document that limitation briefly and continue with independent fixes.

# Definition of done

The hardening pass is complete only when:

- Critical authorization and data-exposure paths have been checked and tested.
- All relevant inputs have consistent client- and server-side validation.
- Rate limits and failure behavior have been verified.
- Authentication, session expiration and permission changes behave correctly.
- Loading, empty, success and error states are coherent.
- Unnecessary API calls have been reduced without breaking freshness or security.
- Core forward and backward referral flows work correctly.
- High-risk lifecycle and retry cases are handled.
- Important buttons and forms do not lead to dead ends.
- Existing tests pass, new regression tests pass, and production builds succeed.
- Remaining real blockers are documented honestly.

Do not claim that every vulnerability is eliminated or that the system is HIPAA-compliant solely because these tasks pass.

## Begin

Inspect the existing implementation and start fixing the highest-risk verified problems.

**Make the application safe, fast, clear and dependable. Change actual code, test actual behavior, and avoid another documentation loop.**