import { connectMongo } from "@/lib/db/mongo";
import { getAllFormDefinitionsForAdmin } from "@/lib/form-definitions";
import { getImportedDropdownSourceSheetNames } from "@/lib/system-settings";
import { FormImport } from "@/models/FormImport";
import { SettingsClient } from "./SettingsClient";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ form?: string }>;
}) {
  await connectMongo();
  const [params, forms, imports, dropdownSourceSheetNames] = await Promise.all([
    searchParams,
    getAllFormDefinitionsForAdmin(),
    FormImport.find({})
      .select({
        _id: 1,
        slug: 1,
        readinessState: 1,
        lastParsedAt: 1,
        parseDiagnostics: 1,
      })
      .lean(),
    getImportedDropdownSourceSheetNames(),
  ]);

  const importBySlug = new Map(imports.map((item) => [item.slug, item]));
  const rows = forms
    .filter((form) => form.source === "imported")
    .map((form) => {
      const imported = importBySlug.get(form.slug);
      return {
        id: form._id,
        slug: form.slug,
        name: form.name,
        externalFormUrl: form.externalFormUrl,
        triggerEnabled: form.triggerEnabled,
        triggerUrl: form.triggerUrl,
        triggerSource: form.triggerSource,
        triggerEvent: form.triggerEvent,
        triggerFunctionName: form.triggerFunctionName,
        triggerNotes: form.triggerNotes,
        detectedTriggerFunctions: imported?.parseDiagnostics?.detectedTriggerFunctions ?? [],
        detectedTriggerEvents: imported?.parseDiagnostics?.detectedTriggerEvents ?? [],
        readinessState: imported?.readinessState ?? "",
        lastParsedAt: imported?.lastParsedAt ? new Date(imported.lastParsedAt).toISOString() : "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <SettingsClient
      rows={rows}
      selectedSlug={params.form ?? ""}
      dropdownSourceSheetNames={dropdownSourceSheetNames}
    />
  );
}
