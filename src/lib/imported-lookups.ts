import { connectMongo } from "@/lib/db/mongo";
import { hydrateImportedFormRuntime } from "@/lib/imported-forms";
import { FormImport } from "@/models/FormImport";
import { Lookup, importedLookupCategory } from "@/models/Lookup";

export async function syncImportedLookupsForImport(importId: string) {
  await connectMongo();
  const imported = await FormImport.findById(importId).lean();
  if (!imported) {
    throw new Error("Imported form draft not found.");
  }

  const runtime = await hydrateImportedFormRuntime({
    slug: imported.slug,
    htmlSource: imported.htmlSource ?? "",
    spreadsheetId: imported.spreadsheetId ?? "",
    spreadsheetBindings: imported.spreadsheetBindings ?? {},
    preferLookupOptions: false,
  });

  let categoriesSynced = 0;
  let valuesSynced = 0;

  for (const field of runtime.fields) {
    if (!["select", "radio", "checkbox-group"].includes(field.type)) continue;
    const options = (field.options ?? [])
      .map((option) => option.value.trim())
      .filter(Boolean);
    if (options.length === 0) continue;

    const category = importedLookupCategory(imported.slug, field.name);
    const uniqueOptions = [...new Set(options)];
    categoriesSynced += 1;
    valuesSynced += uniqueOptions.length;

    for (let i = 0; i < uniqueOptions.length; i += 1) {
      await Lookup.updateOne(
        { category, value: uniqueOptions[i] },
        {
          $set: {
            sortOrder: i,
            isActive: true,
          },
          $setOnInsert: {
            category,
            value: uniqueOptions[i],
          },
        },
        { upsert: true }
      );
    }

    await Lookup.deleteMany({
      category,
      value: { $nin: uniqueOptions },
    });
  }

  return {
    importName: imported.name,
    slug: imported.slug,
    categoriesSynced,
    valuesSynced,
  };
}

export async function syncImportedLookupsForAllImports() {
  await connectMongo();
  const imports = await FormImport.find({}).select({ _id: 1 }).lean();

  let importsSynced = 0;
  let categoriesSynced = 0;
  let valuesSynced = 0;

  for (const imported of imports) {
    const result = await syncImportedLookupsForImport(String(imported._id));
    if (result.categoriesSynced > 0) {
      importsSynced += 1;
      categoriesSynced += result.categoriesSynced;
      valuesSynced += result.valuesSynced;
    }
  }

  return { importsSynced, categoriesSynced, valuesSynced };
}
