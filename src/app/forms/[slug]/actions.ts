"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import {
  appendSpreadsheetRow,
  ensureSpreadsheetSheet,
  readSpreadsheetMatrix,
} from "@/lib/google/sheets";
import { parseImportedFormHtml, type ImportedFieldDefinition } from "@/lib/imported-forms";
import { generateReferenceNo } from "@/lib/reference-number";
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

function isFieldMissing(field: ImportedFieldDefinition, value: unknown) {
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
  await ensureSpreadsheetSheet(opts.spreadsheetId, opts.sheetTitle);
  const existing = await readSpreadsheetMatrix(opts.spreadsheetId, `${opts.sheetTitle}!A1:ZZ2`);
  const baseHeaders = [
    "Timestamp",
    "Reference No",
    "Form Slug",
    "Form Name",
    "Submitted By Email",
    "Submitted By Name",
    "Status",
  ];
  const fieldEntries = Object.entries(opts.labels);
  const headers = [...baseHeaders, ...fieldEntries.map(([, label]) => label)];

  if ((existing[0] ?? []).length === 0) {
    await appendSpreadsheetRow({
      spreadsheetId: opts.spreadsheetId,
      sheetTitle: opts.sheetTitle,
      values: headers,
    });
  }

  const row = [
    new Date().toISOString(),
    opts.referenceNo,
    opts.slug,
    opts.importedName,
    opts.submittedByEmail,
    opts.submittedByName,
    "submitted",
    ...fieldEntries.map(([name]) => stringifyValue(opts.values[name])),
  ];

  await appendSpreadsheetRow({
    spreadsheetId: opts.spreadsheetId,
    sheetTitle: opts.sheetTitle,
    values: row,
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

    const isAdmin = isAdminEmail(email);
    if (definition.visibility === "admin" && !isAdmin) {
      throw new Error("This form is not available to you.");
    }
    if (definition.status !== "published" && !isAdmin) {
      throw new Error("This form is not published yet.");
    }
    if ((definition.availability !== "available" || !definition.isImplemented) && !isAdmin) {
      throw new Error("This form is not available yet.");
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
      if (isFieldMissing(field, value)) missing.push(field.label);
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

    await RequestModel.create({
      formType: "imported",
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
      history: [
        {
          at: new Date(),
          byEmail: email,
          byName: name,
          action: "submitted",
          details: { importedSlug: slug },
        },
      ],
    });

    if ((imported as any).writeResponsesToSheet && imported.spreadsheetId) {
      try {
        await writeImportedSubmissionToSheet({
          spreadsheetId: imported.spreadsheetId,
          sheetTitle: (imported as any).responseSheetName?.trim() || `${imported.name} Responses`,
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
