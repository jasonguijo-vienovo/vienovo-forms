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
  writeSpreadsheetRow,
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

function normalizeHeaderKey(value: string) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function candidateKeys(...values: string[]) {
  const keys = new Set<string>();
  for (const value of values) {
    const key = normalizeHeaderKey(value);
    if (!key) continue;
    keys.add(key);
    if (key.startsWith("nameof")) keys.add(key.slice("nameof".length));
    if (key === "amounttotal") keys.add("totalamount");
    if (key === "totalamount") keys.add("amounttotal");
    if (key.startsWith("requestor")) keys.add(key.replace(/^requestor/, "submittedby"));
    if (key.startsWith("requester")) keys.add(key.replace(/^requester/, "submittedby"));
  }
  return [...keys].filter(Boolean);
}

function headerMatchScore(headerKey: string, candidates: string[]) {
  let best = 0;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (headerKey === candidate) return 3;
    if (candidate.length >= 5 && (headerKey.includes(candidate) || candidate.includes(headerKey))) {
      best = Math.max(best, 2);
    }
  }
  return best;
}

function findBestHeaderIndex(
  headers: string[],
  candidates: string[],
  usedIndexes: Set<number>
) {
  let bestIndex = -1;
  let bestScore = 0;
  for (let index = 0; index < headers.length; index += 1) {
    if (usedIndexes.has(index)) continue;
    const score = headerMatchScore(normalizeHeaderKey(headers[index]), candidates);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
      if (score === 3) break;
    }
  }
  return bestIndex;
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
  const timestamp = new Date();
  const timestampText = timestamp.toLocaleString("en-US", { hour12: false });
  const defaultBaseHeaders = [
    "Request ID",
    "Timestamp",
    "Requestor Name",
    "Requestor Email",
    "Status",
    "Last Updated",
    "Form Slug",
    "Form Name",
  ];
  const fieldEntries = Object.entries(opts.labels).map(([name, label]) => ({
    header: label || humanize(name),
    value: stringifyValue(opts.values[name]),
    candidates: candidateKeys(label || humanize(name), name, humanize(name)),
  }));

  let headers = (existing[0] ?? []).map((value) => String(value ?? "").trim());
  if (headers.length === 0) {
    headers = [...defaultBaseHeaders, ...fieldEntries.map((entry) => entry.header)];
    await writeSpreadsheetRow({
      spreadsheetId: opts.spreadsheetId,
      range: `${opts.sheetTitle}!A1`,
      values: headers,
    });
  }

  const row = new Array(headers.length).fill("");
  const usedIndexes = new Set<number>();

  const baseEntries = [
    {
      candidates: candidateKeys("Request ID", "Reference No", "Reference Number", "Request No"),
      value: opts.referenceNo,
    },
    {
      candidates: candidateKeys("Timestamp", "Created At", "Submitted At"),
      value: timestampText,
    },
    {
      candidates: candidateKeys("Requestor Name", "Requester Name", "Submitted By Name"),
      value: opts.submittedByName,
    },
    {
      candidates: candidateKeys("Requestor Email", "Requester Email", "Submitted By Email"),
      value: opts.submittedByEmail,
    },
    {
      candidates: candidateKeys("Status", "Request Status"),
      value: "submitted",
    },
    {
      candidates: candidateKeys("Last Updated", "Updated At", "Modified At"),
      value: timestampText,
    },
    {
      candidates: candidateKeys("Form Slug", "Slug"),
      value: opts.slug,
    },
    {
      candidates: candidateKeys("Form Name", "Imported Form Name"),
      value: opts.importedName,
    },
  ];

  for (const entry of baseEntries) {
    const index = findBestHeaderIndex(headers, entry.candidates, usedIndexes);
    if (index >= 0) {
      row[index] = entry.value;
      usedIndexes.add(index);
    }
  }

  const unmatchedFields: typeof fieldEntries = [];
  for (const entry of fieldEntries) {
    const index = findBestHeaderIndex(headers, entry.candidates, usedIndexes);
    if (index >= 0) {
      row[index] = entry.value;
      usedIndexes.add(index);
    } else {
      unmatchedFields.push(entry);
    }
  }

  if (unmatchedFields.length > 0) {
    headers = [...headers, ...unmatchedFields.map((entry) => entry.header)];
    for (const entry of unmatchedFields) {
      row.push(entry.value);
    }
    await writeSpreadsheetRow({
      spreadsheetId: opts.spreadsheetId,
      range: `${opts.sheetTitle}!A1`,
      values: headers,
    });
  }

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
