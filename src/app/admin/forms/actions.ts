"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { writeAuditLog } from "@/lib/audit";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import {
  appendSpreadsheetRow,
  readSpreadsheetMatrix,
  writeSpreadsheetRow,
} from "@/lib/google/sheets";
import {
  deleteFormEverywhere as deleteFormEverywhereEntry,
  deleteFormDefinitionEntry,
  hideFormDefinitionEntry,
  slugifyFormId,
  updateFormDefinitionSettings,
} from "@/lib/forms/import-registry-service";
import {
  FORM_DEFINITION_AVAILABILITIES,
  FORM_DEFINITION_STATUSES,
  FORM_DEFINITION_VISIBILITIES,
  type FormDefinitionAvailability,
  type FormDefinitionStatus,
  type FormDefinitionVisibility,
} from "@/models/FormDefinition";
import { RequestModel } from "@/models/Request";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bool(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

function revalidateFormSurfaces() {
  revalidatePath("/admin");
  revalidatePath("/admin/forms");
  revalidatePath("/admin/form-imports");
  revalidatePath("/admin/notifications");
  revalidatePath("/admin/requests");
  revalidatePath("/approvals");
  revalidatePath("/admin/lookups");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}

function messageFromError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "The form registry action could not be completed. Please try again.";
}

function redirectToRegistry(input?: { slug?: string; openSettings?: boolean }) {
  const params = new URLSearchParams();
  if (input?.slug) params.set("form", input.slug);
  if (input?.openSettings) params.set("settings", "open");
  const query = params.toString();
  redirect(query ? `/admin/forms?${query}` : "/admin/forms");
}

const FIXED_ASSET_ITEM_CODE_SHEET = "REQUEST FOR FIXED ASSET ITEM CODE";
const FIXED_ASSET_ITEM_CODE_SPREADSHEET_ID = "1-Ml75zLsLUvackWpjnitqcfJwaL1OtBBKyq7PRZ82vM";
const FIXED_ASSET_ITEM_CODE_SLUG = "request-for-fixed-asset-item-code";
const FIXED_ASSET_ITEM_CODE_HEADERS = [
  "Timestamp",
  "Reference",
  "Requester Name",
  "Requester Email",
  "CAPEX BUDGET",
  "Item Description",
  "Asset Class",
  "Department",
  "Sub-Department",
  "Location",
  "Project Name",
  "Total Cost",
  "Supporting Document",
  "ASSIGNED ITEM CODE",
  "PO NUMBER",
  "Email Status",
] as const;

function norm(input: unknown) {
  return String(input ?? "").trim();
}
function normRef(input: unknown) {
  return norm(input).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}
function normKey(input: unknown) {
  return norm(input).toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function findFieldValue(values: Record<string, unknown>, labels: Record<string, string>, ...aliases: string[]) {
  const wanted = aliases.map(normKey);
  for (const [key, value] of Object.entries(values ?? {})) {
    const keyNorm = normKey(key);
    const labelNorm = normKey(labels?.[key] ?? "");
    if (wanted.some((item) => item === keyNorm || item === labelNorm)) return norm(value);
  }
  return "";
}

export async function backfillFixedAssetItemCodeSheet() {
  try {
    const { email } = await requireAdmin();
    await connectMongo();

    const existing = await readSpreadsheetMatrix(
      FIXED_ASSET_ITEM_CODE_SPREADSHEET_ID,
      `${FIXED_ASSET_ITEM_CODE_SHEET}!A1:Z5000`,
    );
    const currentHeaders = (existing[0] ?? []).map(norm);
    if (
      currentHeaders.length !== FIXED_ASSET_ITEM_CODE_HEADERS.length ||
      FIXED_ASSET_ITEM_CODE_HEADERS.some((header, i) => currentHeaders[i] !== header)
    ) {
      await writeSpreadsheetRow({
        spreadsheetId: FIXED_ASSET_ITEM_CODE_SPREADSHEET_ID,
        range: `${FIXED_ASSET_ITEM_CODE_SHEET}!A1`,
        values: [...FIXED_ASSET_ITEM_CODE_HEADERS],
      });
    }
    const existingRefs = new Set(existing.slice(1).map((row) => normRef(row?.[1])).filter(Boolean));

    const requests = await RequestModel.find(
      { formSlug: FIXED_ASSET_ITEM_CODE_SLUG },
      {
        referenceNo: 1,
        submittedBy: 1,
        formData: 1,
        createdAt: 1,
      },
    )
      .sort({ createdAt: 1 })
      .lean();

    let inserted = 0;
    for (const req of requests) {
      const ref = norm(req.referenceNo);
      if (!ref || existingRefs.has(normRef(ref))) continue;
      const values = ((req as any).formData?.values ?? {}) as Record<string, unknown>;
      const labels = ((req as any).formData?.fieldLabels ?? {}) as Record<string, string>;
      const row = [
        new Date((req as any).createdAt ?? Date.now()).toLocaleString("en-PH", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Manila",
        }),
        ref,
        norm((req as any).submittedBy?.name),
        norm((req as any).submittedBy?.email),
        findFieldValue(values, labels, "capexbudget", "capex budget"),
        findFieldValue(values, labels, "description", "itemdescription", "item description"),
        findFieldValue(values, labels, "assetclass", "asset class", "assetcategory", "asset category"),
        findFieldValue(values, labels, "department"),
        findFieldValue(values, labels, "subdepartment", "sub-department"),
        findFieldValue(values, labels, "location"),
        findFieldValue(values, labels, "projectname", "project name"),
        findFieldValue(values, labels, "totalcost", "total cost", "approvedannualbudget", "approved annual budget"),
        findFieldValue(values, labels, "supportingdocument", "supporting document"),
        findFieldValue(values, labels, "assigneditemcode", "assigned item code"),
        findFieldValue(values, labels, "ponumber", "po number"),
        findFieldValue(values, labels, "emailstatus", "email status"),
      ];
      await appendSpreadsheetRow({
        spreadsheetId: FIXED_ASSET_ITEM_CODE_SPREADSHEET_ID,
        sheetTitle: FIXED_ASSET_ITEM_CODE_SHEET,
        values: row,
      });
      inserted += 1;
    }

    await setFlashToast({
      tone: "success",
      message: `Backfill complete. ${inserted} row(s) added to ${FIXED_ASSET_ITEM_CODE_SHEET}.`,
    });
    await writeAuditLog({
      actorEmail: email,
      action: "backfill_fixed_asset_item_code_sheet",
      targetType: "spreadsheet",
      targetId: FIXED_ASSET_ITEM_CODE_SPREADSHEET_ID,
      correlationId: randomUUID(),
      details: { inserted, sheet: FIXED_ASSET_ITEM_CODE_SHEET },
    });
    revalidateFormSurfaces();
  } catch (error) {
    console.error("backfillFixedAssetItemCodeSheet failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
  }
  redirectToRegistry();
}

export async function updateFormDefinition(formData: FormData) {
  const id = s(formData, "id");
  const slug = s(formData, "slug");
  const status = s(formData, "status") as FormDefinitionStatus;
  const visibility = s(formData, "visibility") as FormDefinitionVisibility;
  const availability = s(formData, "availability") as FormDefinitionAvailability;
  const requestedSlug = slugifyFormId(s(formData, "newSlug")) || slug;

  try {
    const { email } = await requireAdmin();
    await connectMongo();

    if (!id && !slug) {
      throw new Error("Form definition is missing its identity.");
    }
    if (!FORM_DEFINITION_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    if (!FORM_DEFINITION_VISIBILITIES.includes(visibility)) {
      throw new Error(`Invalid visibility: ${visibility}`);
    }
    if (!FORM_DEFINITION_AVAILABILITIES.includes(availability)) {
      throw new Error(`Invalid availability: ${availability}`);
    }

    const result = await updateFormDefinitionSettings({
      id,
      slug,
      name: s(formData, "name"),
      description: s(formData, "description"),
      requestedSlug,
      routePath: s(formData, "routePath"),
      externalFormUrl: s(formData, "externalFormUrl"),
      notes: s(formData, "notes"),
      status,
      visibility,
      availability,
      showInNavbar: bool(formData, "showInNavbar"),
      isImplemented: bool(formData, "isImplemented"),
      writeResponsesToSheet: bool(formData, "writeResponsesToSheet"),
      responseSpreadsheetId: s(formData, "responseSpreadsheetId"),
      responseSheetName: s(formData, "responseSheetName"),
      triggerEnabled: bool(formData, "triggerEnabled"),
      triggerUrl: s(formData, "triggerUrl"),
      triggerSource: s(formData, "triggerSource"),
      triggerEvent: s(formData, "triggerEvent"),
      triggerFunctionName: s(formData, "triggerFunctionName"),
      triggerNotes: s(formData, "triggerNotes"),
    });

    await setFlashToast({ tone: "success", message: "Form settings saved." });
    await writeAuditLog({
      actorEmail: email,
      action: "update_form_definition",
      targetType: "form-definition",
      targetId: id || slug || requestedSlug,
      correlationId: randomUUID(),
      before: result.before
        ? {
            slug: result.before.slug,
            status: result.before.status,
            visibility: result.before.visibility,
            availability: result.before.availability,
            routePath: result.before.routePath,
          }
        : null,
      after: result.after
        ? {
            slug: result.after.slug,
            status: result.after.status,
            visibility: result.after.visibility,
            availability: result.after.availability,
            routePath: result.after.routePath,
          }
        : null,
      details: {
        nextRoutePath: result.nextRoutePath,
      },
    });

    revalidateFormSurfaces();
  } catch (error) {
    console.error("updateFormDefinition failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
  }

  redirectToRegistry({ slug: requestedSlug || slug || id, openSettings: true });
}

export async function hideFormDefinition(formData: FormData) {
  const id = s(formData, "id");
  const slug = s(formData, "slug");
  let redirectSlug = slug || id;

  try {
    const { email } = await requireAdmin();
    await connectMongo();

    if (!id && !slug) {
      throw new Error("Form definition is missing its identity.");
    }

    const result = await hideFormDefinitionEntry({ id, slug });
    redirectSlug = result.after?.slug ?? redirectSlug;
    await setFlashToast({ tone: "success", message: "Form hidden from users." });
    await writeAuditLog({
      actorEmail: email,
      action: "hide_form_definition",
      targetType: "form-definition",
      targetId: id || slug,
      correlationId: randomUUID(),
      before: result.before
        ? {
            slug: result.before.slug,
            status: result.before.status,
            visibility: result.before.visibility,
            availability: result.before.availability,
          }
        : null,
      after: result.after
        ? {
            slug: result.after.slug,
            status: result.after.status,
            visibility: result.after.visibility,
            availability: result.after.availability,
          }
        : null,
    });

    revalidateFormSurfaces();
  } catch (error) {
    console.error("hideFormDefinition failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
  }

  redirectToRegistry({ slug: redirectSlug, openSettings: true });
}

export async function deleteFormDefinition(formData: FormData) {
  const id = s(formData, "id");
  const slug = s(formData, "slug");
  try {
    const { email } = await requireAdmin();
    await connectMongo();

    if (!id && !slug) {
      throw new Error("Form definition is missing its identity.");
    }

    const result = await deleteFormDefinitionEntry({ id, slug });

    if (result.mode === "archive-native") {
      await setFlashToast({ tone: "success", message: "Native form deleted from the system." });
      await writeAuditLog({
        actorEmail: email,
        action: "delete_native_form_definition",
        targetType: "form-definition",
        targetId: result.before.slug,
        correlationId: randomUUID(),
        before: {
          slug: result.before.slug,
          source: result.before.source,
          status: result.before.status,
        },
        after: result.after
          ? {
              slug: result.after.slug,
              source: result.after.source,
              status: result.after.status,
              isDeleted: result.after.isDeleted,
            }
          : null,
      });
    } else {
      await setFlashToast({ tone: "success", message: "Registry entry deleted." });
      await writeAuditLog({
        actorEmail: email,
        action: "delete_form_definition",
        targetType: "form-definition",
        targetId: result.before.slug,
        correlationId: randomUUID(),
        before: {
          slug: result.before.slug,
          source: result.before.source,
          importSourceId: result.before.importSourceId ? String(result.before.importSourceId) : "",
        },
      });
    }

    revalidateFormSurfaces();
  } catch (error) {
    console.error("deleteFormDefinition failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
  }

  redirectToRegistry();
}

export async function deleteFormEverywhere(formData: FormData) {
  const id = s(formData, "id");
  const slug = s(formData, "slug");
  const importId = s(formData, "importId");

  try {
    const { email } = await requireAdmin();
    await connectMongo();

    if (!id && !slug && !importId) {
      throw new Error("Form definition is missing its identity.");
    }

    const result = await deleteFormEverywhereEntry({ id, slug, importId });
    await setFlashToast({
      tone: "success",
      message: `${result.targetName} was deleted globally. Removed ${result.deletedRequestCount} requests, ${result.deletedLookupCount} lookups, and ${result.deletedImportCount} import records.`,
    });
    await writeAuditLog({
      actorEmail: email,
      action: "delete_form_everywhere",
      targetType: "form-definition",
      targetId: result.targetSlug,
      correlationId: randomUUID(),
      before: result.before,
      details: {
        slugs: result.slugs,
        archivedRegistryCount: result.archivedRegistryCount,
        deletedRegistryCount: result.deletedRegistryCount,
        deletedImportCount: result.deletedImportCount,
        deletedRequestCount: result.deletedRequestCount,
        deletedNotificationFlowCount: result.deletedNotificationFlowCount,
        deletedNotificationLogCount: result.deletedNotificationLogCount,
        deletedLookupCount: result.deletedLookupCount,
        droppedMirrorCollectionCount: result.droppedMirrorCollectionCount,
      },
    });

    revalidateFormSurfaces();
  } catch (error) {
    console.error("deleteFormEverywhere failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
  }

  redirectToRegistry();
}
