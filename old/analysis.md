# Heals on Wheels — Complete System Design Explained

I’ve reviewed the full 14-page Heals on Wheels: Referral Workflow & Patient Pipeline Portal developer handoff, including the workflow diagrams, Kanban reference, login screen, AI extraction flow, engineering architecture, API contracts, operational rules, delivery plan, and final open-decision list.

The most important thing to understand is that this is not just a Kanban website. It is a role-controlled referral-processing system with an auditable workflow and clinical and billing approval gates.

## 1. The big architectural decisions

Before explaining every page, here are the decisions that make the rest of the system understandable.

One login portal

All employees use the same sign-in page, with unique accounts, MFA, and server-verified permissions. Do not build separate login websites for intake, nurses, clinical reviewers, scheduling, and billing.

One application, role-specific dashboards

Different users see different work queues, metrics, patient details, and actions. Sharing the application does not mean sharing every patient's information.

One workflow, permission-filtered Kanban views

The system has six principal workflow stages. Each role sees the stages and records it is authorized to work with, rather than receiving unrestricted access to every column.

The backend controls the workflow

Dragging a card is only a user-interface action. The server decides whether the user may move the case and whether its required fields, approvals, and documents are complete.

The PDF directly supports these principles through its identity and permission rules, six-stage state machine, drag-and-drop contract, and API specification. The specific dashboard and navigation arrangement below is my recommended way to implement them.&#x20;

Core_Doc.pdf

Core_Doc.pdf



One distinction matters throughout this explanation:

- Specified in the PDF: a requirement explicitly stated in the handoff.
- Recommended completion: a concrete design decision needed because the handoff leaves a behavior, permission, transition, or data rule undefined.
- Product-owner decision: something that cannot safely be assumed, such as which licensed professional may approve a clinical record or which external billing system the company uses.

That distinction prevents us from accidentally treating a sensible design proposal as an existing business rule.

# Part I — Page-by-page explanation of the complete PDF

## Page 1 of 14: What the product is

Source: Cover and workflow diagram

The product is a secure web application that takes a healthcare referral through six operational stages, starting when documents arrive and ending when the billing team submits a claim.

The cover identifies the six stages and their default owners:

### 01

Referral Intake

Intake Specialist

### 02

Clinical Review

Clinical Coordinator / Reviewer

### 03

Scheduling

Office Manager / Scheduler

### 04

NP Visit

Assigned Nurse Practitioner

### 05

Notes Review

Clinical Coordinator / QA Reviewer

### 06

Billing

Billing Coordinator

The cover also promises team login, MFA, Kanban drag-and-drop, AI-assisted referral extraction, staff queues, audit trails, and HIPAA safeguards.

What this means in practice: the application needs to coordinate people, documents, appointments, decisions, tasks, and claim submissions. A board with six columns is only one part of the system.

The cover's visual reference is a schematic UI, not an instruction to copy every detail of the source video.&#x20;

Core_Doc.pdf



## Page 2: Product overview and the most important design rule

This page establishes four fundamental principles.

### A. The primary object is the referral case

A referral case is the central record moving through the application. It links to:

- A patient profile.
- One or more uploaded referral documents.
- Insurance-verification information.
- Assignments and tasks.
- Clinical review decisions.
- Appointment and encounter records.
- Clinical notes and note-review decisions.
- Billing-readiness information and claim references.
- Internal comments and audit events.

For example, one referral might concern a patient who needs a wound-care visit. The patient profile stores the patient's identity; the referral case tracks this particular request; the documents support the request; the appointment represents the scheduled visit; the note records what happened; and the billing case tracks the resulting claim.

Recommended rule: do not put every piece of data in one enormous `referrals` table. Connect separate records using IDs and enforce appropriate relationships.

Also distinguish a patient from a referral: one patient may have several referrals over time. Creating a new referral should not automatically create a duplicate patient profile.

### B. There are two independent state dimensions

This is arguably the most important technical requirement in the entire PDF.

| Field            | What it answers                    | Example              |
| ---------------- | ---------------------------------- | -------------------- |
| `pipeline_stage` | Where is the case in the workflow? | `NOTES_QA`           |
| `work_status`    | What is happening with the work?   | `BLOCKED_NEEDS_INFO` |

Consider a case in the Notes QA stage.

- It can be `PENDING` if the reviewer has not started.
- It can be `IN_PROGRESS` while the reviewer checks the note.
- It can be `BLOCKED_NEEDS_INFO` if a required signature is missing.
- It can be `ON_HOLD` if the work has a documented, approved pause.
- It can be `COMPLETED` once that stage's required work is finished.

Those are five different work situations in the same stage.

You must not represent stage and work status with one overloaded field. Otherwise, you will have no clean way to determine where a case is and why it is not progressing.&#x20;

Core_Doc.pdf



### C. Every case has ownership

The document defines a default owner role for each stage and a named assignee.

These are different concepts:

- Owner role: which team is responsible?
- Assigned user: which specific person must act?
- Location/site: which office or service area is responsible?

For example:

`stage = INTAKE`, `assigned_role = INTAKE_SPECIALIST`, `assigned_user_id = user_42`, `site_id = site_03`.

The intake team owns the work, but a particular employee is responsible for the next action.

### D. The last stage has a strict approval gate

An NP completing a visit does not make a referral ready for billing.

The clinical note must be reviewed and approved by an appropriately authorized reviewer, and the required supporting documentation must be complete. Only then can the billing-readiness checks pass.

This rule prevents unreviewed documentation from being sent into the claims process.&#x20;

Core_Doc.pdf



## Pages 3–4: The actual state machine

These pages define the process each case must follow. Every stage has an entry condition, required work, and an exit condition.

The crucial point is that the next stage is determined by successful completion of the current stage's requirements, not just by a user dragging a card.

### Stage 1 — Referral Intake and Eligibility

Owner: Intake Specialist.

How a case enters: a referral arrives through secure document upload, fax ingestion, or manual entry. The AI-assisted upload may create a draft before an active intake case exists.

What the intake employee does:

1. Confirms the patient's identifiers.
2. Records the referral source and referring organization or clinician.
3. Checks the payer, insurance plan, and coverage outcome through a permitted verification process.
4. Checks whether the requested service is in the service area.
5. Checks whether the minimum required packet is present.
6. Reviews and corrects any extracted information.
7. Requests missing documents when necessary.

What allows the case to move forward?

The patient/referral record is confirmed, the coverage outcome is recorded, and the required documents are attached. An approved exception may allow incomplete information to proceed only where the relevant policy permits it.

Real-life example

A hospital sends a referral with the patient's demographics, an insurance card, a clinician's order, and wound information.

The AI extracts the information. The intake specialist confirms the identity and corrects a misread member ID. The coverage result is recorded, and the required documents are attached.

Now the case may proceed to Clinical Review.

If the insurance card is missing, the case does not simply move forward. The employee records what is missing, who must provide it, and when the follow-up is due.

### Stage 2 — Pre-Visit Clinical Review

Owner: Clinical Coordinator / authorized Clinical Reviewer.

Entry condition: a verified intake package exists, or an approved exception allows review to begin.

The reviewer examines clinical appropriateness, the documentation, urgency, wound information, and whether more clarification is required.

The reviewer records an explicit disposition:

- Accept: the referral can proceed to scheduling.
- Return: the referral needs more information or correction.
- Reject: the referral is not accepted, with a reason recorded.

An acceptance must include the authorized reviewer's identity and a timestamp.

Example

The patient has passed intake, but the reviewer discovers that a required clinical order or supporting document is missing.

The reviewer returns the referral with a specific reason. The case goes back to an intake correction workflow. The system records who returned it, when, and why.

If the referral is accepted, the scheduler receives it. A mere change of work status to `COMPLETED` must not substitute for the actual acceptance decision.&#x20;

Core_Doc.pdf



### Stage 3 — Scheduling and Assignment

Owner: Office Manager / Scheduler.

Entry condition: clinical acceptance has been recorded.

The scheduler selects the relevant state or location, assigns an appropriate NP, checks patient/provider availability, schedules the visit, and records communication attempts and their outcomes.

The stage is complete when the appointment is scheduled and acknowledged.

Example

The reviewer accepts the referral on Monday. The scheduler finds an available NP, agrees on a time with the patient, records the appointment, and records that the patient acknowledged it.

The case is now awaiting the NP visit.

A cancelled or rescheduled appointment remains part of this stage's workflow. Its change must be audited; it is not a new referral just because the appointment changed.&#x20;

Core_Doc.pdf



### Stage 4 — NP Visit and Documentation

Owner: the assigned Nurse Practitioner.

Entry condition: an appointment has been scheduled or the visit is confirmed.

The NP records:

- Visit status: completed, no-show, or rescheduled.
- Actual date of service, when applicable.
- Clinical note source.
- Services ordered or performed.
- Supporting clinical documentation.

The exit condition is a completed visit AND submitted documentation.

A scheduled visit is not sufficient to proceed to Notes QA. A completed visit without a submitted note is also insufficient.

Example

The NP attends the appointment, records the date of service, documents the encounter, and uploads or links the note. The case now enters the post-visit clinical review queue.

If the patient does not show, the case must be handled by the exception workflow instead of falsely progressing to note review.

### Stage 5 — Post-Visit Clinical Notes Review

Owner: Clinical Coordinator / authorized Clinical QA Reviewer.

The reviewer checks the completeness of the note, service documentation, provider authentication, signature/order requirements, and the supporting wound/procedure information required by the applicable policy.

There are two principal outcomes:

- Approve: the note and required documentation pass the review.
- Return for correction: the NP must fix a documented problem and resubmit.

Only an approved note can advance the case to billing readiness.

Example

The NP's note describes the visit but lacks a required signature or supporting detail. The QA reviewer returns it with a specific correction request. The NP fixes the note, resubmits it, and the QA reviewer checks it again.

The original note, correction request, revised note, and approval decision must remain traceable. Approval must not overwrite the previous history.

### Stage 6 — Ready for Billing to Billed/Submitted

Owner: Billing Coordinator.

The source distinguishes billing readiness from billing submission.

When the approved documentation reaches billing, the billing coordinator verifies the required payer/authorization details, date of service, provider, codes, attachments, and claim readiness.

After the claim is submitted, the system stores the claim/submission reference and the submission time. The PDF specifies `billing_status = SUBMITTED`; rejections and denials must remain trackable.&#x20;

Core_Doc.pdf



There is a terminology issue worth fixing before implementation:

A submitted claim is not necessarily a paid claim. The document calls the final stage `Ready for Billing -> Billed`, but its explicit outcome is `SUBMITTED`. In the implementation, use precise statuses such as `READY` and `SUBMITTED`, with rejection and denial tracking. Only introduce a `PAID` state if the business wants to track payment and has a reliable source for that information.

# Part II — The complete end-to-end system

## 2. How the website should behave from login to completion

The following is the recommended application flow that connects the page requirements into a single, usable product.

\#chatgpt-mermaid-\_r_rp\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_rp\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_rp\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_rp\_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-\_r_rp\_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_rp\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_rp\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_rp\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_rp\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_rp\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_rp\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_rp\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_rp\_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_rp\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_rp\_ p{margin:0;}#chatgpt-mermaid-\_r_rp\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_rp\_ .cluster-label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_rp\_ .cluster-label span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_rp\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_rp\_ .label text,#chatgpt-mermaid-\_r_rp\_ span{fill:rgb(237, 237, 237);color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_rp\_ .node rect,#chatgpt-mermaid-\_r_rp\_ .node circle,#chatgpt-mermaid-\_r_rp\_ .node ellipse,#chatgpt-mermaid-\_r_rp\_ .node polygon,#chatgpt-mermaid-\_r_rp\_ .node path{fill:rgb(17, 40, 19);stroke:rgb(58, 132, 63);stroke-width:1px;}#chatgpt-mermaid-\_r_rp\_ .rough-node .label text,#chatgpt-mermaid-\_r_rp\_ .node .label text,#chatgpt-mermaid-\_r_rp\_ .image-shape .label,#chatgpt-mermaid-\_r_rp\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_rp\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_rp\_ .rough-node .label,#chatgpt-mermaid-\_r_rp\_ .node .label,#chatgpt-mermaid-\_r_rp\_ .image-shape .label,#chatgpt-mermaid-\_r_rp\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_rp\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_rp\_ .root .anchor path{fill:rgb(175, 175, 175)!important;stroke-width:0;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_rp\_ .arrowheadPath{fill:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_rp\_ .edgePath .path{stroke:rgb(175, 175, 175);stroke-width:1px;}#chatgpt-mermaid-\_r_rp\_ .flowchart-link{stroke:rgb(175, 175, 175);fill:none;}#chatgpt-mermaid-\_r_rp\_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_rp\_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_rp\_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_rp\_ .labelBkg{background-color:rgba(0, 0, 0, 0.5);}#chatgpt-mermaid-\_r_rp\_ .cluster rect{fill:rgb(48, 48, 48);stroke:rgba(255, 255, 255, 0.15);stroke-width:1px;}#chatgpt-mermaid-\_r_rp\_ .cluster text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_rp\_ .cluster span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_rp\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(48, 48, 48);border:1px solid rgba(255, 255, 255, 0.15);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_rp\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_rp\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_rp\_ .icon-shape,#chatgpt-mermaid-\_r_rp\_ .image-shape{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_rp\_ .icon-shape p,#chatgpt-mermaid-\_r_rp\_ .image-shape p{background-color:rgb(0, 0, 0);padding:2px;}#chatgpt-mermaid-\_r_rp\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_rp\_ .image-shape .label rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_rp\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_rp\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_rp\_ .node .neo-node{stroke:rgb(58, 132, 63);}#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_rp\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_rp\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].node .neo-line path{stroke:rgb(58, 132, 63);filter:none;}#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_rp\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_rp\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_rp\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_rp\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_rp\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(140, 223, 173);}#chatgpt-mermaid-\_r_rp\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(140, 223, 173);}#chatgpt-mermaid-\_r_rp\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_rp\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_rp\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(2, 28, 12);stroke:rgb(26, 75, 45);stroke-width:1px;}#chatgpt-mermaid-\_r_rp\_ .node rect,#chatgpt-mermaid-\_r_rp\_ .node circle,#chatgpt-mermaid-\_r_rp\_ .node ellipse,#chatgpt-mermaid-\_r_rp\_ .node polygon,#chatgpt-mermaid-\_r_rp\_ .node path{fill:rgb(0, 55, 22);stroke:rgba(255, 255, 255, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_rp\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_rp\_ .node.mermaid-decision .label-container{fill:rgb(2, 28, 12);stroke:rgb(26, 75, 45);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_rp\_ .edgePaths .flowchart-link{stroke:rgb(175, 175, 175);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_rp\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_rp\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Open Heals on WheelsShared Sign-inCredentials Valid?Show Safe Error or RecoveryMFA VerificationMFA Valid?Load Identity, Roles and ScopeRole-Specific DashboardMy Queue / AuthorizedKanbanOpen or Create ReferralPerform Authorized ActionServer Checks Permission andStage GatesExplain Missing RequirementCommit Change + Audit EventUpdate Assignment, Status,Counts and NotificationsNoYesNoYesBlockedAllowed

This diagram is a recommended application interaction model, not an additional diagram taken from the PDF.

The login gives the user access to the application. It does not automatically grant access to every case or every action. Each action must be separately authorized.

### The core navigation

A practical navigation structure would look like this:

| Route                      | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `/login`                   | The shared sign-in page                                          |
| `/dashboard`               | Role-aware home screen and relevant metrics                      |
| `/referrals`               | Search, filter, and view authorized referrals                    |
| `/referrals/new`           | Create a referral manually or start from an upload               |
| `/referrals/:id`           | Case overview and authorized actions                             |
| `/referrals/:id/documents` | Upload, view, correct, and track document processing             |
| `/schedule`                | Appointments and assignment queue for authorized staff           |
| `/visits`                  | Assigned visit work for NPs                                      |
| `/notes-review`            | Notes awaiting review or correction                              |
| `/billing`                 | Billing readiness, submissions, and exceptions                   |
| `/admin/users`             | User invitations, activation, suspension, and access assignments |
| `/admin/audit`             | Restricted audit-event search                                    |

These routes are a design recommendation rather than a list mandated by the PDF. You can implement additional routes as needed, but the permissions behind them must remain consistent.

### What happens when a user opens a referral?

The case detail page should organize the information into clearly separated sections:

- Overview: referral ID, permitted patient summary, stage, work status, priority, location, assignee, age, and next action.
- Documents: received documents, extracted values, source pages, verification corrections, document versions, and processing status.
- Workflow: current requirements, previous decisions, available next actions, and documented reasons for holds or returns.
- Appointments and encounters: scheduling details and visit records, visible to authorized roles.
- Notes and reviews: submitted notes, revision history, reviewer decisions, and timestamps, subject to role permissions.
- Billing: readiness checklist, submission reference, status, and subsequent corrections or rejection/denial activity, as authorized.
- Activity history: case events and comments that the user is allowed to access.

Do not show every tab to every role by default. Both the UI and the API must enforce visibility and access. Hiding a tab in React is not authorization.

## 3. The login page: exact behavior and design

The login design on page 7 is straightforward: Heals on Wheels — Team Sign In, a work-email field, password or SSO, a secure continuation action, and a statement that MFA is required for authorized workforce members. The same page includes the access/role matrix.&#x20;

Core_Doc.pdf



### Recommended login flow

1. Sign-in screen: the employee enters a work email and password or uses the configured SSO provider.
2. Credential check: the identity service verifies the account. Unknown, inactive, suspended, or revoked users cannot continue.
3. MFA: the employee completes the configured second-factor challenge. MFA recovery and lost-device procedures must also be defined.
4. Access loading: the system loads the user's roles, permitted legal entities, sites, states, and other access scopes.
5. Dashboard routing: the application presents the appropriate dashboard and queues.
6. Session enforcement: idle timeout, session expiration, and reauthentication for suitably sensitive operations are enforced by the server.

### What the login page must not do

It must not have a role dropdown that lets someone choose “Admin,” “NP,” or “Billing” and thereby receive that access. Roles are granted to the account by an authorized administrator and verified by the backend.

A multiple-role employee can be given several explicitly approved roles. The recommended UI is a role/context switcher inside the authenticated application, not a way to select privileges during login. All access and privileged role changes should be auditable.

### What if login fails?

| Situation                        | Recommended result                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Incorrect password               | Generic failure message that does not reveal whether an account exists; apply rate limits               |
| MFA failure                      | Deny access and follow the configured retry/recovery controls                                           |
| Account suspended                | Deny access and direct the user to the authorized internal support process                              |
| Forgotten password               | Use the approved recovery flow                                                                          |
| No assigned role or site access  | Deny access to case data and refer the issue for access provisioning                                    |
| Idle session expired             | Require reauthentication; do not continue displaying protected data as if the session remained valid    |
| Employee leaves the organization | Suspend/revoke access promptly and invalidate active sessions as supported by the identity architecture |

These are recommended authentication requirements. They complete the behavior implied by the PDF's account-management and session-security rules; they are not all individually spelled out on the login-screen mockup.

## 4. How many dashboards do we actually need?

Recommendation: one portal, one sign-in experience, and seven role-based dashboard experiences. Do not build seven independent products.

The document lists seven role categories. A user who explicitly holds multiple roles can receive the corresponding modules within the same application.

| Dashboard experience        | What the user primarily sees                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Intake                      | New referrals, unverified data, missing documents, coverage checks, drafts requiring human verification            |
| Clinical Review             | Referrals awaiting clinical acceptance, clarification requests, clinical decisions due                             |
| Office Manager / Scheduling | Accepted referrals awaiting scheduling, appointments, staffing assignments, visits due, overdue operational work   |
| NP                          | The NP's assigned visits, necessary clinical history, documentation tasks, and notes returned for correction       |
| Clinical QA                 | Notes awaiting review, missing signatures, correction requests, approvals due                                      |
| Billing                     | Approved cases awaiting billing checks, ready-to-submit claims, submissions, and billing exceptions                |
| Admin / Compliance          | User and role management, authorized access-scope management, audit-event search, security/administrative controls |

That is seven dashboard experiences, not seven deployments, login domains, or databases.

The PDF explicitly says the office manager needs an operational dashboard across authorized locations and that other users need an actionable My Queue.&#x20;

Core_Doc.pdf



### A. Intake dashboard

New today

# —

Awaiting intake action

Missing information

# —

Follow-up required

Primary actions: open draft, confirm extracted data, record coverage outcome, request documents, and send a complete case to Clinical Review.

The numbers above are illustrative dashboard components, not real data from the PDF.

### B. Clinical Review dashboard

It should show referrals awaiting a clinical decision, return-for-information items, urgency/priority, stage age, and the reviewer responsible.

Actions: accept, return with a reason, or reject with a reason — only for authorized reviewers.

### C. Office Manager dashboard

This view should prioritize operational oversight: unscheduled accepted referrals, appointment conflicts, staffing assignments, cases due today, overdue work, and aging/held cases across authorized locations.

The office manager may receive broader cross-stage operational counts than an ordinary staff member. That does not automatically grant permission to read every clinical note or document. The PDF explicitly separates operational oversight from authorization to access clinical content.&#x20;

Core_Doc.pdf



### D. NP dashboard

The NP sees assigned visits and the clinical information needed to conduct those visits. They need a clear path to mark a visit's outcome and submit or correct documentation.

The NP should not need access to every referral, every billing record, or the entire organization's workload.

### E. Clinical QA dashboard

This dashboard should prioritize completed visits with submitted notes, pending reviews, returned corrections, and notes approaching their review deadlines.

The interface should clearly distinguish a note that has been submitted from one that has actually been approved.

### F. Billing dashboard

The billing team should see approved cases and the supporting information needed for its billing checks. It should not have the power to approve clinical notes merely because a claim is waiting.

The dashboard should distinguish cases that are ready, submitted, rejected, or denied, rather than treating every record in the Billing column as equivalent.

### G. Admin / Compliance dashboard

This should manage accounts, roles, scopes, access reviews, and permitted audit searches.

Administrative privileges should not automatically reveal all patient information. If an administrative or compliance task legitimately requires access to PHI, the authorization and audit rules must permit it.

# Part III — Who can see what, and who is allowed to do what?

## 5. Role-based access control: the real permission model

The PDF calls for RBAC plus location, state, and legal-entity checks on every API request and document retrieval. In practical terms, you need more than a role field attached to a user.&#x20;

Core_Doc.pdf



For clarity, the table below combines the document's permissions with recommended least-privilege rules.

| Role                       | What they see                                                                                                                                   | What they can do                                                                                                                      | What they cannot do by default                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Intake Specialist          | Intake records, permitted patient identifiers, submitted documents, insurance details, draft extraction data                                    | Verify fields, attach documents, record coverage outcomes, request information, correct intake data, submit a complete intake package | Approve clinical appropriateness, approve post-visit notes, submit claims                                     |
| Clinical Reviewer          | Referrals awaiting clinical disposition and required supporting clinical documents                                                              | Review clinical appropriateness and urgency; accept, return, or reject with documented decisions                                      | Perform billing submission; change clinical records beyond authorized review responsibilities                 |
| Office Manager / Scheduler | Operational queues, authorized-location totals, accepted referrals awaiting scheduling, assignments, appointment information needed for the job | Schedule, reschedule, assign staff, supervise queues, manage operational exceptions within scope                                      | Automatically read all notes or make clinical approval decisions without separate authorization               |
| Nurse Practitioner         | Assigned visits, relevant patient history, encounter details, documentation tasks                                                               | Record visit outcomes, create/submit notes, provide corrections, attach or link supporting documents                                  | Approve their own submitted note when independent review is required; mark a case billing-ready               |
| Clinical QA Reviewer       | Submitted notes, supporting documentation, required signatures/orders, correction tasks                                                         | Approve a qualifying note or return it with a specific reason; record reviewer identity and decision time                             | Submit claims on behalf of billing; bypass required documentation or review conditions                        |
| Billing Coordinator        | Billing-ready records, required approved documentation, payer/authorization details, claim references                                           | Validate readiness, submit claims, store submission references, track permitted rejection/correction/denial outcomes                  | Approve clinical notes, invent missing clinical evidence, silently change clinical documentation              |
| Admin / Compliance         | User and role administration, authorized security/audit information, necessary operational settings                                             | Provision or revoke access, manage approved scopes, examine permitted audit trails                                                    | Read all PHI merely because the account is administrative; override clinical gates without explicit authority |

The last column is a recommended starting policy. The actual legal entity, licensing, clinical supervision, and job responsibilities must be confirmed before production.

### The implementation rule

Every action requires a combination of checks.

A useful conceptual authorization rule is:

`ALLOW = authenticated user + granted permission + permitted scope + valid workflow state + satisfied required fields`

For example, a Billing Coordinator could have the permission `billing.submit_claim`, but the server must still reject submission if the case has not passed note approval and billing readiness.

Similarly, being a Clinical Reviewer does not allow an employee to inspect a patient at a different site or legal entity unless that employee's scope authorizes it.

### Can one person hold multiple roles?

Yes, the PDF explicitly allows multiple roles when they are separately granted.

For example, a sufficiently authorized clinical coordinator may be able to review referrals before visits and conduct notes QA after visits.

Recommended implementation:

- Store role assignments separately from the user record.
- Apply each role's permissions and scope.
- Show the user's authorized work modules.
- Enforce the same server-side checks regardless of which module the user opened.
- Audit sensitive role/context switches and privileged actions.

Do not implement this as a single string such as `user.role = "admin"` if one employee may have several responsibilities.

## 6. Who can see the Kanban board?

This is one of your main design questions, and the answer is not every user automatically gets the same six-column board.

Page 5 shows six stages, their counts, example cards, and queue links. Page 6 requires authorized movement and server validation. It does not grant universal visibility of every case.&#x20;

Core_Doc.pdf

Core_Doc.pdf



### Recommended Kanban visibility

| Role               | Recommended board/queue view                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Intake             | Intake cases, drafts needing verification, returned intake tasks                                   |
| Clinical Reviewer  | Cases awaiting clinical disposition and authorized return tasks                                    |
| Office Manager     | Scheduling queue, assignment work, authorized operational stage counts, cross-site workload totals |
| NP                 | Assigned visit cases and documentation corrections                                                 |
| Clinical QA        | Notes awaiting review and cases returned for NP correction                                         |
| Billing            | Approved cases in billing readiness/submission work                                                |
| Admin / Compliance | Administration and audit work; ordinary patient Kanban access is not granted by default            |

Users who hold multiple approved roles can access the appropriate combined set of queues.

### Do we show unauthorized columns as empty?

Usually, no. Showing a column and its count can itself expose operational or sensitive information.

Prefer to show only authorized columns and metrics, based on the user's role, purpose, and scope. A manager who has operational authorization for all six stages may see all six sets of counts, but the details on individual cards and case pages still need their own authorization checks.

For every Kanban card, display the minimum useful information, such as:

- A case identifier.
- Only the patient identifier/summary necessary for that role.
- Stage and work status.
- Assigned person or team.
- Location, when the user is authorized to see it.
- Elapsed time or due/overdue indicator.
- The next required action, when relevant.

No card should rely on color alone. Every status must have a visible text label.

### The Kanban board is not the workflow engine

The browser is allowed to request a move. The server makes the decision.

If a user drags a case to Billing but has no permission to transition that case, the backend rejects the request and the interface restores the original card position. If a gate fails, the response explains the missing requirement without exposing information the user is not authorized to see.

This is why the system needs an operational API even if its main screen looks like a relatively ordinary board.

# Part IV — Forward states, backward states, and every transition

## 7. The six-column board is not enough: define the full state model

The PDF separates `pipeline_stage` from `work_status`. The design should preserve that separation and distinguish it from clinical dispositions and billing outcomes.

I recommend four dimensions.

| Dimension        | Recommended values                                                            | Purpose                                                               |
| ---------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `pipeline_stage` | `INTAKE`, `CLINICAL_REVIEW`, `SCHEDULING`, `NP_VISIT`, `NOTES_QA`, `BILLING`  | The case's location in the main workflow                              |
| `work_status`    | `PENDING`, `IN_PROGRESS`, `ON_HOLD`, `BLOCKED_NEEDS_INFO`, `COMPLETED`        | The state of work inside the current stage                            |
| `case_outcome`   | `ACTIVE`, `REJECTED`, `PATIENT_DECLINED`, `DUPLICATE`, `DISCHARGED`, `CLOSED` | Whether the case remains active or has reached a recorded disposition |
| `billing_status` | `NOT_READY`, `READY`, `SUBMITTED`, `REJECTED`, `DENIED`                       | The state of billing work after clinical approval                     |

The first two fields directly follow the PDF. The additional case-outcome values complete the exception-handling model described on page 12. The billing statuses incorporate the explicitly described readiness and submission outcomes, while `NOT_READY` and the more precise distinctions are recommended implementation details.&#x20;

Core_Doc.pdf



A `PAID` billing status may be added later if payment tracking is in scope and has an authoritative source. It should not be inferred from `SUBMITTED`.

### Example: one case, several different states over time

| Event                              | `pipeline_stage`  | `work_status` | `billing_status` |
| ---------------------------------- | ----------------- | ------------- | ---------------- |
| Referral confirmed                 | `INTAKE`          | `COMPLETED`   | `NOT_READY`      |
| Waiting for reviewer               | `CLINICAL_REVIEW` | `PENDING`     | `NOT_READY`      |
| Reviewer working                   | `CLINICAL_REVIEW` | `IN_PROGRESS` | `NOT_READY`      |
| Accepted, awaiting scheduler       | `SCHEDULING`      | `PENDING`     | `NOT_READY`      |
| NP visit completed, note submitted | `NOTES_QA`        | `PENDING`     | `NOT_READY`      |
| QA reviewer approves               | `BILLING`         | `PENDING`     | `READY`          |
| Billing submits claim              | `BILLING`         | `COMPLETED`   | `SUBMITTED`      |

The exact work status immediately after entry to a stage is an implementation choice. The example uses `PENDING` as the default. A case moves to a new stage only after its transition succeeds, and the new stage's work starts independently.

Notice that `work_status = COMPLETED` during Intake does not mean the entire referral is closed. It means that the mandatory work in that stage has been completed.

## 8. The correct forward transition flow

\#chatgpt-mermaid-\_r_sl\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_sl\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_sl\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_sl\_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-\_r_sl\_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_sl\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_sl\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_sl\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_sl\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_sl\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_sl\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_sl\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_sl\_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_sl\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_sl\_ p{margin:0;}#chatgpt-mermaid-\_r_sl\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_sl\_ .cluster-label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_sl\_ .cluster-label span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_sl\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_sl\_ .label text,#chatgpt-mermaid-\_r_sl\_ span{fill:rgb(237, 237, 237);color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_sl\_ .node rect,#chatgpt-mermaid-\_r_sl\_ .node circle,#chatgpt-mermaid-\_r_sl\_ .node ellipse,#chatgpt-mermaid-\_r_sl\_ .node polygon,#chatgpt-mermaid-\_r_sl\_ .node path{fill:rgb(17, 40, 19);stroke:rgb(58, 132, 63);stroke-width:1px;}#chatgpt-mermaid-\_r_sl\_ .rough-node .label text,#chatgpt-mermaid-\_r_sl\_ .node .label text,#chatgpt-mermaid-\_r_sl\_ .image-shape .label,#chatgpt-mermaid-\_r_sl\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_sl\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_sl\_ .rough-node .label,#chatgpt-mermaid-\_r_sl\_ .node .label,#chatgpt-mermaid-\_r_sl\_ .image-shape .label,#chatgpt-mermaid-\_r_sl\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_sl\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_sl\_ .root .anchor path{fill:rgb(175, 175, 175)!important;stroke-width:0;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_sl\_ .arrowheadPath{fill:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_sl\_ .edgePath .path{stroke:rgb(175, 175, 175);stroke-width:1px;}#chatgpt-mermaid-\_r_sl\_ .flowchart-link{stroke:rgb(175, 175, 175);fill:none;}#chatgpt-mermaid-\_r_sl\_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_sl\_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_sl\_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_sl\_ .labelBkg{background-color:rgba(0, 0, 0, 0.5);}#chatgpt-mermaid-\_r_sl\_ .cluster rect{fill:rgb(48, 48, 48);stroke:rgba(255, 255, 255, 0.15);stroke-width:1px;}#chatgpt-mermaid-\_r_sl\_ .cluster text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_sl\_ .cluster span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_sl\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(48, 48, 48);border:1px solid rgba(255, 255, 255, 0.15);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_sl\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_sl\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_sl\_ .icon-shape,#chatgpt-mermaid-\_r_sl\_ .image-shape{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_sl\_ .icon-shape p,#chatgpt-mermaid-\_r_sl\_ .image-shape p{background-color:rgb(0, 0, 0);padding:2px;}#chatgpt-mermaid-\_r_sl\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_sl\_ .image-shape .label rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_sl\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_sl\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_sl\_ .node .neo-node{stroke:rgb(58, 132, 63);}#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_sl\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_sl\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].node .neo-line path{stroke:rgb(58, 132, 63);filter:none;}#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_sl\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_sl\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_sl\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_sl\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_sl\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(140, 223, 173);}#chatgpt-mermaid-\_r_sl\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(140, 223, 173);}#chatgpt-mermaid-\_r_sl\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_sl\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_sl\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(2, 28, 12);stroke:rgb(26, 75, 45);stroke-width:1px;}#chatgpt-mermaid-\_r_sl\_ .node rect,#chatgpt-mermaid-\_r_sl\_ .node circle,#chatgpt-mermaid-\_r_sl\_ .node ellipse,#chatgpt-mermaid-\_r_sl\_ .node polygon,#chatgpt-mermaid-\_r_sl\_ .node path{fill:rgb(0, 55, 22);stroke:rgba(255, 255, 255, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_sl\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_sl\_ .node.mermaid-decision .label-container{fill:rgb(2, 28, 12);stroke:rgb(26, 75, 45);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_sl\_ .edgePaths .flowchart-link{stroke:rgb(175, 175, 175);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_sl\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_sl\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Draft from upload or manualentry1. Intake and Eligibility2. Clinical Review3. Scheduling4. NP Visit5. Notes QA6. BillingBilling status: SUBMITTEDRecorded rejected outcomeBilling exception and follow-upVerified packet or approvedexceptionAccepted and signed offAppointment scheduled andacknowledgedVisit completed anddocumentation submittedNote approved and checklistpassedClaim submitted and referencestoredReturn with reasonReject with reasonNo show or rescheduleCorrection requiredClaim rejected or denied

The return arrows and exception branches above are the recommended completion of the specified workflow. Rejection, appointment exceptions, and note corrections are explicitly identified in the document; the precise technical routing for each is defined below.

### Transition table

| From            | To                | Required gate                                                                 |
| --------------- | ----------------- | ----------------------------------------------------------------------------- |
| Draft           | Intake            | Human-verified draft is accepted as an active intake case                     |
| Intake          | Clinical Review   | Confirmed record, coverage outcome, and required packet or approved exception |
| Clinical Review | Scheduling        | Qualified reviewer accepts and records identity/time                          |
| Scheduling      | NP Visit          | Appointment scheduled and acknowledged, with an authorized NP assignment      |
| NP Visit        | Notes QA          | Visit is completed and required documentation submitted                       |
| Notes QA        | Billing           | Qualified reviewer approves the note and billing checklist passes             |
| Billing         | Submitted outcome | Authorized billing user confirms submission and records reference/time        |

The backend must validate all these conditions, including when a transition comes from a direct API call, integration, or background process rather than the Kanban board.

## 9. Backward states: when should a case move backward?

This is where the implementation can easily become inconsistent if you do not define explicit rules.

A backward transition is not simply changing the stage dropdown to an earlier value. It is a documented workflow event with a reason, an owner, requirements for correction, and a path back into the forward process.

Here are the recommended rules.

| Scenario                                       | Backward/alternate action                                                                                            | Who handles it?                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Required intake information is missing         | Keep the case in Intake and mark it blocked; if it was already in Clinical Review, return it to Intake with a reason | Intake Specialist                                    |
| Clinical review needs clarification            | Return to Intake or a designated clarification task according to the cause                                           | Intake Specialist or authorized reviewer             |
| Clinical reviewer rejects the referral         | Record a rejected terminal outcome; do not endlessly move it between columns                                         | Authorized Clinical Reviewer                         |
| Appointment is cancelled or needs rescheduling | Keep scheduling as the work stage until another valid appointment is arranged                                        | Scheduler                                            |
| NP marks the visit as no-show                  | Route the case back to Scheduling for follow-up and rescheduling, if appropriate                                     | Scheduler                                            |
| NP documentation is incomplete                 | Return the case from Notes QA to NP Visit with a specific correction request                                         | NP                                                   |
| QA discovers a missing required signature      | Return to NP correction unless the approved policy explicitly assigns a different person to rectify it               | NP / authorized signing clinician                    |
| Claim submission fails                         | Keep the case in Billing with a submission/error task; do not move it to an earlier clinical stage                   | Billing Coordinator                                  |
| Claim is rejected or denied                    | Record the specific billing outcome and assign the follow-up task within the billing workflow                        | Billing Coordinator or authorized billing specialist |

### What happens during a return?

A proper correction loop should work as follows:

1. The authorized reviewer selects Return for correction.
2. The user provides a required reason and, where applicable, the specific missing field or document.
3. The system records the previous stage/status and the return decision in the audit trail.
4. The case moves to the permitted correction destination, and the correction task is assigned to the responsible person.
5. The recipient fixes the issue and resubmits the work.
6. The case re-enters the original review gate, where the reviewer must review it again.

For a note correction, the recommended destination is the NP Visit stage, followed by Notes QA on resubmission. The original QA decision is retained in the history.

The same logic applies to a clinical clarification that is genuinely an intake responsibility, except the correction returns to Intake.

### Why should claim rejection not send a case back to the NP?

Because the type of failure matters.

A claim rejection can arise from claim formatting, eligibility/authorization issues, code corrections, or other billing problems. It does not automatically indicate that the NP's clinical note is wrong.

A denial might require a clinical documentation correction, but the system should route that specific request to the authorized party under a documented reason, not blindly move every denial to Stage 4.

That preserves accountability and prevents inappropriate clinical or billing status changes.

## 10. What does each work status actually mean?

The page 6 status system is about work progression, not workflow position.&#x20;

Core_Doc.pdf



| Work status          | Meaning                                                      | Required behavior                                      |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `PENDING`            | Work is waiting to be started                                | Show the responsible person/team and due time          |
| `IN_PROGRESS`        | Work is actively being processed                             | Track its age and current owner                        |
| `ON_HOLD`            | Work has a legitimate temporary pause                        | Require hold reason and next review date               |
| `BLOCKED_NEEDS_INFO` | A necessary requirement is missing or a correction is needed | Require a reason, action owner, and next action        |
| `COMPLETED`          | Mandatory tasks in the current stage are finished            | Enable a transition only if all other stage gates pass |

The recommended implementation treats hold and blockage differently:

- On hold: work is deliberately paused, with a valid reason and future review.
- Blocked: a prerequisite prevents the work from advancing.

For example, a scheduler may have no response from a patient and need a follow-up date, while a clinical reviewer may be blocked because a required supporting document is missing. Both situations need visibility and ownership, but the reason and resolution are different.

The PDF explicitly requires a reason and next review date for a hold and a structured reason for a blocked movement.&#x20;

Core_Doc.pdf



# Part V — Real-life example from first upload to submitted claim

## 11. A standard successful referral

Consider a fictional case called `R-1047`. The identifier is illustrative; it is not a real patient's data.

Monday morning — referral arrives

An intake specialist uploads the referral documents. The system stores them securely, scans them, and creates an editable draft. No active case is finalized until a staff member verifies the extracted information.

Intake — human verification

The specialist corrects an incorrectly extracted insurance identifier, verifies the required packet, and records a coverage outcome. The active case is routed to Clinical Review.

Clinical Review — acceptance

An authorized reviewer examines the supporting documentation and accepts the referral, recording their decision and timestamp. The case becomes available to the scheduler.

Scheduling — appointment confirmed

The scheduler assigns an eligible NP, books the appointment, records communication attempts, and records acknowledgement. The case awaits the visit.

NP Visit — documentation submitted

The NP marks the visit completed, records the actual date of service, submits the note, and attaches or links required supporting documents. The case enters Notes QA.

Notes QA — reviewer approval

The qualified reviewer verifies that the note and the required supporting materials meet policy. The reviewer records approval. Only after the billing checklist passes can the case become billing-ready.

Billing — claim submission

The billing coordinator checks the required billing details, submits the claim, and records the submission reference and time. The claim status becomes `SUBMITTED`.

That is the complete happy path. The system should keep track of what happened at every stage, who handled it, which requirements passed, and the current next action.

### When do notifications happen?

Page 12 specifies automated routing when a referral arrives, clinical acceptance occurs, a visit is confirmed, a note is submitted, a note is approved, or a gate fails.

The recommended notification behavior is:

- Notify the new owner or queue when work is assigned.
- Notify the responsible person when something is returned.
- Remind responsible users of approaching deadlines.
- Escalate aging or held cases based on configured thresholds.
- Keep PHI out of ordinary email/SMS notifications; send only the minimum necessary notification and use the authenticated portal to view the case.

## 12. What if something happens outside the happy path?

These are not rare UI edge cases. They are part of the core workflow and are explicitly referenced on page 12.&#x20;

Core_Doc.pdf



| Problem                              | Correct system behavior                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Missing documents at intake          | Keep the intake work visible as blocked; record the missing item, requested party, owner, and follow-up date                       |
| Coverage cannot be verified          | Record `PENDING` verification or an appropriate blocked state; do not claim eligibility is confirmed                               |
| Out of network                       | Record the result and route to an authorized policy-based decision; do not assume it automatically means rejection                 |
| Referral not accepted clinically     | Record the rejection reason and authorized review decision; preserve the case history                                              |
| Patient declines                     | Record the decline, who recorded it, when, and the applicable outcome; do not delete the referral                                  |
| Appointment cancelled                | Preserve the cancelled appointment record and audit event; return the operational work to Scheduling                               |
| Patient does not show                | Record the no-show; route to rescheduling or authorized closure, as applicable                                                     |
| NP has not submitted the note        | Keep the documentation task visible; do not route the case to billing                                                              |
| QA requests correction               | Record the reason and assign the correction; retain the original review result                                                     |
| Two users edit a case simultaneously | Use version checks/optimistic locking; reject or reconcile a stale edit instead of silently overwriting changes                    |
| Referral may be a duplicate          | Flag a suspected match, let an authorized user review it, and preserve linkage/history; do not merge charts automatically          |
| Claim submission fails               | Retain billing responsibility, store the failure information without leaking PHI, and permit an authorized retry                   |
| Claim is rejected or denied          | Record the separate billing result and assign follow-up; do not mark it successfully paid or erase the submitted claim's history   |
| User lacks permission                | Reject the operation server-side, record appropriate security events, and expose no protected data the user is not entitled to see |
| A service or background job fails    | Preserve the current case state, surface a recoverable error/task, and avoid partial updates to related records                    |

### What if the case must be reopened?

The PDF does not define a complete reopening policy. I recommend treating reopening as an explicit, permission-controlled action.

The reopening operation should require:

- A documented reason.
- The authorized requester/approver, where required.
- The destination stage and responsible owner.
- The stage/version from which the case was reopened.
- A complete audit entry and any notification required by policy.

Do not let a user simply edit a terminal outcome from `REJECTED` to `ACTIVE`. A reopened case should preserve the prior disposition and create a new, traceable state transition.

For a rejected claim, a retry/correction task usually belongs within Billing; it should not reopen the entire clinical referral unless the underlying problem actually requires clinical or documentation work.

### What if information becomes invalid after approval?

This also needs a deliberate rule.

A downstream change that affects an earlier gate cannot be allowed to silently bypass that gate. For example, a correction to a required clinical note after approval should create a documented revision and trigger the appropriate re-review if policy requires it. Likewise, a changed insurance/authorization result may require a fresh billing-readiness check.

The implementation should not assume every edit must restart the entire workflow. It should determine which prior decisions the changed field invalidates, then require the applicable re-validation.

# Part VI — AI document processing and manual corrections

## 13. Page 8: What happens when a document is uploaded?

The PDF specifies four steps: upload, extract, human review, and create the patient/referral case.&#x20;

Core_Doc.pdf



\#chatgpt-mermaid-\_r_ts\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_ts\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_ts\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_ts\_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-\_r_ts\_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_ts\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_ts\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_ts\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_ts\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_ts\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_ts\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_ts\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_ts\_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_ts\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_ts\_ p{margin:0;}#chatgpt-mermaid-\_r_ts\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_ts\_ .cluster-label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_ts\_ .cluster-label span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_ts\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_ts\_ .label text,#chatgpt-mermaid-\_r_ts\_ span{fill:rgb(237, 237, 237);color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_ts\_ .node rect,#chatgpt-mermaid-\_r_ts\_ .node circle,#chatgpt-mermaid-\_r_ts\_ .node ellipse,#chatgpt-mermaid-\_r_ts\_ .node polygon,#chatgpt-mermaid-\_r_ts\_ .node path{fill:rgb(17, 40, 19);stroke:rgb(58, 132, 63);stroke-width:1px;}#chatgpt-mermaid-\_r_ts\_ .rough-node .label text,#chatgpt-mermaid-\_r_ts\_ .node .label text,#chatgpt-mermaid-\_r_ts\_ .image-shape .label,#chatgpt-mermaid-\_r_ts\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_ts\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_ts\_ .rough-node .label,#chatgpt-mermaid-\_r_ts\_ .node .label,#chatgpt-mermaid-\_r_ts\_ .image-shape .label,#chatgpt-mermaid-\_r_ts\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_ts\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_ts\_ .root .anchor path{fill:rgb(175, 175, 175)!important;stroke-width:0;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_ts\_ .arrowheadPath{fill:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_ts\_ .edgePath .path{stroke:rgb(175, 175, 175);stroke-width:1px;}#chatgpt-mermaid-\_r_ts\_ .flowchart-link{stroke:rgb(175, 175, 175);fill:none;}#chatgpt-mermaid-\_r_ts\_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_ts\_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_ts\_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_ts\_ .labelBkg{background-color:rgba(0, 0, 0, 0.5);}#chatgpt-mermaid-\_r_ts\_ .cluster rect{fill:rgb(48, 48, 48);stroke:rgba(255, 255, 255, 0.15);stroke-width:1px;}#chatgpt-mermaid-\_r_ts\_ .cluster text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_ts\_ .cluster span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_ts\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(48, 48, 48);border:1px solid rgba(255, 255, 255, 0.15);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_ts\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_ts\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_ts\_ .icon-shape,#chatgpt-mermaid-\_r_ts\_ .image-shape{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_ts\_ .icon-shape p,#chatgpt-mermaid-\_r_ts\_ .image-shape p{background-color:rgb(0, 0, 0);padding:2px;}#chatgpt-mermaid-\_r_ts\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_ts\_ .image-shape .label rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_ts\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_ts\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_ts\_ .node .neo-node{stroke:rgb(58, 132, 63);}#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_ts\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_ts\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].node .neo-line path{stroke:rgb(58, 132, 63);filter:none;}#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_ts\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_ts\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ts\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_ts\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ts\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(140, 223, 173);}#chatgpt-mermaid-\_r_ts\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(140, 223, 173);}#chatgpt-mermaid-\_r_ts\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_ts\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_ts\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(2, 28, 12);stroke:rgb(26, 75, 45);stroke-width:1px;}#chatgpt-mermaid-\_r_ts\_ .node rect,#chatgpt-mermaid-\_r_ts\_ .node circle,#chatgpt-mermaid-\_r_ts\_ .node ellipse,#chatgpt-mermaid-\_r_ts\_ .node polygon,#chatgpt-mermaid-\_r_ts\_ .node path{fill:rgb(0, 55, 22);stroke:rgba(255, 255, 255, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_ts\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_ts\_ .node.mermaid-decision .label-container{fill:rgb(2, 28, 12);stroke:rgb(26, 75, 45);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_ts\_ .edgePaths .flowchart-link{stroke:rgb(175, 175, 175);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_ts\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_ts\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Secure document uploadEncryption and malware checkOCR and documentclassificationExtract structured fields withprovenanceConfidence and consistencychecksHuman verifies suggestedfieldsFlag for human correctionStaff confirms draft?Keep draft pending or requestcorrectionCreate or link patient andactive referralAssign Intake queueHigh confidence, no conflictsLow confidence or conflictingdataNoYes

This diagram shows a recommended detailed implementation of the PDF's four-step pipeline.

### Step 1 — Upload

An employee drops one or more documents into the secure upload area.

The system must validate the file type and size, check for malware, store the files in protected object storage, and associate the documents with the correct intake draft. Uploading must not make a document publicly accessible.

### Step 2 — Extract

An OCR/document-processing service identifies the document type and extracts candidate fields, including:

| Category            | Fields from the PDF                                                                  |
| ------------------- | ------------------------------------------------------------------------------------ |
| Patient             | Legal name, date of birth, phone, address                                            |
| Insurance           | Payer, plan, member ID, group ID                                                     |
| Clinical            | Diagnosis, wound site, relevant history                                              |
| Referral            | Source, referring organization/clinician, referral date, requested service, priority |
| Documents           | Document type, source, page, confidence, notes/orders/wound images                   |
| Supporting evidence | Presence of signatures/orders and relevant source pages                              |

The system should store the document and its extraction results separately. A document is evidence; an extracted value is a claim about that evidence.

### Step 3 — Human review

Each extracted value needs enough context to be verifiable.

For example, suppose the document contains an insurance member ID of `AB123456`, but the AI reads `AB12345G`.

The interface should show the proposed value, the source page/snippet, the confidence level, and an editable field. The intake specialist can correct the extracted value and the system records the correction and its provenance.

The PDF explicitly requires confidence information, editable corrections, and source snippets/pages for human verification.

### Step 4 — Create or link the patient and referral

After authorized staff confirm the draft, the system creates the active referral case and either links the correct patient profile or creates a new one when appropriate.

A detected duplicate must not trigger an automatic chart merge. The system should suggest a possible match and route it for authorized human confirmation.

### What must AI never decide on its own?

According to the handoff, AI must not independently determine:

- Insurance eligibility.
- Medical necessity.
- A wound diagnosis.
- Clinical coding.
- Referral acceptance.

The AI's job here is to help structure information, not to replace an authorized professional's decision.&#x20;

Core_Doc.pdf



### AI failure cases you must implement

| Failure                                           | Recommended response                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| OCR cannot read a page                            | Mark extraction incomplete; allow authorized manual entry or retry                                     |
| Confidence is low                                 | Flag the affected fields for human verification                                                        |
| The document contains conflicting patient details | Stop automatic matching; ask an authorized user to resolve the discrepancy                             |
| Required fields are missing                       | Keep the draft incomplete or blocked; show exactly what is missing                                     |
| Processing takes too long                         | Show a processing state and provide controlled retry rather than creating duplicate cases              |
| Extraction service is unavailable                 | Preserve the securely stored source document and enqueue/retry processing without exposing it publicly |
| An upload appears to be a duplicate               | Suggest a match for review; do not merge records automatically                                         |

### A practical data model for this feature

You will likely need:

- `ReferralDocument`: storage reference, type, upload information, processing status.
- `ExtractionJob`: processing state, attempts, service reference, error category.
- `ExtractedField`: field name, candidate value, source page/snippet, confidence, verification state.
- `FieldCorrection`: previous value, corrected value, authorized actor, timestamp, reason where required.
- `ReferralCase` and `Patient`: the confirmed records created or linked after the human verification step.

These are recommended supporting records that make the document's provenance and correction requirements implementable.

# Part VII — Security: what the application must protect

## 14. Page 9: The security baseline is a production gate

The PDF does not claim the product is already compliant. It states that HIPAA obligations require approved vendors, business associate agreements where applicable, policies, risk analysis, workforce training, and continuing operational controls. Production use with real patient information is blocked until the specified security reviews and approvals are completed.&#x20;

Core_Doc.pdf



The document describes six areas.

Access and auditing. Require MFA and unique accounts, enforce least privilege and session expiry, and audit relevant viewing, downloading, editing, exporting, disclosure, and state-change events.

Encryption and keys. Encrypt connections, databases, documents, backups, and other required storage. Protect secrets and managed keys. Do not place plaintext PHI in application logs.

Vendor governance. Review service providers that handle PHI, including hosting, OCR/AI, fax, and message delivery. Obtain the appropriate agreements and validate their actual service scope and subprocessors.

Secure operations. Establish vulnerability management, incident and breach-assessment procedures, disaster recovery, workforce training, access termination, and recurring reviews.

Minimum necessary. Every role receives only the patient information required for its job. Ordinary browser analytics, unsecured notifications, and external crash-reporting tools must not receive raw PHI.

Data lifecycle. Define retention and deletion rules, record integrity, backup restoration, data scope/isolation, export controls, and secure disposal.

### Example: the NP downloads a note

The server first authenticates the NP and checks their permissions and permitted scope for that case and document. It then authorizes the download, records the applicable access event, and delivers the file through protected storage/access mechanisms.

A URL must not function as a substitute for authorization. A person who copies a document URL must not automatically gain access to that document.

### How this affects development

Use synthetic patient data while building and testing the application. The page 13 acceptance criteria explicitly require the MVP to prove its workflow with synthetic test patients before real PHI is allowed.

Do not regard “we use HTTPS” or “the database is encrypted” as sufficient evidence that the production system has met the document's security gate. The organization still needs to approve vendors, controls, policies, and operational readiness.

# Part VIII — Engineering architecture, data, and APIs

## 15. Page 10: The recommended technology architecture

The handoff suggests a stack; it does not mandate particular vendors. Its recommended structure is:

### 1. Web client

Next.js / React + TypeScript · accessible Kanban · role-aware views

### 2. Identity and API

SSO / OIDC + MFA · NestJS or FastAPI · authorization · input validation

### 3. Workflow engine

Transition gates · assignment routing · SLA/escalation jobs · audit events

### 4. Data and files

PostgreSQL · encrypted object storage · background queues · key management

### 5. Integrations

Approved OCR/AI · eligibility clearinghouse · EHR · billing export

This follows the structure suggested on page 10.&#x20;

Core_Doc.pdf



### Recommended implementation choices

Given the PDF's suggested stack, a sensible implementation is:

- Frontend: Next.js, TypeScript, React, and an accessible component system; a Kanban library such as the referenced `dnd-kit` can provide drag interactions.
- Backend: NestJS is a reasonable choice for a TypeScript full-stack team, although the PDF also permits FastAPI.
- Database: PostgreSQL for structured workflow records and transactions.
- Object storage: a protected, encrypted storage service for documents rather than public web assets.
- Queue/workers: background processing for OCR, AI extraction, notifications, retries, and SLA checks.
- Identity: an appropriately secured SSO/OIDC provider with MFA and account-lifecycle management.
- Integrations: add only those that are actually contracted, supported, and approved for the intended data.

The PDF does not specify the precise hosting provider, ORM, queue implementation, or identity vendor. Those choices should be made based on the security controls, integration requirements, operating environment, and organizational procurement decisions.

## 16. The core data entities and what each one stores

Page 10 names the following entities. Their exact columns and relationships must be finalized in the data dictionary.

| Entity                  | Responsibility                                             |
| ----------------------- | ---------------------------------------------------------- |
| `User`                  | Identity, account state, user profile                      |
| `Role`                  | Named job/permission grouping                              |
| `Permission`            | A specific allowed operation, such as accepting a referral |
| `Site`                  | Authorized office/service location                         |
| `Patient`               | Patient identity and profile                               |
| `ReferralCase`          | The central workflow record                                |
| `ReferralDocument`      | Uploaded or linked documents                               |
| `InsuranceVerification` | Payer/coverage verification outcome and evidence           |
| `ClinicalReview`        | Pre-visit clinical disposition and reviewer details        |
| `Appointment`           | Scheduled visit and communication details                  |
| `Encounter`             | Actual visit and service information                       |
| `NoteReview`            | Approval/return decision for submitted documentation       |
| `BillingCase`           | Billing readiness, submission and billing exceptions       |
| `Assignment`            | Responsible role/user and assignment history               |
| `Comment`               | Internal collaboration, subject to visibility policy       |
| `Task`                  | Actionable follow-up, owner and deadline                   |
| `AuditEvent`            | Traceable system and user actions                          |
| `Notification`          | Recipient, event, delivery state and safe message metadata |

Core_Doc.pdf

### Additional data-model decisions that matter

1\. Role assignments need scope. A role should not automatically grant access to every office or legal entity. Model authorized scope explicitly.

2\. Keep workflow history separately. The current referral row should not be the only record of past decisions. Use auditable events and decision records so the application can reconstruct what happened.

3\. Prevent duplicate patient records. Use normalized identifiers and a review workflow for potential matches. Do not automatically merge charts when fields conflict.

4\. Preserve the distinction between clinical notes and billing records. Billing may require certain approved documentation, but the billing team does not need unrestricted permission to change the source clinical note.

5\. Use transactions for state-changing operations. A stage change, assignment update, and transition audit event should not leave the case half-updated if one operation fails.

## 17. Page 11: The API contract and what each endpoint means

Page 11 explicitly lists seven API patterns plus required referral fields.&#x20;

Core_Doc.pdf



| Endpoint                               | Meaning and required behavior                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/referrals/upload`           | Accept an authorized upload, store it securely, and return a document ID and draft-processing status        |
| `GET /api/referrals`                   | Return a paginated, permission-filtered case list                                                           |
| `PATCH /api/referrals/{id}/transition` | Validate a requested stage/status transition, expected version, action and reason                           |
| `PATCH /api/referrals/{id}/assign`     | Assign work to an authorized user/role within the permitted site                                            |
| `POST /api/referrals/{id}/verify`      | Record human approval/correction of extracted fields with provenance                                        |
| `POST /api/referrals/{id}/reviews`     | Record a qualified review decision, such as accept, return, reject or note approval, with reviewer identity |
| `POST /api/referrals/{id}/billing`     | Process authorized readiness/submission/rejection/correction events and claim references                    |
| `GET /api/audit-events`                | Return audit events only to users authorized to search them                                                 |

The last endpoint makes eight listed endpoint patterns when the seven other patterns are counted individually.

### What should a transition request contain?

The document requires `stage`, `expectedVersion`, `action`, and `reason` in the transition request.

A practical request shape could be:

```
{
  "stage": "NP_VISIT",
  "expectedVersion": 12,
  "action": "RETURN_FOR_CORRECTION",
  "reason": "Required signature is missing"
}
```

This is an illustrative design example, not an existing payload from the PDF.

The backend must derive the actual previous state from the database. It must not trust the client to report arbitrary previous stages or to supply a user identity it can impersonate.

A successful transition should validate permissions and business rules, update the record/version, create an audit event, and trigger the needed queue/notification changes in a transaction or reliable transactional-outbox pattern.

If the version in the request is stale, the server should reject the update and have the client reload or reconcile the latest state. The interface should never silently overwrite someone else's work.

### Why the same rules must apply to every client

The PDF explicitly says the state machine is on the backend, with the Kanban board being only one client of it.

Therefore, the same workflow checks apply whether the request originated from:

- Drag-and-drop on the web.
- A case-detail action button.
- A mobile NP workflow.
- An approved integration.
- An authorized background/batch operation.

Otherwise, users will eventually discover a way to bypass required approvals through an alternate endpoint.

# Part IX — Dashboards, alerts, SLAs, and exceptions

## 18. Page 12: How operations are monitored

The PDF identifies eight operational metrics for the office manager and related teams:

| Dashboard metric | What it measures                                      |
| ---------------- | ----------------------------------------------------- |
| New Today        | Referrals received or not yet assigned                |
| With Intake      | Intake work, including pending insurance verification |
| Clinical Review  | Cases awaiting clinical disposition                   |
| To Schedule      | Accepted referrals awaiting an appointment            |
| Visits Due       | Today's or overdue visits                             |
| Notes to Review  | Post-visit notes and pending corrections              |
| Billing Ready    | Approved cases awaiting billing submission            |
| Aging Cases      | Work at risk of missing a target or currently on hold |

These are counters over filtered cases, not separate workflow stages.&#x20;

Core_Doc.pdf



A dashboard count should ideally be clickable. For example, selecting "Notes to Review" should open the authorized records matching the metric's exact definition.

### Define the metrics precisely

Before implementing dashboard numbers, write down the query/criteria behind each one.

For example:

- New Today: cases received within the applicable reporting day, with rules for time zone and location.
- To Schedule: accepted referrals not yet scheduled or acknowledged.
- Visits Due: appointments with a qualifying visit date/status today or overdue.
- Notes to Review: submitted notes awaiting review or returned corrections, with the two categories separately identifiable.
- Billing Ready: cases where required clinical approvals and the billing-readiness gate have passed.
- Aging Cases: active cases exceeding the configured stage-specific target, overdue deadlines, or approved hold-review dates.

Otherwise, two developers can implement the same counter and produce different numbers.

### Automation rules

The source specifies a series of event-driven routing rules:

1. A new referral is assigned to Intake and the owner is notified.
2. Clinical acceptance routes the case to Scheduling.
3. A confirmed visit routes the case to the assigned NP.
4. A submitted note routes the case to Clinical QA.
5. An approved note makes the case eligible for billing readiness, subject to the checklist.
6. A failed gate routes the work back with a named reason and action owner.
7. A hold or missing-information condition requires a reason, requested party where applicable, follow-up date, and an aging timer.

These should be triggered by successful, committed workflow events, not merely by a browser showing a card in a new location.&#x20;

Core_Doc.pdf



### What are SLAs?

An SLA is the configured service target for completing a task or stage.

The PDF gives an illustrative example: 24 hours for intake verification, followed by the next 24 hours for scheduling after the packet is complete.

That is an example, not necessarily a finalized company policy.

The proper implementation should allow authorized configuration of targets, including different thresholds by stage, location, priority, and applicable operating calendar.

Each tracked task should have a due time, an owner, and a measurable resolution event. A hold must not make overdue work invisible; held cases should still appear in an appropriately filtered operational view.

# Part X — The pages at the end: delivery scope and unresolved decisions

## 19. Page 13: What belongs in the MVP?

The document divides the work into two releases.

### Release 1 — Core operations

The first release must demonstrate that the entire core workflow works, including:

- Invite-only sign-in, MFA, user administration, role/scope enforcement.
- Document upload, AI-assisted extraction, human validation, patient/referral creation.
- A six-stage Kanban board with counts, statuses, and blocked-move explanations.
- Scheduling, visit completion, QA approval/return, billing readiness, and claim submission tracking.
- Searchable audit events for authorized reviewers.
- Case search/filtering, preserved notes/missing-document reasons, secure notifications.
- No PHI leaks through public links, logs, analytics, or unauthorized sessions.

The system must be demonstrable with synthetic patient records before the production security gate is lifted.&#x20;

Core_Doc.pdf



### Release 2 — Optional expansion

The PDF identifies these as optional extensions:

- Insurance eligibility clearinghouse integration.
- EHR integration or clinical note synchronization.
- Claims platform integration.
- Rejection/denial follow-up.
- Business-intelligence reporting.
- Mobile NP workflows.

It also expects source code, deployment scripts, a data dictionary, security tests, a runbook, and administrator training.&#x20;

Core_Doc.pdf



### Recommended implementation order

I would build the software in this order, rather than creating the Kanban first and discovering the workflow problems afterward.

1. Data model and permissions: users, scopes, patient/referral entities, audit records, and clear enums for workflow states.
2. Backend state machine: implement every stage gate, permitted forward transition, return route, exception, and version check.
3. Authentication and authorization: shared login, MFA/SSO integration, invitations, role assignments, site/tenant scope, session enforcement.
4. Case-detail interface and queues: create the usable Intake, Clinical, Scheduling, NP, QA, Billing, and Admin views.
5. Kanban interactions: implement drag-and-drop as a client for the existing server transition API, with rejection explanations and rollback behavior.
6. Document pipeline: secure upload, asynchronous extraction, human verification, provenance, and safe retry behavior.
7. Operational automation: assignments, counters, notifications, task deadlines, aging, and escalations.
8. End-to-end testing and release gates: test all standard/exception flows, access boundaries, concurrency, audit behavior, and security requirements with synthetic data.

This sequence is a recommendation. Its point is simple: the backend needs a defined workflow and permission model before the UI can safely expose actions.

## 20. Page 14: Which decisions are still missing?

The final page explicitly says several decisions must be confirmed before implementation. This is important because the PDF is a design specification, not evidence that these policies or integrations already exist.&#x20;

Core_Doc.pdf



Here is how I would resolve them for an initial build.

| Open question in the PDF                                                  | Recommended starting decision                                                                                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which legal entities and state offices share the portal?                  | Model tenant/legal entity and site separately. Require an explicit scope policy. Do not assume all sites share the same access boundary.                  |
| Who may approve referrals and notes?                                      | Define the authorized professional roles and any supervision rules before creating approval permissions. The backend should enforce the approved policy.  |
| Do NPs chart in this app or an external EHR?                              | For the MVP, permit documented secure upload/linking of notes only if accepted by the organization. Keep the note source and external reference explicit. |
| Which billing system receives claims?                                     | Make submission a controlled, recorded billing operation. Begin with the approved manual/secure process if necessary; do not fake an API integration.     |
| How is "Billed" confirmed?                                                | Define what counts as submission and the evidence required. Store a submission reference and time. Do not equate submission with payment.                 |
| Which intake sources and payers need integrations first?                  | Begin with supported secure uploads/manual entry, then prioritize integrations according to real referral volume and approved vendor capabilities.        |
| Who can confirm eligibility?                                              | Assign a specific permission to the authorized staff role and define acceptable evidence for manual versus automated verification.                        |
| What are retention, incident-response, SLA, and location-access policies? | Establish an approved configuration/policy before real patient data is used. These should not be invented by the frontend team.                           |

These are concrete starting decisions, not substitutes for the responsible clinical, operational, security, and compliance owners' approval.

# Part XI — The gaps in the PDF and how to close them

## 21. The 16 gaps I would resolve before development

The document establishes a solid workflow outline, but several important implementation decisions are either incomplete or explicitly left open. Here is the gap audit and the recommended resolution.

| #  | Gap                                                                                         | Recommended resolution                                                                                                                       |
| -- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Roles are listed, but the complete permission matrix is missing                             | Define permissions per action, record type, and data scope. Do not rely on role names alone.                                                 |
| 2  | Tenant, legal-entity, state, and site isolation are undecided                               | Define the access boundaries before provisioning users. Every relevant query, API, and document access must enforce them.                    |
| 3  | Exact enum values and permitted transitions are not fully specified                         | Define the stage, work-status, case-outcome, and billing-status enums and the transition matrix described above.                             |
| 4  | Some stage gates are described in prose only                                                | Convert each gate into backend validation rules with explicit required fields and approval conditions.                                       |
| 5  | Rejected, declined, duplicate, discharged, and reopened cases lack detailed lifecycle rules | Introduce structured dispositions, closure reasons, and explicit reopening permissions. Never silently delete cases.                         |
| 6  | NP note creation versus an external EHR is undecided                                        | Build a clear note-source abstraction and use an approved manual/secure linking process until integration is confirmed.                      |
| 7  | Eligibility verification depends on an unspecified source                                   | Record the verification source, outcome, timestamp, evidence/reference, and authorized verifier. Treat unverified information as unverified. |
| 8  | Billing submission and the meaning of "Billed" are ambiguous                                | Separate readiness, submission, rejection/denial, and payment tracking. Store submission references and timestamps.                          |
| 9  | SLA examples are present, but operating policy is not finalized                             | Configure stage-specific targets, business calendars, escalation thresholds, and hold-review rules.                                          |
| 10 | Audit, concurrency, and recovery details are incomplete                                     | Use version checks, atomic state changes, immutable decision/event history, and defined recovery behavior.                                   |
| 11 | Notifications are mentioned without a complete delivery policy                              | Define recipient rules, delivery channels, safe message content, retries, and delivery status. Never include PHI in unsecured messages.      |
| 12 | Comment, note, document, and export visibility is not defined per role                      | Apply purpose-appropriate visibility and authorization to each content type and operation.                                                   |
| 13 | AI extraction failure/retry thresholds are unspecified                                      | Configure confidence thresholds and supported document types; require human review of uncertain or conflicting data.                         |
| 14 | Patient/referral duplication handling is only partially specified                           | Preserve separate patient and referral identities, suggest potential matches, and require confirmation before merging.                       |
| 15 | Dashboard metric definitions are not precise enough for reporting                           | Define the filtering rules and time boundaries for each metric so every dashboard reports consistent counts.                                 |
| 16 | Production security approval is a gate but lacks a detailed release checklist               | Define the required security test evidence, vendor approvals, policies, backup/recovery evidence, and sign-offs before enabling real PHI.    |

The distinction is that some of these points can be resolved through engineering design, while others need the product owner or an authorized clinical/security decision-maker. The document itself flags several of those matters on page 14; the remaining recommendations complete the implementation detail without pretending the unresolved policies are already known.&#x20;

Core_Doc.pdf



## 22. The final state contract I recommend

Before coding the Kanban, create a single backend workflow contract.

For every operation, the contract should specify:

1. Who is authorized to perform it?
2. Which sites, entities, and records may they act on?
3. Which current stage and work status are allowed?
4. Which fields, documents, or approvals are required?
5. What stage/status/outcome changes occur?
6. Who becomes responsible for the next action?
7. What audit event is written?
8. What happens if validation, persistence, or notification fails?

For example, `approve_note` should not be a generic update that accepts any arbitrary `pipeline_stage`.

It should enforce the specific rules for that decision:

- The user has the required note-review permission.
- The relevant record is inside their authorized scope.
- The current case is awaiting the appropriate review.
- The required documentation is available.
- Any configured approval policy is satisfied.
- The reviewer decision and timestamp are recorded.
- The resulting transition is permitted and billing readiness can be evaluated.
- The change and its audit record are committed consistently.

These checks belong in a reusable workflow service, not scattered across frontend event handlers.

### Recommended API failure responses

The PDF does not dictate HTTP error codes, but the implementation should use consistent responses.

| Result                      | Recommended behavior                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `401 Unauthorized`          | Authentication is absent or invalid                                                          |
| `403 Forbidden`             | The authenticated user lacks the necessary permission                                        |
| `404 Not Found`             | The resource is unavailable, including when a safe response must not disclose its existence  |
| `409 Conflict`              | The record version is stale or there is a conflicting update                                 |
| `422 Unprocessable Content` | The input is structurally valid but the business gate or required-field validation fails     |
| `429 Too Many Requests`     | The request exceeded applicable rate limits                                                  |
| `5xx`                       | A server or integration failure occurred; return a safe error and preserve recoverable state |

The exact API contract can differ, but frontend behavior must be deterministic. A rejected transition must never be displayed as successfully completed.

## 23. The recommended database foundation

The PDF lists mandatory referral fields on page 11. I would retain those fields and add the missing lifecycle fields needed by the state model.&#x20;

Core_Doc.pdf



A starting `ReferralCase` model might include:

```
type PipelineStage =
  | "INTAKE"
  | "CLINICAL_REVIEW"
  | "SCHEDULING"
  | "NP_VISIT"
  | "NOTES_QA"
  | "BILLING";

type WorkStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "BLOCKED_NEEDS_INFO"
  | "COMPLETED";

type CaseOutcome =
  | "ACTIVE"
  | "REJECTED"
  | "PATIENT_DECLINED"
  | "DUPLICATE"
  | "DISCHARGED"
  | "CLOSED";

type BillingStatus =
  | "NOT_READY"
  | "READY"
  | "SUBMITTED"
  | "REJECTED"
  | "DENIED";

interface ReferralCase {
  id: string;
  patientId: string;
  tenantId: string;
  legalEntityId: string;
  siteId: string;

  pipelineStage: PipelineStage;
  workStatus: WorkStatus;
  caseOutcome: CaseOutcome;
  billingStatus: BillingStatus;

  assignedRole: string;
  assignedUserId: string | null;

  priority: string;
  source: string;
  receivedAt: string;
  completedPacketAt: string | null;
  stageEnteredAt: string;
  dueAt: string | null;

  holdReason: string | null;
  holdReviewAt: string | null;

  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  closedAt: string | null;
  closureReason: string | null;
}
```

This is an illustrative TypeScript contract, not a schema supplied by the PDF. In a production design, enums, foreign keys, tenant isolation, database constraints, field validation, and access rules should be enforced beyond the TypeScript types.

A separate `AuditEvent` record should capture, as applicable:

- Actor and affected case.
- Operation/action.
- Previous and resulting state.
- Timestamp in UTC.
- Reason and gate result.
- Relevant version and request/correlation identifier.

Other entities — particularly assignments, documents, review decisions, appointments, encounters, tasks, and billing records — should have their own appropriate lifecycle, constraints, and audit history.

Do not put sensitive note contents, insurance IDs, or other unnecessary PHI into generic error messages, normal application logs, or analytics events.

## 24. How to know when the system is actually complete

The MVP is not finished merely because the six-column Kanban renders and cards move between columns.

I would require the following end-to-end acceptance scenarios. These extend the acceptance criteria in the PDF into testable system behavior.

## Workflow acceptance checklist

Track review progress

### 0 / 16

Invite and authenticate users

Only invited, active users with valid authentication/MFA can access authorized modules.

Enforce site and role boundaries

A user cannot retrieve an unauthorized case or document by changing an ID or API request.

Upload and verify a referral

Documents produce a draft; human confirmation is required before the active case is created.

Block incomplete intake

Missing required information prevents the forward transition and produces a clear, recorded correction task.

Accept, return, and reject referrals

Only an authorized reviewer can record these decisions, with required rationale and audit history.

Schedule and reschedule

The appointment, acknowledgement, assigned NP, cancellation, and rescheduling history remain consistent.

Record an NP visit

No-show or incomplete documentation cannot progress to post-visit approval.

Return and approve notes

A returned note is corrected and resubmitted; billing readiness cannot bypass review.

Validate billing gates

Only approved documentation and a passed billing checklist permit billing readiness.

Track claim submission

Submission records the actual outcome, timestamp, and reference; rejection/denial remains trackable.

Handle backwards transitions

Every permitted rollback requires the appropriate authority and reason; forbidden moves are rejected.

Handle conflicting edits

Stale versions are detected without silently overwriting another user's work.

Run SLA and alert workflows

Due dates, held cases, escalation thresholds, and owner notifications behave as configured.

Audit sensitive activity

Authorized reviewers can search required events without exposing protected audit data to other roles.

Test recovery and data isolation

Failed background jobs, integration outages, and unauthorized requests do not create partial or exposed records.

Pass the production security gate

Required vendor approvals, policies, security evidence, and responsible sign-offs are complete before real PHI is enabled.

This checklist is a proposed implementation and QA aid. Checking an item means that it has been reviewed in this checklist, not that the deployed product has passed a formal audit or is compliant.

# Final recommendation

The system design I would implement from this document is:

- One portal and one login experience, with invite-only accounts, MFA, and appropriate account recovery.
- Seven role-based dashboard experiences inside the same application, with a shared My Queue pattern.
- One six-stage workflow and permission-filtered Kanban, not an unrestricted board visible to every employee.
- A backend-enforced state machine with explicit gates, approvals, return paths, terminal outcomes, and concurrency checks.
- Separate stage, work-status, case-outcome, and billing-status fields so different business concepts do not get mixed together.
- Human-verified AI extraction, with document provenance, correction history, duplicate checks, and controlled retries.
- Event-driven assignments, notifications, metrics, and SLA tracking, all based on committed backend events.
- Auditable records and role/scope checks across the APIs and document storage, with no unnecessary exposure of PHI.
- A synthetic-data MVP followed by a formal production security gate, with EHR, eligibility, billing, and mobile integrations added only when their requirements and permissions are established.

The fundamental design principle is this: a card represents work, not permission; a stage represents workflow location, not approval; and a completed visit is not the same as an approved note or a submitted claim.

Keep those distinctions intact in the data model, backend, UI, and audit history, and the application will have a coherent foundation. Collapse them into one status field or allow unrestricted drag-and-drop, and the product will quickly become unreliable even if the interface looks polished.