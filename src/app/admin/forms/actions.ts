"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
