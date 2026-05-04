"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { FormImport, FORM_IMPORT_STATUSES, type FormImportStatus } from "@/models/FormImport";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function readTextInput(formData: FormData, fileKey: string, textKey: string) {
  const file = formData.get(fileKey);
  if (file instanceof File && file.size > 0) {
    return await file.text();
  }
  return s(formData, textKey);
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function summarize(htmlSource: string, appsScriptSource: string) {
  const html = htmlSource || "";
  const gs = appsScriptSource || "";
  const matchCount = (source: string, regex: RegExp) => source.match(regex)?.length ?? 0;

  return {
    inputCount: matchCount(html, /<input\b/gi),
    selectCount: matchCount(html, /<select\b/gi),
    textareaCount: matchCount(html, /<textarea\b/gi),
    scriptFunctionCount: matchCount(gs, /\bfunction\s+[A-Za-z0-9_]+\s*\(/g),
  };
}

export async function createFormImport(formData: FormData) {
  const { email, session } = await requireAdmin();
  await connectMongo();

  const name = s(formData, "name");
  if (!name) throw new Error("Form name is required.");

  const htmlSource = await readTextInput(formData, "htmlFile", "htmlSource");
  const appsScriptSource = await readTextInput(formData, "gsFile", "appsScriptSource");

  if (!htmlSource) {
    throw new Error("Provide the form index.html source or upload the file.");
  }
  if (!appsScriptSource) {
    throw new Error("Provide the code.gs source or upload the file.");
  }

  await FormImport.create({
    name,
    slug: slugify(s(formData, "slug")) || slugify(name),
    sourceType: "google-apps-script",
    spreadsheetId: s(formData, "spreadsheetId"),
    htmlSource,
    appsScriptSource,
    notes: s(formData, "notes"),
    status: "draft",
    createdByEmail: email,
    createdByName: session.user.name ?? email,
    summary: summarize(htmlSource, appsScriptSource),
  });

  revalidatePath("/admin/form-imports");
}

export async function updateFormImportStatus(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const status = s(formData, "status") as FormImportStatus;
  if (!id || !FORM_IMPORT_STATUSES.includes(status)) return;

  await FormImport.updateOne({ _id: id }, { $set: { status } });
  revalidatePath("/admin/form-imports");
}
