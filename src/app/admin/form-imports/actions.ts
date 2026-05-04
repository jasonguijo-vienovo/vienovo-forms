"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { BUILTIN_FORMS } from "@/lib/form-definitions";
import { parseSpreadsheetBindings } from "@/lib/imported-forms";
import { FormImport, FORM_IMPORT_STATUSES, type FormImportStatus } from "@/models/FormImport";
import { FormDefinition } from "@/models/FormDefinition";

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

function bindingsFromFormData(formData: FormData) {
  const raw = s(formData, "spreadsheetBindings");
  if (!raw) return {};

  try {
    return parseSpreadsheetBindings(raw);
  } catch {
    throw new Error("Spreadsheet bindings must be valid JSON.");
  }
}

const RESERVED_NATIVE_SLUGS = new Set(BUILTIN_FORMS.map((form) => form.slug));

async function ensureImportedRegistryEntry(imported: {
  _id: unknown;
  slug: string;
  name: string;
  notes?: string;
}) {
  await FormDefinition.updateOne(
    { slug: imported.slug },
    {
      $set: {
        slug: imported.slug,
        name: imported.name,
        routePath: `/forms/${imported.slug}`,
        source: "imported",
        importSourceId: imported._id,
        notes: imported.notes || "",
      },
      $setOnInsert: {
        description: "Imported legacy form draft. Review and implement before publishing.",
        status: "draft",
        visibility: "admin",
        availability: "coming-soon",
        isImplemented: true,
        showInNavbar: false,
        sortOrder: 1000,
      },
    },
    { upsert: true }
  );
}

export async function createFormImport(formData: FormData) {
  const { email, session } = await requireAdmin();
  await connectMongo();

  const name = s(formData, "name");
  if (!name) throw new Error("Form name is required.");
  const requestedSlug = slugify(s(formData, "slug")) || slugify(name);
  if (RESERVED_NATIVE_SLUGS.has(requestedSlug)) {
    throw new Error(
      `The slug "${requestedSlug}" is reserved by an existing built-in form. Use a different slug.`
    );
  }

  const htmlSource = await readTextInput(formData, "htmlFile", "htmlSource");
  const appsScriptSource = await readTextInput(formData, "gsFile", "appsScriptSource");

  if (!htmlSource) {
    throw new Error("Provide the form index.html source or upload the file.");
  }
  if (!appsScriptSource) {
    throw new Error("Provide the code.gs source or upload the file.");
  }

  const created = await FormImport.create({
    name,
    slug: requestedSlug,
    sourceType: "google-apps-script",
    spreadsheetId: s(formData, "spreadsheetId"),
    spreadsheetBindings: bindingsFromFormData(formData),
    writeResponsesToSheet: bool(formData, "writeResponsesToSheet"),
    responseSheetName: s(formData, "responseSheetName"),
    htmlSource,
    appsScriptSource,
    notes: s(formData, "notes"),
    status: "draft",
    createdByEmail: email,
    createdByName: session.user.name ?? email,
    summary: summarize(htmlSource, appsScriptSource),
  });

  await ensureImportedRegistryEntry(created);

  revalidatePath("/admin/form-imports");
  revalidatePath("/admin/forms");
}

export async function updateFormImportConfig(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;

  await FormImport.updateOne(
    { _id: id },
    {
      $set: {
        spreadsheetId: s(formData, "spreadsheetId"),
        spreadsheetBindings: bindingsFromFormData(formData),
        writeResponsesToSheet: bool(formData, "writeResponsesToSheet"),
        responseSheetName: s(formData, "responseSheetName"),
        notes: s(formData, "notes"),
      },
    }
  );

  revalidatePath("/admin/form-imports");
}

export async function publishFormImport(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;

  const imported = await FormImport.findByIdAndUpdate(
    id,
    { $set: { status: "implemented" } },
    { new: true }
  ).lean();
  if (!imported) return;

  await ensureImportedRegistryEntry(imported);

  await FormDefinition.updateOne(
    { slug: imported.slug },
    {
      $set: {
        name: imported.name,
        description:
          imported.notes?.trim() ||
          "Imported legacy form, now published for end users through the in-app runtime.",
        status: "published",
        visibility: "everyone",
        availability: "available",
        isImplemented: true,
      },
    }
  );

  revalidatePath("/admin/form-imports");
  revalidatePath("/admin/forms");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}

export async function createMissingRegistryEntry(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;

  const imported = await FormImport.findById(id).lean();
  if (!imported) return;

  await ensureImportedRegistryEntry(imported);

  revalidatePath("/admin/form-imports");
  revalidatePath("/admin/forms");
}

export async function updateFormImportStatus(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const status = s(formData, "status") as FormImportStatus;
  if (!id || !FORM_IMPORT_STATUSES.includes(status)) return;

  await FormImport.updateOne({ _id: id }, { $set: { status } });
  if (status === "implemented") {
    await FormDefinition.updateOne({ importSourceId: id }, { $set: { isImplemented: true } });
  }
  revalidatePath("/admin/form-imports");
  revalidatePath("/admin/forms");
}
