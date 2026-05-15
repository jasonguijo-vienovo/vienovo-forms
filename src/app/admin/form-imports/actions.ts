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
  deleteFormEverywhere as deleteFormEverywhereEntry,
  deleteImportedForm,
  publishImportedForm,
  repairImportedFormLinkage,
  saveImportDraft,
  slugifyFormId,
  updateImportConfig,
  updateImportStatus,
} from "@/lib/forms/import-registry-service";
import { syncImportedLookupsForImport } from "@/lib/imported-lookups";
import { parseImportedFormHtml, parseSpreadsheetBindings } from "@/lib/imported-forms";
import { FormImport, FORM_IMPORT_STATUSES, type FormImportStatus } from "@/models/FormImport";

const FORM_IMPORTS_PATH = "/admin/form-imports";
const FORM_IMPORTS_MANAGE_PATH = "/admin/form-imports?tab=manage";

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

async function readUploadedTextFiles(formData: FormData, fileKey: string) {
  const files = formData.getAll(fileKey).filter((entry): entry is File => entry instanceof File && entry.size > 0);
  return Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })));
}

function baseFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

function normalizeFileKey(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function uniqueSlug(slug: string, used: Set<string>) {
  const base = slug || "imported-form";
  let next = base;
  let suffix = 2;
  while (used.has(next)) {
    next = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(next);
  return next;
}

function pickScriptForHtml(
  htmlFileName: string,
  gsFiles: Array<{ name: string; text: string }>,
  fallbackSource: string,
) {
  if (gsFiles.length === 0) return fallbackSource;
  if (gsFiles.length === 1) return gsFiles[0].text;

  const htmlKey = normalizeFileKey(baseFileName(htmlFileName));
  const exact = gsFiles.find((file) => normalizeFileKey(baseFileName(file.name)) === htmlKey);
  if (exact) return exact.text;

  const partial = gsFiles.find((file) => {
    const scriptKey = normalizeFileKey(baseFileName(file.name));
    return scriptKey.includes(htmlKey) || htmlKey.includes(scriptKey);
  });
  if (partial) return partial.text;

  return gsFiles.map((file) => `\n\n/* FILE: ${file.name} */\n${file.text}`).join("\n").trim();
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

function revalidateImportSurfaces(scope: "all" | "importer" = "all") {
  revalidatePath("/admin");
  revalidatePath(FORM_IMPORTS_PATH);
  revalidatePath("/admin/forms");
  revalidatePath("/admin/requests");
  revalidatePath("/approvals");
  if (scope === "importer") return;
  revalidatePath("/admin/notifications");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}

function resolveImportRedirectPath(formData: FormData, fallback: "create" | "manage" = "manage") {
  const tab = s(formData, "tab");
  if (tab === "manage") return FORM_IMPORTS_MANAGE_PATH;
  if (tab === "create") return `${FORM_IMPORTS_PATH}?tab=create`;
  return fallback === "manage" ? FORM_IMPORTS_MANAGE_PATH : `${FORM_IMPORTS_PATH}?tab=create`;
}

export async function createFormImport(formData: FormData) {
  try {
    const { email, session } = await requireAdmin();
    await connectMongo();

    const htmlFiles = await readUploadedTextFiles(formData, "htmlFiles");
    const gsFiles = await readUploadedTextFiles(formData, "gsFiles");
    const pastedAppsScriptSource = s(formData, "appsScriptSource");

    if (htmlFiles.length > 1) {
      const usedSlugs = new Set<string>();
      let savedCount = 0;
      let replacedCount = 0;
      const failures: string[] = [];

      for (const htmlFile of htmlFiles) {
        try {
          const parsed = parseImportedFormHtml(htmlFile.text);
          const derivedName =
            parsed.title && parsed.title !== "Imported Form" ? parsed.title : baseFileName(htmlFile.name);
          const slug = uniqueSlug(slugifyFormId(baseFileName(htmlFile.name)) || slugifyFormId(derivedName), usedSlugs);
          const appsScriptSource = pickScriptForHtml(htmlFile.name, gsFiles, pastedAppsScriptSource);

          if (!appsScriptSource) {
            throw new Error("No matching code.gs source was provided.");
          }

          const result = await saveImportDraft({
            name: derivedName,
            slug,
            spreadsheetId: s(formData, "spreadsheetId"),
            spreadsheetBindings: bindingsFromFormData(formData),
            writeResponsesToSheet: bool(formData, "writeResponsesToSheet"),
            responseSheetName: s(formData, "responseSheetName"),
            htmlSource: htmlFile.text,
            appsScriptSource,
            externalFormUrl: s(formData, "externalFormUrl"),
            notes: s(formData, "notes"),
            createdByEmail: email,
            createdByName: session.user.name ?? email,
            ensureRegistryEntry: false,
          });

          savedCount += 1;
          if (result.replaced) replacedCount += 1;
          void writeAuditLog({
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
              batch: true,
              fileName: htmlFile.name,
              replaced: result.replaced,
              blockerCount: result.diagnostics.parseDiagnostics.blockerCount,
              warningCount: result.diagnostics.parseDiagnostics.warningCount,
            },
          }).catch((auditError) => {
            console.error("createFormImport batch audit failed:", auditError);
          });
        } catch (error) {
          failures.push(`${htmlFile.name}: ${messageFromError(error)}`);
        }
      }

      if (savedCount === 0) {
        throw new Error(failures[0] || "No import drafts were saved.");
      }

      await setFlashToast({
        tone: failures.length > 0 ? "error" : "success",
        message:
          failures.length > 0
            ? `Saved ${savedCount} draft(s), ${failures.length} failed. First: ${failures[0]}`
            : `Saved ${savedCount} import draft(s)${replacedCount ? `, replaced ${replacedCount}` : ""}.`,
      });
    } else {
      const name = s(formData, "name");
      const htmlSource = await readMultipleTextInput(formData, "htmlFiles", "htmlFile", "htmlSource");
      const appsScriptSource = await readMultipleTextInput(formData, "gsFiles", "gsFile", "appsScriptSource");
      const parsed = htmlSource ? parseImportedFormHtml(htmlSource) : null;
      const resolvedName =
        name ||
        (parsed?.title && parsed.title !== "Imported Form" ? parsed.title : "") ||
        (htmlFiles[0]?.name ? baseFileName(htmlFiles[0].name) : "");
      if (!resolvedName) throw new Error("Form name is required.");
      const requestedSlug = slugifyFormId(s(formData, "slug")) || slugifyFormId(resolvedName);

      if (!htmlSource) {
        throw new Error("Provide the form index.html source or upload the file.");
      }
      if (!appsScriptSource) {
        throw new Error("Provide the code.gs source or upload the file.");
      }

      const result = await saveImportDraft({
        name: resolvedName,
        slug: requestedSlug,
        spreadsheetId: s(formData, "spreadsheetId"),
        spreadsheetBindings: bindingsFromFormData(formData),
        writeResponsesToSheet: bool(formData, "writeResponsesToSheet"),
        responseSheetName: s(formData, "responseSheetName"),
        htmlSource,
        appsScriptSource,
        externalFormUrl: s(formData, "externalFormUrl"),
        notes: s(formData, "notes"),
        createdByEmail: email,
        createdByName: session.user.name ?? email,
        ensureRegistryEntry: false,
      });

      await setFlashToast({
        tone: "success",
        message: result.replaced ? `Import draft replaced for ${resolvedName}.` : `Import draft saved for ${resolvedName}.`,
      });
      void writeAuditLog({
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
      }).catch((auditError) => {
        console.error("createFormImport audit failed:", auditError);
      });
    }
  } catch (error) {
    console.error("createFormImport failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
  }

  revalidateImportSurfaces("importer");
  redirect(resolveImportRedirectPath(formData, "create"));
}

export async function updateFormImportConfig(formData: FormData) {
  const id = s(formData, "id");
  const inline = bool(formData, "inline");
  try {
    const { email } = await requireAdmin();
    await connectMongo();

    if (!id) throw new Error("Import draft is missing its identity.");

    const result = await updateImportConfig({
      id,
      spreadsheetId: s(formData, "spreadsheetId"),
      spreadsheetBindings: bindingsFromFormData(formData),
      writeResponsesToSheet: bool(formData, "writeResponsesToSheet"),
      responseSheetName: s(formData, "responseSheetName"),
      externalFormUrl: s(formData, "externalFormUrl"),
      notes: s(formData, "notes"),
    });

    await setFlashToast({
      tone: result.diagnostics.parseDiagnostics.blockerCount > 0 ? "error" : "success",
      message:
        result.diagnostics.parseDiagnostics.blockerCount > 0
          ? `Settings saved, but publish is blocked by ${result.diagnostics.parseDiagnostics.blockerCount} issue(s).`
          : "Import settings saved.",
    });
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
  } catch (error) {
    console.error("updateFormImportConfig failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
    if (inline) return;
  }

  if (inline) return;
  redirect(resolveImportRedirectPath(formData, "manage"));
}

export async function publishFormImport(formData: FormData) {
  const id = s(formData, "id");
  const dryRun = bool(formData, "dryRun");
  const inline = bool(formData, "inline");
  try {
    const { email } = await requireAdmin();
    await connectMongo();

    if (!id) throw new Error("Import draft is missing its identity.");

    if (dryRun) {
      const draft = await FormImport.findById(id).lean();
      if (!draft) throw new Error("Import draft not found.");
      const blockerCount = draft.parseDiagnostics?.blockerCount ?? draft.parseDiagnostics?.blockers?.length ?? 0;
      const warningCount = draft.parseDiagnostics?.warningCount ?? draft.parseDiagnostics?.warnings?.length ?? 0;
      await setFlashToast({
        tone: blockerCount > 0 ? "error" : warningCount > 0 ? "success" : "success",
        message:
          blockerCount > 0
            ? `Preflight blocked: ${blockerCount} issue(s) must be fixed before publishing.`
            : warningCount > 0
              ? `Preflight passed with ${warningCount} warning(s). Review before publishing.`
              : `Preflight passed: ${draft.name} is ready to publish.`,
      });
      revalidatePath(FORM_IMPORTS_PATH);
      revalidatePath(FORM_IMPORTS_MANAGE_PATH);
    } else {
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
    }
  } catch (error) {
    console.error("publishFormImport failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
    if (inline) return;
  }

  if (inline) return;
  redirect(resolveImportRedirectPath(formData, "manage"));
}

export async function createMissingRegistryEntry(formData: FormData) {
  const inline = bool(formData, "inline");
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
  if (inline) return;
  redirect(resolveImportRedirectPath(formData, "manage"));
}

export async function updateFormImportStatus(formData: FormData) {
  const inline = bool(formData, "inline");
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
  if (inline) return;
  redirect(resolveImportRedirectPath(formData, "manage"));
}

export async function deleteFormImport(formData: FormData) {
  const id = s(formData, "id");
  const inline = bool(formData, "inline");
  try {
    const { email } = await requireAdmin();
    await connectMongo();

    if (!id) throw new Error("Import draft is missing its identity.");

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
  } catch (error) {
    console.error("deleteFormImport failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
    if (inline) return;
  }

  if (inline) return;
  redirect(resolveImportRedirectPath(formData, "manage"));
}

export async function repairFormImport(formData: FormData) {
  const inline = bool(formData, "inline");
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;

  try {
    const result = await repairImportedFormLinkage({ id });
    await setFlashToast({
      tone: result.diagnostics.parseDiagnostics.blockerCount > 0 ? "error" : "success",
      message:
        result.diagnostics.parseDiagnostics.blockerCount > 0
          ? `Repair finished for ${result.importRecord?.name || "import draft"}, but ${result.diagnostics.parseDiagnostics.blockerCount} blocker(s) still need manual fixes.`
          : `Repair finished for ${result.importRecord?.name || "import draft"}. Registry and runtime links were re-aligned.`,
    });
    await writeAuditLog({
      actorEmail: email,
      action: "repair_form_import",
      targetType: "form-import",
      targetId: id,
      correlationId: randomUUID(),
      before: result.definitionBefore
        ? {
            slug: result.definitionBefore.slug,
            routePath: result.definitionBefore.routePath,
            importSourceId: result.definitionBefore.importSourceId
              ? String(result.definitionBefore.importSourceId)
              : "",
          }
        : null,
      after: result.definitionAfter
        ? {
            slug: result.definitionAfter.slug,
            routePath: result.definitionAfter.routePath,
            importSourceId: result.definitionAfter.importSourceId
              ? String(result.definitionAfter.importSourceId)
              : "",
          }
        : null,
      details: {
        repaired: result.repaired,
        blockerCount: result.diagnostics.parseDiagnostics.blockerCount,
        warningCount: result.diagnostics.parseDiagnostics.warningCount,
      },
    });
  } catch (error) {
    console.error("repairFormImport failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
  }

  revalidateImportSurfaces();
  if (inline) return;
  redirect(resolveImportRedirectPath(formData, "manage"));
}

export async function deleteFormEverywhere(formData: FormData) {
  const id = s(formData, "id");
  const slug = s(formData, "slug");
  const inline = bool(formData, "inline");
  try {
    const { email } = await requireAdmin();
    await connectMongo();

    if (!id && !slug) throw new Error("Import draft is missing its identity.");

    const result = await deleteFormEverywhereEntry({ importId: id, slug });
    await setFlashToast({
      tone: "success",
      message: `${result.targetName} was deleted globally. Removed ${result.deletedRequestCount} requests, ${result.deletedLookupCount} lookups, and ${result.deletedRegistryCount + result.archivedRegistryCount} registry records.`,
    });
    await writeAuditLog({
      actorEmail: email,
      action: "delete_form_everywhere",
      targetType: "form-import",
      targetId: id || result.targetSlug,
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

    revalidateImportSurfaces();
  } catch (error) {
    console.error("deleteFormEverywhere (importer) failed:", error);
    await setFlashToast({ tone: "error", message: messageFromError(error) });
    if (inline) return;
  }

  if (inline) return;
  redirect(resolveImportRedirectPath(formData, "manage"));
}

export async function syncImportedDropdowns(formData: FormData) {
  const inline = bool(formData, "inline");
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
    if (inline) return;
    redirect(resolveImportRedirectPath(formData, "manage"));
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
  revalidatePath(FORM_IMPORTS_MANAGE_PATH);
  revalidatePath("/admin/lookups");
  revalidatePath("/admin");
  if (inline) return;
  redirect(resolveImportRedirectPath(formData, "manage"));
}
