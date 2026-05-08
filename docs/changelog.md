# Changelog

## 2026-05-08

### Authentication hardening
- Removed the `AUTH_DEV_BYPASS` credentials sign-in path while keeping Microsoft Entra ID intact.
- Removed dev-bypass admin escalation so admin access now depends on `ADMIN_EMAILS` and stored user roles only.
- Updated the sign-in screen, readiness messaging, and setup docs to reflect the supported sign-in flows.
- Added Firebase Authentication as an optional second sign-in path using Firebase Google sign-in on the client and Firebase Admin ID-token verification on the server.

## 2026-05-04

### Build and runtime fixes
- Removed the `workerThreads` Next.js experiment that caused `DataCloneError` during build.
- Updated auth-safe rendering behavior so Next dynamic server usage is not swallowed.
- Deferred MongoDB env validation until connection time so build-time imports do not crash.
- Removed the old auth middleware path that was causing runtime middleware failures on Vercel.
- Added development-mode admin access for signed-in `@vienovo.ph` users when `AUTH_DEV_BYPASS=1`.

### Admin importer and registry
- Renamed the importer action button to `Sync` and expanded it to sync dropdown values plus detected approver and processor people from imported form options.
- Added a dedicated `/admin/processors` page for managing processor accounts separately from the general approver roster.
- Refined the form importer into a guided admin workflow: create or replace draft, sync dropdowns, open preview, publish, and delete.
- Added import progress checks for source saved, registry created, dropdowns synced, preview ready, and published.
- Moved importer technical details such as spreadsheet scan output, bindings JSON, native output structure, and source snapshots into expandable sections.
- Refined the forms registry into a clearer control panel with live/admin status badges, quick open links, requester preview links, import source links, and dropdown links.
- Reordered the admin sidebar so the importer sits next to overview and registry in the main workflow.
- Refined admin overview into a launchpad for importer, registry, dropdowns, approvers, and seed actions.
- Added `/admin/form-imports` to store imported `index.html`, `code.gs`, spreadsheet IDs, and notes.
- Added `/admin/forms` as a forms registry for visibility, status, availability, and navbar control.
- Connected the dashboard, forms list, and navbar to the registry instead of hardcoded form lists.
- Hardened the registry page so it falls back safely instead of throwing an internal server error.
- Added a one-click `Publish for users` action from the importer page.
- Added admin controls to hide forms from users without deleting them.
- Added delete controls for imported registry entries and imported form drafts.
- Re-importing a form with the same slug now replaces the existing draft instead of creating duplicate importer records.
- Hardened form re-import again so duplicate slug drafts are cleaned up and importer failures show a readable toast instead of a generic production 500.
- Changed importer actions to redirect back to `/admin/form-imports` after save/update/delete so the page reloads with fresh data and visible feedback instead of silently resetting the form.
- Moved the requester preview toggle into the top navbar on imported form pages for admins, beside the `Admin` link.
- Made the admin/requester preview controls visible in the always-present right side of the navbar.
- Added imported dropdown syncing into `Manage dropdowns`, grouped by imported form.
- Updated `Run seed` on admin overview so it also syncs imported-form dropdown values into the lookup store.
- Added the same admin/requester preview toggle to the native form pages in the top navbar.

### Dashboard
- Refined dashboard and forms list cards so requesters see clearer start-request actions and simpler empty states.
- The dashboard now hides unavailable or coming-soon forms from normal users.
- Added real recent request and pending approval lists.
- Added a dashboard delete action for a user's own submitted requests.

### System feedback
- Added a reusable global toast notification for successful admin and dashboard actions.
- Save, import, publish, hide, and delete actions now show a short confirmation message in the UI.
- Fixed the toast implementation so Vercel builds do not fail from a client component importing a server-only `next/headers` helper.

### Imported form runtime
- Added generic imported-form routes at `/forms/[slug]`.
- Imported forms can now render a usable runtime for end users instead of staying as admin-only metadata.
- Imported forms now preserve the original imported HTML/CSS layout more closely while still submitting through the app.
- Switched imported form rendering to a sandboxed original-HTML frame so legacy Apps Script layout and client-side dropdown behavior can run closer to the deployed original.
- Added a submit bridge from the legacy HTML frame back into the app request database.
- Imported form submissions now save into the app request system and open on the normal request detail page.
- Added request detail support for imported-form field display.
- Added imported-form reference numbering and request model support.

### Google Sheets support
- Added Google Sheets read support using the existing service account pattern.
- Imported forms can now load dropdown options from Sheets.
- Added explicit `spreadsheetBindings` JSON support for forced field-to-range mappings.
- Added automatic spreadsheet scanning by sheet tabs and header rows.
- Improved spreadsheet scanning to look across the first rows for headers instead of assuming only row 1.
- Added a clearer Vercel credential warning when the local service-account key file is missing.
- Added admin-side spreadsheet scan preview so imports show detected tabs, field mappings, and warnings.
- Added optional write-back of imported submissions into Google Sheets response tabs.
- Added response export configuration on the importer page, including a target response tab name.

### Notes
- Lint is still not configured in this repo. `npm run lint` opens the Next.js ESLint setup prompt.
- Verification used `npm run typecheck` for the changes above.
