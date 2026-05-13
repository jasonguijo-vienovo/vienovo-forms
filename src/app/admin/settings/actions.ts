"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { writeAuditLog } from "@/lib/audit";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { updateFormTriggerSettings } from "@/lib/forms/import-registry-service";
import {
  parseSheetNameList,
  saveImportedDropdownSourceSheetNames,
} from "@/lib/system-settings";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bool(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function messageFromError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "The settings could not be saved. Please try again.";
}

function redirectToSettings(slug?: string) {
  const params = new URLSearchParams();
  if (slug) params.set("form", slug);
  const query = params.toString();
  redirect(query ? `/admin/settings?${query}` : "/admin/settings");
}

export async function saveTriggerSettings(formData: FormData) {
  const id = s(formData, "id");
  const slug = s(formData, "slug");

  try {
    const { email } = await requireAdmin();
    await connectMongo();

    if (!id && !slug) {
      throw new Error("Imported form settings are missing their identity.");
    }

    const result = await updateFormTriggerSettings({
      id,
      slug,
      triggerEnabled: bool(formData, "triggerEnabled"),
      triggerUrl: s(formData, "triggerUrl"),
      triggerSource: s(formData, "triggerSource"),
      triggerEvent: s(formData, "triggerEvent"),
      triggerFunctionName: s(formData, "triggerFunctionName"),
      triggerNotes: s(formData, "triggerNotes"),
    });

    await setFlashToast({
      tone: "success",
      message: `Trigger settings saved for ${result.after?.name || slug || "form"}.`,
    });
    await writeAuditLog({
      actorEmail: email,
      action: "update_form_trigger_settings",
      targetType: "form-definition",
      targetId: id || slug,
      correlationId: randomUUID(),
      before: result.before
        ? {
            triggerEnabled: result.before.triggerEnabled,
            triggerUrl: result.before.triggerUrl,
            triggerEvent: result.before.triggerEvent,
            triggerFunctionName: result.before.triggerFunctionName,
          }
        : null,
      after: result.after
        ? {
            triggerEnabled: result.after.triggerEnabled,
            triggerUrl: result.after.triggerUrl,
            triggerEvent: result.after.triggerEvent,
            triggerFunctionName: result.after.triggerFunctionName,
          }
        : null,
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/forms");
    revalidatePath("/admin/form-imports");
  } catch (error) {
    console.error("saveTriggerSettings failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
  }

  redirectToSettings(slug || id);
}

export async function saveImporterSettings(formData: FormData) {
  try {
    const { email } = await requireAdmin();
    const rawSheetNames = s(formData, "dropdownSourceSheetNames");
    const sheetNames = parseSheetNameList(rawSheetNames);
    const savedSheetNames = await saveImportedDropdownSourceSheetNames(sheetNames);

    await setFlashToast({
      tone: "success",
      message: `Importer settings saved. Auto-detect will scan: ${savedSheetNames.join(", ")}.`,
    });
    await writeAuditLog({
      actorEmail: email,
      action: "update_importer_settings",
      targetType: "system-setting",
      targetId: "imported-dropdown-source-sheets",
      correlationId: randomUUID(),
      details: {
        dropdownSourceSheetNames: savedSheetNames,
      },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/form-imports");
    revalidatePath("/admin/lookups");
  } catch (error) {
    console.error("saveImporterSettings failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
  }

  redirectToSettings();
}
