import { connectMongo } from "@/lib/db/mongo";
import { parseImportedFormHtml } from "@/lib/imported-forms";
import { Lookup, LOOKUP_CATEGORIES, parseImportedLookupCategory } from "@/models/Lookup";
import { FormImport } from "@/models/FormImport";
import LookupsClient, { type LookupAdminGroup } from "./LookupsClient";

const CATEGORY_LABELS: Record<string, string> = {
  department: "Departments",
  airport: "Airports (Origin / Destination)",
  multiCityDeparture: "Multi-city Departure",
  airline: "Airlines",
  baggage: "Baggage (Kg)",
  cashAdvancePayableTo: "Payables to",
  reimbursementFormType: "Form Type",
  reimbursementCostCenter: "Cost Center",
  reimbursementLocation: "Location",
  reimbursementLiquidationType: "Liquidation Type",
};

const FORM_GROUPS: Array<{
  key: string;
  title: string;
  description: string;
  categories: string[];
}> = [
  {
    key: "travel-booking",
    title: "Travel Booking",
    description: "Dropdown values used in the Travel Booking request form.",
    categories: ["department", "airport", "multiCityDeparture", "airline", "baggage"],
  },
  {
    key: "cash-advance",
    title: "Cash Advance",
    description: "Dropdown values used in the Cash Advance request form.",
    categories: ["cashAdvancePayableTo"],
  },
  {
    key: "reimbursement",
    title: "Reimbursement",
    description: "Dropdown values used in the Reimbursement request form.",
    categories: [
      "reimbursementFormType",
      "reimbursementCostCenter",
      "reimbursementLocation",
      "reimbursementLiquidationType",
      "department",
    ],
  },
];

export default async function LookupsPage() {
  await connectMongo();
  const [all, imports] = await Promise.all([
    Lookup.find({}).sort({ category: 1, sortOrder: 1 }).lean(),
    FormImport.find({}).select({ slug: 1, name: 1, htmlSource: 1 }).lean(),
  ]);
  const importNameBySlugKey = new Map(
    imports.map((item) => [item.slug.toLowerCase().replace(/[^a-z0-9]+/g, ""), item.name])
  );
  const dynamicCategories = [...new Set(all.map((item) => item.category))];
  const allCategories = [...new Set([...LOOKUP_CATEGORIES, ...dynamicCategories])];

  const itemsByCategory: Record<
    string,
    Array<{ id: string; value: string; isActive: boolean }>
  > = {};
  const categoryLabels: Record<string, string> = { ...CATEGORY_LABELS };
  for (const cat of allCategories) itemsByCategory[cat] = [];
  for (const item of all) {
    if (itemsByCategory[item.category]) {
      itemsByCategory[item.category].push({
        id: String(item._id),
        value: item.value,
        isActive: item.isActive,
      });
    }
  }

  const assigned = new Set(FORM_GROUPS.flatMap((g) => g.categories));
  const importedGroups = new Map<string, string[]>();
  const importedLabelByCategory = new Map<string, string>();
  for (const imported of imports) {
    const runtime = parseImportedFormHtml(imported.htmlSource ?? "");
    for (const field of runtime.fields) {
      if (field.type !== "select") continue;
      const fieldKey = field.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (!fieldKey) continue;
      const slugKey = imported.slug.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const category = `imported:${slugKey}:${fieldKey}`;
      importedLabelByCategory.set(category, field.label || humanizeImportedField(field.name));
      const categories = importedGroups.get(slugKey) ?? [];
      if (!categories.includes(category)) categories.push(category);
      importedGroups.set(slugKey, categories);
    }
  }

  for (const category of allCategories) {
    const parsed = parseImportedLookupCategory(category);
    if (!parsed) continue;
    const categories = importedGroups.get(parsed.slugKey) ?? [];
    categories.push(category);
    importedGroups.set(parsed.slugKey, categories);
    categoryLabels[category] = importedLabelByCategory.get(category) || humanizeImportedField(parsed.fieldKey);
  }

  for (const [slugKey, categories] of importedGroups.entries()) {
    for (const category of categories) {
      if (!allCategories.includes(category)) allCategories.push(category);
      if (!itemsByCategory[category]) itemsByCategory[category] = [];
      if (!categoryLabels[category]) {
        const parsed = parseImportedLookupCategory(category);
        categoryLabels[category] =
          importedLabelByCategory.get(category) ||
          (parsed ? humanizeImportedField(parsed.fieldKey) : category);
      }
    }
  }

  const otherCategories = allCategories.filter(
    (c) => !assigned.has(c) && !parseImportedLookupCategory(c)
  );
  const groupsToRender: LookupAdminGroup[] = [
    ...FORM_GROUPS,
    ...[...importedGroups.entries()].map(([slugKey, categories]) => ({
      key: `imported-${slugKey}`,
      title: importNameBySlugKey.get(slugKey) || humanizeImportedField(slugKey),
      description: "Imported dropdown values synced from legacy forms.",
      categories,
    })),
    ...(otherCategories.length
      ? [
          {
            key: "other",
            title: "Other",
            description: "Categories not assigned to a specific form yet.",
            categories: otherCategories,
          },
        ]
      : []),
  ];

  return <LookupsClient categoryLabels={categoryLabels} groups={groupsToRender} itemsByCategory={itemsByCategory} />;
}

function humanizeImportedField(input: string) {
  return input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
