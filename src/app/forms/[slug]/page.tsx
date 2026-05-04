import { notFound, redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { isAdminEmail } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { hydrateImportedFormRuntime } from "@/lib/imported-forms";
import { safeAuth } from "@/lib/safe-auth";
import { FormImport } from "@/models/FormImport";
import { submitImportedForm } from "./actions";

export default async function ImportedFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");

  const definition = await getFormDefinitionBySlug(slug);
  if (!definition || definition.source !== "imported") notFound();

  const isAdmin = isAdminEmail(session.user.email);
  if (definition.visibility === "admin" && !isAdmin) redirect("/dashboard");
  if (definition.status !== "published" && !isAdmin) redirect("/dashboard");
  if ((definition.availability !== "available" || !definition.isImplemented) && !isAdmin) {
    redirect("/dashboard");
  }

  await connectMongo();
  const imported = await FormImport.findOne({ slug }).lean();
  if (!imported) notFound();

  const runtime = await hydrateImportedFormRuntime({
    htmlSource: imported.htmlSource ?? "",
    spreadsheetId: imported.spreadsheetId ?? "",
    spreadsheetBindings: imported.spreadsheetBindings ?? {},
  });

  const submitAction = submitImportedForm.bind(null, slug);

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 overflow-hidden">
          <div className="bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-6 py-6 text-white">
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-brand-100">
              Imported form runtime
            </p>
            <h1 className="text-2xl font-bold mt-1">{definition.name}</h1>
            <p className="text-sm text-brand-50 mt-2 max-w-2xl">
              {definition.description || runtime.description || "Imported from the legacy Apps Script form."}
            </p>
          </div>

          <div className="p-6 space-y-5">
            <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 text-sm text-gray-600">
              <p className="font-semibold text-gray-800 mb-1">How this version works</p>
              <p>
                This page renders the imported form using the saved HTML structure and optional
                spreadsheet-backed dropdown sources. Submissions are saved into the request history
                inside this app.
              </p>
            </div>

            {runtime.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold mb-1">Things to review</p>
                <ul className="space-y-1 text-xs list-disc pl-4">
                  {runtime.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {isAdmin && (
              <div className="rounded-xl border border-brand-100 bg-white p-4 text-sm text-gray-600 space-y-2">
                <p className="font-semibold text-gray-800">Spreadsheet wiring</p>
                <p>
                  Spreadsheet ID: <code>{imported.spreadsheetId || "not provided"}</code>
                </p>
                <p>
                  Discovered sheet tabs: <code>{runtime.sheetNames.join(", ") || "none"}</code>
                </p>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">
{JSON.stringify(runtime.spreadsheetBindings, null, 2) || "{}"}
                </pre>
              </div>
            )}

            {runtime.fields.length === 0 ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                No supported fields were found in the imported HTML yet.
              </div>
            ) : (
              <form action={submitAction} className="space-y-4">
                {runtime.fields.map((field) => (
                  <FieldRenderer key={field.name} field={field} />
                ))}

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    className="bg-gradient-to-br from-brand-600 to-brand-700 text-white font-semibold px-8 py-2.5 rounded-lg shadow-md hover:opacity-95 active:scale-[0.99] transition"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function FieldRenderer({
  field,
}: {
  field: Awaited<ReturnType<typeof hydrateImportedFormRuntime>>["fields"][number];
}) {
  const hasOptions = (field.options?.length ?? 0) > 0;

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-brand-100 px-5 py-4">
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {field.label}
        {field.required ? <span className="text-red-400"> *</span> : null}
      </label>

      {field.type === "textarea" ? (
        <textarea
          name={field.name}
          required={field.required}
          rows={field.rows ?? 4}
          defaultValue={field.defaultValue}
          placeholder={field.placeholder}
          className="field-input resize-y"
        />
      ) : field.type === "select" && hasOptions ? (
        <select name={field.name} required={field.required} defaultValue="" className="field-input">
          <option value="">-- Select --</option>
          {field.options?.map((option) => (
            <option key={`${field.name}_${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "radio" && hasOptions ? (
        <div className="space-y-2">
          {field.options?.map((option) => (
            <label
              key={`${field.name}_${option.value}`}
              className="flex items-center gap-2 rounded-lg border border-brand-100 px-3 py-2 text-sm text-gray-700"
            >
              <input type="radio" name={field.name} value={option.value} required={field.required} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : field.type === "checkbox-group" && hasOptions ? (
        <div className="space-y-2">
          {field.options?.map((option) => (
            <label
              key={`${field.name}_${option.value}`}
              className="flex items-center gap-2 rounded-lg border border-brand-100 px-3 py-2 text-sm text-gray-700"
            >
              <input type="checkbox" name={field.name} value={option.value} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : field.type === "checkbox" ? (
        <label className="flex items-center gap-2 rounded-lg border border-brand-100 px-3 py-2 text-sm text-gray-700">
          <input type="checkbox" name={field.name} required={field.required} defaultChecked={field.defaultValue === "Yes"} />
          <span>Yes</span>
        </label>
      ) : (
        <input
          type={field.type === "checkbox-group" || field.type === "radio" || field.type === "select" ? "text" : field.type}
          name={field.name}
          required={field.required}
          defaultValue={field.defaultValue}
          placeholder={
            field.placeholder ||
            (hasOptions ? undefined : field.type === "select" || field.type === "radio" || field.type === "checkbox-group"
              ? "No options were loaded, so enter a value manually"
              : undefined)
          }
          className="field-input"
        />
      )}
    </section>
  );
}
