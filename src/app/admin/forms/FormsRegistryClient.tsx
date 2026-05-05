"use client";

import { useState } from "react";
import { Eye, FileInput, Save, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
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
import { deleteFormDefinition, hideFormDefinition, updateFormDefinition } from "./actions";

type RegistryForm = {
  _id?: string;
  slug: string;
  name: string;
  description: string;
  routePath: string;
  source: "native" | "imported";
  status: string;
  visibility: string;
  availability: string;
  isImplemented: boolean;
  showInNavbar: boolean;
  writeResponsesToSheet: boolean;
  responseSpreadsheetId: string;
  responseSheetName: string;
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
  const [view, setView] = useState<ViewFilter>("all");
  const importedSet = new Set(importedSlugSet);

  const filteredForms = forms.filter((form) => {
    const matchesQuery =
      !query ||
      [form.name, form.slug, form.description, form.routePath]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());

    if (!matchesQuery) return false;
    if (view === "live") return isLiveForRequesters(form);
    if (view === "draft") return form.status === "draft";
    if (view === "admin") return form.visibility === "admin";
    if (view === "imported") return form.source === "imported";
    return true;
  });

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
          <p className="mt-1">
            If you expected imported forms here, check the importer records or the database connection.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Live forms" value={liveCount} tone="ok" hint="Visible to requesters now" />
        <AdminMetricCard label="Published" value={publishedCount} hint="Already approved for use" />
        <AdminMetricCard label="Drafts" value={draftCount} hint="Still being prepared" />
        <AdminMetricCard label="Imported" value={importedCount} hint="Came from legacy source" />
      </div>

      <AdminSection
        title="All forms"
        description="Search or narrow the list, then open a form card to adjust its visibility and behavior."
        meta={`${filteredForms.length} of ${forms.length} shown`}
      >
        <div className="mb-5 flex flex-col gap-3">
          <AdminSearchField
            value={query}
            onChange={setQuery}
            placeholder="Search by form name, form ID, description, or route"
          />
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
          <AdminEmptyState
            title="No forms match these filters"
            description="Try a different search or switch back to a broader filter."
          />
        ) : (
          <div className="space-y-4">
            {filteredForms.map((form) => {
              const liveForUsers = isLiveForRequesters(form);
              const implementedRoute = form.isImplemented && form.routePath;
              const sourceExists = form.source === "native" || importedSet.has(form.slug);

              return (
                <article key={form.slug} className="border border-surface-border bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-surface-text">{form.name}</h3>
                        <AdminStatusPill tone={liveForUsers ? "ok" : "warn"}>
                          {liveForUsers ? "Live" : "Not live"}
                        </AdminStatusPill>
                        <AdminStatusPill tone={form.source === "imported" ? "brand" : "neutral"}>
                          {form.source}
                        </AdminStatusPill>
                        {form.visibility === "admin" ? (
                          <AdminStatusPill tone="warn">Admin only</AdminStatusPill>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-surface-muted">{form.description || "No description yet."}</p>
                      <p className="mt-2 text-xs text-surface-muted">
                        Form ID: <code>{form.slug}</code>
                      </p>
                      <p className="mt-1 text-xs text-surface-muted">
                        Route: <code>{form.routePath}</code>
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {implementedRoute ? (
                        <Link href={form.routePath} className="btn-secondary">
                          <Eye className="h-4 w-4" />
                          Open form
                        </Link>
                      ) : null}
                      {implementedRoute ? (
                        <Link href={`${form.routePath}?preview=requester`} className="btn-secondary">
                          <Eye className="h-4 w-4" />
                          Requester preview
                        </Link>
                      ) : null}
                      {form.source === "imported" ? (
                        <Link href="/admin/form-imports" className="btn-secondary">
                          <FileInput className="h-4 w-4" />
                          Open importer
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  {!sourceExists ? (
                    <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      This imported form no longer has a matching import draft. Re-import it with the same
                      form ID or remove this registry entry.
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <QuickMetric label="Who can see this?" value={humanizeVisibility(form.visibility)} />
                    <QuickMetric label="Publishing state" value={humanizeStatus(form.status)} />
                    <QuickMetric label="Can users open it?" value={form.availability === "available" ? "Yes" : "No"} />
                    <QuickMetric label="Top menu" value={form.showInNavbar ? "Shown" : "Hidden"} />
                    <QuickMetric
                      label="Responses to Sheets"
                      value={form.writeResponsesToSheet ? "Enabled" : "Off"}
                    />
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-brand-700">
                      Edit form settings
                    </summary>

                    <form action={updateFormDefinition} className="mt-4 space-y-4">
                      <input type="hidden" name="id" value={form._id ?? ""} />
                      <input type="hidden" name="slug" value={form.slug} />

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Form name">
                          <input name="name" defaultValue={form.name} className="field-input" />
                        </Field>
                        <Field label="Route path">
                          <input name="routePath" defaultValue={form.routePath} className="field-input" />
                        </Field>
                      </div>

                      <Field label="Short description">
                        <textarea name="description" rows={3} defaultValue={form.description} className="field-input" />
                      </Field>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Field label="Publishing state">
                          <select name="status" defaultValue={form.status} className="field-input">
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {humanizeStatus(status)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Who can see this?">
                          <select name="visibility" defaultValue={form.visibility} className="field-input">
                            {visibilityOptions.map((visibility) => (
                              <option key={visibility} value={visibility}>
                                {humanizeVisibility(visibility)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Can users open it?">
                          <select name="availability" defaultValue={form.availability} className="field-input">
                            {availabilityOptions.map((availability) => (
                              <option key={availability} value={availability}>
                                {availability === "available" ? "Yes, users can open it" : "No, not yet"}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Internal notes">
                          <textarea name="notes" rows={3} defaultValue={form.notes} className="field-input" />
                        </Field>
                        <div className="border border-surface-border bg-slate-50 p-4">
                          <p className="text-sm font-semibold text-surface-text">Display options</p>
                          <p className="mt-1 text-xs text-surface-muted">
                            These only affect visibility and access. They do not change submission logic.
                          </p>
                          <label className="mt-3 flex items-center gap-2 text-sm text-surface-text">
                            <input
                              type="checkbox"
                              name="isImplemented"
                              defaultChecked={form.isImplemented}
                              className="accent-brand-600"
                            />
                            <span>The form page is ready to open</span>
                          </label>
                          <label className="mt-2 flex items-center gap-2 text-sm text-surface-text">
                            <input
                              type="checkbox"
                              name="showInNavbar"
                              defaultChecked={form.showInNavbar}
                              className="accent-brand-600"
                            />
                            <span>Show this in the quick request menu</span>
                          </label>
                        </div>
                      </div>

                      <div className="border border-surface-border bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-surface-text">Response export</p>
                        <p className="mt-1 text-xs text-surface-muted">
                          Each form can copy submitted responses into one Google Sheets tab. This is how we keep
                          one response tab per form as more forms are added.
                        </p>
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <Field label="Response spreadsheet ID">
                            <input
                              name="responseSpreadsheetId"
                              defaultValue={form.responseSpreadsheetId}
                              placeholder="Leave blank to rely on the default response spreadsheet env"
                              className="field-input"
                            />
                          </Field>
                          <Field label="Response sheet tab">
                            <input
                              name="responseSheetName"
                              defaultValue={form.responseSheetName}
                              placeholder={`${form.name} Responses`}
                              className="field-input"
                            />
                          </Field>
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-sm text-surface-text">
                          <input
                            type="checkbox"
                            name="writeResponsesToSheet"
                            defaultChecked={form.writeResponsesToSheet}
                            className="accent-brand-600"
                          />
                          <span>Copy new submissions to this form’s response tab</span>
                        </label>
                      </div>

                      <div className="border border-surface-border bg-slate-50 p-4 text-sm text-surface-muted">
                        <p className="font-semibold text-surface-text">Visibility checklist</p>
                        <p className="mt-1">
                          A form becomes visible to requesters only when all four are true: published, visible
                          to everyone, available to open, and marked as ready.
                        </p>
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <PendingSubmitButton
                          type="submit"
                          idleLabel={
                            <span className="inline-flex items-center gap-2">
                              <Save className="h-4 w-4" />
                              <span>Save changes</span>
                            </span>
                          }
                          pendingLabel="Saving..."
                          className="btn-primary"
                        />
                      </div>
                    </form>
                  </details>

                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <form action={hideFormDefinition}>
                      <input type="hidden" name="id" value={form._id ?? ""} />
                      <input type="hidden" name="slug" value={form.slug} />
                      <PendingSubmitButton
                        type="submit"
                        idleLabel={
                          <span className="inline-flex items-center gap-2">
                            <Undo2 className="h-4 w-4" />
                            <span>Hide from users</span>
                          </span>
                        }
                        pendingLabel="Hiding..."
                        className="border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
                      />
                    </form>
                    <form action={deleteFormDefinition}>
                      <input type="hidden" name="id" value={form._id ?? ""} />
                      <input type="hidden" name="slug" value={form.slug} />
                      <PendingSubmitButton
                        type="submit"
                        idleLabel={
                          <span className="inline-flex items-center gap-2">
                            <Trash2 className="h-4 w-4" />
                            <span>{form.source === "native" ? "Delete native form" : "Delete registry entry"}</span>
                          </span>
                        }
                        pendingLabel="Deleting..."
                        className="border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                      />
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function isLiveForRequesters(form: {
  status: string;
  visibility: string;
  availability: string;
  isImplemented: boolean;
}) {
  return (
    form.status === "published" &&
    form.visibility === "everyone" &&
    form.availability === "available" &&
    form.isImplemented
  );
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

function QuickMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-surface-border bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-surface-text">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-surface-text">{label}</label>
      {children}
    </div>
  );
}
