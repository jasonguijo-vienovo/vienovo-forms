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

### Imported form runtime
- Added generic imported-form routes at `/forms/[slug]`.
- Imported forms can now render a usable runtime for end users instead of staying as admin-only metadata.
- Imported form submissions now save into the app request system and open on the normal request detail page.
- Added request detail support for imported-form field display.
- Added imported-form reference numbering and request model support.

### Google Sheets support
- Added Google Sheets read support using the existing service account pattern.
- Imported forms can now load dropdown options from Sheets.
- Added explicit `spreadsheetBindings` JSON support for forced field-to-range mappings.
- Added automatic spreadsheet scanning by sheet tabs and header rows.
- Added admin-side spreadsheet scan preview so imports show detected tabs, field mappings, and warnings.
- Added optional write-back of imported submissions into Google Sheets response tabs.
- Added response export configuration on the importer page, including a target response tab name.

### Notes
- Lint is still not configured in this repo. `npm run lint` opens the Next.js ESLint setup prompt.
- Verification used `npm run typecheck` for the changes above.
