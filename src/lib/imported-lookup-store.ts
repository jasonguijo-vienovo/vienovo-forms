import { connectMongo } from "@/lib/db/mongo";
import { Lookup, parseImportedLookupCategory } from "@/models/Lookup";

function normalizeLookupKey(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function loadImportedLookupOptions(slug: string) {
  await connectMongo();
  const slugKey = normalizeLookupKey(slug);
  const docs = await Lookup.find({
    category: new RegExp(`^imported:${slugKey}:`),
    isActive: true,
  })
    .sort({ category: 1, sortOrder: 1, value: 1 })
    .lean();

  const optionsByField = new Map<string, string[]>();
  for (const doc of docs) {
    const parsed = parseImportedLookupCategory(doc.category);
    if (!parsed || parsed.slugKey !== slugKey) continue;
    const current = optionsByField.get(parsed.fieldKey) ?? [];
    current.push(doc.value);
    optionsByField.set(parsed.fieldKey, current);
  }

  return optionsByField;
}
