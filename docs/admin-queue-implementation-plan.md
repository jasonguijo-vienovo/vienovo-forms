# Approver Queue Implementation Plan

## Implementation Status

Implemented on branch `feat/native-form-submit-debug`.

Delivered:

- new approver-only `/approvals` workspace
- navbar visibility for eligible approvers and admins
- pending queue plus recently approved and recently rejected sections
- single-request approve/reject with comment from the queue
- bulk approve and bulk reject with shared comment support
- shared approval mutation service reused by the existing request approval page

Verified:

- `npm run typecheck`
- `npm run build`

Caveats still present in the repo:

- `next lint` is still interactive because ESLint has not been fully configured in this app yet
- Next warns about multiple `package-lock.json` files when building
- build logs still show the existing Mongo fallback warning when local Mongo is not running

## Summary

Add a dedicated approver workspace for signed-in approvers so they can quickly review and act on requests assigned to them without digging through the general requester dashboard or the admin-only queue.

This should be an approver-facing page, not a replacement for the existing admin queue.

## Context

The current app already has several relevant pieces:

- Requester dashboard shows a small `Pending approvals` list for the signed-in user.
- Request detail page already supports approver visibility and shows the full approval chain.
- Request approval page already supports approve/reject actions for the current approver.
- Admins already have a read-only `/admin/requests` queue for all requests.

The screenshot brief asks for:

- a role-based approval page for approvers
- visibility in the top navbar
- cards/grid layout
- sections for to-approve and recently approved
- request details on click
- approve/reject/comment actions
- bulk actions for efficient multi-approval

## Key Finding

This repo does not currently have a real session-level `approver` role being assigned in auth.

- `src/auth.ts` declares an optional role type, but session population only sets `id`.
- Access today is mostly determined by:
  - admin email allowlist via `src/lib/admin.ts`
  - approver membership inferred from `Request.approvalChain[].approverEmail`
  - approver definitions stored in `Approver` documents

So the new page should initially be gated by approver eligibility based on email and request/approver data, not by a new auth role unless we intentionally add one later.

## Recommended Scope

### Phase 1

Ship a dedicated approver queue page that:

- is available to signed-in users whose email appears in active approver data or pending request steps
- shows requests currently waiting for their action
- shows recently acted requests for their email
- links into the existing request detail and request approval pages
- supports single-request approve/reject/comment using the existing approval action path

### Phase 2

Add workflow acceleration:

- bulk select
- bulk approve
- bulk reject with per-request validation
- bulk comment / follow-up only if the business process really needs it

### Phase 3

If needed, formalize a persistent auth/session role model for `approver`, `processor`, and `admin`.

## Proposed UX

### Route

Use a dedicated top-level requester/approver route:

- `/approvals`

Why:

- easy to expose in the global navbar
- does not mix with `/admin`
- matches the mental model of “things waiting for my action”

Alternative:

- `/requests/approvals`

This is also valid, but `/approvals` is cleaner for navbar usage.

### Navbar

Add a new top-nav item:

- `Approvals`

Visibility rule:

- show only when the signed-in email is approver-capable

Recommended helper:

- `canAccessApprovals(email)` in a shared auth/access helper

### Page Sections

Use a dense but clear operations layout:

1. Header
- title: `Approvals`
- short description: `Requests waiting for your review and recently completed decisions.`
- optional count badges

2. Metrics row
- `Waiting for me`
- `Approved today`
- `Rejected today`
- `Recently completed`

3. Tabs or segmented filters
- `Needs action`
- `Recently approved`
- `Recently rejected`
- optional `All activity`

4. Main content
- card grid on wide screens or compact stacked rows on smaller screens
- each item should show:
  - reference number
  - form name
  - requester
  - current step / role
  - submitted date
  - current status
  - action buttons

5. Bulk action bar
- appears only when rows/cards are selected

## Data Model Reuse

Use the existing `RequestModel` fields:

- `referenceNo`
- `formType`
- `formSlug`
- `formName`
- `submittedBy`
- `approvalChain`
- `currentStep`
- `status`
- `history`
- timestamps

### Needs-action query

Requests currently awaiting the signed-in approver:

- `approvalChain` contains a step where:
  - `approverEmail === userEmail`
  - `status === "pending"`
  - `step === currentStep`

### Recently acted query

Requests where the signed-in approver already acted:

- `approvalChain` contains a step where:
  - `approverEmail === userEmail`
  - `status in ["approved", "rejected"]`

Sort:

- recent by `actedAt` if present
- otherwise fall back to `updatedAt`

## Access Control

### Initial rule

Allow access when:

- user is admin, or
- user email appears in at least one active `Approver` document, or
- user email appears in at least one request approval step

This is the safest first implementation because it matches current app behavior.

### Future rule

If auth/session roles become real:

- `admin` can access
- `approver` can access
- `processor` can optionally access a processor-specific tab or queue

## Implementation Shape

### 1. Shared access helper

Add a helper such as:

- `src/lib/approval-access.ts`

Responsibilities:

- normalize signed-in email
- determine `canAccessApprovals`
- optionally return an access summary:
  - `isAdmin`
  - `isApprover`
  - `isProcessor`

### 2. New page

Add:

- `src/app/approvals/page.tsx`

Responsibilities:

- require sign-in
- reject non-approvers
- load:
  - needs-action requests
  - recently acted requests
  - counts for header metrics
- render a new client component

### 3. New client component

Add:

- `src/app/approvals/ApprovalsClient.tsx`

Responsibilities:

- tabs / filters
- search by reference, requester, or form
- select one or many requests
- launch bulk actions
- navigate to request detail or request approval page

### 4. Shared query helpers

Add:

- `src/lib/approval-queue.ts`

Responsibilities:

- `getPendingApprovalsForUser(email, options)`
- `getRecentlyActedApprovalsForUser(email, options)`
- `getApprovalQueueMetrics(email)`

This keeps dashboard, approvals page, and future notifications aligned.

### 5. Navbar integration

Update:

- `src/components/navbar.tsx`

Add:

- conditional `Approvals` nav item

### 6. Reuse current action pages

Do not duplicate approval mutation logic.

Reuse:

- `src/app/requests/[ref]/approve/page.tsx`
- `src/app/requests/[ref]/approve/actions.ts`

The new queue should link into that flow first.

## Bulk Actions

### Recommended first bulk action

Implement bulk approve first.

Why:

- simplest and least ambiguous
- easiest to validate against current-step ownership
- most likely to deliver immediate value

### Validation rules

For each selected request:

- request still exists
- current step is still pending
- current approver email matches signed-in user
- request has not already been approved/rejected by someone else

### Recommended behavior

- process each request individually in a loop
- collect successes and failures
- show summary toast/result panel:
  - `8 approved`
  - `2 skipped because they were no longer assigned to you`

### Bulk reject

Only add when product behavior is settled.

Questions to settle first:

- one shared rejection comment for all?
- separate reason per request?
- allowed for imported and native forms equally?

### Bulk comment

This should likely wait.

Comment semantics are less clear than approval/rejection and may overlap with request history and notification flow.

## Suggested UI States

### Empty states

- No items needing action
- No recently approved items
- No results for current filters

### Loading states

- skeleton metrics
- skeleton cards/rows

### Conflict states

- request already acted on
- request reassigned to another approver
- request no longer pending

## Technical Risks

### 1. No true approver role in session

The screenshot asks for role-based access, but current auth is mostly email-based.

Mitigation:

- phase 1 uses email/data-driven access
- phase 2 can formalize session roles if needed

### 2. Approval chain consistency

Bulk actions can race with another approver or admin.

Mitigation:

- re-check current step at mutation time
- return per-request success/failure results

### 3. Imported form differences

Some imported forms may have approval chains that differ from native ones.

Mitigation:

- keep page list/query logic generic
- keep action execution routed through current request approval logic

### 4. Navbar clutter

Top nav already includes dashboard, new request, and helpdesk.

Mitigation:

- add `Approvals` only for eligible users
- place it near `Dashboard`

## Recommended Order

1. Add access helper for approver eligibility.
2. Add query helpers for pending and recently acted approvals.
3. Add `/approvals` page and client UI.
4. Add navbar item.
5. Reuse existing request detail and approve routes from queue cards.
6. Add bulk approve only.
7. Add audit/history notes for bulk actions if needed.

## File Targets

- `src/lib/approval-access.ts`
- `src/lib/approval-queue.ts`
- `src/app/approvals/page.tsx`
- `src/app/approvals/ApprovalsClient.tsx`
- `src/components/navbar.tsx`

Potential later updates:

- `src/app/dashboard/page.tsx`
  - optionally make `Pending approvals` point to `/approvals`
- `src/app/requests/[ref]/approve/actions.ts`
  - optionally extract reusable approve/reject service logic for bulk processing

## Open Questions

1. Should processors appear in the same queue, or should processor work stay separate?
2. Should recently approved show only the user’s own actions, or all actions from chains they belong to?
3. Is bulk reject required in v1, or is bulk approve enough?
4. Should the queue default to cards, or should it default to compact table rows with an optional card mode?
5. Should the navbar item say `Approvals` or `My Approvals`?

## Recommendation

Build `/approvals` as a dedicated approver workspace using current request data and current approve/reject actions.

Do not introduce a brand-new approval engine.
Do not merge it into `/admin/requests`.
Do not block on adding a true auth role first.

That gives the fastest path to a useful, low-risk feature while staying aligned with the current architecture.
