import { connectMongo } from "@/lib/db/mongo";
import { projectFormRuntimeState, type FormRuntimeState } from "@/lib/forms/runtime-state";
import {
  FormDefinition,
  type FormDefinitionAvailability,
  type FormDefinitionStatus,
  type FormDefinitionVisibility,
} from "@/models/FormDefinition";

const DEFAULT_RESPONSE_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_MASTER_ID ?? "";

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
  writeResponsesToSheet: boolean;
  responseSpreadsheetId: string;
  responseSheetName: string;
  notes: string;
  _id?: string;
  runtime: FormRuntimeState;
};

function sortCatalog(forms: AppFormDefinition[]) {
  return [...forms].sort((a, b) => {
    if (a.runtime.requesterCanOpen !== b.runtime.requesterCanOpen) {
      return a.runtime.requesterCanOpen ? -1 : 1;
    }
    const orderDiff = a.sortOrder - b.sortOrder;
    return orderDiff || a.name.localeCompare(b.name);
  });
}

export const BUILTIN_FORMS: Omit<AppFormDefinition, "runtime">[] = [
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
    writeResponsesToSheet: Boolean(DEFAULT_RESPONSE_SPREADSHEET_ID),
    responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
    responseSheetName: "Travel Booking Responses",
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
    writeResponsesToSheet: Boolean(DEFAULT_RESPONSE_SPREADSHEET_ID),
    responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
    responseSheetName: "Cash Advance Responses",
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
    writeResponsesToSheet: Boolean(DEFAULT_RESPONSE_SPREADSHEET_ID),
    responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
    responseSheetName: "Reimbursement Responses",
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
    writeResponsesToSheet: Boolean(DEFAULT_RESPONSE_SPREADSHEET_ID),
    responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
    responseSheetName: "Request for Payment Responses",
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
    writeResponsesToSheet: Boolean(DEFAULT_RESPONSE_SPREADSHEET_ID),
    responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
    responseSheetName: "Cashiering Responses",
    notes: "",
  },
  {
    slug: "leave-request",
    name: "Leave Request",
    description: "Submit planned leave requests for manager review and approval.",
    routePath: "/forms/leave-request",
    source: "native",
    status: "published",
    visibility: "everyone",
    availability: "coming-soon",
    isImplemented: false,
    showInNavbar: false,
    sortOrder: 70,
    writeResponsesToSheet: Boolean(DEFAULT_RESPONSE_SPREADSHEET_ID),
    responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
    responseSheetName: "Leave Request Responses",
    notes: "",
  },
];

const BUILTIN_FORM_BY_SLUG = new Map(BUILTIN_FORMS.map((form) => [form.slug, form]));
const BUILTIN_FORM_SLUGS = new Set(BUILTIN_FORMS.map((form) => form.slug));

function withRuntime(form: Omit<AppFormDefinition, "runtime">): AppFormDefinition {
  return {
    ...form,
    runtime: projectFormRuntimeState(form),
  };
}

function normalizeFormDefinitionRow(row: any): Omit<AppFormDefinition, "runtime"> {
  return {
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
    writeResponsesToSheet: Boolean(row.writeResponsesToSheet),
    responseSpreadsheetId: row.responseSpreadsheetId ?? "",
    responseSheetName: row.responseSheetName ?? "",
    notes: row.notes ?? "",
  };
}

function mergeBuiltInWithOverride(
  builtin: Omit<AppFormDefinition, "runtime">,
  override?: any,
): Omit<AppFormDefinition, "runtime"> | null {
  if (override?.isDeleted) return null;
  if (!override) return builtin;
  const normalized = normalizeFormDefinitionRow(override);
  return {
    ...builtin,
    ...normalized,
    source: "native",
    routePath: normalized.routePath || builtin.routePath,
  };
}

function fallbackForms() {
  return BUILTIN_FORMS.map(withRuntime).sort((a, b) => a.sortOrder - b.sortOrder);
}

function shouldIncludeForCatalog(
  form: AppFormDefinition,
  opts: {
    includeAdminOnly: boolean;
    includeDrafts: boolean;
    includeUnavailable: boolean;
  },
) {
  if (form.status === "archived") return false;
  if (!opts.includeDrafts && form.status !== "published") return false;
  if (!opts.includeAdminOnly && form.visibility === "admin") return false;
  if (!opts.includeUnavailable && !form.runtime.requesterCanOpen) return false;
  return true;
}

export async function syncBuiltInForms() {
  const deletedNativeSlugs = new Set(
    (
      await FormDefinition.find({ source: "native", isDeleted: true })
        .select({ slug: 1 })
        .lean()
    ).map((row) => row.slug),
  );

  for (const form of BUILTIN_FORMS) {
    if (deletedNativeSlugs.has(form.slug)) continue;
    try {
      await FormDefinition.updateOne(
        { slug: form.slug },
        {
          $setOnInsert: {
            slug: form.slug,
            source: form.source,
            name: form.name,
            description: form.description,
            routePath: form.routePath,
            status: form.status,
            visibility: form.visibility,
            availability: form.availability,
            isImplemented: form.isImplemented,
            showInNavbar: form.showInNavbar,
            sortOrder: form.sortOrder,
            writeResponsesToSheet: form.writeResponsesToSheet,
            responseSpreadsheetId: form.responseSpreadsheetId,
            responseSheetName: form.responseSheetName,
            notes: form.notes,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      console.error(`Failed to sync built-in form ${form.slug}:`, error);
    }
  }
}

export async function getAllFormDefinitionsForAdmin(): Promise<AppFormDefinition[]> {
  try {
    await connectMongo();
    await syncBuiltInForms();
    const rows = await FormDefinition.find({}).sort({ sortOrder: 1, name: 1 }).lean();
    const rowBySlug = new Map(rows.map((row) => [row.slug, row]));
    const builtIns = BUILTIN_FORMS.map((form) => mergeBuiltInWithOverride(form, rowBySlug.get(form.slug)))
      .filter(Boolean)
      .map((form) => withRuntime(form as Omit<AppFormDefinition, "runtime">));
    const imported = rows
      .filter((row) => row.source === "imported" && !row.isDeleted && !BUILTIN_FORM_SLUGS.has(row.slug))
      .map(normalizeFormDefinitionRow)
      .map(withRuntime);

    return [...builtIns, ...imported].sort((a, b) => {
      const orderDiff = a.sortOrder - b.sortOrder;
      return orderDiff || a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error("Admin form registry fallback:", error);
    return fallbackForms();
  }
}

export async function getFormDefinitionBySlug(slug: string): Promise<AppFormDefinition | null> {
  try {
    await connectMongo();
    const row = await FormDefinition.findOne({ slug }).lean();
    const builtin = BUILTIN_FORM_BY_SLUG.get(slug);

    if (builtin) {
      const merged = mergeBuiltInWithOverride(builtin, row);
      return merged ? withRuntime(merged) : null;
    }

    if (!row || row.isDeleted) return null;
    return withRuntime(normalizeFormDefinitionRow(row));
  } catch (error) {
    console.error("Form registry lookup failed:", error);
    const builtin = BUILTIN_FORM_BY_SLUG.get(slug);
    return builtin ? withRuntime(builtin) : null;
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
    await connectMongo();

    const [builtinRows, importedRows] = await Promise.all([
      FormDefinition.find({ slug: { $in: [...BUILTIN_FORM_SLUGS] } }).lean(),
      FormDefinition.find({
        source: "imported",
        isDeleted: { $ne: true },
        status: includeDrafts ? { $ne: "archived" } : "published",
        ...(includeAdminOnly ? {} : { visibility: { $ne: "admin" } }),
        ...(includeUnavailable ? {} : { availability: "available", isImplemented: true }),
      })
        .sort({ sortOrder: 1, name: 1 })
        .lean(),
    ]);

    const builtInBySlug = new Map(builtinRows.map((row) => [row.slug, row]));
    const builtIns = BUILTIN_FORMS.map((form) => mergeBuiltInWithOverride(form, builtInBySlug.get(form.slug)))
      .filter(Boolean)
      .map((form) => withRuntime(form as Omit<AppFormDefinition, "runtime">))
      .filter((form) => shouldIncludeForCatalog(form, { includeAdminOnly, includeDrafts, includeUnavailable }));

    const imported = importedRows
      .map(normalizeFormDefinitionRow)
      .map(withRuntime)
      .filter((form) => shouldIncludeForCatalog(form, { includeAdminOnly, includeDrafts, includeUnavailable }));

    return sortCatalog([...builtIns, ...imported]);
  } catch (error) {
    if (!allowFallback) throw error;
    console.error("Form registry fallback:", error);
    return sortCatalog(
      fallbackForms().filter((form) =>
        shouldIncludeForCatalog(form, { includeAdminOnly, includeDrafts, includeUnavailable }),
      ),
    );
  }
}

export async function getNavbarForms(): Promise<AppFormDefinition[]> {
  const forms = await getCatalogForms({ allowFallback: true, includeUnavailable: false, includeDrafts: false });
  return forms.filter((form) => form.runtime.shouldShowInNavbar);
}
