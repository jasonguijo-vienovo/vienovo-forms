# Importer, Registry, and Forms Backend Plan

## Objective

Make the form importer, forms registry, and runtime form-definition backend more reliable, easier to reason about, and safer to evolve.

This plan covers:

- imported form drafts
- publish and registry sync
- form-definition lookups
- slug rename and delete flows
- runtime readiness and consistency checks
- operational repair and recovery paths

## Why This Matters

The current system already works, but a few backend patterns will get brittle as more imported forms and more request history accumulate:

- importer and registry state is duplicated across `FormImport` and `FormDefinition`
- several admin actions update multiple collections without transaction boundaries
- some runtime lookups load and sync more data than they need
- slug rename and publish flows are doing cross-system work inline
- importer readiness is inferred at action time instead of being stored as a durable status

The goal of this plan is not to redesign the product. It is to make the backend calmer, more predictable, and easier to operate.

## Success Criteria

- import and registry mutations either complete consistently or fail cleanly
- `FormDefinition` becomes the stable runtime-facing source of truth
- runtime form lookups stop loading the full registry when they only need one form
- imported form publish has an explicit readiness gate
- slug rename and delete flows are repairable and auditable
- admins have tooling to detect and fix drift between imports, registry entries, and requests

## Phase 1: Transaction Safety And Consistency

Target outcome: importer and registry writes stop leaving partial state behind.

### Scope

Wrap multi-document admin mutations in shared orchestration functions and Mongo sessions where possible.

### Work

Create a small service layer for importer and registry mutations:

- `src/lib/forms/import-registry-service.ts`

Move cross-document operations out of route action files and into service functions such as:

- `saveImportDraft`
- `publishImportedForm`
- `updateImportConfig`
- `renameImportedFormSlug`
- `deleteImportedForm`
- `hideFormDefinition`

Use transactions for operations that touch more than one logical record:

- `FormImport`
- `FormDefinition`
- `NotificationFlow`
- `RequestModel`
- `Lookup`

### Priority Files

- [src/app/admin/form-imports/actions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/form-imports/actions.ts:1)
- [src/app/admin/forms/actions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/forms/actions.ts:1)
- [src/models/FormImport.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/models/FormImport.ts:1)
- [src/models/FormDefinition.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/models/FormDefinition.ts:1)

### Acceptance Criteria

- a publish failure does not leave an import marked implemented while the registry stays stale
- a slug rename failure does not update some collections but not others
- delete and hide actions behave consistently for imported and native forms
- route actions become thinner and mostly coordinate input, toasts, redirects, and revalidation

### Verification

- unit-style service tests where feasible
- manual failure injection on publish and rename paths
- verify DB state after interrupted or invalid mutations

## Phase 2: Source of Truth Cleanup

Target outcome: runtime-facing form settings have one authoritative home.

### Scope

Reduce duplicated mutable state between `FormImport` and `FormDefinition`.

### Direction

Use `FormDefinition` as the runtime source of truth for:

- slug
- visibility
- availability
- status
- response export settings
- navbar visibility
- implementation state

Keep `FormImport` focused on:

- imported source artifact
- scan summary
- spreadsheet bindings
- import status
- authoring notes
- parse diagnostics
- source version history

### Work

Document which fields are authoritative in which model.

Refactor sync behavior so the importer does not keep re-copying settings back and forth unless explicitly intended.

Add guardrails:

- if an imported registry entry exists, runtime should prefer `FormDefinition`
- importer updates should sync only the fields that truly belong there

### Priority Files

- [src/app/admin/form-imports/actions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/form-imports/actions.ts:1)
- [src/app/admin/forms/actions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/forms/actions.ts:1)
- [src/lib/form-definitions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/lib/form-definitions.ts:1)

### Acceptance Criteria

- there is a documented owner for every mutable field
- response export settings do not drift between importer and registry
- imported runtime behavior no longer depends on whichever document happened to be updated last

### Verification

- compare importer config page values to runtime form behavior
- compare registry settings to submit/export behavior
- run a drift detection script against local/dev data

## Phase 3: Direct Lookup And Query Efficiency

Target outcome: runtime pages stop doing more DB work than necessary.

### Scope

Replace broad “load everything and filter” paths with direct targeted queries.

### Current Hotspot

[src/lib/form-definitions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/lib/form-definitions.ts:1) currently uses `loadAllFromDb()` in places where a single form lookup would be enough, and that path also runs built-in sync logic.

### Work

Split concerns:

- `syncBuiltInForms` should run in an explicit admin-safe sync path, not inside every general lookup
- `getFormDefinitionBySlug` should query a single form directly
- `getCatalogForms` should query by runtime filters instead of loading the full registry first
- `getAllFormDefinitionsForAdmin` can stay broader, but it should be intentionally admin-only

Add indexes if missing for the most common lookup paths:

- `slug`
- `source + status`
- `visibility + availability + status`
- `sortOrder`

### Priority Files

- [src/lib/form-definitions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/lib/form-definitions.ts:1)
- [src/models/FormDefinition.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/models/FormDefinition.ts:1)

### Acceptance Criteria

- single-form runtime pages no longer load the whole registry
- built-in sync is no longer coupled to every form lookup
- requester catalog and navbar queries are more targeted

### Verification

- confirm form pages still respect visibility, availability, and implementation flags
- compare DB query volume locally before and after
- smoke test dashboard, forms catalog, navbar, and imported form pages

## Phase 4: Import Readiness And Stored Diagnostics

Target outcome: imported forms have explicit durable readiness state before publish.

### Scope

Persist importer analysis results and use them for review and gating.

### Work

Store diagnostics on `FormImport`, for example:

- parsed field count
- warnings
- unsupported patterns
- missing spreadsheet bindings
- source checksums
- last parsed at
- readiness status

Add a readiness service:

- parse imported HTML and Apps Script
- calculate warnings and blockers
- persist diagnostics
- decide whether publish is allowed

Suggested model additions on `FormImport`:

- `parseDiagnostics`
- `readinessState`
- `sourceChecksum`
- `lastParsedAt`
- `sourceVersion`

### Publish Gate

Require publish checks such as:

- valid slug
- parsed runtime exists
- no blocking parse errors
- required bindings present
- response sheet config valid if export is enabled
- registry row exists or can be safely created

### Priority Files

- [src/models/FormImport.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/models/FormImport.ts:1)
- [src/lib/imported-forms.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/lib/imported-forms.ts:147)
- [src/app/admin/form-imports/actions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/form-imports/actions.ts:1)

### Acceptance Criteria

- importer review pages show stored diagnostics instead of recomputing everything ad hoc
- publish refuses clearly when blocking issues exist
- draft replacement updates the recorded source version and checksum

### Verification

- import a clean sample and a broken sample
- verify warnings and blockers are stable across page reloads
- confirm publish only succeeds for ready imports

## Phase 5: Slug Rename, Delete, and Repair Hardening

Target outcome: destructive or cross-system changes become auditable and repairable.

### Scope

Turn rename and delete into explicit backend workflows with validation and repair support.

### Work

Refactor slug rename into a dedicated workflow that updates:

- `FormDefinition`
- `FormImport`
- `NotificationFlow`
- `RequestModel`
- `Lookup`
- request mirror collections

Add preflight checks:

- target slug not already in use
- no reserved native slug conflict
- mirror collection rename viability
- imported lookup category rename viability

Add repair commands for:

- re-sync imported registry entries from imports
- repair request `formSlug` drift
- repair orphaned imported registry entries
- repair stale notification flow slugs
- detect missing mirror collections

### Priority Files

- [src/app/admin/forms/actions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/forms/actions.ts:1)
- [src/app/admin/form-imports/actions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/admin/form-imports/actions.ts:1)
- [src/lib/request-mirror.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/lib/request-mirror.ts:1)

### Acceptance Criteria

- rename either completes end to end or fails with no hidden drift
- delete and hide operations leave the system in a known state
- a repair command can detect and fix common importer/registry inconsistencies

### Verification

- rename an imported slug in dev and inspect all downstream systems
- delete an imported registry entry and verify import status/state behavior
- run repair commands against intentionally drifted test data

## Phase 6: Runtime State Projection

Target outcome: runtime form availability becomes easier to interpret and safer to consume.

### Scope

Introduce a derived runtime state instead of repeatedly branching on several fields across pages and actions.

### Work

Add a derived projection or helper that centralizes runtime decisions, for example:

- `runtimeState`
- `canOpen`
- `canSubmit`
- `adminOnly`
- `isPublishedToRequesters`

This can start as a helper in `form-definitions.ts` before becoming a persisted field if needed.

Use it in:

- requester dashboard
- forms catalog
- navbar forms
- imported form page
- imported form submit action

### Priority Files

- [src/lib/form-definitions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/lib/form-definitions.ts:1)
- [src/app/forms/page.tsx](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/forms/page.tsx:1)
- [src/app/forms/[slug]/page.tsx](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/forms/[slug]/page.tsx:1)
- [src/app/forms/[slug]/actions.ts](/c:/Users/JasonGabrielGuijo/Downloads/vienovo-forms/vienovo-forms/src/app/forms/[slug]/actions.ts:1)

### Acceptance Criteria

- runtime gating logic is centralized
- requester-facing pages behave consistently for draft/admin-only/coming-soon/imported forms
- backend submit actions use the same form-state rules as page rendering

### Verification

- test published, draft, admin-only, archived, and unavailable form variants
- compare behavior between page load and submit action

## Phase 7: Auditability And Operations

Target outcome: admins and developers can understand what changed and recover faster.

### Scope

Add stronger audit context, repair tooling, and operational visibility.

### Work

Extend audit logs with:

- previous values
- next values
- actor
- correlation id
- downstream sync results

Add scripts or admin-safe service commands for:

- `validate-import-registry-consistency`
- `repair-import-registry-links`
- `backfill-import-diagnostics`
- `resync-built-in-forms`
- `detect-orphaned-request-form-slugs`

Consider turning heavier mutations into tracked jobs later if they start getting slow.

### Acceptance Criteria

- important admin mutations are traceable
- drift is detectable without manually inspecting collections
- the team has at least one repeatable recovery path per major failure mode

### Verification

- run validation against local/dev data
- inspect audit records after publish, rename, hide, and delete operations

## Recommended Implementation Order

1. Phase 1: transaction safety and shared mutation services
2. Phase 2: source-of-truth cleanup between import and registry
3. Phase 3: direct lookup/query efficiency in `form-definitions.ts`
4. Phase 4: stored diagnostics and publish readiness
5. Phase 5: slug rename/delete hardening and repair commands
6. Phase 6: runtime state projection
7. Phase 7: audit and operational tooling

## Suggested First Sprint

If we want the best payoff with the lowest coordination cost, start here:

- move publish, config update, and slug rename into shared service functions
- add transaction boundaries for importer and registry mutations
- refactor `getFormDefinitionBySlug` into a direct query path
- document authoritative field ownership between `FormImport` and `FormDefinition`

That first sprint will not look flashy in the UI, but it will remove the biggest backend sharp edges quickly.

## Risks And Watchouts

### Migration risk

If we change source-of-truth ownership without a migration plan, the app may read stale settings from the wrong model.

Mitigation:

- document ownership first
- add validation scripts before removing old fallback behavior

### Transaction complexity

Some operations touch non-transaction-friendly external concerns such as mirror collection rename patterns and broad updates.

Mitigation:

- keep the transactional core around primary records first
- use compensating repair scripts for the remaining external steps

### Over-coupling admin and runtime logic

It is easy to put too much admin orchestration into runtime lookup helpers.

Mitigation:

- keep runtime lookups lean
- move admin mutation workflows into dedicated services

## Final Direction

The backend direction I recommend is:

- stable service-layer mutations
- one clear runtime source of truth
- direct lookup paths instead of broad registry loads
- explicit importer readiness and diagnostics
- repairable cross-system workflows

That will make imports safer to publish, registry behavior easier to trust, and form runtime logic much easier to maintain as the system grows.
