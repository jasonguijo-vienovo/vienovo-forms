# Admin Queue Research

## Goal

Make the admin queue easy to scan, easy to jump around, and able to keep performing well as request volume grows.

This research is tailored to the current implementation in this repo, not a generic dashboard pattern.

## Current State In This Repo

### What the current queue does

The admin queue lives at `/admin/requests`.

- [src/app/admin/requests/page.tsx](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/requests/page.tsx) fetches the latest `75` requests, sorts by `createdAt desc`, and sends the whole result to the client.
- [src/app/admin/requests/RequestsClient.tsx](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/requests/RequestsClient.tsx) does search and status filtering entirely in memory on that preloaded array.
- [src/models/Request.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/models/Request.ts) has basic indexes for requester history and form history, but not indexes shaped for a cross-form admin operations queue.

### Why this will become exhausting

The current page avoids true endless scroll, but it still has the same operational failure mode:

- Admins can only work with whatever `75` rows happened to be preloaded.
- Search is not global; it only searches those loaded rows.
- Metrics like "Pending" are counts from the loaded subset, not the real queue.
- There is no way to jump by date, form, current approver, or age bucket.
- There is no stable URL state for "show me pending reimbursement requests from last week".
- The table is read-only and row context is thin, so finding the right request often means opening multiple detail pages.

### Mismatch with the project's own design brief

The design brief already asks for a stronger queue than the current implementation provides.

[docs/design-brief.md](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/docs/design-brief.md) says the requests admin queue should include:

- Search by reference number or requester
- Filter by form
- Filter by status
- Filter by date
- Filter by current approver or processor
- Columns for current step and last updated
- Quick detail drawer or request detail link

Today the queue has only search, a partial status filter, and an open link.

## Research Findings

### 1. A queue like this should be table-first, not feed-first

Carbon's data table guidance is a strong match for this app because the brief already references Carbon-style enterprise patterns.

- Carbon says data tables are ideal when users must navigate to a specific piece of data to complete a task.
- Carbon recommends a toolbar for search, filtering, settings, and utilities.
- Carbon supports sortable columns, expandable rows for progressive disclosure, and pagination when the amount of data is too large to show at once.

This fits an admin request queue much better than a long scrolling list or card feed.

### 2. Pagination is the right default for findability

Carbon's pagination guidance places pagination below the table and treats it as part of the data table workflow.

Atlassian's dynamic table guidance also frames this kind of component as rows of data with built-in pagination and sorting.

For admin operations, pagination beats endless scrolling because it gives:

- A predictable stopping point
- Better sense of progress
- Stable results when filters change
- Easier keyboard and mouse navigation
- Better support for sharable URLs and browser history

### 3. Filters and sorting should live in the URL and run on the server

Next.js App Router supports handling filtering, pagination, and sorting with `searchParams` on the page route. That is a good fit here because it makes the queue:

- Shareable
- Refresh-safe
- Server-driven
- Easy to revisit from bookmarks or copied links

This is especially useful for admin work such as:

- `?status=pending&form=reimbursement`
- `?status=returned&from=2026-05-01&to=2026-05-05`
- `?assignee=dave.mundia@vienovo.ph`

### 4. Offset pagination is easy, but cursor pagination scales better

MongoDB's documentation is clear that `skip()` gets slower as the offset grows because the server must scan from the beginning of the result set. MongoDB recommends range-query pagination for better performance as offsets grow.

That means:

- `page=1,2,3` with `skip()` is simple and acceptable for small data sets.
- A true long-term admin queue should use cursor-based pagination for the default newest-first view.

For this product, the best stable cursor is:

- sort by `createdAt desc`
- tie-break with `_id desc`

### 5. Index design matters more than UI polish once volume grows

MongoDB's compound index guidance says field order is important, and indexes can support both query predicates and sorts when they match the query pattern.

That matters here because the queue wants combinations like:

- `status + createdAt`
- `formSlug + status + createdAt`
- `current approver + status + createdAt`

Without queue-shaped indexes or denormalized queue fields, the UI may feel faster for a while but will degrade as requests accumulate.

## Recommended Direction For This Repo

## Recommendation Summary

Build a server-driven, paginated admin queue with compact rows, sticky filters, saved views, and a quick-detail surface. Do not use endless scroll as the primary navigation model.

## Recommended UX Structure

### Top row: queue summary

Show real server-derived counts, not counts from the current page payload.

- Total open
- Pending approval
- Returned
- Rejected
- Submitted without approval chain

These should act as one-click presets.

### Second row: sticky filter toolbar

Use a compact horizontal toolbar with:

- Search input for reference number, requester name, requester email
- Status filter
- Form filter
- Current approver or processor filter
- Date range filter
- Page size selector: `25`, `50`, `100`
- Clear filters action

The toolbar should stay visible while scrolling the table.

### Main table

Use a dense table, not large card rows.

Recommended columns:

- Reference
- Form
- Requester
- Status
- Current step
- Current assignee
- Submitted
- Last updated
- Age
- Actions

Recommended interactions:

- Sort by `Submitted`, `Last updated`, `Age`
- Open request in detail page
- Optional quick-detail drawer on row click
- Optional row expansion for approval summary

### Quick-detail pattern

Avoid forcing admins to fully leave the queue every time they inspect a record.

Best fit:

- Keep the full request detail page as the source of truth
- Add a right-side quick-detail drawer for common checks
- Include requester, status, current step, last actions, and a link to the full detail page

This matches the design brief's "quick detail drawer or link" requirement and reduces repetitive back-and-forth navigation.

### Saved views

Add default saved views before adding advanced custom reporting.

Suggested presets:

- `All open`
- `Pending approval`
- `Returned`
- `Waiting more than 3 days`
- `Travel Booking`
- `Reimbursement`
- `Needs processor`

These reduce admin effort more than raw pagination alone.

## Recommended Data Strategy

### Short-term

Move filtering, sorting, and pagination to the server page route and drive state from `searchParams`.

That alone fixes the biggest current limitations:

- global search
- real counts
- sharable URLs
- older items become reachable
- no dependence on one preloaded array

### Medium-term

Denormalize queue-facing fields onto the request document so the admin queue does not need to infer everything from `approvalChain` every time.

Suggested derived fields:

- `currentActorEmail`
- `currentActorName`
- `currentRole`
- `queueBucket`
- `lastActionAt`
- `lastActionBy`
- `ageDays` should stay computed, not stored

Why this matters:

- `approvalChain` is great as source-of-truth workflow history
- it is not ideal as the main query surface for a high-traffic admin queue

With derived queue fields, the queue becomes simpler to query, sort, and index.

### Long-term

If admins eventually need reporting across very large histories, split the concerns:

- operational queue for active work
- reporting/export views for historical analysis

Do not make the day-to-day queue carry every reporting use case.

## Recommended Pagination Model

### Best long-term choice

Use cursor-based pagination for the default newest-first queue.

Suggested sort:

- `createdAt desc`
- `_id desc`

Suggested URL shape:

- `?status=pending&limit=50`
- `?status=pending&limit=50&after=<cursor>`
- `?status=pending&limit=50&before=<cursor>`

### Acceptable transitional choice

If the team wants the smallest first step, use offset pagination now and plan to switch later.

Good for:

- fast delivery
- familiar page numbers
- modest data volumes

Not good for:

- very deep browsing
- large historical queues

If offset pagination is used first, keep the page contract abstract enough that the backend can switch to cursors later without redesigning the whole UI.

## Recommended Index Strategy

The current model has:

- `{ "submittedBy.email": 1, status: 1, createdAt: -1 }`
- `{ formSlug: 1, createdAt: -1 }`

Those help requester views more than the admin queue.

For an admin queue, likely useful indexes are:

- `{ status: 1, createdAt: -1, _id: -1 }`
- `{ formSlug: 1, status: 1, createdAt: -1, _id: -1 }`
- `{ currentActorEmail: 1, status: 1, createdAt: -1, _id: -1 }`
- `{ queueBucket: 1, createdAt: -1, _id: -1 }`
- `{ referenceNo: 1 }` already exists and should stay

Important note:

- I recommend indexing derived scalar queue fields instead of leaning heavily on `approvalChain` for admin filtering.
- That keeps the query surface simpler and safer than building more and more logic on top of a nested workflow array.

## Option Comparison

### Option A: keep the current custom table, but make it server-driven

Pros:

- smallest code change
- no new dependency
- best fit with current repo style
- easiest to review and maintain

Cons:

- custom work for sorting state, URL syncing, and pagination UI
- less feature-rich if the table grows complex later

Best for this repo right now: yes

### Option B: use TanStack Table

Pros:

- strong control over columns, sorting, filtering state, and rendering
- works well with server-side data
- not visually opinionated

Cons:

- still requires you to build the actual UI shell
- adds complexity the current queue may not need yet

Best if:

- the queue is about to gain many more columns, bulk actions, pinning, or complex sort/filter behavior

### Option C: use AG Grid

Pros:

- very powerful for enterprise tables
- strong support for server-side row models and very large datasets

Cons:

- heavy compared to this codebase
- much larger integration and design footprint
- likely overkill for the current product stage

Best for this repo right now: no

## Recommended Phased Plan

### Phase 1: fix navigation and findability

Target outcome: admins can reliably find any request without exhausting scroll/search loops.

Build:

- server-side filters from `searchParams`
- status, form, assignee, and date filters
- page size selector
- stable pagination
- sortable submitted/updated columns
- include `updatedAt`, current step, current assignee in result rows

### Phase 2: improve scanning speed

Target outcome: admins spend less time opening requests just to identify them.

Build:

- quick-detail drawer
- age column
- saved views
- sticky toolbar
- row expansion or concise timeline summary

### Phase 3: harden for scale

Target outcome: queue stays fast as data grows.

Build:

- derived queue fields
- queue-shaped compound indexes
- cursor pagination
- optional server-side export route

## Specific Product Decisions I Recommend

If we want the highest value with the lowest risk, these are the calls I would make:

1. Use a paginated table, not infinite scroll.
2. Put filter and sort state in the URL.
3. Keep the full request detail page, but add a quick-detail drawer.
4. Start with a custom server-driven table before introducing a grid library.
5. Plan for derived queue fields before relying more heavily on `approvalChain` filtering.
6. Add saved operational views early because they remove more friction than visual polish alone.

## Proposed First Implementation Shape

If we implement this in the current Next.js structure, the queue route should evolve toward:

- `src/app/admin/requests/page.tsx`
  - read `searchParams`
  - run filtered query on the server
  - compute total counts and active page metadata
  - pass normalized rows plus metadata to the client component
- `src/app/admin/requests/RequestsClient.tsx`
  - render controls
  - update query string on interactions
  - keep only lightweight local UI state like drawer open/closed

This keeps data work server-side and interaction work client-side, which is a good fit for the current App Router codebase.

## Sources

- Carbon Data Table usage: https://carbondesignsystem.com/components/data-table/usage/
- Carbon Pagination usage: https://carbondesignsystem.com/components/pagination/usage/
- Carbon Data Table accessibility: https://carbondesignsystem.com/components/data-table/accessibility/
- Atlassian Dynamic Table: https://atlassian.design/components/dynamic-table/
- Next.js `page` and `searchParams`: https://nextjs.org/docs/app/api-reference/file-conventions/page
- Next.js `useSearchParams`: https://nextjs.org/docs/app/api-reference/functions/use-search-params
- MongoDB `cursor.skip()` guidance: https://www.mongodb.com/docs/v8.2/reference/method/cursor.skip/
- MongoDB compound indexes: https://www.mongodb.com/docs/v8.0/core/indexes/index-types/index-compound/
- MongoDB sort with indexes: https://www.mongodb.com/docs/v8.0/tutorial/sort-results-with-indexes/

## Bottom Line

The right answer for this admin queue is not "load more rows while scrolling."

The right answer is:

- a compact table
- server-driven filters and sorting
- pagination or cursors instead of feed-style browsing
- richer row context
- queue-shaped indexes and derived fields as volume grows

That gives admins a queue they can navigate intentionally instead of visually hunting through a long list.
