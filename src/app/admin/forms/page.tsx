import { getAllFormDefinitionsForAdmin } from "@/lib/form-definitions";
import {
  FORM_DEFINITION_AVAILABILITIES,
  FORM_DEFINITION_STATUSES,
  FORM_DEFINITION_VISIBILITIES,
} from "@/models/FormDefinition";
import { deleteFormDefinition, hideFormDefinition, updateFormDefinition } from "./actions";

export default async function AdminFormsPage() {
  const forms = await getAllFormDefinitionsForAdmin();
  const publishedCount = forms.filter((form) => form.status === "published").length;
  const draftCount = forms.filter((form) => form.status === "draft").length;
  const importedCount = forms.filter((form) => form.source === "imported").length;
  const hasOnlyBuiltIns = importedCount === 0 && forms.every((form) => form.source === "native");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Forms registry</h1>
        <p className="text-gray-500 text-sm mt-1">
          This is the control panel for whether a form shows up to users, stays admin-only, or is
          still treated as coming soon.
        </p>
      </div>

      <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4 text-sm text-gray-600">
        <p className="font-semibold text-gray-800 mb-1">What this page is for</p>
        <p>
          Use this page to decide if a form is visible on the dashboard and forms list, whether it
          should appear in the navbar quick menu, and whether it is ready for users or still in
          draft mode.
        </p>
      </div>

      {hasOnlyBuiltIns ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold mb-1">Registry is running in safe mode</p>
          <p>
            Only the built-in forms are showing right now. If you expected imported forms here,
            check the database connection or the form import records.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Published forms" value={publishedCount} />
        <Stat label="Draft forms" value={draftCount} />
        <Stat label="Imported forms" value={importedCount} />
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3">
            All forms
          </h2>
          <span className="text-xs text-gray-400">{forms.length} entries</span>
        </div>

        <div className="space-y-4">
          {forms.map((form) => (
            <article
              key={form.slug}
              className="rounded-xl border border-brand-100 p-4 bg-white"
            >
              <form action={updateFormDefinition} className="space-y-4">
                <input type="hidden" name="id" value={form._id ?? ""} />
                <input type="hidden" name="slug" value={form.slug} />

                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-gray-800">{form.name}</h3>
                      <Badge>{form.status}</Badge>
                      <Badge tone="neutral">{form.source}</Badge>
                      {form.visibility === "admin" ? <Badge tone="warn">admin only</Badge> : null}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Slug: <code>{form.slug}</code>
                    </p>
                  </div>

                  <div className="text-xs text-gray-500 space-y-1">
                    <div>
                      Route: <code>{form.routePath}</code>
                    </div>
                    <div>
                      Availability: <strong>{form.availability}</strong>
                    </div>
                    <div>
                      Implemented: <strong>{form.isImplemented ? "Yes" : "No"}</strong>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Name">
                    <input name="name" defaultValue={form.name} className="field-input" />
                  </Field>
                  <Field label="Route path">
                    <input name="routePath" defaultValue={form.routePath} className="field-input" />
                  </Field>
                </div>

                <Field label="Description">
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={form.description}
                    className="field-input"
                  />
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Publishing status">
                    <select name="status" defaultValue={form.status} className="field-input">
                      {FORM_DEFINITION_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Visibility">
                    <select name="visibility" defaultValue={form.visibility} className="field-input">
                      {FORM_DEFINITION_VISIBILITIES.map((visibility) => (
                        <option key={visibility} value={visibility}>
                          {visibility}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Catalog availability">
                    <select name="availability" defaultValue={form.availability} className="field-input">
                      {FORM_DEFINITION_AVAILABILITIES.map((availability) => (
                        <option key={availability} value={availability}>
                          {availability}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Notes">
                    <textarea
                      name="notes"
                      rows={3}
                      defaultValue={form.notes}
                      className="field-input"
                    />
                  </Field>
                  <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-4">
                    <p className="text-sm font-semibold text-gray-800 mb-3">Display controls</p>
                    <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                      <input
                        type="checkbox"
                        name="isImplemented"
                        defaultChecked={form.isImplemented}
                        className="accent-brand-600"
                      />
                      <span>Form code exists and route is ready</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        name="showInNavbar"
                        defaultChecked={form.showInNavbar}
                        className="accent-brand-600"
                      />
                      <span>Show in navbar quick menu</span>
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 text-sm text-gray-600">
                  <p className="font-semibold text-gray-800 mb-1">Publishing rule</p>
                  <p>
                    A form appears on the public dashboard/forms list only when it is{" "}
                    <strong>published</strong>. It becomes clickable only when it is both{" "}
                    <strong>implemented</strong> and <strong>available</strong>. Imported forms
                    should normally stay <strong>draft + admin</strong> until implementation is
                    done.
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-gray-900 hover:bg-black text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
                  >
                    Save form settings
                  </button>
                </div>
              </form>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <form action={hideFormDefinition}>
                  <input type="hidden" name="id" value={form._id ?? ""} />
                  <input type="hidden" name="slug" value={form.slug} />
                  <button
                    type="submit"
                    className="bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 font-semibold px-4 py-2 rounded-lg text-sm transition"
                  >
                    Hide from users
                  </button>
                </form>
                {form.source === "imported" ? (
                  <form action={deleteFormDefinition}>
                    <input type="hidden" name="id" value={form._id ?? ""} />
                    <input type="hidden" name="slug" value={form.slug} />
                  <button
                    type="submit"
                    className="bg-white border border-red-200 text-red-700 hover:bg-red-50 font-semibold px-4 py-2 rounded-lg text-sm transition"
                  >
                    Delete registry entry
                  </button>
                </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-3xl font-bold mt-1 text-gray-800">{value}</p>
    </div>
  );
}

function Badge({
  children,
  tone = "brand",
}: {
  children: React.ReactNode;
  tone?: "brand" | "warn" | "neutral";
}) {
  const className =
    tone === "warn"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : tone === "neutral"
        ? "bg-gray-50 text-gray-600 border-gray-200"
        : "bg-brand-50 text-brand-700 border-brand-100";

  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 border ${className}`}
    >
      {children}
    </span>
  );
}
