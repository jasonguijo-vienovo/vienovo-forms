# Changelog

## 2026-05-04

### Build and runtime fixes
- Removed the `workerThreads` Next.js experiment that caused `DataCloneError` during build.
- Updated auth-safe rendering behavior so Next dynamic server usage is not swallowed.
- Deferred MongoDB env validation until connection time so build-time imports do not crash.
- Removed the old auth middleware path that was causing runtime middleware failures on Vercel.
- Added development-mode admin access for signed-in `@vienovo.ph` users when `AUTH_DEV_BYPASS=1`.

### Admin importer and registry
- Added `/admin/form-imports` to store imported `index.html`, `code.gs`, spreadsheet IDs, and notes.
- Added `/admin/forms` as a forms registry for visibility, status, availability, and navbar control.
- Connected the dashboard, forms list, and navbar to the registry instead of hardcoded form lists.
- Hardened the registry page so it falls back safely instead of throwing an internal server error.
- Added a one-click `Publish for users` action from the importer page.
- Added admin controls to hide forms from users without deleting them.
- Added delete controls for imported registry entries and imported form drafts.

### Dashboard
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
