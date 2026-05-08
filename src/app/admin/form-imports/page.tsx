import Link from "next/link";
import { AdminHelpPanel, AdminMetricCard, AdminPageHeader, AdminSection } from "@/components/admin-ui";
import { connectMongo } from "@/lib/db/mongo";
import { FormDefinition } from "@/models/FormDefinition";
import { FormImport, FORM_IMPORT_STATUSES } from "@/models/FormImport";
import { Lookup } from "@/models/Lookup";
import { createFormImport } from "./actions";
import { FormImportsClient } from "./FormImportsClient";
import { StepOneCreateDraftForm } from "./StepOneCreateDraftForm";

function normalizeLookupKey(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export default async function FormImportsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const resolved = (await searchParams) ?? {};
  const tab = String(resolved.tab ?? "create");
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

  const definitionBySlug: Record<string, any> = {};
  for (const item of definitions) definitionBySlug[item.slug] = item;

  const syncedStatsBySlugKey: Record<string, { categoryCount: number; valueCount: number }> = {};
  for (const row of syncedLookupRows) {
    const [, slugKeyRaw] = String(row.category).split(":");
    if (!slugKeyRaw) continue;
    const slugKey = normalizeLookupKey(slugKeyRaw);
    if (!syncedStatsBySlugKey[slugKey]) syncedStatsBySlugKey[slugKey] = { categoryCount: 0, valueCount: 0 };
    syncedStatsBySlugKey[slugKey].valueCount += 1;
  }

  const readyForReview = imports.filter((item) => Boolean(definitionBySlug[item.slug])).length;
  const published = definitions.filter(
    (item) => item.status === "published" && item.visibility === "everyone" && item.availability === "available" && item.isImplemented
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

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/form-imports?tab=create" className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${tab === "create" ? "border-brand-700 bg-brand-50 text-brand-700" : "border-surface-border bg-white text-surface-muted"}`}>Step 1: Create Draft</Link>
        <Link href="/admin/form-imports?tab=manage" className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${tab === "manage" ? "border-brand-700 bg-brand-50 text-brand-700" : "border-surface-border bg-white text-surface-muted"}`}>Step 2: Manage Drafts</Link>
      </div>

      {tab === "create" ? <AdminSection title="Step 1: Create or replace an import draft" description="Use the same form ID if you are re-importing.">
        <StepOneCreateDraftForm action={createFormImport} />
      </AdminSection> : null}

      {tab === "manage" ? <AdminSection title="Step 2: Review, sync, preview, publish" description="Two-column efficient workflow" meta={`${imports.length} drafts`}>
        <FormImportsClient
          imports={JSON.parse(JSON.stringify(imports))}
          definitionBySlug={definitionBySlug}
          syncedStatsBySlugKey={syncedStatsBySlugKey}
          statuses={FORM_IMPORT_STATUSES}
        />
      </AdminSection> : null}
    </div>
  );
}
