import { Eye, FileInput, ListChecks, Save, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { connectMongo } from "@/lib/db/mongo";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAllFormDefinitionsForAdmin } from "@/lib/form-definitions";
import {
  FORM_DEFINITION_AVAILABILITIES,
  FORM_DEFINITION_STATUSES,
  FORM_DEFINITION_VISIBILITIES,
} from "@/models/FormDefinition";
import { FormImport } from "@/models/FormImport";
import { deleteFormDefinition, hideFormDefinition, updateFormDefinition } from "./actions";

export default async function AdminFormsPage() {
  const forms = await getAllFormDefinitionsForAdmin();
  await connectMongo();
  const imports = await FormImport.find({})
    .select({ slug: 1, name: 1 })
    .lean();
  const importedSlugSet = new Set(imports.map((item) => item.slug));

  const publishedCount = forms.filter((form) => form.status === "published").length;
  const draftCount = forms.filter((form) => form.status === "draft").length;
  const importedCount = forms.filter((form) => form.source === "imported").length;
  const liveCount = forms.filter(isLiveForRequesters).length;
  const hasOnlyBuiltIns = importedCount === 0 && forms.every((form) => form.source === "native");

  return (
    <div className="admin-page">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-eyebrow">Form operations</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-surface-text">Forms registry</h1>
          <p className="mt-1 text-sm text-surface-muted">
            Control which forms are live for requesters, admin-only, hidden, or shown in the navbar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/admin/form-imports">
            <FileInput className="h-4 w-4" />
            Import form
          </LinkButton>
          <LinkButton href="/admin/lookups">
            <ListChecks className="h-4 w-4" />
            Manage dropdowns
          </LinkButton>
        </div>
      </div>

      {hasOnlyBuiltIns ? (
        <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold mb-1">Registry is running in safe mode</p>
          <p>
            Only the built-in forms are showing right now. If you expected imported forms here,
            check the database connection or the form import records.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Live to users" value={liveCount} tone="ok" />
        <Stat label="Published" value={publishedCount} />
        <Stat label="Draft" value={draftCount} />
        <Stat label="Imported" value={importedCount} />
      </div>

      <section className="admin-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h2 className="text-base font-semibold text-surface-text">
            All forms
          </h2>
          <span className="text-xs text-gray-400">{forms.length} entries</span>
        </div>

        <div className="space-y-4 p-5">
          {forms.map((form) => {
            const liveForUsers = isLiveForRequesters(form);
            const implementedRoute = form.isImplemented && form.routePath;
            const sourceExists = form.source === "native" || importedSlugSet.has(form.slug);

            return (
              <article key={form.slug} className="border border-surface-border bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-surface-text">{form.name}</h3>
                      <Badge tone={liveForUsers ? "ok" : "warn"}>
                        {liveForUsers ? "live" : "not live"}
                      </Badge>
                      <Badge>{form.status}</Badge>
                      <Badge tone="neutral">{form.source}</Badge>
                      {form.visibility === "admin" ? <Badge tone="warn">admin only</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-surface-muted">
                      Slug: <code>{form.slug}</code>
                    </p>
                    <p className="mt-1 text-xs text-surface-muted">
                      Route: <code>{form.routePath}</code>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {implementedRoute ? (
                      <LinkButton href={form.routePath}>
                        <Eye className="h-4 w-4" />
                        Open
                      </LinkButton>
                    ) : null}
                    {implementedRoute ? (
                      <LinkButton href={`${form.routePath}?preview=requester`}>
                        <Eye className="h-4 w-4" />
                        Requester preview
                      </LinkButton>
                    ) : null}
                    {form.source === "imported" ? (
                      <LinkButton href="/admin/form-imports">
                        <FileInput className="h-4 w-4" />
                        Import source
                      </LinkButton>
                    ) : null}
                  </div>
                </div>

                {!sourceExists ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    This imported registry entry has no matching import draft. Re-import the source
                    with the same slug or delete the registry entry.
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <StatusMetric label="Status" value={form.status} />
                  <StatusMetric label="Visibility" value={form.visibility} />
                  <StatusMetric label="Availability" value={form.availability} />
                  <StatusMetric label="Navbar" value={form.showInNavbar ? "shown" : "hidden"} />
                </div>

                <form action={updateFormDefinition} className="space-y-4 mt-4">
                  <input type="hidden" name="id" value={form._id ?? ""} />
                  <input type="hidden" name="slug" value={form.slug} />

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
                    <div className="border border-surface-border bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-gray-800 mb-3">Display controls</p>
                      <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                        <input
                          type="checkbox"
                          name="isImplemented"
                          defaultChecked={form.isImplemented}
                          className="accent-brand-600"
                        />
                        <span>Route is ready and can be opened</span>
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

                  <div className="border border-surface-border bg-slate-50 p-4 text-sm text-surface-muted">
                    <p className="font-semibold text-gray-800 mb-1">Requester visibility rule</p>
                    <p>
                      Users see this form only when it is published, visible to everyone, available,
                      and marked ready.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <PendingSubmitButton
                      type="submit"
                      idleLabel={
                        <span className="inline-flex items-center gap-2">
                          <Save className="h-4 w-4" />
                          <span>Save settings</span>
                        </span>
                      }
                      pendingLabel="Saving..."
                      className="btn-primary"
                    />
                  </div>
                </form>

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
                  {form.source === "imported" ? (
                    <form action={deleteFormDefinition}>
                      <input type="hidden" name="id" value={form._id ?? ""} />
                      <input type="hidden" name="slug" value={form.slug} />
                      <PendingSubmitButton
                        type="submit"
                        idleLabel={
                          <span className="inline-flex items-center gap-2">
                            <Trash2 className="h-4 w-4" />
                            <span>Delete registry entry</span>
                          </span>
                        }
                        pendingLabel="Deleting..."
                        className="border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                      />
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
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

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="btn-secondary"
    >
      {children}
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" }) {
  const valueClass = tone === "ok" ? "text-brand-700" : "text-surface-text";
  return (
    <div className="admin-panel p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-surface-border bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-surface-muted font-semibold">{label}</p>
      <p className="text-sm font-bold text-surface-text">{value}</p>
    </div>
  );
}

function Badge({
  children,
  tone = "brand",
}: {
  children: React.ReactNode;
  tone?: "brand" | "warn" | "neutral" | "ok";
}) {
  const className =
    tone === "ok"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "warn"
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
