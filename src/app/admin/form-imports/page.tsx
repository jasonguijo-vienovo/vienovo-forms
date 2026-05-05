import {
  CheckCircle2,
  Circle,
  DatabaseZap,
  Eye,
  FileInput,
  Layers3,
  Settings2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { AdminHelpPanel, AdminMetricCard, AdminPageHeader, AdminSection } from "@/components/admin-ui";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { connectMongo } from "@/lib/db/mongo";
import { parseImportedFormHtml, type ImportedFormRuntime } from "@/lib/imported-forms";
import { FormDefinition } from "@/models/FormDefinition";
import { FormImport, FORM_IMPORT_STATUSES } from "@/models/FormImport";
import { Lookup } from "@/models/Lookup";
import {
  createMissingRegistryEntry,
  createFormImport,
  deleteFormImport,
  publishFormImport,
  syncImportedDropdowns,
  updateFormImportConfig,
  updateFormImportStatus,
} from "./actions";

type SyncedDropdownStats = {
  categoryCount: number;
  valueCount: number;
};

function normalizeLookupKey(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export default async function FormImportsPage() {
  await connectMongo();
  const [imports, definitions, syncedLookupRows] = await Promise.all([
    FormImport.find({}).sort({ createdAt: -1 }).lean(),
    FormDefinition.find({ source: "imported" })
      .select({ slug: 1, status: 1, visibility: 1, availability: 1, isImplemented: 1 })
      .lean(),
    Lookup.find({ category: /^imported:/, isActive: true })
      .select({ category: 1, value: 1 })
      .lean(),
  ]);

  const definitionBySlug = new Map(definitions.map((item) => [item.slug, item]));
  const syncedStatsBySlugKey = new Map<string, SyncedDropdownStats & { categories: Set<string> }>();
  for (const row of syncedLookupRows) {
    const [, slugKey] = String(row.category).split(":");
    if (!slugKey) continue;
    const current = syncedStatsBySlugKey.get(slugKey) ?? {
      categoryCount: 0,
      valueCount: 0,
      categories: new Set<string>(),
    };
    current.categories.add(String(row.category));
    current.categoryCount = current.categories.size;
    current.valueCount += 1;
    syncedStatsBySlugKey.set(slugKey, current);
  }

  const previewEntries: Array<[string, ImportedFormRuntime]> = imports.map((item) => {
    try {
      const runtime = parseImportedFormHtml(item.htmlSource ?? "");
      return [
        item.slug,
        {
          ...runtime,
          title: runtime.title || item.name,
          spreadsheetBindings: item.spreadsheetBindings ?? {},
        },
      ];
    } catch (error) {
      return [
        item.slug,
        {
          title: item.name,
          description: "",
          fields: [],
          warnings: [error instanceof Error ? error.message : "Failed to parse import source."],
          sheetNames: [],
          spreadsheetBindings: item.spreadsheetBindings ?? {},
          autoDetectedBindings: {},
          hydratedHtml: "",
        },
      ];
    }
  });
  const runtimePreviewBySlug = new Map(previewEntries);

  const readyForReview = imports.filter((item) => definitionBySlug.has(item.slug)).length;
  const published = definitions.filter(
    (item) =>
      item.status === "published" &&
      item.visibility === "everyone" &&
      item.availability === "available" &&
      item.isImplemented
  ).length;

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Import pipeline"
        title="Form importer"
        description="Bring in a legacy Apps Script form, connect its spreadsheet, update dropdowns, preview it, and then make it available to users."
      />

      <AdminHelpPanel title="Fast path">
        The usual order is: upload `index.html` and `code.gs`, add the spreadsheet ID, save the draft,
        add it to the registry, update from spreadsheet, preview it, and then make it live.
      </AdminHelpPanel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AdminMetricCard label="Drafts" value={imports.length} />
        <AdminMetricCard label="Ready for review" value={readyForReview} />
        <AdminMetricCard label="Live forms" value={published} tone="ok" />
      </div>

      <AdminSection
        title="Step 1: Create or replace an import draft"
        description="Use the same form ID if you are re-importing. The latest source replaces the old draft."
      >
        <div className="flex items-center gap-3 mb-4">
          <StepNumber value="1" />
          <div>
            <h2 className="text-lg font-bold text-gray-800">Create or replace an import draft</h2>
            <p className="text-sm text-gray-500">
              This stores the imported source safely without making it visible to requesters yet.
            </p>
          </div>
        </div>

        <form action={createFormImport} className="space-y-4">
          <PendingFormState className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Form name" required>
                <input
                  name="name"
                  required
                  placeholder="Example: Petty Cash Replenishment"
                  className="field-input"
                />
              </Field>
              <Field label="Suggested form ID">
                <input
                  name="slug"
                  placeholder="Example: petty-cash-replenishment"
                  className="field-input"
                />
              </Field>
            </div>

            <Field label="Spreadsheet ID">
              <input
                name="spreadsheetId"
                placeholder="Needed if dropdowns or people come from Google Sheets."
                className="field-input"
              />
            </Field>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Field label="index.html file(s)">
                <input
                  type="file"
                  name="htmlFiles"
                  accept=".html,.htm,text/html"
                  multiple
                  className="field-input"
                />
              </Field>
              <Field label="code.gs file(s)">
                <input
                  type="file"
                  name="gsFiles"
                  accept=".gs,.js,text/plain"
                  multiple
                  className="field-input"
                />
              </Field>
            </div>

            <details className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                Paste source manually instead of uploading files
              </summary>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <Field label="index.html source">
                  <textarea
                    name="htmlSource"
                    rows={12}
                    placeholder="Paste the legacy form HTML here if you are not uploading the file."
                    className="field-input font-mono text-xs"
                  />
                </Field>
                <Field label="code.gs source">
                  <textarea
                    name="appsScriptSource"
                    rows={12}
                    placeholder="Paste the Google Apps Script code here if you are not uploading the file."
                    className="field-input font-mono text-xs"
                  />
                </Field>
              </div>
            </details>

            <details className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                Optional spreadsheet and notes settings
              </summary>
              <div className="space-y-4 mt-4">
                <Field label="Spreadsheet bindings JSON">
                  <textarea
                    name="spreadsheetBindings"
                    rows={6}
                    placeholder={`{\n  "department": "Departments!A2:A",\n  "destination": "Airports!A2:A"\n}`}
                    className="field-input font-mono text-xs"
                  />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-surface-border bg-slate-50 p-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <input type="checkbox" name="writeResponsesToSheet" className="accent-brand-600" />
                      <span>Also copy submitted responses to Google Sheets</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-2">
                      MongoDB stays the main record. Google Sheets receives an extra copy when this is enabled.
                    </p>
                  </div>
                  <Field label="Response sheet tab">
                    <input
                      name="responseSheetName"
                      placeholder="Optional. Example: Imported Responses"
                      className="field-input"
                    />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea
                    name="notes"
                    rows={4}
                    placeholder="Optional workflow rules, approver notes, or dropdown details."
                    className="field-input"
                  />
                </Field>
              </div>
            </details>

            <div className="flex justify-end">
              <PendingSubmitButton
                type="submit"
                idleLabel={
                  <span className="inline-flex items-center gap-2">
                    <FileInput className="h-4 w-4" />
                    <span>Save draft</span>
                  </span>
                }
                pendingLabel="Saving draft..."
                className="btn-primary"
              />
            </div>
          </PendingFormState>
        </form>
      </AdminSection>

      <AdminSection
        title="Step 2: Review, update, preview, and publish"
        description="Each draft shows the next useful action so admins can move it forward safely."
        meta={`${imports.length} drafts`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <StepNumber value="2" />
            <div>
              <h2 className="text-lg font-bold text-gray-800">Review, sync, preview, publish</h2>
              <p className="text-sm text-gray-500">
                Best order: add to registry, update from spreadsheet, preview it, then make it live.
              </p>
            </div>
          </div>
          <span className="text-xs text-gray-400">{imports.length} drafts</span>
        </div>

        {imports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/30 p-8 text-center">
            <p className="text-sm font-semibold text-gray-700">No import drafts yet.</p>
            <p className="text-sm text-gray-500 mt-1">
              Add `index.html`, `code.gs`, and the spreadsheet ID above to start.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {imports.map((item) => {
              const runtime = runtimePreviewBySlug.get(item.slug);
              const definition = definitionBySlug.get(item.slug);
              const slugKey = normalizeLookupKey(item.slug);
              const syncedStats = syncedStatsBySlugKey.get(slugKey) ?? {
                categoryCount: 0,
                valueCount: 0,
              };
              const hasRegistry = Boolean(definition);
              const hasSpreadsheet = Boolean(item.spreadsheetId);
              const hasSyncedDropdowns = syncedStats.valueCount > 0;
              const isPublished =
                definition?.status === "published" &&
                definition?.visibility === "everyone" &&
                definition?.availability === "available" &&
                definition?.isImplemented;

              return (
                <article
                  key={String(item._id)}
                  className="border border-surface-border bg-white p-4"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-800">{item.name}</h3>
                        <Badge>{item.status}</Badge>
                        {isPublished ? <Badge tone="ok">live</Badge> : <Badge tone="warn">internal only</Badge>}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Form ID: <code>{item.slug}</code>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Saved by {item.createdByName || item.createdByEmail || "unknown"} on{" "}
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      {!hasRegistry ? (
                        <ActionForm action={createMissingRegistryEntry} id={String(item._id)}>
                          <Layers3 className="h-4 w-4" />
                          Add to registry
                        </ActionForm>
                      ) : null}
                      <ActionForm action={syncImportedDropdowns} id={String(item._id)} tone="blue">
                        <DatabaseZap className="h-4 w-4" />
                        Update from spreadsheet
                      </ActionForm>
                      <Link
                        href={`/forms/${item.slug}`}
                        className="inline-flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm transition"
                      >
                        <Eye className="h-4 w-4" />
                        Open preview
                      </Link>
                      <ActionForm action={publishFormImport} id={String(item._id)} tone="brand">
                        <CheckCircle2 className="h-4 w-4" />
                        Make live
                      </ActionForm>
                      <ActionForm action={deleteFormImport} id={String(item._id)} tone="danger">
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </ActionForm>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-2">
                    <ProgressStep done label="Source saved" />
                    <ProgressStep done={hasRegistry} label="Registry created" />
                    <ProgressStep
                      done={!hasSpreadsheet || hasSyncedDropdowns}
                      label={hasSpreadsheet ? "Dropdowns updated" : "No spreadsheet linked"}
                    />
                    <ProgressStep done={Boolean(runtime?.fields.length)} label="Preview ready" />
                    <ProgressStep done={Boolean(isPublished)} label="Published" />
                  </div>

                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <Metric label="Inputs" value={item.summary?.inputCount ?? 0} />
                    <Metric label="Selects" value={item.summary?.selectCount ?? 0} />
                    <Metric label="Synced values" value={syncedStats.valueCount} />
                    <Metric
                      label="Spreadsheet"
                      valueText={hasSpreadsheet ? "Linked" : "None"}
                    />
                  </div>

                  <NextActionHint
                    hasRegistry={hasRegistry}
                    hasSpreadsheet={hasSpreadsheet}
                    hasSyncedDropdowns={hasSyncedDropdowns}
                    previewReady={Boolean(runtime?.fields.length)}
                    isPublished={Boolean(isPublished)}
                  />

                  {runtime?.warnings.length ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="font-semibold mb-1">Needs review</p>
                      <ul className="list-disc pl-5 space-y-1 text-xs">
                        {runtime.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <details className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                      Spreadsheet, status, and source details
                    </summary>
                    <div className="mt-4 space-y-4">
                      <div className="rounded-xl border border-brand-100 bg-white p-4">
                        <p className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 mb-3">
                          Registry status
                        </p>
                        {definition ? (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <Metric label="Status" valueText={String(definition.status ?? "draft")} />
                            <Metric label="Visibility" valueText={String(definition.visibility ?? "admin")} />
                            <Metric label="Availability" valueText={String(definition.availability ?? "coming-soon")} />
                            <Metric label="Implemented" valueText={definition.isImplemented ? "Yes" : "No"} />
                          </div>
                        ) : (
                          <p className="text-sm text-amber-800">
                            No registry entry yet. Add this to the registry before relying on dashboard visibility.
                          </p>
                        )}
                      </div>

                      <form action={updateFormImportStatus} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={String(item._id)} />
                        <Field label="Internal draft status">
                          <select
                            name="status"
                            defaultValue={item.status}
                            className="field-input min-w-[180px]"
                          >
                            {FORM_IMPORT_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <PendingSubmitButton
                          type="submit"
                          idleLabel={
                            <span className="inline-flex items-center gap-2">
                              <Settings2 className="h-4 w-4" />
                              <span>Update status</span>
                            </span>
                          }
                          pendingLabel="Saving..."
                          className="bg-gray-900 hover:bg-black text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
                        />
                      </form>

                      <form action={updateFormImportConfig} className="space-y-3">
                        <input type="hidden" name="id" value={String(item._id)} />
                        <Field label="Spreadsheet ID">
                          <input
                            name="spreadsheetId"
                            defaultValue={item.spreadsheetId ?? ""}
                            placeholder="Example: 1AbcDef..."
                            className="field-input"
                          />
                        </Field>
                        <Field label="Spreadsheet bindings JSON">
                          <textarea
                            name="spreadsheetBindings"
                            rows={6}
                            defaultValue={JSON.stringify(item.spreadsheetBindings ?? {}, null, 2)}
                            className="field-input font-mono text-xs"
                          />
                        </Field>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="border border-surface-border bg-slate-50 p-4">
                            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                              <input
                                type="checkbox"
                                name="writeResponsesToSheet"
                                defaultChecked={Boolean((item as any).writeResponsesToSheet)}
                                className="accent-brand-600"
                              />
                              <span>Also copy imported submissions to Sheets</span>
                            </label>
                          </div>
                          <Field label="Response sheet tab">
                            <input
                              name="responseSheetName"
                              defaultValue={(item as any).responseSheetName ?? ""}
                              placeholder="Example: Imported Responses"
                              className="field-input"
                            />
                          </Field>
                        </div>
                        <Field label="Notes">
                          <textarea
                            name="notes"
                            rows={3}
                            defaultValue={item.notes ?? ""}
                            className="field-input"
                          />
                        </Field>
                        <div className="flex justify-end">
                          <PendingSubmitButton
                            type="submit"
                            idleLabel="Save settings"
                            pendingLabel="Saving..."
                            className="btn-secondary"
                          />
                        </div>
                      </form>

                      <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-4 text-sm text-gray-600 space-y-3">
                        <p>
                          Spreadsheet ID: <code>{item.spreadsheetId || "not provided"}</code>
                        </p>
                        <p>
                          Spreadsheet scanning only happens when you explicitly update from spreadsheet or
                          open the form, which keeps the importer fast even with large sheets.
                        </p>
                        <ScanBlock
                          title="Explicit bindings"
                          value={runtime?.spreadsheetBindings ?? {}}
                        />
                        <ScanBlock
                          title="Parsed field names"
                          value={runtime?.fields.map((field) => ({
                            name: field.name,
                            label: field.label,
                            type: field.type,
                          })) ?? []}
                        />
                        <p className="text-xs text-gray-500">
                          Sheet copy:{" "}
                          <strong>{(item as any).writeResponsesToSheet ? "Enabled" : "Off"}</strong>
                          {" - "}
                          tab <code>{(item as any).responseSheetName || `${item.name} Responses`}</code>
                        </p>
                      </div>

                      <div className="rounded-xl border border-brand-100 bg-white p-4">
                        <p className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 mb-3">
                          Expected native output
                        </p>
                        <TargetStructure slug={item.slug} />
                      </div>

                      <details>
                        <summary className="cursor-pointer text-sm font-medium text-brand-700">
                          View source snapshot
                        </summary>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                          <SourceBox title="index.html" value={item.htmlSource ?? ""} />
                          <SourceBox title="code.gs" value={item.appsScriptSource ?? ""} />
                        </div>
                      </details>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-white px-4 py-2 min-w-[84px]">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
    </div>
  );
}

function StepNumber({ value }: { value: string }) {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
      {value}
    </div>
  );
}

function ProgressStep({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
        done
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-gray-200 bg-gray-50 text-gray-500"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

function NextActionHint({
  hasRegistry,
  hasSpreadsheet,
  hasSyncedDropdowns,
  previewReady,
  isPublished,
}: {
  hasRegistry: boolean;
  hasSpreadsheet: boolean;
  hasSyncedDropdowns: boolean;
  previewReady: boolean;
  isPublished: boolean;
}) {
  let message = "Open the form and check the requester preview before making it live.";
  if (!hasRegistry) message = "Add this draft to the registry so it can be controlled from the dashboard.";
  else if (hasSpreadsheet && !hasSyncedDropdowns) {
    message = "Update from spreadsheet so dropdowns, approvers, and processors can use the latest sheet data.";
  } else if (!previewReady) {
    message = "Open the details and review the imported source because no supported fields were detected yet.";
  } else if (isPublished) {
    message = "This form is already live. Use Forms registry later if you need to hide or adjust it.";
  }

  return (
    <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm text-gray-700">
      <span className="font-semibold text-gray-900">Next:</span> {message}
    </div>
  );
}

function ActionForm({
  action,
  id,
  children,
  tone = "default",
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  children: React.ReactNode;
  tone?: "default" | "brand" | "blue" | "danger";
}) {
  const className =
    tone === "brand"
      ? "bg-brand-600 hover:bg-brand-700 text-white border-brand-600"
      : tone === "blue"
        ? "bg-white hover:bg-blue-50 text-blue-700 border-blue-200"
        : tone === "danger"
          ? "bg-white hover:bg-red-50 text-red-700 border-red-200"
          : "bg-white hover:bg-amber-50 text-amber-700 border-amber-200";

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <PendingSubmitButton
        type="submit"
        idleLabel={children}
        pendingLabel="Working..."
        className={`border font-semibold px-4 py-2 rounded-lg text-sm transition ${className}`}
      />
    </form>
  );
}

function Metric({
  label,
  value,
  valueText,
}: {
  label: string;
  value?: number;
  valueText?: string;
}) {
  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
      <p className="text-lg font-bold text-gray-800">{valueText ?? value ?? 0}</p>
    </div>
  );
}

function ScanBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="font-semibold text-gray-800 mb-1">{title}</p>
      <pre className="bg-white border border-gray-200 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function SourceBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-700">
        {title}
      </div>
      <pre className="p-3 text-xs overflow-auto whitespace-pre-wrap bg-white text-gray-700 max-h-[360px]">
        {value || "(empty)"}
      </pre>
    </div>
  );
}

function TargetStructure({ slug }: { slug: string }) {
  return (
    <div className="border border-surface-border bg-slate-50 p-4">
      <pre className="text-xs sm:text-sm text-gray-700 whitespace-pre-wrap overflow-auto">
        {`src/app/forms/${slug}/
  page.tsx
  form.tsx
  actions.ts`}
      </pre>
      <div className="grid gap-3 mt-4 grid-cols-1 md:grid-cols-2">
        <Checklist
          title="Core output"
          items={[
            `Route folder: src/app/forms/${slug}/`,
            "page.tsx loads lookup data and prefill data",
            "form.tsx contains the native React/TSX form UI",
            "actions.ts validates, stores, and routes approvals",
          ]}
        />
        <Checklist
          title="Supporting links"
          items={[
            "Manage dropdowns stores synced dropdown values",
            "Forms registry controls dashboard and navbar visibility",
            "Dashboard and forms list expose published available forms",
          ]}
        />
      </div>
    </div>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg bg-white border border-brand-100 p-3">
      <p className="text-sm font-semibold text-gray-800 mb-2">{title}</p>
      <ul className="text-xs text-gray-600 space-y-1">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function Badge({
  children,
  tone = "brand",
}: {
  children: React.ReactNode;
  tone?: "brand" | "warn" | "ok";
}) {
  const className =
    tone === "ok"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-brand-50 text-brand-700 border-brand-100";

  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 border ${className}`}
    >
      {children}
    </span>
  );
}
