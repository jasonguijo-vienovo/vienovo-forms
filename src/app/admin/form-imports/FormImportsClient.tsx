"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, DatabaseZap, Eye, Layers3, Trash2 } from "lucide-react";
import Link from "next/link";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { AdminEmptyState, AdminStatusPill } from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";
import { createMissingRegistryEntry, deleteFormImport, publishFormImport, syncImportedDropdowns, updateFormImportConfig, updateFormImportStatus } from "./actions";

export function FormImportsClient({ imports, definitionBySlug, syncedStatsBySlugKey, statuses }: any) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"all"|"needs_registry"|"needs_sync"|"live">("all");
  const [selectedId, setSelectedId] = useState<string | null>(imports[0]?._id ? String(imports[0]._id) : null);
  const [limit, setLimit] = useState(30);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => imports.filter((item: any) => {
    const definition = definitionBySlug[item.slug];
    const synced = syncedStatsBySlugKey[item.slug] ?? { valueCount: 0 };
    const isLive = definition?.status === "published" && definition?.visibility === "everyone" && definition?.availability === "available" && definition?.isImplemented;
    const matches = !q || [item.name, item.slug].join(" ").toLowerCase().includes(q.toLowerCase());
    if (!matches) return false;
    if (view === "needs_registry") return !definition;
    if (view === "needs_sync") return Boolean(item.spreadsheetId) && synced.valueCount === 0;
    if (view === "live") return isLive;
    return true;
  }), [imports, definitionBySlug, syncedStatsBySlugKey, q, view]);

  const visible = filtered.slice(0, limit);
  const current = filtered.find((x: any) => String(x._id) === selectedId) ?? filtered[0] ?? null;
  const blockers = filtered.reduce((n: number, it: any) => n + (it.parseDiagnostics?.blockers?.length ?? 0), 0);
  const warnings = filtered.reduce((n: number, it: any) => n + (it.parseDiagnostics?.warnings?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      {(blockers > 0 || warnings > 0) ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Review summary:</span> {blockers} blockers, {warnings} warnings across current results.
        </div>
      ) : null}
      <div className="mb-3 flex flex-col gap-3">
        <AdminSearchField value={q} onChange={setQ} placeholder="Search draft by name or form ID" />
        <AdminFilterTabs value={view} onChange={setView} options={[{value:"all",label:"All"},{value:"needs_registry",label:"Needs registry"},{value:"needs_sync",label:"Needs sync"},{value:"live",label:"Live"}]} />
      </div>

      {filtered.length === 0 ? <AdminEmptyState title="No drafts found" description="Try changing filters or search." /> : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-surface-muted">
              <input type="checkbox" onChange={(e)=>{
                const next: Record<string, boolean> = {};
                if (e.target.checked) visible.forEach((v:any)=>next[String(v._id)] = true);
                setSelected(next);
              }} /> Select visible
            </div>
              {visible.map((item: any) => {
              const definition = definitionBySlug[item.slug];
              const synced = syncedStatsBySlugKey[item.slug] ?? { valueCount: 0 };
              const isLive = definition?.status === "published" && definition?.visibility === "everyone" && definition?.availability === "available" && definition?.isImplemented;
                return <button key={String(item._id)} type="button" onClick={()=>setSelectedId(String(item._id))} className={`w-full border p-4 text-left ${String(item._id)===selectedId?"border-brand-400 ring-1 ring-brand-200":"border-surface-border"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-surface-text">{item.name}</p>
                    <p className="text-xs text-surface-muted">{item.slug}</p>
                  </div>
                  <div className="flex gap-1">
                    <AdminStatusPill tone={isLive?"ok":"warn"}>{isLive?"live":"internal"}</AdminStatusPill>
                    <AdminStatusPill tone={!definition?"warn":"brand"}>{!definition?"registry":"ready"}</AdminStatusPill>
                  </div>
                </div>
                <p className="mt-2 text-xs text-surface-muted">Synced values: {synced.valueCount ?? 0}</p>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                  <PipelineChip done label="Draft" />
                  <PipelineChip done={Boolean(definition)} label="Registry" />
                  <PipelineChip done={!item.spreadsheetId || (synced.valueCount ?? 0) > 0} label="Sync" />
                  <PipelineChip done={Boolean(item.parseDiagnostics?.parsedFieldCount)} label="Preview" />
                  <PipelineChip done={isLive} label="Live" />
                </div>
              </button>;
            })}
            {filtered.length > limit ? <button className="btn-secondary w-full" onClick={()=>setLimit((n)=>n+30)}>Load more</button> : null}
          </div>

          <aside className="admin-panel p-4">
            {current ? <DraftPanel item={current} definition={definitionBySlug[current.slug]} statuses={statuses} /> : <p className="text-sm text-surface-muted">Select a draft.</p>}
          </aside>
        </div>
      )}

      <div className="admin-panel p-4">
        <p className="text-sm font-semibold text-surface-text">Bulk actions</p>
        <p className="mb-3 text-xs text-surface-muted">Use on selected visible drafts.</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(selected).filter(([,v])=>v).map(([id]) => (
            <form key={id} action={syncImportedDropdowns}><input type="hidden" name="id" value={id} /><PendingSubmitButton type="submit" idleLabel={`Sync ${id.slice(-5)}`} pendingLabel="Syncing..." className="btn-secondary" /></form>
          ))}
        </div>
      </div>
    </div>
  );
}

function DraftPanel({ item, definition, statuses }: any) {
  const isLive = definition?.status === "published" && definition?.visibility === "everyone" && definition?.availability === "available" && definition?.isImplemented;
  const syncedNeeded = Boolean(item.spreadsheetId);
  const nextAction = !definition ? "registry" : (syncedNeeded ? "sync" : (!isLive ? "publish" : "preview"));
  return <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-surface-text">Edit import settings</h3>
      <Link href={`/forms/${item.slug}`} className="btn-secondary"><Eye className="h-4 w-4" />Preview</Link>
    </div>
    <div className="flex flex-wrap gap-2">
      <AdminStatusPill tone={isLive?"ok":"warn"}>{isLive?"Live":"Internal only"}</AdminStatusPill>
      <AdminStatusPill tone="brand">{item.status}</AdminStatusPill>
    </div>
    <details><summary className="cursor-pointer text-sm font-semibold text-brand-700">Status</summary>
      <form action={updateFormImportStatus} className="mt-2 space-y-2"><input type="hidden" name="id" value={String(item._id)} />
        <select name="status" defaultValue={item.status} className="field-input">{statuses.map((s:string)=><option key={s} value={s}>{s}</option>)}</select>
        <PendingSubmitButton type="submit" idleLabel="Update status" pendingLabel="Saving..." className="btn-secondary" />
      </form>
    </details>
    <details><summary className="cursor-pointer text-sm font-semibold text-brand-700">Spreadsheet</summary>
      <form action={updateFormImportConfig} className="mt-2 space-y-2"><input type="hidden" name="id" value={String(item._id)} />
        <input name="spreadsheetId" defaultValue={item.spreadsheetId ?? ""} className="field-input" placeholder="Spreadsheet ID" />
        <textarea name="spreadsheetBindings" rows={4} defaultValue={JSON.stringify(item.spreadsheetBindings ?? {}, null, 2)} className="field-input font-mono text-xs" />
        <PendingSubmitButton type="submit" idleLabel="Save settings" pendingLabel="Saving..." className="btn-secondary" />
      </form>
    </details>
    <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-surface-border bg-white pt-3">
      {nextAction === "registry" ? <form action={createMissingRegistryEntry}><input type="hidden" name="id" value={String(item._id)} /><PendingSubmitButton type="submit" idleLabel="Next: Add registry" pendingLabel="Working..." className="btn-primary" /></form> : null}
      {nextAction === "sync" ? <form action={syncImportedDropdowns}><input type="hidden" name="id" value={String(item._id)} /><PendingSubmitButton type="submit" idleLabel="Next: Sync from spreadsheet" pendingLabel="Syncing..." className="btn-primary" /></form> : null}
      {nextAction === "publish" ? <form action={publishFormImport}><input type="hidden" name="id" value={String(item._id)} /><PendingSubmitButton type="submit" idleLabel="Next: Publish live" pendingLabel="Publishing..." className="btn-primary" /></form> : null}
      {nextAction === "preview" ? <Link href={`/forms/${item.slug}`} className="btn-primary"><Eye className="h-4 w-4" />Next: Open preview</Link> : null}
      {!definition ? <form action={createMissingRegistryEntry}><input type="hidden" name="id" value={String(item._id)} /><PendingSubmitButton type="submit" idleLabel={<span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4" />Add registry</span>} pendingLabel="Working..." className="btn-secondary" /></form> : null}
      <form action={syncImportedDropdowns}><input type="hidden" name="id" value={String(item._id)} /><PendingSubmitButton type="submit" idleLabel={<span className="inline-flex items-center gap-2"><DatabaseZap className="h-4 w-4" />Sync</span>} pendingLabel="Syncing..." className="btn-secondary" /></form>
      <form action={publishFormImport}><input type="hidden" name="id" value={String(item._id)} /><PendingSubmitButton type="submit" idleLabel={<span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Publish</span>} pendingLabel="Publishing..." className="btn-primary" /></form>
      <form action={deleteFormImport} onSubmit={(e)=>{ if (!confirm("Delete this import draft?")) e.preventDefault(); }}><input type="hidden" name="id" value={String(item._id)} /><PendingSubmitButton type="submit" idleLabel={<span className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4" />Delete</span>} pendingLabel="Deleting..." className="border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700" /></form>
    </div>
  </div>;
}

function PipelineChip({ done, label }: { done: boolean; label: string }) {
  return <span className={`rounded border px-2 py-0.5 ${done ? "border-green-200 bg-green-50 text-green-800" : "border-surface-border bg-white text-surface-muted"}`}>{label}</span>;
}
