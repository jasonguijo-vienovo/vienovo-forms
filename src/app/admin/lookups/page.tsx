import { connectMongo } from "@/lib/db/mongo";
import { Lookup, LOOKUP_CATEGORIES } from "@/models/Lookup";
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
  const all = await Lookup.find({}).sort({ category: 1, sortOrder: 1 }).lean();

  const itemsByCategory: Record<
    string,
    Array<{ id: string; value: string; isActive: boolean }>
  > = {};
  for (const cat of LOOKUP_CATEGORIES) itemsByCategory[cat] = [];
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
  const otherCategories = LOOKUP_CATEGORIES.filter((c) => !assigned.has(c));
  const groupsToRender: LookupAdminGroup[] = [
    ...FORM_GROUPS,
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Manage dropdowns</h1>
        <p className="text-gray-500 text-sm mt-1">
          Add, deactivate, or remove values that appear in form dropdowns.
        </p>
      </div>

      <LookupsClient
        categoryLabels={CATEGORY_LABELS}
        groups={groupsToRender}
        itemsByCategory={itemsByCategory}
      />
    </div>
  );
}
