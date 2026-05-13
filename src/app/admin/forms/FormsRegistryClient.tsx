"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, FileInput, Save, Trash2, Undo2, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  AdminEmptyState,
  AdminHelpPanel,
  AdminMetricCard,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";
import { backfillFixedAssetItemCodeSheet, deleteFormDefinition, deleteFormEverywhere, hideFormDefinition, updateFormDefinition } from "./actions";

type RegistryForm = {
  _id?: string;
  importSourceId?: string;
  slug: string;
  name: string;
  description: string;
  routePath: string;
  externalFormUrl: string;
  source: "native" | "imported";
  status: string;
  visibility: string;
  availability: string;
  isImplemented: boolean;
  showInNavbar: boolean;
  writeResponsesToSheet: boolean;
  responseSpreadsheetId: string;
  responseSheetName: string;
  triggerEnabled: boolean;
  triggerUrl: string;
  triggerSource: string;
  triggerEvent: string;
  triggerFunctionName: string;
  triggerNotes: string;
  notes: string;
};

type ViewFilter = "all" | "live" | "draft" | "admin" | "imported";

export function FormsRegistryClient({
  forms,
  importedSlugSet,
  liveCount,
  publishedCount,
  draftCount,
  importedCount,
  hasOnlyBuiltIns,
  statusOptions,
  visibilityOptions,
  availabilityOptions,
}: {
  forms: RegistryForm[];
  importedSlugSet: string[];
  liveCount: number;
  publishedCount: number;
  draftCount: number;
  importedCount: number;
  hasOnlyBuiltIns: boolean;
  statusOptions: string[];
  visibilityOptions: string[];
  availabilityOptions: string[];
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("all");
  const [visibleCount, setVisibleCount] = useState(40);
  const importedSet = useMemo(() => new Set(importedSlugSet), [importedSlugSet]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedSlugFromUrl = searchParams.get("form") ?? "";
  const settingsFromUrl = searchParams.get("settings");
  const [selectedSlug, setSelectedSlug] = useState(selectedSlugFromUrl);
  const [isSettingsOpen, setIsSettingsOpen] = useState(settingsFromUrl === "open");
  const [draftDirty, setDraftDirty] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 180);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    setSelectedSlug(selectedSlugFromUrl);
    setIsSettingsOpen(settingsFromUrl === "open");
  }, [selectedSlugFromUrl, settingsFromUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (settingsFromUrl) return;
    const saved = window.localStorage.getItem("admin_forms_settings_open");
    if (saved === "1") setIsSettingsOpen(true);
  }, [settingsFromUrl]);

  const filteredForms = useMemo(() => {
    return forms.filter((form) => {
      const matchesQuery =
        !debouncedQuery ||
        [form.name, form.slug, form.description, form.routePath, form.externalFormUrl]
          .join(" ")
          .toLowerCase()
          .includes(debouncedQuery);

      if (!matchesQuery) return false;
      if (view === "live") return isLiveForRequesters(form);
      if (view === "draft") return form.status === "draft";
      if (view === "admin") return form.visibility === "admin";
      if (view === "imported") return form.source === "imported";
      return true;
    });
  }, [debouncedQuery, forms, view]);

  const visibleForms = useMemo(() => filteredForms.slice(0, visibleCount), [filteredForms, visibleCount]);

  const selectedForm = useMemo(
    () => filteredForms.find((form) => form.slug === selectedSlug) ?? filteredForms[0] ?? null,
    [filteredForms, selectedSlug]
  );

  useEffect(() => {
    if (!selectedForm && isSettingsOpen) {
      setIsSettingsOpen(false);
    }
  }, [selectedForm, isSettingsOpen]);

  useEffect(() => {
    setVisibleCount(40);
  }, [debouncedQuery, view]);

  function syncUrl(nextSlug: string | null, open: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextSlug) params.set("form", nextSlug);
    else params.delete("form");
    if (open) params.set("settings", "open");
    else params.delete("settings");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function openSettingsFor(slug: string) {
    setSelectedSlug(slug);
    setIsSettingsOpen(true);
    setDraftDirty(false);
    setIsEditMode(false);
    if (typeof window !== "undefined") window.localStorage.setItem("admin_forms_settings_open", "1");
    if (typeof window !== "undefined") {
      const key = "admin_forms_metrics_open_count";
      const current = Number(window.localStorage.getItem(key) ?? "0");
      window.localStorage.setItem(key, String(current + 1));
    }
    syncUrl(slug, true);
  }

  function closeSettings() {
    setIsSettingsOpen(false);
    setDraftDirty(false);
    setIsEditMode(false);
    if (typeof window !== "undefined") window.localStorage.setItem("admin_forms_settings_open", "0");
    syncUrl(selectedForm?.slug ?? null, false);
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Form operations"
        title="Forms registry"
        description="Control which forms people can see, which ones are still internal, and which ones are ready to open."
        actions={
          <>
            <Link href="/admin/form-imports" className="btn-primary">
              <FileInput className="h-4 w-4" />
              Import form
            </Link>
            <form action={backfillFixedAssetItemCodeSheet}>
              <PendingSubmitButton
                type="submit"
                idleLabel="Backfill Item Code Sheet"
                pendingLabel="Backfilling..."
                className="btn-secondary"
              />
            </form>
            <Link href="/admin/lookups" className="btn-secondary">
              Manage dropdowns
            </Link>
          </>
        }
      />

      <AdminHelpPanel title="What this page does">
        This is the master visibility control for forms. A form becomes visible to normal users only
        when it is published, visible to everyone, available to open, and marked as ready.
      </AdminHelpPanel>

      {hasOnlyBuiltIns ? (
        <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Registry is currently showing only built-in forms.</p>
          <p className="mt-1">If you expected imported forms here, check importer records or DB connection.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Live forms" value={liveCount} tone="ok" hint="Visible to requesters now" />
        <AdminMetricCard label="Published" value={publishedCount} hint="Already approved for use" />
        <AdminMetricCard label="Drafts" value={draftCount} hint="Still being prepared" />
        <AdminMetricCard label="Imported" value={importedCount} hint="Came from legacy source" />
      </div>

      <AdminSection title="All forms" description="Select a form, then edit settings in the right panel." meta={`${filteredForms.length} of ${forms.length} shown`}>
        <div className="mb-5 flex flex-col gap-3">
          <AdminSearchField value={query} onChange={setQuery} placeholder="Search by form name, form ID, description, or route" />
          <AdminFilterTabs
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All" },
              { value: "live", label: "Live" },
              { value: "draft", label: "Drafts" },
              { value: "admin", label: "Admin only" },
              { value: "imported", label: "Imported" },
            ]}
          />
        </div>

        {filteredForms.length === 0 ? (
          <AdminEmptyState title="No forms match these filters" description="Try a different search or switch to broader filters." />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
            <div className="space-y-3">
              {visibleForms.map((form) => {
                const liveForUsers = isLiveForRequesters(form);
                const active = selectedForm?.slug === form.slug;
                return (
                  <button key={form.slug} type="button" onClick={() => openSettingsFor(form.slug)} className={`w-full border bg-white p-4 text-left transition ${active ? "border-brand-400 ring-1 ring-brand-200" : "border-surface-border hover:border-brand-200"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-surface-text">{form.name}</p>
                        <p className="mt-1 truncate text-xs text-surface-muted">
                          {form.slug} • {form.externalFormUrl ? "External Google Apps Script form" : form.routePath}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <AdminStatusPill tone={liveForUsers ? "ok" : "warn"}>{liveForUsers ? "Live" : "Not live"}</AdminStatusPill>
                        <AdminStatusPill tone={form.source === "imported" ? "brand" : "neutral"}>{form.source}</AdminStatusPill>
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredForms.length > visibleCount ? (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + 40)}
                    className="btn-secondary w-full"
                  >
                    Load more forms ({filteredForms.length - visibleCount} remaining)
                  </button>
                </div>
              ) : null}
            </div>

            <aside className={`admin-panel h-fit ${isSettingsOpen ? "block" : "hidden xl:block"}`}>
              <div className="sticky top-20">
                <div className="flex items-center justify-between border-b border-surface-border bg-slate-50/70 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-surface-text">Edit form settings</h3>
                    {draftDirty ? <span className="status-pill border-amber-200 bg-amber-50 text-amber-800">Unsaved</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditMode((v) => !v)}
                      className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                    >
                      {isEditMode ? "Disable edit" : "Edit"}
                    </button>
                    <button type="button" onClick={closeSettings} className="text-xs font-semibold text-surface-muted hover:text-surface-text">Hide settings</button>
                  </div>
                </div>
                <div className="p-5">
                  {selectedForm ? (
                    <FormSettingsForm
                      form={selectedForm}
                      importedSet={importedSet}
                      statusOptions={statusOptions}
                      visibilityOptions={visibilityOptions}
                      availabilityOptions={availabilityOptions}
                      onDirtyChange={setDraftDirty}
                      isEditMode={isEditMode}
                    />
                  ) : (
                    <p className="text-sm text-surface-muted">Select a form to edit.</p>
                  )}
                </div>
              </div>
            </aside>

            {isSettingsOpen ? (
              <div className="fixed inset-0 z-40 bg-slate-900/35 xl:hidden" onClick={closeSettings}>
                <aside
                  className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-auto border-t border-surface-border bg-white"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-surface-border bg-slate-50/90 px-4 py-3 backdrop-blur">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-surface-text">Edit form settings</h3>
                      {draftDirty ? <span className="status-pill border-amber-200 bg-amber-50 text-amber-800">Unsaved</span> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditMode((v) => !v)}
                        className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                      >
                        {isEditMode ? "Disable edit" : "Edit"}
                      </button>
                      <button type="button" onClick={closeSettings} className="text-xs font-semibold text-surface-muted hover:text-surface-text">
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    {selectedForm ? (
                      <FormSettingsForm
                        form={selectedForm}
                        importedSet={importedSet}
                        statusOptions={statusOptions}
                        visibilityOptions={visibilityOptions}
                        availabilityOptions={availabilityOptions}
                        onDirtyChange={setDraftDirty}
                        isEditMode={isEditMode}
                      />
                    ) : (
                      <p className="text-sm text-surface-muted">Select a form to edit.</p>
                    )}
                  </div>
                </aside>
              </div>
            ) : null}
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function FormSettingsForm({ form, importedSet, statusOptions, visibilityOptions, availabilityOptions, onDirtyChange, isEditMode }: { form: RegistryForm; importedSet: Set<string>; statusOptions: string[]; visibilityOptions: string[]; availabilityOptions: string[]; onDirtyChange: (dirty: boolean) => void; isEditMode: boolean }) {
  const liveForUsers = isLiveForRequesters(form);
  const launchUrl = form.externalFormUrl || form.routePath;
  const implementedRoute = (form.isImplemented || Boolean(form.externalFormUrl)) && launchUrl;
  const sourceExists = form.source === "native" || importedSet.has(form.slug);
  const [openVisibility, setOpenVisibility] = useState(false);
  const [openRouting, setOpenRouting] = useState(false);
  const [openResponses, setOpenResponses] = useState(false);
  const [openTrigger, setOpenTrigger] = useState(false);
  const [openAdvanced, setOpenAdvanced] = useState(false);

  const liveReason = liveForUsers
    ? "Published, visible to everyone, available, and ready."
    : "Blocked until published + everyone visibility + available + ready.";
  const scopedDeleteLabel = form.source === "native" ? "Delete native form" : "Delete registry entry";
  const scopedDeleteMessage =
    form.source === "native"
      ? `Delete ${form.name} from the registry? This hides the native form from the system, but it does not purge requests or imported data.`
      : `Delete the ${form.name} registry entry only? This keeps the import draft and request data.`;
  const globalDeleteMessage =
    `Delete ${form.name} everywhere?\n\nThis will remove registry and import records, request data, imported lookups, notification flows, notification delivery logs, and mirror collections for ${form.slug}. Native code files are not deleted from the repo.`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <AdminStatusPill tone={liveForUsers ? "ok" : "warn"}>{liveForUsers ? "Live" : "Not live"}</AdminStatusPill>
        {form.visibility === "admin" ? <AdminStatusPill tone="warn">Admin only</AdminStatusPill> : null}
      </div>
      <p className="text-xs text-surface-muted">{liveReason}</p>

      {implementedRoute ? (
        <div className="flex">
          <Link href={launchUrl} className="btn-secondary">
            <Eye className="h-4 w-4" />
            {form.externalFormUrl ? "Open external form" : "Open form"}
          </Link>
        </div>
      ) : null}

      {!sourceExists ? <div className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Missing importer record for this form ID.</div> : null}

      <form key={form.slug} action={updateFormDefinition} className="space-y-3" onChange={() => isEditMode && onDirtyChange(true)}>
        <input type="hidden" name="id" value={form._id ?? ""} />
        <input type="hidden" name="slug" value={form.slug} />
        <SectionToggle title="Visibility" open={openVisibility} onToggle={() => setOpenVisibility((v) => !v)} />
        {openVisibility ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Publishing state"><select name="status" defaultValue={form.status} disabled={!isEditMode} className={`field-input ${!isEditMode ? "field-locked" : ""}`}>{statusOptions.map((s) => <option key={s} value={s}>{humanizeStatus(s)}</option>)}</select></Field>
              <Field label="Who can see this?"><select name="visibility" defaultValue={form.visibility} disabled={!isEditMode} className={`field-input ${!isEditMode ? "field-locked" : ""}`}>{visibilityOptions.map((v) => <option key={v} value={v}>{humanizeVisibility(v)}</option>)}</select></Field>
            </div>
            <Field label="Can users open it?"><select name="availability" defaultValue={form.availability} disabled={!isEditMode} className={`field-input ${!isEditMode ? "field-locked" : ""}`}>{availabilityOptions.map((a) => <option key={a} value={a}>{a === "available" ? "Yes, users can open it" : "No, not yet"}</option>)}</select></Field>
            <label className="flex items-center gap-2 text-sm text-surface-text"><input type="checkbox" name="isImplemented" defaultChecked={form.isImplemented} disabled={!isEditMode} className="accent-brand-600" /><span>The form page is ready to open</span></label>
            <label className="flex items-center gap-2 text-sm text-surface-text"><input type="checkbox" name="showInNavbar" defaultChecked={form.showInNavbar} disabled={!isEditMode} className="accent-brand-600" /><span>Show this in quick request menu</span></label>
          </>
        ) : null}

        <SectionToggle title="Routing" open={openRouting} onToggle={() => setOpenRouting((v) => !v)} />
        {openRouting ? (
          <>
            <Field label="Form name"><input name="name" defaultValue={form.name} readOnly={!isEditMode} className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
            <Field label="Form ID"><input name="newSlug" defaultValue={form.slug} readOnly={!isEditMode || form.source === "native"} className={`field-input ${!isEditMode || form.source === "native" ? "field-locked" : ""}`} /></Field>
            <Field label="Route path"><input name="routePath" defaultValue={form.routePath} readOnly={!isEditMode || form.source === "imported"} className={`field-input ${!isEditMode || form.source === "imported" ? "field-locked" : ""}`} /></Field>
            <Field label="External form URL"><input name="externalFormUrl" type="url" defaultValue={form.externalFormUrl} readOnly={!isEditMode} placeholder="https://script.google.com/..." className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
            {form.externalFormUrl ? <p className="text-xs text-surface-muted">Requester links will open this URL instead of the in-app form route.</p> : null}
            <Field label="Short description"><textarea name="description" rows={3} defaultValue={form.description} readOnly={!isEditMode} className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
          </>
        ) : null}

        <SectionToggle title="Responses" open={openResponses} onToggle={() => setOpenResponses((v) => !v)} />
        {openResponses ? (
          <>
            <Field label="Response spreadsheet ID"><input name="responseSpreadsheetId" defaultValue={form.responseSpreadsheetId} readOnly={!isEditMode} className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
            <Field label="Response sheet tab"><input name="responseSheetName" defaultValue={form.responseSheetName} readOnly={!isEditMode} className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
            <label className="flex items-center gap-2 text-sm text-surface-text"><input type="checkbox" name="writeResponsesToSheet" defaultChecked={form.writeResponsesToSheet} disabled={!isEditMode} className="accent-brand-600" /><span>Copy new submissions to response tab</span></label>
          </>
        ) : null}

        {form.source === "imported" ? (
          <>
            <SectionToggle title="Trigger automation" open={openTrigger} onToggle={() => setOpenTrigger((v) => !v)} />
            {openTrigger ? (
              <>
                <p className="text-xs text-surface-muted">
                  Imported forms can call an Apps Script web app or webhook after a successful in-app submit.
                </p>
                <label className="flex items-center gap-2 text-sm text-surface-text">
                  <input type="checkbox" name="triggerEnabled" defaultChecked={form.triggerEnabled} disabled={!isEditMode} className="accent-brand-600" />
                  <span>Enable post-submit trigger call</span>
                </label>
                <Field label="Trigger URL"><input name="triggerUrl" type="url" defaultValue={form.triggerUrl} readOnly={!isEditMode} placeholder="https://script.google.com/macros/s/.../exec" className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Trigger source"><input name="triggerSource" defaultValue={form.triggerSource} readOnly={!isEditMode} placeholder="apps-script-web-app" className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
                  <Field label="Trigger event"><input name="triggerEvent" defaultValue={form.triggerEvent} readOnly={!isEditMode} placeholder="submitted" className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
                </div>
                <Field label="Function name hint"><input name="triggerFunctionName" defaultValue={form.triggerFunctionName} readOnly={!isEditMode} placeholder="onFormSubmit" className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
                <Field label="Trigger notes"><textarea name="triggerNotes" rows={3} defaultValue={form.triggerNotes} readOnly={!isEditMode} className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
                {form.externalFormUrl ? <p className="text-xs text-surface-muted">This trigger runs only for in-app submissions. External launch URLs keep their own trigger behavior outside this app.</p> : null}
              </>
            ) : null}
          </>
        ) : null}

        <SectionToggle title="Advanced" open={openAdvanced} onToggle={() => setOpenAdvanced((v) => !v)} />
        {openAdvanced ? (
          <Field label="Internal notes"><textarea name="notes" rows={3} defaultValue={form.notes} readOnly={!isEditMode} className={`field-input ${!isEditMode ? "field-locked" : ""}`} /></Field>
        ) : null}

        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-surface-border bg-white pt-3">
          <button type="reset" className="btn-secondary" onClick={() => onDirtyChange(false)}>Reset changes</button>
          <button type="button" className="btn-secondary">Save + Next form</button>
          <PendingSubmitButton type="submit" disabled={!isEditMode} idleLabel={<span className="inline-flex items-center gap-2"><Save className="h-4 w-4" /><span>Save changes</span></span>} pendingLabel="Saving..." className="btn-primary" />
        </div>
      </form>

      <div className="flex flex-wrap justify-end gap-2">
        <form action={hideFormDefinition}>
          <input type="hidden" name="id" value={form._id ?? ""} />
          <input type="hidden" name="slug" value={form.slug} />
          <input type="hidden" name="status" value="draft" />
          <input type="hidden" name="visibility" value="admin" />
          <input type="hidden" name="availability" value="coming-soon" />
          <PendingSubmitButton type="submit" idleLabel={<span className="inline-flex items-center gap-2"><Undo2 className="h-4 w-4" /><span>Hide from users</span></span>} pendingLabel="Hiding..." className="border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50" />
        </form>
        <form action={deleteFormDefinition} onSubmit={(event) => { if (!confirm(scopedDeleteMessage)) event.preventDefault(); }}>
          <input type="hidden" name="id" value={form._id ?? ""} />
          <input type="hidden" name="slug" value={form.slug} />
          <PendingSubmitButton type="submit" idleLabel={<span className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4" /><span>{scopedDeleteLabel}</span></span>} pendingLabel="Deleting..." className="border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50" />
        </form>
        <form action={deleteFormEverywhere} onSubmit={(event) => { if (!confirm(globalDeleteMessage)) event.preventDefault(); }}>
          <input type="hidden" name="id" value={form._id ?? ""} />
          <input type="hidden" name="slug" value={form.slug} />
          <input type="hidden" name="importId" value={form.source === "imported" ? form.importSourceId ?? "" : ""} />
          <PendingSubmitButton type="submit" idleLabel={<span className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4" /><span>Delete everywhere</span></span>} pendingLabel="Deleting..." className="border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-100" />
        </form>
      </div>
    </div>
  );
}

function SectionToggle({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between border border-surface-border bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-surface-text">
      <span>{title}</span>
      <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

function isLiveForRequesters(form: { status: string; visibility: string; availability: string; isImplemented: boolean; externalFormUrl?: string }) {
  return form.status === "published" && form.visibility === "everyone" && form.availability === "available" && (form.isImplemented || Boolean(String(form.externalFormUrl ?? "").trim()));
}
function humanizeStatus(status: string) {
  if (status === "published") return "Published";
  if (status === "draft") return "Draft";
  if (status === "archived") return "Archived";
  return status;
}
function humanizeVisibility(visibility: string) {
  if (visibility === "everyone") return "Everyone";
  if (visibility === "admin") return "Admins only";
  return visibility;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1.5 block text-sm font-semibold text-surface-text">{label}</label>{children}</div>;
}

