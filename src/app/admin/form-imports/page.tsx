import { connectMongo } from "@/lib/db/mongo";
import { hydrateImportedFormRuntime, type ImportedFormRuntime } from "@/lib/imported-forms";
import Link from "next/link";
import { FormDefinition } from "@/models/FormDefinition";
import { FormImport, FORM_IMPORT_STATUSES } from "@/models/FormImport";
import {
  createFormImport,
  publishFormImport,
  updateFormImportConfig,
  updateFormImportStatus,
} from "./actions";

export default async function FormImportsPage() {
  await connectMongo();
  const [imports, definitions] = await Promise.all([
    FormImport.find({}).sort({ createdAt: -1 }).lean(),
    FormDefinition.find({ source: "imported" })
      .select({ slug: 1, status: 1, visibility: 1, availability: 1, isImplemented: 1 })
      .lean(),
  ]);
  const definitionBySlug = new Map(definitions.map((item) => [item.slug, item]));
  const previewEntries: Array<[string, ImportedFormRuntime]> = await Promise.all(
    imports.map(async (item) => {
      try {
        const runtime = await hydrateImportedFormRuntime({
          htmlSource: item.htmlSource ?? "",
          spreadsheetId: item.spreadsheetId ?? "",
          spreadsheetBindings: item.spreadsheetBindings ?? {},
        });
        return [item.slug, runtime];
      } catch (error) {
        return [
          item.slug,
          {
            title: item.name,
            description: "",
            fields: [],
            warnings: [error instanceof Error ? error.message : "Failed to scan spreadsheet."],
            sheetNames: [],
            spreadsheetBindings: {},
            autoDetectedBindings: {},
          },
        ];
      }
    })
  );
  const runtimePreviewBySlug = new Map(previewEntries);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Form importer</h1>
        <p className="text-gray-500 text-sm mt-1">
          Save legacy Apps Script form assets here so we can convert them into native app forms.
        </p>
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
          Target output structure
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Every imported form is meant to end up in the same native structure used by the existing
          forms in this repo.
        </p>
        <TargetStructure slug="your-form-slug" />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
          New import draft
        </h2>
        <form action={createFormImport} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Form name" required>
              <input
                name="name"
                required
                placeholder="Example: Petty Cash Replenishment"
                className="field-input"
              />
            </Field>
            <Field label="Suggested slug">
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
              placeholder="Optional. Needed if dropdowns or responses are sheet-driven."
              className="field-input"
            />
          </Field>

          <Field label="Spreadsheet bindings JSON">
            <textarea
              name="spreadsheetBindings"
              rows={6}
              placeholder={`{\n  \"department\": \"Departments!A2:A\",\n  \"destination\": \"Airports!A2:A\"\n}`}
              className="field-input font-mono text-xs"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" name="writeResponsesToSheet" className="accent-brand-600" />
                <span>Also write submitted responses back to Google Sheets</span>
              </label>
              <p className="text-xs text-gray-500 mt-2">
                Optional. Mongo stays the main record, and Sheets gets a copy of each imported-form
                submission.
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field label="index.html file">
              <input
                type="file"
                name="htmlFile"
                accept=".html,.htm,text/html"
                className="field-input"
              />
            </Field>
            <Field label="code.gs file">
              <input
                type="file"
                name="gsFile"
                accept=".gs,.js,text/plain"
                className="field-input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field label="index.html source" required>
              <textarea
                name="htmlSource"
                rows={14}
                placeholder="Paste the legacy form HTML here if you are not uploading the file."
                className="field-input font-mono text-xs"
              />
            </Field>
            <Field label="code.gs source" required>
              <textarea
                name="appsScriptSource"
                rows={14}
                placeholder="Paste the Google Apps Script code here if you are not uploading the file."
                className="field-input font-mono text-xs"
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              name="notes"
              rows={4}
              placeholder="Optional notes about dropdown sources, workflow rules, approvers, or anything we should preserve."
              className="field-input"
            />
          </Field>

          <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 text-sm text-gray-600">
            <p className="font-semibold text-gray-800 mb-1">What to provide</p>
            <p>
              For the most reliable conversion, give both <code>index.html</code> and{" "}
              <code>code.gs</code>. Add the spreadsheet ID when the legacy form reads dropdown data
              from Google Sheets or writes responses there.
            </p>
            <p className="mt-2">
              The app will first try to scan sheet tabs and header rows automatically. Use
              bindings JSON only when auto-detection is not enough or when you want to force a
              specific column.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition"
            >
              Save import draft
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3">
            Saved drafts
          </h2>
          <span className="text-xs text-gray-400">{imports.length} drafts</span>
        </div>

        {imports.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-6">
            No import drafts yet. Add one above to start converting a legacy form.
          </p>
        ) : (
          <div className="space-y-4">
            {imports.map((item) => {
              const runtime = runtimePreviewBySlug.get(item.slug);
              return (
                <article key={String(item._id)} className="rounded-xl border border-brand-100 p-4 bg-white">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-800">{item.name}</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 bg-brand-50 text-brand-700 border border-brand-100">
                          {item.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Slug: <code>{item.slug}</code>
                      </p>
                      <p className="text-sm text-gray-500">
                        Spreadsheet ID: <code>{item.spreadsheetId || "not provided"}</code>
                      </p>
                      <p className="text-sm text-gray-500">
                        Runtime URL:{" "}
                        <Link href={`/forms/${item.slug}`} className="text-brand-700 underline">
                          /forms/{item.slug}
                        </Link>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Saved by {item.createdByName || item.createdByEmail || "unknown"} on{" "}
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <form action={updateFormImportStatus} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={String(item._id)} />
                      <select
                        name="status"
                        defaultValue={item.status}
                        className="field-input min-w-[160px]"
                      >
                        {FORM_IMPORT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="bg-gray-900 hover:bg-black text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
                      >
                        Update
                      </button>
                    </form>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={publishFormImport}>
                      <input type="hidden" name="id" value={String(item._id)} />
                      <button
                        type="submit"
                        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
                      >
                        Publish for users
                      </button>
                    </form>
                    <Link
                      href="/admin/forms"
                      className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm transition"
                    >
                      Open forms registry
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                    <Metric label="Inputs" value={item.summary?.inputCount ?? 0} />
                    <Metric label="Selects" value={item.summary?.selectCount ?? 0} />
                    <Metric label="Textareas" value={item.summary?.textareaCount ?? 0} />
                    <Metric label="GS Functions" value={item.summary?.scriptFunctionCount ?? 0} />
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-3">
                      Expected native output
                    </p>
                    <TargetStructure slug={item.slug} compact />
                  </div>

                  {definitionBySlug.get(item.slug) ? (
                    <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
                      <p className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 mb-2">
                        Registry visibility
                      </p>
                      <p className="text-sm text-gray-600">
                        This import already created an admin-side form registry record.
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                        <Metric
                          label="Publish status"
                          valueText={String(definitionBySlug.get(item.slug)?.status ?? "draft")}
                        />
                        <Metric
                          label="Visibility"
                          valueText={String(definitionBySlug.get(item.slug)?.visibility ?? "admin")}
                        />
                        <Metric
                          label="Availability"
                          valueText={String(
                            definitionBySlug.get(item.slug)?.availability ?? "coming-soon"
                          )}
                        />
                        <Metric
                          label="Implemented"
                          valueText={definitionBySlug.get(item.slug)?.isImplemented ? "Yes" : "No"}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-3">
                        Manage dashboard visibility and publishing in <code>/admin/forms</code>.
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                    <p className="text-xs font-bold tracking-[0.1em] uppercase text-gray-500 mb-3">
                      Spreadsheet configuration
                    </p>
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
                        <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-4">
                          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <input
                              type="checkbox"
                              name="writeResponsesToSheet"
                              defaultChecked={Boolean((item as any).writeResponsesToSheet)}
                              className="accent-brand-600"
                            />
                            <span>Write imported submissions back to Sheets</span>
                          </label>
                          <p className="text-xs text-gray-500 mt-2">
                            Optional. App requests are still saved in Mongo even if this is enabled.
                          </p>
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
                      <p className="text-xs text-gray-500">
                        Leave this empty if the spreadsheet has clean header rows. The app will try
                        to auto-scan tabs and headers first. Use JSON only when you want to force a
                        specific range, for example <code>{`{"department":"Departments!A2:A"}`}</code>.
                      </p>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold px-4 py-2 rounded-lg text-sm transition"
                        >
                          Save spreadsheet config
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/30 p-4">
                    <p className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 mb-3">
                      Spreadsheet scan preview
                    </p>
                    {!item.spreadsheetId ? (
                      <p className="text-sm text-gray-500">
                        No spreadsheet ID yet. Add one above to let the app scan tabs and headers.
                      </p>
                    ) : (
                      <div className="space-y-3 text-sm text-gray-600">
                        <p>
                          Detected sheet tabs: <code>{runtime?.sheetNames.join(", ") || "none"}</code>
                        </p>
                        <div>
                          <p className="font-semibold text-gray-800 mb-1">Explicit bindings</p>
                          <pre className="bg-white border border-gray-200 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">
{JSON.stringify(runtime?.spreadsheetBindings ?? {}, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 mb-1">Auto-detected field mappings</p>
                          <pre className="bg-white border border-gray-200 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">
{JSON.stringify(runtime?.autoDetectedBindings ?? {}, null, 2)}
                          </pre>
                        </div>
                      <div>
                        <p className="font-semibold text-gray-800 mb-1">Warnings</p>
                        {runtime?.warnings.length ? (
                            <ul className="list-disc pl-5 space-y-1 text-xs text-amber-900">
                              {runtime.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gray-500">No scan warnings.</p>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 mb-1">Response export</p>
                        <p className="text-xs text-gray-500">
                          Enabled:{" "}
                          <strong>{(item as any).writeResponsesToSheet ? "Yes" : "No"}</strong>
                          {" · "}
                          Tab: <code>{(item as any).responseSheetName || `${item.name} Responses`}</code>
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                  {item.notes ? (
                    <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">
                      {item.notes}
                    </div>
                  ) : null}

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-brand-700">
                      View source snapshot
                    </summary>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                      <SourceBox title="index.html" value={item.htmlSource ?? ""} />
                      <SourceBox title="code.gs" value={item.appsScriptSource ?? ""} />
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>
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

function TargetStructure({
  slug,
  compact = false,
}: {
  slug: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-4">
      <pre className="text-xs sm:text-sm text-gray-700 whitespace-pre-wrap overflow-auto">
{`src/app/forms/${slug}/
  page.tsx
  form.tsx
  actions.ts`}
      </pre>

      <div className={`grid gap-3 mt-4 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
        <Checklist
          title="Always part of the output"
          items={[
            `Route folder: src/app/forms/${slug}/`,
            "page.tsx loads lookup data and prefill data",
            "form.tsx contains the native React/TSX form UI",
            "actions.ts validates, stores, and routes approvals",
          ]}
        />
        <Checklist
          title="Optional supporting files"
          items={[
            "src/lib/request-fields.ts for diff/history display",
            "src/models/Lookup.ts categories for dropdown sources",
            "src/lib/seed-data.ts for initial dropdown values",
            "src/app/forms/page.tsx, dashboard/page.tsx, and navbar.tsx to expose the new form",
          ]}
        />
      </div>
    </div>
  );
}

function Checklist({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
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
