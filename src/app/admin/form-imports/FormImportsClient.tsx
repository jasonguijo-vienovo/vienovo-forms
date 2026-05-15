"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  Eye,
  Layers3,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { AdminEmptyState, AdminStatusPill } from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";
import {
  createMissingRegistryEntry,
  deleteFormEverywhere,
  deleteFormImport,
  publishFormImport,
  repairFormImport,
  syncImportedDropdowns,
  updateFormImportConfig,
  updateFormImportStatus,
} from "./actions";

function normalizeLookupKey(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isDefinitionLive(definition: any) {
  return (
    definition?.status === "published" &&
    definition?.visibility === "everyone" &&
    definition?.availability === "available" &&
    (definition?.isImplemented || Boolean(String(definition?.externalFormUrl ?? "").trim()))
  );
}

function definitionLaunchHref(item: any, definition: any) {
  return String(definition?.externalFormUrl ?? "").trim() || `/forms/${item.slug}`;
}

export function FormImportsClient({ imports, definitionBySlug, syncedStatsBySlugKey, versionsByImportId, statuses }: any) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"all" | "blocked" | "needs_review" | "needs_registry" | "needs_sync" | "live">("all");
  const [selectedId, setSelectedId] = useState<string | null>(imports[0]?._id ? String(imports[0]._id) : null);
  const [limit, setLimit] = useState(30);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filtered = useMemo(
    () =>
      imports.filter((item: any) => {
        const definition = definitionBySlug[item.slug];
        const synced = syncedStatsBySlugKey[normalizeLookupKey(item.slug)] ?? { valueCount: 0 };
        const isLive = isDefinitionLive(definition);
        const matches = !q || [item.name, item.slug].join(" ").toLowerCase().includes(q.toLowerCase());
        if (!matches) return false;
        if (view === "blocked") {
          return item.readinessState === "blocked" || (item.parseDiagnostics?.blockerCount ?? 0) > 0;
        }
        if (view === "needs_review") {
          return item.readinessState === "needs-review" || (item.parseDiagnostics?.warningCount ?? 0) > 0;
        }
        if (view === "needs_registry") return !definition;
        if (view === "needs_sync") return needsDropdownSync(item, synced);
        if (view === "live") return isLive;
        return true;
      }),
    [imports, definitionBySlug, syncedStatsBySlugKey, q, view],
  );

  const visible = filtered.slice(0, limit);
  const current = filtered.find((x: any) => String(x._id) === selectedId) ?? filtered[0] ?? null;
  const blockers = filtered.reduce((n: number, it: any) => n + (it.parseDiagnostics?.blockers?.length ?? 0), 0);
  const warnings = filtered.reduce((n: number, it: any) => n + (it.parseDiagnostics?.warnings?.length ?? 0), 0);

  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }

    const selectedExists = filtered.some((entry: any) => String(entry._id) === selectedId);
    if (!selectedExists) setSelectedId(String(filtered[0]._id));
  }, [filtered, selectedId]);

  return (
    <div className="space-y-4">
      {blockers > 0 || warnings > 0 ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Review summary:</span> {blockers} blockers, {warnings} warnings
          across current results.
        </div>
      ) : null}

      <div className="mb-3 flex flex-col gap-3">
        <AdminSearchField value={q} onChange={setQ} placeholder="Search draft by name or form ID" />
        <AdminFilterTabs
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "All" },
            { value: "blocked", label: "Blocked" },
            { value: "needs_review", label: "Needs review" },
            { value: "needs_registry", label: "Needs registry" },
            { value: "needs_sync", label: "Needs sync" },
            { value: "live", label: "Live" },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <AdminEmptyState title="No drafts found" description="Try changing filters or search." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-surface-muted">
              <input
                type="checkbox"
                onChange={(event) => {
                  const next: Record<string, boolean> = {};
                  if (event.target.checked) visible.forEach((v: any) => (next[String(v._id)] = true));
                  setSelected(next);
                }}
              />
              <span>Select visible</span>
            </div>
            {visible.map((item: any) => {
              const definition = definitionBySlug[item.slug];
              const synced = syncedStatsBySlugKey[normalizeLookupKey(item.slug)] ?? { valueCount: 0 };
              const isLive = isDefinitionLive(definition);
              const blockerCount =
                item.parseDiagnostics?.blockerCount ?? item.parseDiagnostics?.blockers?.length ?? 0;
              const warningCount =
                item.parseDiagnostics?.warningCount ?? item.parseDiagnostics?.warnings?.length ?? 0;

              return (
                <button
                  key={String(item._id)}
                  type="button"
                  onClick={() => setSelectedId(String(item._id))}
                  className={`w-full border p-4 text-left ${
                    String(item._id) === selectedId
                      ? "border-brand-400 ring-1 ring-brand-200"
                      : "border-surface-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-surface-text">{item.name}</p>
                      <p className="text-xs text-surface-muted">{item.slug}</p>
                    </div>
                    <div className="flex gap-1">
                      <AdminStatusPill tone={blockerCount > 0 ? "danger" : warningCount > 0 ? "warn" : "ok"}>
                        {readinessLabel(item)}
                      </AdminStatusPill>
                      <AdminStatusPill tone={isLive ? "ok" : "warn"}>{isLive ? "live" : "internal"}</AdminStatusPill>
                      <AdminStatusPill tone={!definition ? "warn" : "brand"}>
                        {!definition ? "registry" : "ready"}
                      </AdminStatusPill>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-surface-muted">
                    {`Fields: ${item.parseDiagnostics?.parsedFieldCount ?? 0} detected · Synced values: ${
                      synced.valueCount ?? 0
                    } · v${item.sourceVersion ?? 1}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    <PipelineChip done label="Draft" />
                    <PipelineChip done={Boolean(definition)} label="Registry" />
                    <PipelineChip done={!needsDropdownSync(item, synced)} label="Sync" />
                    <PipelineChip
                      done={
                        Boolean(item.parseDiagnostics?.parsedFieldCount) ||
                        Boolean(String(item.externalFormUrl ?? "").trim())
                      }
                      label="Preview"
                    />
                    <PipelineChip done={blockerCount === 0} label="Preflight" />
                    <PipelineChip done={isLive} label="Live" />
                  </div>
                </button>
              );
            })}
            {filtered.length > limit ? (
              <button className="btn-secondary w-full" onClick={() => setLimit((n) => n + 30)}>
                Load more
              </button>
            ) : null}
          </div>

          <aside className="admin-panel p-4">
            {current ? (
              <DraftPanel
                key={String(current._id)}
                item={current}
                definition={definitionBySlug[current.slug]}
                synced={syncedStatsBySlugKey[normalizeLookupKey(current.slug)] ?? { valueCount: 0 }}
                versions={versionsByImportId[String(current._id)] ?? []}
                statuses={statuses}
              />
            ) : (
              <p className="text-sm text-surface-muted">Select a draft.</p>
            )}
          </aside>
        </div>
      )}

      <div className="admin-panel p-4">
        <p className="text-sm font-semibold text-surface-text">Bulk actions</p>
        <p className="mb-3 text-xs text-surface-muted">Use on selected visible drafts.</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(selected)
            .filter(([, value]) => value)
            .map(([id]) => (
              <form key={id} action={syncImportedDropdowns}>
                <input type="hidden" name="id" value={id} />
                <PendingSubmitButton
                  type="submit"
                  idleLabel={`Sync ${id.slice(-5)}`}
                  pendingLabel="Syncing..."
                  className="btn-secondary"
                />
              </form>
            ))}
        </div>
      </div>
    </div>
  );
}

function DraftPanel({ item, definition, synced, versions, statuses }: any) {
  const isLive = isDefinitionLive(definition);
  const blockerCount = item.parseDiagnostics?.blockerCount ?? item.parseDiagnostics?.blockers?.length ?? 0;
  const warningCount = item.parseDiagnostics?.warningCount ?? item.parseDiagnostics?.warnings?.length ?? 0;
  const syncedNeeded = needsDropdownSync(item, synced);
  const nextAction =
    blockerCount > 0 ? "fix" : !definition ? "registry" : syncedNeeded ? "sync" : !isLive ? "publish" : "preview";
  const previewHref = definitionLaunchHref(item, definition);
  const previewLabel = definition?.externalFormUrl ? "Open external" : "Preview";
  const localDeleteMessage = `Delete the import draft for ${item.name} only? This keeps request data and may leave the registry record behind if it was created separately.`;
  const globalDeleteMessage = `Delete ${item.name} everywhere?\n\nThis will remove the import record, registry record, request data, imported lookups, notification flows, notification delivery logs, and mirror collections for ${item.slug}.`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-surface-text">Edit import settings</h3>
          <p className="text-xs text-surface-muted">
            Selected form: <span className="font-medium text-surface-text">{item.name}</span> ({item.slug})
          </p>
        </div>
        <Link href={previewHref} className="btn-secondary">
          <Eye className="h-4 w-4" />
          {previewLabel}
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <AdminStatusPill tone={blockerCount > 0 ? "danger" : warningCount > 0 ? "warn" : "ok"}>
          {readinessLabel(item)}
        </AdminStatusPill>
        <AdminStatusPill tone={isLive ? "ok" : "warn"}>{isLive ? "Live" : "Internal only"}</AdminStatusPill>
        <AdminStatusPill tone="brand">{item.status}</AdminStatusPill>
        <AdminStatusPill tone="brand">v{item.sourceVersion ?? 1}</AdminStatusPill>
      </div>
      <p className="text-xs text-surface-muted">
        Last parsed: {item.lastParsedAt ? new Date(item.lastParsedAt).toLocaleString() : "Not recorded"}
      </p>
      <ImportReadinessPanel item={item} definition={definition} synced={synced} />
      <VersionHistory key={`versions-${String(item._id)}`} rows={versions ?? []} item={item} />

      <details key={`status-${String(item._id)}`}>
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">
          {`Status - ${item.name} (${item.slug})`}
        </summary>
        <form action={updateFormImportStatus} className="mt-2 space-y-2">
          <input type="hidden" name="id" value={String(item._id)} />
          <input type="hidden" name="tab" value="manage" />
          <input type="hidden" name="inline" value="1" />
          <select name="status" defaultValue={item.status} className="field-input">
            {statuses.map((status: string) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <PendingSubmitButton
            type="submit"
            idleLabel="Update status"
            pendingLabel="Saving..."
            className="btn-secondary"
          />
        </form>
      </details>

      <details key={`spreadsheet-${String(item._id)}`}>
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">
          {`Spreadsheet - ${item.spreadsheetId ? "Connected" : "Not connected"}`}
        </summary>
        <form action={updateFormImportConfig} className="mt-2 space-y-2">
          <input type="hidden" name="id" value={String(item._id)} />
          <input type="hidden" name="tab" value="manage" />
          <input type="hidden" name="inline" value="1" />
          <input
            name="externalFormUrl"
            defaultValue={item.externalFormUrl ?? ""}
            className="field-input"
            placeholder="External form URL (optional)"
          />
          <input
            name="spreadsheetId"
            defaultValue={item.spreadsheetId ?? ""}
            className="field-input"
            placeholder="Spreadsheet ID"
          />
          <input
            name="responseSheetName"
            defaultValue={item.responseSheetName ?? ""}
            className="field-input"
            placeholder="Response sheet tab"
          />
          <label className="flex items-center gap-2 text-sm text-surface-text">
            <input
              type="checkbox"
              name="writeResponsesToSheet"
              defaultChecked={Boolean(item.writeResponsesToSheet)}
              className="accent-brand-600"
            />
            <span>Copy submissions to response sheet</span>
          </label>
          <textarea
            name="spreadsheetBindings"
            rows={4}
            defaultValue={JSON.stringify(item.spreadsheetBindings ?? {}, null, 2)}
            className="field-input font-mono text-xs"
          />
          <PendingSubmitButton
            type="submit"
            idleLabel="Save settings"
            pendingLabel="Saving..."
            className="btn-secondary"
          />
        </form>
      </details>

      <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-surface-border bg-white pt-3">
        {nextAction === "fix" ? (
          <a href="#import-readiness" className="btn-primary">
            <AlertTriangle className="h-4 w-4" />
            Fix blockers first
          </a>
        ) : null}
        {nextAction === "registry" ? (
          <form action={createMissingRegistryEntry}>
            <input type="hidden" name="id" value={String(item._id)} />
            <input type="hidden" name="tab" value="manage" />
            <input type="hidden" name="inline" value="1" />
            <PendingSubmitButton
              type="submit"
              idleLabel="Next: Add registry"
              pendingLabel="Working..."
              className="btn-primary"
            />
          </form>
        ) : null}
        {nextAction === "sync" ? (
          <form action={syncImportedDropdowns}>
            <input type="hidden" name="id" value={String(item._id)} />
            <input type="hidden" name="tab" value="manage" />
            <input type="hidden" name="inline" value="1" />
            <PendingSubmitButton
              type="submit"
              idleLabel="Next: Sync from spreadsheet"
              pendingLabel="Syncing dropdown values..."
              busyTimeoutMs={120000}
              className="btn-primary"
            />
          </form>
        ) : null}
        {nextAction === "publish" ? (
          <form action={publishFormImport}>
            <input type="hidden" name="id" value={String(item._id)} />
            <input type="hidden" name="tab" value="manage" />
            <input type="hidden" name="inline" value="1" />
            <PendingSubmitButton
              type="submit"
              idleLabel="Next: Publish live"
              pendingLabel="Publishing..."
              className="btn-primary"
            />
          </form>
        ) : null}
        {nextAction === "preview" ? (
          <Link href={previewHref} className="btn-primary">
            <Eye className="h-4 w-4" />
            {definition?.externalFormUrl ? "Next: Open external form" : "Next: Open preview"}
          </Link>
        ) : null}
        <form action={publishFormImport}>
          <input type="hidden" name="id" value={String(item._id)} />
          <input type="hidden" name="dryRun" value="1" />
          <input type="hidden" name="tab" value="manage" />
          <input type="hidden" name="inline" value="1" />
          <PendingSubmitButton
            type="submit"
            idleLabel={
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Preflight
              </span>
            }
            pendingLabel="Checking..."
            className="btn-secondary"
          />
        </form>
        <form action={repairFormImport}>
          <input type="hidden" name="id" value={String(item._id)} />
          <input type="hidden" name="tab" value="manage" />
          <input type="hidden" name="inline" value="1" />
          <PendingSubmitButton
            type="submit"
            idleLabel={
              <span className="inline-flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Repair linkage
              </span>
            }
            pendingLabel="Repairing..."
            className="btn-secondary"
          />
        </form>
        {!definition ? (
          <form action={createMissingRegistryEntry}>
            <input type="hidden" name="id" value={String(item._id)} />
            <input type="hidden" name="tab" value="manage" />
            <input type="hidden" name="inline" value="1" />
            <PendingSubmitButton
              type="submit"
              idleLabel={
                <span className="inline-flex items-center gap-2">
                  <Layers3 className="h-4 w-4" />
                  Add registry
                </span>
              }
              pendingLabel="Working..."
              className="btn-secondary"
            />
          </form>
        ) : null}
        <form action={syncImportedDropdowns}>
          <input type="hidden" name="id" value={String(item._id)} />
          <input type="hidden" name="tab" value="manage" />
          <input type="hidden" name="inline" value="1" />
          <PendingSubmitButton
            type="submit"
            idleLabel={
              <span className="inline-flex items-center gap-2">
                <DatabaseZap className="h-4 w-4" />
                Sync
              </span>
            }
            pendingLabel="Syncing dropdown values..."
            busyTimeoutMs={120000}
            className="btn-secondary"
          />
        </form>
        <form action={publishFormImport}>
          <input type="hidden" name="id" value={String(item._id)} />
          <input type="hidden" name="tab" value="manage" />
          <input type="hidden" name="inline" value="1" />
          <PendingSubmitButton
            type="submit"
            disabled={blockerCount > 0}
            idleLabel={
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Publish
              </span>
            }
            pendingLabel="Publishing..."
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
        </form>
        <form
          action={deleteFormImport}
          onSubmit={(event) => {
            if (!confirm(localDeleteMessage)) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={String(item._id)} />
          <input type="hidden" name="tab" value="manage" />
          <input type="hidden" name="inline" value="1" />
          <PendingSubmitButton
            type="submit"
            idleLabel={
              <span className="inline-flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                Delete draft only
              </span>
            }
            pendingLabel="Deleting..."
            className="border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700"
          />
        </form>
        <form
          action={deleteFormEverywhere}
          onSubmit={(event) => {
            if (!confirm(globalDeleteMessage)) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={String(item._id)} />
          <input type="hidden" name="slug" value={String(item.slug)} />
          <input type="hidden" name="tab" value="manage" />
          <input type="hidden" name="inline" value="1" />
          <PendingSubmitButton
            type="submit"
            idleLabel={
              <span className="inline-flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                Delete everywhere
              </span>
            }
            pendingLabel="Deleting..."
            className="border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800"
          />
        </form>
      </div>
    </div>
  );
}

function VersionHistory({ rows, item }: { rows: any[]; item: any }) {
  return (
    <details className="rounded border border-surface-border bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-brand-700">
        {`Version history (${rows.length}) - ${item.slug}`}
      </summary>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-surface-muted">No version snapshots recorded yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.slice(0, 8).map((row) => (
            <div key={String(row._id)} className="rounded border border-surface-border bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-surface-text">
                    v{row.sourceVersion} · {String(row.event ?? "").replace(/-/g, " ")}
                  </p>
                  <p className="mt-1 text-xs text-surface-muted">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : "No timestamp"}
                    {row.createdByEmail ? ` by ${row.createdByEmail}` : ""}
                  </p>
                </div>
                <AdminStatusPill tone={row.readinessState === "blocked" ? "danger" : row.readinessState === "needs-review" ? "warn" : "ok"}>
                  {row.readinessState || "snapshot"}
                </AdminStatusPill>
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function PipelineChip({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={`rounded border px-2 py-0.5 ${
        done ? "border-green-200 bg-green-50 text-green-800" : "border-surface-border bg-white text-surface-muted"
      }`}
    >
      {label}
    </span>
  );
}

function readinessLabel(item: any) {
  const blockers = item.parseDiagnostics?.blockerCount ?? item.parseDiagnostics?.blockers?.length ?? 0;
  const warnings = item.parseDiagnostics?.warningCount ?? item.parseDiagnostics?.warnings?.length ?? 0;
  if (blockers > 0 || item.readinessState === "blocked") return "blocked";
  if (warnings > 0 || item.readinessState === "needs-review") return "needs review";
  return "ready";
}

function needsDropdownSync(item: any, synced: any) {
  const missingBindings = item.parseDiagnostics?.missingBindings?.length ?? 0;
  return Boolean(item.spreadsheetId) && missingBindings > 0 && Number(synced?.valueCount ?? 0) === 0;
}

function ImportReadinessPanel({ item, definition, synced }: any) {
  const blockers = item.parseDiagnostics?.blockers ?? [];
  const warnings = item.parseDiagnostics?.warnings ?? [];
  const missingBindings = item.parseDiagnostics?.missingBindings ?? [];
  const hasIssues =
    blockers.length > 0 ||
    warnings.length > 0 ||
    missingBindings.length > 0 ||
    !definition ||
    definition?.source !== "imported" ||
    String(definition?.importSourceId ?? "") !== String(item._id) ||
    String(definition?.routePath ?? "") !== `/forms/${item.slug}`;

  return (
    <section id="import-readiness" className="rounded border border-surface-border bg-surface-subtle p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-surface-text">Publish readiness</p>
          <p className="text-xs text-surface-muted">
            {`${item.parseDiagnostics?.parsedFieldCount ?? 0} fields detected · ${synced?.valueCount ?? 0} synced lookup values`}
          </p>
        </div>
        <AdminStatusPill tone={blockers.length > 0 ? "danger" : warnings.length > 0 ? "warn" : "ok"}>
          {readinessLabel(item)}
        </AdminStatusPill>
      </div>
      {!hasIssues ? (
        <p className="mt-3 text-sm text-green-800">
          No blockers found. This import can be published after final preview.
        </p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          {!definition ? (
            <IssueLine
              tone="warn"
              text="Registry entry is missing. Use Add registry or Repair linkage to rebuild it."
            />
          ) : null}
          {definition && definition.source !== "imported" ? (
            <IssueLine
              tone="danger"
              text={`Registry source drift detected: expected imported but found ${definition.source}. Use Repair linkage.`}
            />
          ) : null}
          {definition && String(definition.importSourceId ?? "") !== String(item._id) ? (
            <IssueLine
              tone="warn"
              text="Registry import link is stale or missing. Use Repair linkage to relink this draft."
            />
          ) : null}
          {definition && String(definition.routePath ?? "") !== `/forms/${item.slug}` ? (
            <IssueLine
              tone="warn"
              text={`Route drift detected: registry route is ${definition.routePath || "(empty)"} but expected /forms/${item.slug}.`}
            />
          ) : null}
          {blockers.map((entry: string) => (
            <IssueLine key={`blocker-${entry}`} tone="danger" text={entry} />
          ))}
          {warnings.map((entry: string) => (
            <IssueLine key={`warning-${entry}`} tone="warn" text={entry} />
          ))}
          {missingBindings.length > 0 ? (
            <IssueLine tone="warn" text={`Dropdown fields still need synced values: ${missingBindings.join(", ")}`} />
          ) : null}
        </div>
      )}
    </section>
  );
}

function IssueLine({ tone, text }: { tone: "danger" | "warn"; text: string }) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        tone === "danger"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      {text}
    </div>
  );
}
