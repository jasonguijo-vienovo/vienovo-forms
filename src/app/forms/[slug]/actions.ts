"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
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

function isFieldMissing(field: ImportedFieldDefinition, value: unknown) {
  if (!field.required) return false;
  if (Array.isArray(value)) return value.length === 0;
  if (field.type === "checkbox") return value !== "Yes";
  return !String(value ?? "").trim();
}

export async function submitImportedForm(slug: string, formData: FormData) {
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

  for (const field of runtime.fields) {
    const value = collectFieldValue(field, formData);
    values[field.name] = value;
    labels[field.name] = field.label;
    if (isFieldMissing(field, value)) missing.push(field.label);
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

  redirect(`/requests/${referenceNo}`);
}
