import { connectMongo } from "@/lib/db/mongo";
import { parseImportedFormHtml } from "@/lib/imported-forms";
import { APPROVER_ROLES, Approver } from "@/models/Approver";
import { FormImport } from "@/models/FormImport";
import { Lookup, LOOKUP_CATEGORIES, parseImportedLookupCategory } from "@/models/Lookup";
import { SystemSetting } from "@/models/SystemSetting";
import LookupsClient, { type LookupAdminGroup } from "./LookupsClient";

const APPROVER_CUSTOM_ROLES_KEY = "approver-custom-roles";
const LOOKUP_APPROVER_SYNC_KEY = "lookup-approver-sync";
const LOOKUP_USER_INFO_BINDINGS_KEY = "lookup-user-info-bindings";
const USER_INFO_FIELD_OPTIONS = [
  { value: "department", label: "Department" },
  { value: "jobTitle", label: "Job Title" },
  { value: "employeeId", label: "Employee ID" },
  { value: "fullName", label: "Full Name" },
] as const;

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
  const [all, imports, dynamicApproverRoles, storedRoleDoc, approverSyncDoc, userInfoBindingDoc] = await Promise.all([
    Lookup.find({}).sort({ category: 1, sortOrder: 1 }).lean(),
    FormImport.find({}).select({ slug: 1, name: 1, htmlSource: 1 }).lean(),
    Approver.distinct("roles"),
    SystemSetting.findOne({ key: APPROVER_CUSTOM_ROLES_KEY }).lean(),
    SystemSetting.findOne({ key: LOOKUP_APPROVER_SYNC_KEY }).lean(),
    SystemSetting.findOne({ key: LOOKUP_USER_INFO_BINDINGS_KEY }).lean(),
  ]);
  const approverSyncByCategory =
    approverSyncDoc?.value && typeof approverSyncDoc.value === "object"
      ? Object.fromEntries(
          Object.entries(approverSyncDoc.value as Record<string, unknown>)
            .map(([category, value]) => [String(category ?? "").trim(), String(value ?? "").trim()])
            .filter(([category, value]) => Boolean(category) && Boolean(value)),
        )
      : {};
  const userInfoBindingByCategory =
    userInfoBindingDoc?.value && typeof userInfoBindingDoc.value === "object"
      ? Object.fromEntries(
          Object.entries(userInfoBindingDoc.value as Record<string, unknown>)
            .map(([category, value]) => [String(category ?? "").trim(), String(value ?? "").trim()])
            .filter(([category, value]) => Boolean(category) && Boolean(value)),
        )
      : {};

  const storedRoles = Array.isArray(storedRoleDoc?.value)
    ? (storedRoleDoc.value as unknown[]).map((item) => String(item ?? "").trim()).filter(Boolean)
    : typeof storedRoleDoc?.value === "string"
      ? storedRoleDoc.value
          .split(/[\n,;]+/g)
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];

  const knownRoleMap = new Map<string, string>();
  for (const role of [
    ...APPROVER_ROLES,
    ...dynamicApproverRoles.map((item) => String(item ?? "").trim()).filter(Boolean),
    ...storedRoles,
  ]) {
    const value = String(role ?? "").trim();
    const key = value.replace(/\s+/g, "").toLowerCase();
    if (!key) continue;
    if (!knownRoleMap.has(key)) knownRoleMap.set(key, value);
  }
  const baseRoleKeys = new Set(APPROVER_ROLES.map((role) => role.replace(/\s+/g, "").toLowerCase()));
  const baseRoles = APPROVER_ROLES.filter((role) =>
    knownRoleMap.has(role.replace(/\s+/g, "").toLowerCase()),
  );
  const customRoles = [...knownRoleMap.entries()]
    .filter(([key]) => !baseRoleKeys.has(key))
    .map(([, value]) => value)
    .sort((a, b) => a.localeCompare(b));
  const knownApproverRoles = [...baseRoles, ...customRoles];

  const importNameBySlugKey = new Map(
    imports.map((item) => [item.slug.toLowerCase().replace(/[^a-z0-9]+/g, ""), item.name])
  );
  const dynamicCategories = [...new Set(all.map((item) => item.category))];
  const allCategories = [...new Set([...LOOKUP_CATEGORIES, ...dynamicCategories])];

  const itemsByCategory: Record<
    string,
    Array<{ id: string; value: string; label?: string; isActive: boolean }>
  > = {};
  const categoryLabels: Record<string, string> = { ...CATEGORY_LABELS };
  for (const cat of allCategories) itemsByCategory[cat] = [];
  for (const item of all) {
    if (itemsByCategory[item.category]) {
      itemsByCategory[item.category].push({
        id: String(item._id),
        value: item.value,
        label: item.label || "",
        isActive: item.isActive,
      });
    }
  }

  const assigned = new Set(FORM_GROUPS.flatMap((g) => g.categories));
  const importedGroups = new Map<string, string[]>();
  const importedLabelByCategory = new Map<string, string>();
  const importedCanonicalBySlugAndLabel = new Map<string, string>();
  for (const imported of imports) {
    const runtime = parseImportedFormHtml(imported.htmlSource ?? "");
    for (const field of runtime.fields) {
      if (field.type !== "select") continue;
      const fieldKey = field.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (!fieldKey) continue;
      const slugKey = imported.slug.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const inferredLabel = field.label || humanizeImportedField(field.name);
      const labelKey = inferredLabel.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const inferredCategory = `imported:${slugKey}:${fieldKey}`;
      const category =
        importedCanonicalBySlugAndLabel.get(`${slugKey}:${labelKey}`) || inferredCategory;
      importedCanonicalBySlugAndLabel.set(`${slugKey}:${labelKey}`, category);
      importedLabelByCategory.set(category, inferredLabel);
      const categories = importedGroups.get(slugKey) ?? [];
      if (!categories.includes(category)) categories.push(category);
      importedGroups.set(slugKey, categories);
    }
  }

  for (const category of allCategories) {
    const parsed = parseImportedLookupCategory(category);
    if (!parsed) continue;
    const labelKey = (importedLabelByCategory.get(category) || parsed.fieldKey)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    const canonicalCategory =
      importedCanonicalBySlugAndLabel.get(`${parsed.slugKey}:${labelKey}`) || category;
    importedCanonicalBySlugAndLabel.set(`${parsed.slugKey}:${labelKey}`, canonicalCategory);
    const categories = importedGroups.get(parsed.slugKey) ?? [];
    if (!categories.includes(canonicalCategory)) categories.push(canonicalCategory);
    importedGroups.set(parsed.slugKey, categories);
    categoryLabels[canonicalCategory] =
      importedLabelByCategory.get(canonicalCategory) ||
      importedLabelByCategory.get(category) ||
      humanizeImportedField(parsed.fieldKey);
  }

  for (const [, categories] of importedGroups.entries()) {
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

  return (
    <LookupsClient
      categoryLabels={categoryLabels}
      groups={groupsToRender}
      itemsByCategory={itemsByCategory}
      approverRoles={knownApproverRoles}
      approverSyncByCategory={approverSyncByCategory}
      userInfoBindingByCategory={userInfoBindingByCategory}
      userInfoFieldOptions={USER_INFO_FIELD_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
    />
  );
}

function humanizeImportedField(input: string) {
  return input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
