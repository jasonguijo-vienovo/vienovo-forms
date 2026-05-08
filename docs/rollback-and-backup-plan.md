# Rollback and Backup Plan

## Purpose

This plan protects the current working Vienovo Forms system before and during the full UI redesign. The goal is simple: redesign freely, but keep a clean path back if the new UI is confusing, broken, slow, or just looks bad.

Use this before starting any major Google Stitch implementation work.

## Current Stable Point

Before redesign work starts, create a known-good marker in Git.

Recommended stable tag:

```powershell
git checkout main
git pull origin main
git tag stable-before-stitch-redesign
git push origin stable-before-stitch-redesign
```

This gives us a named recovery point even if `main` moves forward.

## Redesign Branch Rule

Do the redesign on a separate branch first.

Recommended branch:

```powershell
git checkout -b redesign/google-stitch-ui
git push -u origin redesign/google-stitch-ui
```

Do not start the redesign directly on `main` unless the change is tiny. For the full visual rebuild, use the branch and deploy it as a Vercel preview.

## What To Back Up

Back up these five things before heavy UI work:

- Git stable tag.
- Vercel production deployment.
- MongoDB database.
- Vercel environment variables.
- Current UI screenshots.

## Git Rollback

Use this when the code needs to return to the stable pre-redesign version.

### Option A: Revert the redesign commits

Use this if redesign commits were already pushed to `main` and we want a normal Git history.

```powershell
git checkout main
git pull origin main
git revert <first-redesign-commit>^..<last-redesign-commit>
git push origin main
```

This creates a new commit that undoes the redesign.

### Option B: Restore from the stable tag

Use this only if we deliberately decide to reset `main` back to the stable tag. This is stronger and should be done carefully.

```powershell
git checkout main
git pull origin main
git reset --hard stable-before-stitch-redesign
git push origin main --force-with-lease
```

Use `--force-with-lease`, not plain force push.

## Vercel Rollback

Use this if production deploys but the UI is bad or broken.

Steps:

1. Open Vercel project.
2. Go to `Deployments`.
3. Find the last good production deployment before the redesign.
4. Click the deployment menu.
5. Choose `Promote to Production` or `Redeploy`, depending on what Vercel shows.
6. Verify `/dashboard`, `/forms`, `/admin`, and one imported form.

Recommended note:

Write down the deployment ID before redesign starts.

Example:

```text
Last known good production deployment:
dpl_XXXXXXXXXXXXXXXXXXXXXXXX
```

## MongoDB Backup

The redesign should not change schema or request storage, but we should still back up MongoDB before large UI work because forms, imports, registry, approvers, dropdowns, and requests are all stored there.

### MongoDB Atlas Backup

If using MongoDB Atlas:

1. Open Atlas.
2. Go to the cluster.
3. Open `Backup`.
4. Create an on-demand snapshot if available.
5. Label it `before-stitch-redesign`.

### Manual Export Backup

If using `mongodump`, run this from a trusted machine with the production connection string.

```powershell
mongodump --uri="<PRODUCTION_MONGODB_URI>" --out="backups/mongodb-before-stitch-redesign"
```

Do not commit the backup folder. It can contain sensitive data.

### Collections To Verify

After backup, make sure these collections exist in the backup:

- `requests`
- `formdefinitions`
- `formimports`
- `lookups`
- `approvers`
- `notificationflows`
- `employees`
- `reimbursementroutes`
- `counters`

## MongoDB Restore

Use restore only if data was damaged, not just because the UI looks bad.

```powershell
mongorestore --uri="<PRODUCTION_MONGODB_URI>" --drop "backups/mongodb-before-stitch-redesign"
```

This can overwrite production data. Pause and confirm before running it.

## Vercel Environment Variable Backup

Before redesign work, export or manually record the current production environment variables.

Important variables:

- `MONGODB_URI`
- `AUTH_SECRET`
- `AUTH_URL`
- `AUTH_MICROSOFT_ENTRA_ID_ID`
- `AUTH_MICROSOFT_ENTRA_ID_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ISSUER`
- `ADMIN_EMAILS`
- `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEETS_MASTER_ID`
- `GOOGLE_DRIVE_TRAVEL_BOOKING_FOLDER_ID`
- `GOOGLE_DRIVE_CASH_ADVANCE_FOLDER_ID`
- `GOOGLE_DRIVE_REIMBURSEMENT_FOLDER_ID`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`

Store the backup in a secure password manager or Vercel environment backup. Do not commit secrets to the repo.

## Screenshot Backup

Capture current screenshots before redesign. These are not just visual references. They are also rollback comparison material.

Minimum screenshot set:

- Sign in.
- Dashboard.
- Forms list.
- Travel Booking form.
- Cash Advance form.
- Reimbursement form.
- One imported form.
- Request detail.
- Admin overview.
- Form importer.
- Forms registry.
- Dropdowns.
- Approvers.
- Processors.
- Notification flow.
- Reimbursement routing.
- Toast success.
- Validation error.
- Empty state.

Suggested folder outside repo:

```text
Vienovo Forms UI Backup - before Stitch redesign
```

If screenshots are added to the repo later, use:

```text
docs/screenshots/before-redesign/
```

Avoid screenshots that expose secrets, private keys, SMTP passwords, or sensitive employee data.

## Redesign Safety Rules

During redesign:

- Keep backend actions unchanged unless a UI change truly needs it.
- Keep routes unchanged.
- Keep MongoDB models unchanged.
- Keep imported form submit bridge unchanged unless specifically testing imported forms.
- Keep Google Sheets write-back unchanged.
- Keep admin-only diagnostics out of requester views.
- Make one page group at a time.
- Typecheck after each meaningful page group.
- Use Vercel preview before merging to `main`.

## Required Smoke Test Before Merge

Before merging redesign to `main`, test these flows:

- Sign in works.
- Dashboard loads.
- New request page lists available forms.
- Native form submits and creates a MongoDB request.
- Imported form submits and creates a MongoDB request.
- Imported dropdowns do not reload the page.
- Request detail opens.
- Approver can approve.
- Approver can reject.
- Admin overview loads.
- Form importer loads without timeout.
- Forms registry saves settings.
- Dropdowns can add/edit/delete values.
- Approvers can add/edit/delete.
- Processors can add/edit/delete.
- Notification flow can save.
- SMTP test button runs and shows a readable toast.

## Rollback Decision Checklist

Rollback if any of these happen in production:

- Requesters cannot submit forms.
- Imported forms cannot submit.
- Admin cannot access `/admin`.
- Forms registry cannot load.
- Requests are saved incorrectly.
- The UI hides live forms from requesters by mistake.
- Vercel build fails and cannot deploy a quick fix.
- The redesign makes the workflow materially harder to understand.

Do not rollback only because of small visual polish issues. Fix those forward on the redesign branch if the core flows are healthy.

## Fast Recovery Path

If production is broken after redesign:

1. Promote the last good Vercel deployment.
2. If code also needs to be restored, revert the redesign commits on `main`.
3. Check MongoDB data was not damaged.
4. If data was damaged, restore from the pre-redesign backup.
5. Document what failed in `docs/changelog.md`.

## Redesign Merge Rule

Merge to `main` only when:

- `npm run typecheck` passes.
- Vercel preview deploy works.
- Requester smoke tests pass.
- Admin smoke tests pass.
- At least one imported form is tested.
- Screenshots are captured for the new design.

## Notes

- `npm run lint` currently opens the Next.js ESLint setup prompt, so typecheck is the reliable local verification command until lint is configured.
- The production database is the most important asset. UI can be rolled back quickly; damaged request data is harder to recover.
