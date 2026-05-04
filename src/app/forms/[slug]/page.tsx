import { notFound, redirect } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { isAdminEmail } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { hydrateImportedFormRuntime } from "@/lib/imported-forms";
import { safeAuth } from "@/lib/safe-auth";
import { FormImport } from "@/models/FormImport";
import { submitImportedForm } from "./actions";
import { ImportedFormFrame } from "./imported-form-frame";

export default async function ImportedFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");

  const definition = await getFormDefinitionBySlug(slug);
  if (!definition || definition.source !== "imported") notFound();

  const isAdmin = isAdminEmail(session.user.email);
  const requesterPreview = isAdmin && resolvedSearchParams?.preview === "requester";
  const showAdminDiagnostics = isAdmin && !requesterPreview;
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
  const requesterDescription =
    definition.description &&
    !definition.description.toLowerCase().includes("imported legacy form draft")
      ? definition.description
      : runtime.description || "Submit your request using the form below.";

  return (
    <>
      <Navbar
        adminShortcut={
          isAdmin
            ? {
                href: requesterPreview ? `/forms/${slug}` : `/forms/${slug}?preview=requester`,
                label: requesterPreview ? "Admin view" : "Requester preview",
              }
            : null
        }
      />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 overflow-hidden">
          <div className="bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 px-6 py-6 text-white">
            {showAdminDiagnostics ? (
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-brand-100">
                Imported form runtime
              </p>
            ) : null}
            <h1 className="text-2xl font-bold mt-1">{definition.name}</h1>
            <p className="text-sm text-brand-50 mt-2 max-w-2xl">
              {showAdminDiagnostics
                ? definition.description || runtime.description || "Imported from the legacy Apps Script form."
                : requesterDescription}
            </p>
          </div>

          <div className="p-6 space-y-5">
            {showAdminDiagnostics && runtime.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold mb-1">Things to review</p>
                <ul className="space-y-1 text-xs list-disc pl-4">
                  {runtime.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {showAdminDiagnostics && (
              <div className="rounded-xl border border-brand-100 bg-white p-4 text-sm text-gray-600 space-y-2">
                <p className="font-semibold text-gray-800">Spreadsheet wiring</p>
                <p>
                  Spreadsheet ID: <code>{imported.spreadsheetId || "not provided"}</code>
                </p>
                <p>
                  Discovered sheet tabs: <code>{runtime.sheetNames.join(", ") || "none"}</code>
                </p>
                <p className="font-medium text-gray-700">Explicit bindings</p>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">
{JSON.stringify(runtime.spreadsheetBindings, null, 2) || "{}"}
                </pre>
                <p className="font-medium text-gray-700">Auto-detected bindings</p>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-auto whitespace-pre-wrap">
{JSON.stringify(runtime.autoDetectedBindings, null, 2) || "{}"}
                </pre>
              </div>
            )}

            {runtime.fields.length === 0 ? (
              <div
                className={`rounded-xl p-4 text-sm ${
                  showAdminDiagnostics
                    ? "border border-red-200 bg-red-50 text-red-800"
                    : "border border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                {showAdminDiagnostics
                  ? "No supported fields were found in the imported HTML yet."
                  : "This form preview is not ready yet."}
              </div>
            ) : (
              <ImportedFormFrame
                htmlSource={imported.htmlSource ?? ""}
                fields={runtime.fields}
                submitAction={submitAction}
              />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
