"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { writeAuditLog } from "@/lib/audit";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import {
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

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bool(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

function revalidateFormSurfaces() {
  revalidatePath("/admin/forms");
  revalidatePath("/admin/form-imports");
  revalidatePath("/admin/notifications");
  revalidatePath("/admin/lookups");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}

export async function updateFormDefinition(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const slug = s(formData, "slug");
  if (!id && !slug) return;

  const status = s(formData, "status") as FormDefinitionStatus;
  const visibility = s(formData, "visibility") as FormDefinitionVisibility;
  const availability = s(formData, "availability") as FormDefinitionAvailability;
  const requestedSlug = slugifyFormId(s(formData, "newSlug")) || slug;

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
    notes: s(formData, "notes"),
    status,
    visibility,
    availability,
    showInNavbar: bool(formData, "showInNavbar"),
    isImplemented: bool(formData, "isImplemented"),
    writeResponsesToSheet: bool(formData, "writeResponsesToSheet"),
    responseSpreadsheetId: s(formData, "responseSpreadsheetId"),
    responseSheetName: s(formData, "responseSheetName"),
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
}

export async function hideFormDefinition(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const slug = s(formData, "slug");
  if (!id && !slug) return;

  const result = await hideFormDefinitionEntry({ id, slug });
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
}

export async function deleteFormDefinition(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const slug = s(formData, "slug");
  if (!id && !slug) return;

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
}
