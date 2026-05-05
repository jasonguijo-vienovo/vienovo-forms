import { connectMongo } from "@/lib/db/mongo";
import {
  FormDefinition,
  type FormDefinitionAvailability,
  type FormDefinitionStatus,
  type FormDefinitionVisibility,
} from "@/models/FormDefinition";

export type AppFormDefinition = {
  slug: string;
  name: string;
  description: string;
  routePath: string;
  source: "native" | "imported";
  status: FormDefinitionStatus;
  visibility: FormDefinitionVisibility;
  availability: FormDefinitionAvailability;
  isImplemented: boolean;
  showInNavbar: boolean;
  sortOrder: number;
  notes: string;
  _id?: string;
};

function isStartRequestAvailable(form: Pick<AppFormDefinition, "status" | "availability" | "isImplemented">) {
  return form.status === "published" && form.availability === "available" && form.isImplemented;
}

function sortCatalogForRequester(forms: AppFormDefinition[]) {
  return [...forms].sort((a, b) => {
    const aAvailable = isStartRequestAvailable(a);
    const bAvailable = isStartRequestAvailable(b);
    if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
    const orderDiff = a.sortOrder - b.sortOrder;
    return orderDiff || a.name.localeCompare(b.name);
  });
}

export const BUILTIN_FORMS: AppFormDefinition[] = [
  {
    slug: "travel-booking",
    name: "Travel Booking",
    description: "Book a flight, hotel, or company travel.",
    routePath: "/forms/travel-booking",
    source: "native",
    status: "published",
    visibility: "everyone",
    availability: "available",
    isImplemented: true,
    showInNavbar: true,
    sortOrder: 10,
    notes: "",
  },
  {
    slug: "cash-advance",
    name: "Cash Advance",
    description: "Request advance funds for upcoming expenses.",
    routePath: "/forms/cash-advance",
    source: "native",
    status: "published",
    visibility: "everyone",
    availability: "available",
    isImplemented: true,
    showInNavbar: true,
    sortOrder: 20,
    notes: "",
  },
  {
    slug: "reimbursement",
    name: "Reimbursement",
    description: "Get reimbursed for expenses you already paid for.",
    routePath: "/forms/reimbursement",
    source: "native",
    status: "published",
    visibility: "everyone",
    availability: "available",
    isImplemented: true,
    showInNavbar: true,
    sortOrder: 30,
    notes: "",
  },
  {
    slug: "request-for-payment",
    name: "Request for Payment",
    description: "Request payment to a vendor or supplier.",
    routePath: "/forms/request-for-payment",
    source: "native",
    status: "published",
    visibility: "everyone",
    availability: "coming-soon",
    isImplemented: false,
    showInNavbar: false,
    sortOrder: 40,
    notes: "",
  },
  {
    slug: "cashiering",
    name: "Cashiering",
    description: "Cashier-related transactions and requests.",
    routePath: "/forms/cashiering",
    source: "native",
    status: "published",
    visibility: "everyone",
    availability: "coming-soon",
    isImplemented: false,
    showInNavbar: false,
    sortOrder: 50,
    notes: "",
  },
];

function fallbackForms() {
  return [...BUILTIN_FORMS].sort((a, b) => a.sortOrder - b.sortOrder);
}

const BUILTIN_FORM_BY_SLUG = new Map(BUILTIN_FORMS.map((form) => [form.slug, form]));
const BUILTIN_FORM_SLUGS = new Set(BUILTIN_FORMS.map((form) => form.slug));

async function syncBuiltInForms() {
  for (const form of BUILTIN_FORMS) {
    try {
      await FormDefinition.updateOne(
        { slug: form.slug },
        {
          $setOnInsert: {
            slug: form.slug,
            source: form.source,
          },
          $set: {
            name: form.name,
            description: form.description,
            routePath: form.routePath,
            source: form.source,
            status: form.status,
            visibility: form.visibility,
            availability: form.availability,
            isImplemented: form.isImplemented,
            showInNavbar: form.showInNavbar,
            sortOrder: form.sortOrder,
            notes: form.notes,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      console.error(`Failed to sync built-in form ${form.slug}:`, error);
    }
  }
}

function normalizeForms(rows: Array<any>): AppFormDefinition[] {
  return rows.map((row) => ({
    _id: row._id ? String(row._id) : undefined,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    routePath: row.routePath || `/forms/${row.slug}`,
    source: row.source,
    status: row.status,
    visibility: row.visibility,
    availability: row.availability,
    isImplemented: Boolean(row.isImplemented),
    showInNavbar: Boolean(row.showInNavbar),
    sortOrder: row.sortOrder ?? 0,
    notes: row.notes ?? "",
  }));
}

function withBuiltInForms(rows: AppFormDefinition[]) {
  const rowBySlug = new Map(rows.map((row) => [row.slug, row]));
  const builtInRows = BUILTIN_FORMS.map((form) => ({
    ...form,
    ...(rowBySlug.get(form.slug) ?? {}),
    source: "native" as const,
    routePath: rowBySlug.get(form.slug)?.routePath || form.routePath,
  }));
  const importedRows = rows.filter(
    (row) => row.source === "imported" && !BUILTIN_FORM_SLUGS.has(row.slug)
  );
  return [...builtInRows, ...importedRows].sort((a, b) => {
    const orderDiff = a.sortOrder - b.sortOrder;
    return orderDiff || a.name.localeCompare(b.name);
  });
}

async function loadAllFromDb(): Promise<AppFormDefinition[]> {
  await connectMongo();
  await syncBuiltInForms();
  const rows = await FormDefinition.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  return withBuiltInForms(normalizeForms(rows));
}

export async function getAllFormDefinitionsForAdmin(): Promise<AppFormDefinition[]> {
  try {
    return await loadAllFromDb();
  } catch (error) {
    console.error("Admin form registry fallback:", error);
    return fallbackForms();
  }
}

export async function getFormDefinitionBySlug(slug: string): Promise<AppFormDefinition | null> {
  try {
    const forms = await loadAllFromDb();
    return forms.find((form) => form.slug === slug) ?? null;
  } catch (error) {
    console.error("Form registry lookup failed:", error);
    const builtIn = BUILTIN_FORM_BY_SLUG.get(slug);
    if (builtIn) return builtIn;
    return fallbackForms().find((form) => form.slug === slug) ?? null;
  }
}

export async function getCatalogForms(opts?: {
  includeAdminOnly?: boolean;
  includeDrafts?: boolean;
  includeUnavailable?: boolean;
  allowFallback?: boolean;
}): Promise<AppFormDefinition[]> {
  const includeAdminOnly = opts?.includeAdminOnly ?? false;
  const includeDrafts = opts?.includeDrafts ?? false;
  const includeUnavailable = opts?.includeUnavailable ?? false;
  const allowFallback = opts?.allowFallback ?? true;

  try {
    const forms = await loadAllFromDb();
    const filtered = forms.filter((form) => {
      if (!includeDrafts && form.status !== "published") return false;
      if (!includeAdminOnly && form.visibility === "admin") return false;
      if (!includeUnavailable && (form.availability !== "available" || !form.isImplemented)) {
        return false;
      }
      if (form.status === "archived") return false;
      return true;
    });
    return sortCatalogForRequester(filtered);
  } catch (error) {
    if (!allowFallback) throw error;
    console.error("Form registry fallback:", error);
    const filtered = fallbackForms().filter(
      (form) =>
        form.status === "published" &&
        (includeUnavailable || (form.availability === "available" && form.isImplemented))
    );
    return sortCatalogForRequester(filtered);
  }
}

export async function getNavbarForms(): Promise<AppFormDefinition[]> {
  const forms = await getCatalogForms({ allowFallback: true });
  return forms.filter((form) => form.showInNavbar && form.availability === "available" && form.isImplemented);
}
