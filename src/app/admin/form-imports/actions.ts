"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { writeAuditLog } from "@/lib/audit";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import {
  createImportedRegistryEntry,
  deleteImportedForm,
  publishImportedForm,
  saveImportDraft,
  slugifyFormId,
  updateImportConfig,
  updateImportStatus,
} from "@/lib/forms/import-registry-service";
import { syncImportedLookupsForImport } from "@/lib/imported-lookups";
import { parseSpreadsheetBindings } from "@/lib/imported-forms";
import { FormImport, FORM_IMPORT_STATUSES, type FormImportStatus } from "@/models/FormImport";

const FORM_IMPORTS_PATH = "/admin/form-imports";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bool(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

async function readTextInput(formData: FormData, fileKey: string, textKey: string) {
  const file = formData.get(fileKey);
  if (file instanceof File && file.size > 0) {
    return await file.text();
  }
  return s(formData, textKey);
}

async function readMultipleTextInput(
  formData: FormData,
  fileKey: string,
  fallbackSingleFileKey: string,
  textKey: string,
) {
  const files = formData.getAll(fileKey).filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > 0) {
    const chunks = await Promise.all(
      files.map(async (file) => `\n\n/* FILE: ${file.name} */\n${await file.text()}`),
    );
    return chunks.join("\n").trim();
  }

  return readTextInput(formData, fallbackSingleFileKey, textKey);
}

function bindingsFromFormData(formData: FormData) {
  const raw = s(formData, "spreadsheetBindings");
  if (!raw) return {};

  try {
    return parseSpreadsheetBindings(raw);
  } catch {
    throw new Error("Spreadsheet bindings must be valid JSON.");
  }
}

function messageFromError(error: unknown) {
  if (typeof error === "object" && error && "code" in error && (error as { code?: unknown }).code === 11000) {
    return "A form with this slug already exists. The import was not saved cleanly, so we blocked the duplicate.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "The import could not be saved. Please try again.";
}

function revalidateImportSurfaces() {
  revalidatePath(FORM_IMPORTS_PATH);
  revalidatePath("/admin/forms");
  revalidatePath("/admin/notifications");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}

export async function createFormImport(formData: FormData) {
  try {
    const { email, session } = await requireAdmin();
    await connectMongo();

    const name = s(formData, "name");
    if (!name) throw new Error("Form name is required.");
    const requestedSlug = slugifyFormId(s(formData, "slug")) || slugifyFormId(name);
    const htmlSource = await readMultipleTextInput(formData, "htmlFiles", "htmlFile", "htmlSource");
    const appsScriptSource = await readMultipleTextInput(formData, "gsFiles", "gsFile", "appsScriptSource");

    if (!htmlSource) {
      throw new Error("Provide the form index.html source or upload the file.");
    }
    if (!appsScriptSource) {
      throw new Error("Provide the code.gs source or upload the file.");
    }

    const result = await saveImportDraft({
      name,
      slug: requestedSlug,
      spreadsheetId: s(formData, "spreadsheetId"),
      spreadsheetBindings: bindingsFromFormData(formData),
      writeResponsesToSheet: bool(formData, "writeResponsesToSheet"),
      responseSheetName: s(formData, "responseSheetName"),
      htmlSource,
      appsScriptSource,
      notes: s(formData, "notes"),
      createdByEmail: email,
      createdByName: session.user.name ?? email,
    });

    await setFlashToast({
      tone: "success",
      message: result.replaced ? `Import draft replaced for ${name}.` : `Import draft saved for ${name}.`,
    });
    await writeAuditLog({
      actorEmail: email,
      action: "save_form_import",
      targetType: "form-import",
      targetId: String(result.importRecord._id),
      correlationId: randomUUID(),
      after: {
        slug: result.importRecord.slug,
        sourceVersion: result.importRecord.sourceVersion,
        readinessState: result.diagnostics.readinessState,
      },
      details: {
        replaced: result.replaced,
        blockerCount: result.diagnostics.parseDiagnostics.blockerCount,
        warningCount: result.diagnostics.parseDiagnostics.warningCount,
      },
    });
  } catch (error) {
    console.error("createFormImport failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
  }

  revalidateImportSurfaces();
  redirect(FORM_IMPORTS_PATH);
}

export async function updateFormImportConfig(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;

  const result = await updateImportConfig({
    id,
    spreadsheetId: s(formData, "spreadsheetId"),
    spreadsheetBindings: bindingsFromFormData(formData),
    writeResponsesToSheet: bool(formData, "writeResponsesToSheet"),
    responseSheetName: s(formData, "responseSheetName"),
    notes: s(formData, "notes"),
  });

  await setFlashToast({ tone: "success", message: "Import settings saved." });
  await writeAuditLog({
    actorEmail: email,
    action: "update_form_import_config",
    targetType: "form-import",
    targetId: id,
    correlationId: randomUUID(),
    before: result.before
      ? {
          spreadsheetId: result.before.spreadsheetId,
          writeResponsesToSheet: result.before.writeResponsesToSheet,
          responseSheetName: result.before.responseSheetName,
          notes: result.before.notes,
        }
      : null,
    after: result.after
      ? {
          spreadsheetId: result.after.spreadsheetId,
          writeResponsesToSheet: result.after.writeResponsesToSheet,
          responseSheetName: result.after.responseSheetName,
          notes: result.after.notes,
          readinessState: result.after.readinessState,
        }
      : null,
    details: {
      blockerCount: result.diagnostics.parseDiagnostics.blockerCount,
      warningCount: result.diagnostics.parseDiagnostics.warningCount,
    },
  });

  revalidateImportSurfaces();
  redirect(FORM_IMPORTS_PATH);
}

export async function publishFormImport(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;
  const dryRun = bool(formData, "dryRun");

  if (dryRun) {
    const draft = await FormImport.findById(id).lean();
    await setFlashToast({
      tone: "success",
      message: draft
        ? `Dry run: ${draft.name} would be marked implemented and published to everyone.`
        : "Dry run: draft not found.",
    });
    redirect(FORM_IMPORTS_PATH);
  }

  const result = await publishImportedForm({ id, actorEmail: email });
  await setFlashToast({
    tone: "success",
    message: `${result.importRecord.name} is now published for users.`,
  });
  await writeAuditLog({
    actorEmail: email,
    action: "publish_form_import",
    targetType: "form-import",
    targetId: String(result.importRecord._id),
    correlationId: randomUUID(),
    before: result.definitionBefore
      ? {
          status: result.definitionBefore.status,
          visibility: result.definitionBefore.visibility,
          availability: result.definitionBefore.availability,
          isImplemented: result.definitionBefore.isImplemented,
        }
      : null,
    after: result.definitionAfter
      ? {
          status: result.definitionAfter.status,
          visibility: result.definitionAfter.visibility,
          availability: result.definitionAfter.availability,
          isImplemented: result.definitionAfter.isImplemented,
        }
      : null,
    details: {
      slug: result.importRecord.slug,
      name: result.importRecord.name,
      readinessState: result.diagnostics.readinessState,
    },
  });

  revalidateImportSurfaces();
  redirect(FORM_IMPORTS_PATH);
}

export async function createMissingRegistryEntry(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;

  const result = await createImportedRegistryEntry({ id });
  await setFlashToast({ tone: "success", message: "Registry entry created from import draft." });
  await writeAuditLog({
    actorEmail: email,
    action: "create_import_registry_entry",
    targetType: "form-import",
    targetId: id,
    correlationId: randomUUID(),
    after: result.definition
      ? {
          slug: result.definition.slug,
          status: result.definition.status,
          visibility: result.definition.visibility,
          availability: result.definition.availability,
        }
      : null,
    details: {
      importSlug: result.importRecord.slug,
      importName: result.importRecord.name,
    },
  });

  revalidateImportSurfaces();
  redirect(FORM_IMPORTS_PATH);
}

export async function updateFormImportStatus(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const status = s(formData, "status") as FormImportStatus;
  if (!id || !FORM_IMPORT_STATUSES.includes(status)) return;

  const result = await updateImportStatus({ id, status });
  await setFlashToast({ tone: "success", message: `Import status saved as ${status}.` });
  await writeAuditLog({
    actorEmail: email,
    action: "update_form_import_status",
    targetType: "form-import",
    targetId: id,
    correlationId: randomUUID(),
    before: result.before ? { status: result.before.status } : null,
    after: result.after ? { status: result.after.status } : null,
  });

  revalidateImportSurfaces();
  redirect(FORM_IMPORTS_PATH);
}

export async function deleteFormImport(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;

  const result = await deleteImportedForm({ id });
  await setFlashToast({ tone: "success", message: `${result.importRecord.name} import was deleted.` });
  await writeAuditLog({
    actorEmail: email,
    action: "delete_form_import",
    targetType: "form-import",
    targetId: id,
    correlationId: randomUUID(),
    before: {
      slug: result.importRecord.slug,
      name: result.importRecord.name,
      status: result.importRecord.status,
    },
  });

  revalidateImportSurfaces();
  redirect(FORM_IMPORTS_PATH);
}

export async function syncImportedDropdowns(formData: FormData) {
  const { email } = await requireAdmin();
  const id = s(formData, "id");
  if (!id) return;
  const dryRun = bool(formData, "dryRun");

  if (dryRun) {
    const draft = await FormImport.findById(id).lean();
    await setFlashToast({
      tone: "success",
      message: draft
        ? `Dry run: ${draft.name} would sync dropdowns and people from spreadsheet.`
        : "Dry run: draft not found.",
    });
    redirect(FORM_IMPORTS_PATH);
  }

  const result = await syncImportedLookupsForImport(id);
  await setFlashToast({
    tone: "success",
    message:
      result.categoriesSynced > 0 || result.peopleSynced > 0
        ? `${result.importName}: synced ${result.valuesSynced} dropdown values and ${result.peopleSynced} people.`
        : `${result.importName}: no dropdown values or people were found to sync.`,
  });
  await writeAuditLog({
    actorEmail: email,
    action: "sync_imported_dropdowns",
    targetType: "form-import",
    targetId: id,
    correlationId: randomUUID(),
    details: {
      importName: result.importName,
      categoriesSynced: result.categoriesSynced,
      valuesSynced: result.valuesSynced,
      peopleSynced: result.peopleSynced,
    },
  });

  revalidatePath(FORM_IMPORTS_PATH);
  revalidatePath("/admin/lookups");
  revalidatePath("/admin");
  redirect(FORM_IMPORTS_PATH);
}
