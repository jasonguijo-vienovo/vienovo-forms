# Vienovo Forms Workflow Improvement Plan

## Purpose

This document turns the current workflow review into a practical implementation plan for the Vienovo Forms system. It also serves as repo memory for how this project should be evolved going forward so future work stays consistent, safe, and scalable.

This plan is intentionally grounded in the current repo, current admin tools, current approval flow, current imported-form runtime, and the project operating style already used in this codebase.

## Repo Workflow Memory

Use these rules as the default workflow for future changes in this repository.

### Working Style

- Treat `https://github.com/jasonguijo-vienovo/vienovo-forms.git` as the canonical repository.
- Follow the repo's lean unified workflow manually: small focused patches, minimal disruption, and verification with the cheapest useful checks first.
- Prefer existing project patterns before introducing new abstractions.
- Read repo docs first before inventing new structure.
- Keep imported forms, approvals, people, notifications, and admin operations aligned with existing business logic unless there is a deliberate migration plan.
- Favor repairable workflows over brittle one-way workflows.
- Prefer guided admin flows over scattered manual admin steps.
- Design for both desktop and mobile use.
- Treat scalability, auditability, and operational clarity as first-class requirements, not cleanup work for later.

### Delivery Rules

- Start with the smallest safe improvement that reduces real workflow friction.
- For risky flows, add guardrails before adding more features.
- Prefer background jobs for long-running admin work.
- Keep destructive actions explicit and confirmed.
- Keep request, approval, and employee data readable in the database and understandable in the UI.
- When a workflow can break across registry, import, request, notification, or sheet layers, add diagnostics and repair paths.

### Product Rules

- Requesters should be able to submit without training.
- Approvers should be able to act quickly and confidently.
- Admins should be able to diagnose and repair system issues without touching the database directly.
- Imported forms should feel governable, not mysterious.
- Notifications should summarize business context, not raw payloads.
- People and role assignment should come from a clear source of truth.

## Current Priority Areas

The main friction points in the current system are:

1. Imported forms are powerful but too fragmented across import, registry, sync, preview, and publish steps.
2. Approvals work, but they behave more like isolated actions than a managed operations inbox.
3. People and roles are split across multiple models and admin pages.
4. Several important admin operations still run synchronously and are hard to observe.
5. The admin overview does not yet function as a true exception dashboard.

## Implementation Status

Updated on branch `feat/2026-05-08`.

Delivered in the first implementation slice:

- importer readiness filters for blocked, needs-review, needs-registry, needs-sync, and live forms
- visible import preflight details with blockers, warnings, missing registry, missing bindings, field count, and synced lookup count
- publish action hardening so blocked imports show useful failure feedback instead of silently failing
- preflight action in the importer manage panel
- approval queue urgency buckets for overdue, due soon, and normal requests
- return-for-correction action from the approvals queue and single request approval page
- returned requests can be edited again by the requester
- response sheet status sync supports the `returned` status
- admin operational exception cards for blocked imports, overdue approvals, returned requests, and failed notification deliveries
- approver admin setup now supports employee-directory-backed selection and stores employee context alongside approver records
- employee sync now records recent admin job runs with status, timing, actor, and failure context

Verified:

- `npm run typecheck`

## North Star

The target operating model for this system is:

- one reliable people directory
- one understandable form lifecycle
- one clear approval state machine
- one clean request summary shape used across pages, emails, and exports
- one admin control layer with visibility into sync, routing, notifications, and failures

## Implementation Plan

### Phase 1: Stabilize Imported Forms

Goal:
Make imported forms safe, guided, and repairable.

Problems to solve:

- importing a form still requires too many separate admin actions
- registry and import records can drift out of sync
- a form can look configured in the database while still failing at runtime
- admins do not get enough preflight feedback before publishing

Work:

- turn import management into a single guided flow:
  - create or re-import
  - map fields
  - validate dependencies
  - preview
  - publish
- add a publish gate that blocks release when required settings are incomplete
- separate draft and live versions for imported forms
- add a repair action for mismatched import and registry states
- add import health statuses such as `safe`, `needs review`, and `legacy fragile`
- normalize imported form request summaries so the same structured data can be reused in request views, emails, and approvals

Acceptance criteria:

- an admin can publish an imported form without jumping across multiple pages
- broken slug and registry mismatches are detectable from the UI
- deleting or replacing an imported form does not leave orphaned runtime behavior
- imported form submissions produce structured request summaries

### Phase 2: Rebuild Approvals As An Inbox Workflow

Goal:
Make approvals faster, clearer, and more scalable.

Problems to solve:

- approvals are functional but still too linear
- users lack urgency and SLA visibility
- the system does not yet treat reassignment, return-for-correction, and delegation as core workflow actions

Work:

- add `return for correction` as a first-class workflow outcome
- add queue sections such as:
  - `Needs action now`
  - `Overdue`
  - `Waiting on processor`
  - `Recently acted`
- add SLA timers and aging indicators
- support delegation and out-of-office coverage
- add escalation rules for stalled approvals
- move bulk approval actions into managed background execution where needed
- improve mobile approval actions so common actions are quick to complete

Acceptance criteria:

- approvers can understand urgency without opening each request
- stalled approvals are visible and actionable
- corrections and rework can be tracked without abusing reject flows
- bulk actions do not feel fragile under larger workloads

### Phase 3: Unify People And Role Management

Goal:
Make employee identity and internal role assignment consistent across the system.

Problems to solve:

- employee, user, approver, and processor data are still conceptually split
- admin role assignment is improving but still spread across multiple pages and models

Work:

- keep `Employee` as the canonical person directory
- keep auth-specific data in `User`
- move app responsibilities into role assignments that reference employees
- reorganize admin people management into a clearer structure:
  - people
  - role assignments
  - approval routing
  - processors
  - access roles
- continue replacing free-text user selection with employee-backed pickers
- document fallback rules for partially synced employees

Acceptance criteria:

- admins can assign responsibilities from one trusted people source
- user-role and processor setup no longer depend on manual typing
- person identity and role responsibility are easier to audit

### Phase 4: Move Long-Running Admin Work Into Jobs

Goal:
Make operations safer and more observable.

Problems to solve:

- syncs, imports, bulk actions, and other heavy work are still hard to monitor
- failed operations can be silent or hard to retry cleanly

Work:

- add a background job model for long-running operations
- track status, start time, finish time, retry state, and operator
- show job history in admin
- provide failure reasons and retry actions
- use jobs for:
  - employee sync
  - large import publish operations
  - dropdown sync
  - bulk approvals
  - heavy notification backfills or replays

Acceptance criteria:

- long-running tasks no longer depend on one blocking request
- admins can see what failed and retry it safely
- job history improves operational confidence

### Phase 5: Turn Admin Into An Exception Dashboard

Goal:
Help admins find issues early instead of discovering them through user complaints.

Problems to solve:

- readiness is improving, but admin still lacks a unified operational dashboard

Work:

- expand `/admin` into an exception dashboard
- show alerts for:
  - imports blocked from publish
  - broken form routing
  - stale employee sync
  - notification delivery failures
  - overdue approvals
  - broken response destinations
  - orphaned or mismatched form records
- provide direct links from alerts to repair actions

Acceptance criteria:

- admins can spot broken workflow states from one landing page
- each exception points to a concrete next step

### Phase 6: Scale Data Sync And Analytics

Goal:
Reduce redundant sync work and improve workflow insight.

Problems to solve:

- employee sync will become heavier as data grows
- managers and admins will eventually need workflow analytics

Work:

- move employee sync toward Microsoft Graph delta sync
- track sync freshness and sync coverage
- add analytics for:
  - request volume by form
  - approval bottlenecks
  - processor backlog
  - aging by step and by person
  - notification failure rate

Acceptance criteria:

- sync becomes more efficient over time
- operations leaders can see where the workflow is slowing down

## Supporting UI Improvements

These should be applied throughout the phases above rather than treated as isolated redesign work.

### Requester Experience

- make form search and filtering real, not placeholder behavior
- group request details by section instead of flat data rendering
- improve request confirmation and status visibility
- improve long-form usability on mobile
- support save and resume where business rules allow

### Notifications

- provide event-specific notification previews
- support test sends
- provide failure and resend visibility
- keep request details structured and readable

### Safety And Repairability

- every destructive action should explain scope clearly
- every high-risk workflow should have either a dry run, preview, or rollback path
- every multi-record workflow should have repair tooling where possible

## Practical Rollout Order

Build in this order unless a production issue forces reprioritization:

1. Imported form publish gate and repair flow
2. Approval inbox improvements with correction and SLA handling
3. Unified people and role model improvements
4. Background jobs and operational history
5. Admin exception dashboard
6. Incremental sync and analytics

## Success Measures

Use these as the working indicators for whether workflow quality is improving:

- fewer admin-only manual repair steps
- fewer imported-form runtime surprises
- faster time to publish a reliable imported form
- faster approval turnaround
- fewer stuck approvals
- fewer support issues caused by unclear people or role assignment
- clearer operational visibility without database inspection

## Change Discipline

When implementing this plan:

- do not rewrite stable workflow areas without a clear gain
- prefer phased migration over big-bang replacement
- preserve current business behavior unless the phase explicitly changes it
- keep docs updated when workflow rules or admin responsibilities change

## Related Docs

- [Design Brief](./design-brief.md)
- [Approver Queue Implementation Plan](./admin-queue-implementation-plan.md)
- [Import Registry Backend Plan](./import-registry-backend-plan.md)
- [Rollback And Backup Plan](./rollback-and-backup-plan.md)
