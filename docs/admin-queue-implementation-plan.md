# Admin Queue Implementation Plan

## Objective

Turn the current `/admin/requests` page into a scalable operations queue that admins can filter, scan, and navigate without hunting through a long list.

This plan is based on [docs/admin-queue-research.md](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/docs/admin-queue-research.md).

## Success Criteria

- Admins can find any request by reference number, requester, form, status, assignee, or date range.
- Search and filters work against the database result set, not just the rows currently loaded in the browser.
- Queue state is shareable through the URL.
- The page shows real queue counts from MongoDB.
- The table includes enough context to avoid opening multiple detail pages just to identify the right request.
- The first release improves navigation without requiring a major schema migration.
- Later releases add queue-specific fields and indexes so performance stays stable as request volume grows.

## Recommended Build Path

## Phase 1: Server-Driven Queue

Target outcome: admins can reliably find and page through requests.

### Scope

Update the queue to read filter, sort, and pagination state from `searchParams`, query MongoDB on the server, and render only the current page of results.

### User Experience

- Keep the page table-first.
- Replace client-only filtering with URL-backed controls.
- Add a compact filter toolbar above the table.
- Add pagination controls below the table.
- Keep "Open request" as the primary action.

### Filters

Implement these first:

- `q`: reference number, requester name, requester email, form name, form slug
- `status`: `all`, `pending`, `submitted`, `approved`, `returned`, `rejected`
- `form`: all form slugs/types
- `assignee`: current approval actor email, derived from the current approval step at read time for now
- `from`: submitted date lower bound
- `to`: submitted date upper bound
- `limit`: `25`, `50`, `100`
- `page`: offset page number for the first implementation

### Sorting

Implement:

- `sort=createdAt`
- `sort=updatedAt`
- `direction=asc|desc`

Default:

- `sort=createdAt`
- `direction=desc`

### Data Work

Update [src/app/admin/requests/page.tsx](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/requests/page.tsx) to:

- accept `searchParams`
- normalize and validate query params
- build a MongoDB filter
- fetch one page of rows
- fetch real total count for active filters
- fetch status summary counts
- select `updatedAt`, `approvalChain`, and `currentStep`
- compute current step and current assignee for display

Update [src/app/admin/requests/RequestsClient.tsx](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/requests/RequestsClient.tsx) to:

- remove local array filtering as the source of truth
- render controlled filter links/forms that update the URL
- render pagination metadata
- display submitted and last updated dates
- display current step and current assignee
- include the `submitted` status filter

### Suggested Helpers

Create a small local helper file:

- `src/app/admin/requests/query.ts`

Use it for:

- parsing search params
- clamping `limit`
- validating status and sort values
- building pagination metadata
- formatting MongoDB filters

Keep this helper close to the route until it is reused elsewhere.

### Acceptance Criteria

- `/admin/requests?status=pending` shows only pending requests from MongoDB.
- `/admin/requests?q=<reference>` can find a request outside the latest 75 records.
- `/admin/requests?form=reimbursement&status=pending` combines filters correctly.
- `/admin/requests?from=2026-05-01&to=2026-05-05` filters by submitted date.
- Pagination works with filters preserved in the URL.
- Reloading the page preserves the queue state.
- The metric cards show server-derived counts, not counts from the displayed page only.

### Verification

Run:

```powershell
npm run typecheck
npm run lint
```

Manual checks:

- Open `/admin/requests`.
- Try each status tab.
- Search by a known reference number.
- Combine search plus status.
- Change page size.
- Navigate forward and backward through pages.
- Open a request and return to the filtered queue.

## Phase 2: Scanning And Workflow Speed

Target outcome: admins can understand the request before opening the full detail page.

### Scope

Improve table readability and add lightweight in-page context.

### User Experience

Add:

- sticky filter toolbar
- age column
- current step column
- current assignee column
- saved view presets
- row expansion or side drawer for quick detail

Saved view presets:

- `All open`
- `Pending approval`
- `Returned`
- `Waiting more than 3 days`
- `Travel Booking`
- `Reimbursement`
- `Needs processor`

### Quick Detail Drawer

Add a client-side drawer in [src/app/admin/requests/RequestsClient.tsx](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/requests/RequestsClient.tsx).

The drawer should show:

- reference number
- requester name and email
- form name
- status
- submitted date
- last updated date
- current step
- current assignee
- compact approval chain
- link to full request detail

Keep the full request detail page as the source of truth.

### Acceptance Criteria

- Admins can inspect approval position without leaving the queue.
- Preset views update URL state.
- Toolbar remains reachable while scanning table rows.
- Drawer can be opened and closed by keyboard.
- Full request detail remains one click away.

### Verification

Run:

```powershell
npm run typecheck
npm run lint
```

Manual checks:

- Check drawer keyboard focus and close behavior.
- Check desktop table width.
- Check mobile behavior for horizontal scroll and filter stacking.
- Check empty state when filters return no results.

## Phase 3: Scale Hardening

Target outcome: the queue remains fast when request history grows.

### Scope

Add derived queue fields and queue-shaped indexes.

### Schema Additions

Update [src/models/Request.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/models/Request.ts) with optional fields:

- `currentActorEmail`
- `currentActorName`
- `currentRole`
- `queueBucket`
- `lastActionAt`
- `lastActionBy`

Do not store `ageDays`; calculate age at read time.

### Indexes

Add indexes after derived fields exist:

- `{ status: 1, createdAt: -1, _id: -1 }`
- `{ formSlug: 1, status: 1, createdAt: -1, _id: -1 }`
- `{ currentActorEmail: 1, status: 1, createdAt: -1, _id: -1 }`
- `{ queueBucket: 1, createdAt: -1, _id: -1 }`

### Write Path Updates

Update request creation and approval actions so derived queue fields stay current.

Likely files:

- `src/app/forms/travel-booking/actions.ts`
- `src/app/forms/cash-advance/actions.ts`
- `src/app/forms/reimbursement/actions.ts`
- `src/app/forms/[slug]/actions.ts`
- `src/app/requests/[ref]/approve/actions.ts`
- `src/lib/request-mirror.ts`

### Backfill

Add a one-time script to backfill queue fields from existing `approvalChain`, `currentStep`, `status`, and `history`.

Suggested script:

- `scripts/backfill-request-queue-fields.ts`

Backfill logic:

- if status is `pending`, use the approval step matching `currentStep`
- if no approval chain exists and status is `submitted`, set `queueBucket=submitted`
- if status is terminal, clear current actor fields and set bucket from status
- use latest history item for `lastActionAt` and `lastActionBy` when available

### Acceptance Criteria

- Queue filters by current assignee using scalar indexed fields.
- Existing requests have queue fields after backfill.
- New requests and approval actions keep queue fields current.
- Queue query code no longer needs to inspect full `approvalChain` for normal filtering.

### Verification

Run:

```powershell
npm run typecheck
npm run lint
```

Database checks:

- Run backfill against local/dev data.
- Compare a sample of request detail pages against queue row fields.
- Verify pending requests show the correct current actor.
- Verify approved/rejected requests do not show stale current actors.

## Phase 4: Cursor Pagination And Operations Extras

Target outcome: deep queue navigation does not slow down as data grows.

### Scope

Replace offset pagination with cursor pagination for the default newest-first queue and add operations conveniences.

### Cursor Pagination

Use:

- `createdAt desc`
- `_id desc`

URL shape:

- `?status=pending&limit=50`
- `?status=pending&limit=50&after=<cursor>`
- `?status=pending&limit=50&before=<cursor>`

### Optional Enhancements

Add only if admins need them:

- server-side CSV export for filtered results
- column visibility settings
- "copy link to filtered view"
- bulk status review tools
- saved custom views per admin

### Acceptance Criteria

- Next and previous navigation stays fast for large result sets.
- Cursor state preserves all active filters.
- Export uses server-side filtering and does not depend on visible rows.

## Implementation Order

1. Add `src/app/admin/requests/query.ts`.
2. Refactor `page.tsx` to use server-side query params.
3. Refactor `RequestsClient.tsx` controls to update URL state.
4. Add pagination UI.
5. Add current step, current assignee, submitted, and updated columns.
6. Add real status summary counts.
7. Add sticky toolbar and saved presets.
8. Add quick-detail drawer.
9. Add derived queue fields and indexes.
10. Backfill existing requests.
11. Switch from offset pagination to cursor pagination.

## Risks And Mitigations

### Risk: search becomes slow

Mitigation:

- Start with exact reference search and case-insensitive regex for small text fields.
- Add indexed normalized search fields later if request volume grows enough to require it.

### Risk: current assignee is expensive to query

Mitigation:

- Phase 1 can compute assignee for display.
- Phase 3 should add `currentActorEmail` for efficient filtering.

### Risk: derived queue fields become stale

Mitigation:

- Centralize queue-field derivation in one helper.
- Call that helper from create, edit, approve, reject, and backfill paths.
- Add a small verification script that detects mismatches between `approvalChain` and derived fields.

### Risk: admins expect reporting from the queue

Mitigation:

- Keep this page focused on operational work.
- Add export/reporting as a separate server-side action if needed.

## First Sprint Recommendation

Build Phase 1 first.

This gives the biggest immediate relief because it removes the latest-75 limit, makes search global, and gives admins reliable filters without taking on schema migration risk yet.

Suggested first sprint task list:

- Implement URL-backed query parsing.
- Implement server-side `q`, `status`, `form`, date, and limit filters.
- Add offset pagination with preserved filters.
- Add real counts.
- Add `submitted`, `updated`, current step, and current assignee columns.
- Keep styling consistent with existing admin UI components.

Once Phase 1 is stable, move to Phase 2 for the drawer and saved views.
