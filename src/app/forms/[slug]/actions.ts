"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { getFormUserAccess } from "@/lib/forms/runtime-state";
import { parseImportedFormHtml, type ImportedFieldDefinition } from "@/lib/imported-forms";
import { deriveRequestQueueFields } from "@/lib/request-queue";
import { generateReferenceNo } from "@/lib/reference-number";
import { syncRequestMirror } from "@/lib/request-mirror";
import { appendResponseSheetRow, buildResponseSheetRows } from "@/lib/response-sheet";
import { RequestModel } from "@/models/Request";
import { FormImport } from "@/models/FormImport";

function collectFieldValue(field: ImportedFieldDefinition, formData: FormData) {
  if (field.type === "checkbox") {
    return formData.get(field.name) ? "Yes" : "No";
  }

  if (field.type === "checkbox-group") {
    return formData
      .getAll(field.name)
      .map((value) => String(value).trim())
      .filter(Boolean);
  }

  return String(formData.get(field.name) ?? "").trim();
}

function humanize(input: string) {
  return input
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizePayloadValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (value == null) return "";
  return String(value).trim();
}

function parseFramePayload(formData: FormData) {
  const raw = String(formData.get("__payload") ?? "").trim();
  if (!raw) return null;

  const parsed = JSON.parse(raw) as {
    values?: Record<string, unknown>;
    labels?: Record<string, unknown>;
  };
  const values = Object.fromEntries(
    Object.entries(parsed.values ?? {})
      .map(([key, value]) => [key.trim(), normalizePayloadValue(value)])
      .filter(([key]) => key)
  );
  const labels = Object.fromEntries(
    Object.entries(parsed.labels ?? {})
      .map(([key, value]) => [key.trim(), String(value ?? "").replace(/\s+/g, " ").trim()])
      .filter(([key, value]) => key && value)
  );

  return { values, labels };
}

function isMiddleNameField(field: ImportedFieldDefinition) {
  const key = `${field.name} ${field.label}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return key.includes("middlename");
}

function isFieldMissing(slug: string, field: ImportedFieldDefinition, value: unknown) {
  if (slug === "employee-information" && isMiddleNameField(field)) return false;
  if (!field.required) return false;
  if (Array.isArray(value)) return value.length === 0;
  if (field.type === "checkbox") return value !== "Yes";
  return !String(value ?? "").trim();
}

function stringifyValue(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  return String(value ?? "");
}

async function writeImportedSubmissionToSheet(opts: {
  spreadsheetId: string;
  sheetTitle: string;
  referenceNo: string;
  slug: string;
  importedName: string;
  submittedByEmail: string;
  submittedByName: string;
  labels: Record<string, string>;
  values: Record<string, unknown>;
}) {
  await appendResponseSheetRow({
    spreadsheetId: opts.spreadsheetId,
    sheetTitle: opts.sheetTitle,
    rowValues: buildResponseSheetRows({
      referenceNo: opts.referenceNo,
      formSlug: opts.slug,
      formName: opts.importedName,
      submittedByEmail: opts.submittedByEmail,
      submittedByName: opts.submittedByName,
      labels: opts.labels,
      values: opts.values,
    }),
  });
}

export async function submitImportedForm(slug: string, formData: FormData) {
  try {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase();
    const name = session?.user?.name ?? email ?? "";
    if (!email) throw new Error("Not signed in");

    await connectMongo();

    const definition = await getFormDefinitionBySlug(slug);
    if (!definition || definition.source !== "imported") {
      throw new Error("Imported form not found.");
    }

    const isAdmin = await isAdminUser(email);
    const access = getFormUserAccess(definition, { isAdmin });
    if (!access.canSubmit) {
      throw new Error(access.blockerMessage || "This form is not available right now.");
    }

    const imported = await FormImport.findOne({ slug }).lean();
    if (!imported) throw new Error("Import source not found.");

    const runtime = parseImportedFormHtml(imported.htmlSource ?? "");
    if (runtime.fields.length === 0) {
      throw new Error("This imported form does not contain any supported fields yet.");
    }

    const values: Record<string, unknown> = {};
    const labels: Record<string, string> = {};
    const missing: string[] = [];
    const framePayload = parseFramePayload(formData);

    for (const field of runtime.fields) {
      const value = framePayload
        ? normalizePayloadValue(framePayload.values[field.name])
        : collectFieldValue(field, formData);
      values[field.name] = value;
      labels[field.name] = framePayload?.labels[field.name] || field.label;
      if (isFieldMissing(slug, field, value)) missing.push(field.label);
    }

    if (framePayload) {
      for (const [name, value] of Object.entries(framePayload.values)) {
        if (name in values) continue;
        values[name] = value;
        labels[name] = framePayload.labels[name] || humanize(name);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }

    const referenceNo = await generateReferenceNo("imported");

    const history = [
      {
        at: new Date(),
        byEmail: email,
        byName: name,
        action: "submitted",
        details: { importedSlug: slug },
      },
    ];
    const queueFields = deriveRequestQueueFields({
      status: "submitted",
      approvalChain: [],
      currentStep: 0,
      history,
      submittedBy: { email, name },
    });

    const createdRequest = await RequestModel.create({
      formType: "imported",
      formSlug: slug,
      formName: imported.name,
      referenceNo,
      submittedBy: { email, name },
      formData: {
        importedSlug: slug,
        importedFormName: imported.name,
        spreadsheetId: imported.spreadsheetId ?? "",
        fieldLabels: labels,
        values,
      },
      approvalChain: [],
      currentStep: 0,
      status: "submitted",
      history,
      ...queueFields,
    });

    await syncRequestMirror({
      requestId: String(createdRequest._id),
      referenceNo,
      formSlug: slug,
      formName: imported.name,
      submittedBy: { email, name },
      formData: {
        importedSlug: slug,
        importedFormName: imported.name,
        spreadsheetId: imported.spreadsheetId ?? "",
        fieldLabels: labels,
        values,
      },
      approvalChain: [],
      currentStep: 0,
      status: "submitted",
      history: createdRequest.history,
      createdAt: createdRequest.createdAt,
      updatedAt: createdRequest.updatedAt,
    });

    const responseSpreadsheetId =
      definition.responseSpreadsheetId?.trim() ||
      imported.spreadsheetId?.trim() ||
      process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() ||
      process.env.GOOGLE_SHEETS_MASTER_ID?.trim() ||
      "";
    const responseSheetName =
      definition.responseSheetName?.trim() ||
      (imported as any).responseSheetName?.trim() ||
      `${imported.name} Responses`;
    const shouldWriteResponses =
      definition.writeResponsesToSheet || Boolean((imported as any).writeResponsesToSheet);

    if (shouldWriteResponses && responseSpreadsheetId) {
      try {
        await writeImportedSubmissionToSheet({
          spreadsheetId: responseSpreadsheetId,
          sheetTitle: responseSheetName,
          referenceNo,
          slug,
          importedName: imported.name,
          submittedByEmail: email,
          submittedByName: name,
          labels,
          values,
        });
      } catch (error) {
        console.error("Imported form response export failed:", error);
      }
    }

    await setFlashToast({
      tone: "success",
      message: `${imported.name} submitted: ${referenceNo}`,
    });
    redirect(`/requests/${referenceNo}`);
  } catch (error) {
    console.error(`submitImportedForm failed for ${slug}:`, error);
    await setFlashToast({
      tone: "error",
      message:
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "The imported form could not be submitted.",
    });
    redirect(`/forms/${slug}`);
  }
}
