# Vienovo Forms Redesign Brief

## Purpose

This document is the design reference for rebuilding the Vienovo Forms interface in Google Stitch. It should guide the full system redesign while keeping the current product logic intact: employees submit requests, approvers act on them, processors handle final steps, and admins manage imported forms, dropdowns, registry settings, people, and notifications.

Add screenshots under each page section as they become available.

## Design Direction

### Core Reference Mix

Use these references together, not as one-to-one copies:

- Retool-style internal admin panels for admin structure, dense operations pages, forms, filters, and table-heavy management screens.
- Jira Service Management-style requester portal for employee request submission, request history, approval state, and request details.
- IBM Carbon-style form and table discipline for labels, field spacing, validation, dropdown behavior, empty states, and accessibility.
- Vienovo brand identity for color and tone, mainly through green accents, logo placement, and calm internal-company polish.

### Product Personality

The app should feel like a serious internal business tool that employees can use every day without training. It should be clear, fast, and practical. The requester side should feel simple and friendly. The admin side should feel dense but organized, like a control room for forms and approvals.

Avoid marketing-style hero sections, oversized decorative cards, generic SaaS dashboard clutter, decorative gradients, and visuals that make the product feel more like a landing page than a working system.

## Visual System

### Layout

- Use a top global navigation for the whole app.
- Use a left sidebar only inside admin pages.
- Keep the requester experience centered and simple.
- Keep admin pages wider, denser, and optimized for scanning.
- Prefer tables, panels, tabs, filters, status badges, and compact action bars.
- Avoid cards inside cards.
- Use clear page titles, short helper text, and direct action buttons.

### Color

- Primary brand: Vienovo green.
- Neutrals: white, soft gray, charcoal text.
- Status colors:
  - Green for approved, live, active, successful.
  - Amber for draft, pending, warning, review needed.
  - Red for rejected, error, delete, failed.
  - Blue only for informational or sync actions.
- Keep color restrained. The system should not feel like a single green wall.

### Typography

- Use a clean enterprise UI type style.
- Page titles should be strong but not huge.
- Form labels should be clear and compact.
- Tables should prioritize readability over decoration.
- Buttons should fit their labels on mobile and desktop.

### Components

Use these consistently:

- Primary button for the main action on a page.
- Secondary button for navigation or non-critical actions.
- Destructive button for delete actions.
- Icon plus text buttons for admin tools.
- Status badges for request and form states.
- Skeleton loading for pages and panels.
- Toast notification for saved, submitted, imported, deleted, synced, and failed actions.
- Empty states with one clear next action.
- Inline validation for forms.
- Confirmation treatment for destructive actions.

## Information Architecture

### Requester Navigation

Top nav:

- Logo
- Dashboard
- New request
- Helpdesk
- User email
- Sign out
- Admin link only for admins
- Requester preview toggle only for admins viewing forms

Requester pages should never expose importer details, spreadsheet wiring, registry wording, debug warnings, or admin-only setup language.

### Admin Navigation

Admin sidebar:

- Overview
- Form importer
- Forms registry
- Dropdowns
- Approvers
- Processors
- Notification flow
- Reimbursement routing

Admin pages can show technical details, but advanced details should sit inside expandable panels or secondary tabs.

## Page Designs

## 1. Sign In

### Goal

Let employees sign in with the least friction possible through Microsoft Entra or, when configured, Firebase Authentication.

### Layout

- Centered sign-in panel.
- Vienovo logo at top.
- Clear heading: "Sign in to Vienovo Forms".
- Microsoft sign-in as the primary action when configured.
- Firebase Google sign-in only when enabled.
- Short error and loading states.

### Components

- Logo
- Primary sign-in button with loading state
- Google sign-in button when Firebase sign-in is enabled
- Error toast or inline error

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/sign-in.png
```

## 2. Requester Dashboard

### Goal

Show the employee what they can do next: start a form, track recent requests, and see approvals waiting for them.

### Layout

- Top greeting and quick status summary.
- "Start a request" section with available forms only.
- Recent requests list.
- Pending approvals list if user is an approver.
- Empty states when there are no requests or approvals.

### Components

- Form cards with form name, short description, and "Start request".
- Request list rows with reference number, form name, status, date, and details link.
- Approval rows with current step and action link.
- Delete action only for allowed user-owned requests.

### States

- Loading skeleton.
- No available forms.
- No recent requests.
- No pending approvals.
- Successful deletion toast.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/requester-dashboard.png
```

## 3. Available Forms

### Goal

Give requesters a clean catalog of forms they are allowed to use.

### Layout

- Page title: "New request".
- Compact grid or list of available forms.
- Form cards grouped only if the number of forms grows.
- Coming soon forms should be hidden from requesters unless the product decision changes.

### Components

- Form card
- Status badge only if needed
- Start request button

### States

- Loading skeleton.
- Empty state if no forms are available.
- Admin requester-preview mode should show what requesters see, not admin setup details.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/available-forms.png
```

## 4. Native Form Page

### Goal

Make form submission clear, calm, and easy to complete.

### Layout

- Form header with logo, form title, and short purpose.
- Sections grouped by business meaning, not by implementation.
- Required fields clearly marked.
- Approval section near the end.
- Submit action sticky or repeated at bottom on long forms if needed.

### Components

- Text input
- Date input
- Select dropdown
- Searchable dropdown where lists are long
- File upload
- Radio group
- Checkbox agreement
- Inline validation summary
- Submit button with loading state

### States

- Loading skeleton.
- Validation error state.
- Submit loading state.
- Successful submission toast after redirect to request detail.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/native-form.png
```

## 5. Imported Form Page

### Goal

Render imported legacy forms in a way that keeps their original design while making submission and tracking work inside the new system.

### Layout

- Use the original imported HTML/CSS as the main form body.
- Keep admin-only review warnings hidden from requesters.
- Admins can toggle requester preview in the top nav.
- The form should not reload when dropdowns are selected.

### Components

- Imported form iframe/runtime
- Submit bridge into MongoDB request storage
- Optional Sheets write-back behavior
- Admin-only preview/debug panels outside requester mode

### States

- Loading skeleton.
- Missing dropdown options state.
- Successful submission toast.
- Submission error toast with readable message.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/imported-form.png
```

## 6. Request Detail

### Goal

Show the complete request record in a way that requesters, approvers, processors, and admins can understand quickly.

### Layout

- Header with reference number, form name, status, and submitted date.
- Requester information.
- Form answers grouped cleanly.
- Approval timeline.
- Action area for current approver.
- History log.

### Components

- Status badge
- Detail fields
- Timeline steps
- Approve/reject buttons
- Comment textarea
- Edit link when allowed
- Attachment links if available

### States

- Pending approval.
- Approved.
- Rejected.
- Submitted without approval chain for imported forms.
- Loading skeleton.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/request-detail.png
```

## 7. Admin Overview

### Goal

Act as the admin launchpad. The admin should immediately know where to go next.

### Layout

- Page title and short operational summary.
- Stat row:
  - Live forms
  - Import drafts
  - Dropdown values
  - Approver emails to review
- Main workflow links.
- Seed action panel.

### Components

- Stat tiles
- Admin workflow links
- Seed button with loading state
- Result summary after seed

### States

- Loading skeleton.
- Seed success.
- Seed failure.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/admin-overview.png
```

## 8. Form Importer

### Goal

Make importing a legacy Apps Script form understandable and recoverable.

### Layout

- Step 1: Create or replace import draft.
- Step 2: Review, sync, preview, publish.
- Existing drafts listed as operational panels.
- Technical details in expandable panels.

### Components

- Form name input
- Slug input
- Spreadsheet ID input
- index.html upload
- code.gs upload
- Source paste fallback
- Response sheet settings
- Draft cards
- Progress checks:
  - Source saved
  - Registry created
  - Synced
  - Preview ready
  - Published
- Actions:
  - Create registry
  - Sync
  - Open form
  - Publish
  - Delete

### States

- Empty draft list.
- Saving draft.
- Import success toast.
- Import failure toast.
- Sync success toast.
- Delete success toast.
- Spreadsheet scan warnings inside admin-only details.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/form-importer.png
```

## 9. Forms Registry

### Goal

Control which forms exist, which are live, and which are visible to requesters.

### Layout

- Form rows or compact registry panels.
- Native and imported forms clearly labeled.
- Quick open/requester preview links.
- Status controls.

### Components

- Form name
- Source badge
- Status select
- Visibility select
- Availability select
- Show in navbar checkbox
- Implemented checkbox
- Save button
- Hide button
- Delete button for imported forms only

### States

- Live.
- Admin only.
- Coming soon.
- Draft.
- Archived.
- Save success toast.
- Delete success toast.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/forms-registry.png
```

## 10. Manage Dropdowns

### Goal

Let admins maintain dropdown values for native and imported forms without editing code.

### Layout

- Left group selector by form or category.
- Right side shows dropdown groups.
- Each group can add, edit, activate/deactivate, and delete values.

### Components

- Form/category selector
- Dropdown value list
- Add value input
- Edit value panel
- Activate/deactivate button
- Delete button

### States

- Empty category.
- Add success toast.
- Update success toast.
- Delete success toast.
- Loading skeleton.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/manage-dropdowns.png
```

## 11. Approvers

### Goal

Manage the people who can approve requests.

### Layout

- Add approver form at top.
- Approver list below.
- Roles shown as badges or checkboxes.
- Email review warnings visible.

### Components

- Name input
- Email input
- Role checkboxes:
  - Supervisor
  - Department head
  - Cash advance approver
  - Processor if still shown here
- Active toggle
- Save/delete buttons

### States

- Email missing review state.
- Active/inactive state.
- Save success toast.
- Delete success toast.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/approvers.png
```

## 12. Processors

### Goal

Manage final-processing users separately from general approvers.

### Layout

- Add processor form.
- Processor list.
- Show active state and email review status.

### Components

- Name input
- Email input
- Active toggle
- Save button
- Delete button

### States

- No processors configured.
- Email needs review.
- Active/inactive.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/processors.png
```

## 13. Notification Flow

### Goal

Let admins configure and test approval and notification behavior for every form.

### Layout

- SMTP test card at the top.
- One notification configuration panel per form.
- Compact toggles for each event.
- Extra recipients and notes fields.

### Components

- Test email input
- Send test email button
- Toggle notifications active
- Toggle on submit
- Toggle next approver
- Toggle final approval
- Toggle rejection
- Extra recipients textarea
- Notes textarea
- Save flow button
- Reset defaults button

### States

- SMTP test success toast.
- SMTP test error toast.
- Flow saved toast.
- Reset success toast.
- Missing SMTP env error.
- Authentication failure error.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/notification-flow.png
```

## 14. Reimbursement Routing

### Goal

Map reimbursement requests to approvers by department, cost center, and location.

### Layout

- Add route form.
- Routing table/list below.
- Filters for department, cost center, or location when data grows.

### Components

- Department input/select
- Cost center input/select
- Location input/select
- Immediate superior email
- Department head email
- Active toggle
- Save/delete buttons

### States

- Empty routing list.
- Route saved.
- Route inactive.
- Missing approver email warning.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/reimbursement-routing.png
```

## 15. Requests Admin Queue

### Goal

Give admins a central operations view of all requests across all forms.

### Layout

- Table-first page.
- Filters at top.
- Request rows below.
- Quick detail drawer or link to request detail.

### Components

- Search by reference number or requester.
- Filter by form.
- Filter by status.
- Filter by date.
- Filter by current approver or processor.
- Request table:
  - Reference
  - Form
  - Requester
  - Status
  - Current step
  - Submitted date
  - Last updated
  - Actions

### States

- Empty search.
- No requests yet.
- Loading skeleton.
- Export or report action if added later.

### Screenshot Placeholder

Add screenshot here:

```text
screenshots/requests-admin-queue.png
```

## Interaction Rules

### Request Submission

- The user should always see a loading state after pressing submit.
- The user should land on the request detail page after success.
- The user should see a success toast.
- Errors should be readable and recoverable.

### Importing Forms

- Saving an import draft should not require understanding backend details.
- Sync should be the one action that pulls dropdowns, approvers, and processors from imported sources.
- Publishing should be visually separate from saving a draft.
- Deleting should feel clearly destructive.

### Admin Actions

- Every save, sync, delete, import, publish, seed, and test email action should show a toast.
- Long-running actions should show pending button text.
- Empty states should tell the admin what action is available next.

## Google Stitch Prompt

Use this as the main prompt:

```text
Design an internal company forms and approval platform for Vienovo called Vienovo Forms.

The product has two modes: requester and admin.

Requester mode lets employees start a request, fill native or imported forms, submit, track request status, and approve requests assigned to them.

Admin mode lets admins import legacy Apps Script forms, manage a forms registry, sync dropdowns and people from spreadsheets, manage approvers and processors, configure notification flow, manage reimbursement routing, and run seed/sync actions.

Design style should be inspired by Retool internal admin panels, Jira Service Management request portals, and IBM Carbon form/table patterns. Use a clean enterprise operations interface with white and soft gray surfaces, Vienovo green as the brand accent, compact spacing, clear status badges, icon buttons, tables, forms, filters, skeleton loading, toast notifications, and empty/error states.

Avoid marketing hero sections, decorative gradients, oversized cards, generic dashboard clutter, and debug-heavy requester screens.

Create screens for: sign in, requester dashboard, available forms, native form page, imported form page, request detail with approval timeline, admin overview, form importer, forms registry, manage dropdowns, approvers, processors, notification flow, reimbursement routing, and requests admin queue.
```

## Screenshot Checklist

Capture these for the redesign process:

- Current sign-in page.
- Current requester dashboard.
- Current forms catalog.
- One native form.
- One imported form.
- Request detail page.
- Admin overview.
- Form importer with at least one draft.
- Forms registry.
- Manage dropdowns.
- Approvers.
- Processors.
- Notification flow.
- Reimbursement routing.
- Any visible toast.
- Any validation error.
- Any empty state.

## Implementation Guardrails

- Do not redesign backend logic while redesigning UI.
- Preserve all current routes unless there is a deliberate migration plan.
- Preserve form submission behavior.
- Preserve imported-form iframe bridge behavior.
- Preserve MongoDB request storage.
- Preserve optional Google Sheets write-back.
- Keep requester pages free of admin diagnostics.
- Keep admin diagnostics available but tucked into expandable details.
- Verify with typecheck first, then visual/manual testing.
