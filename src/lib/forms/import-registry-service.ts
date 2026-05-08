import mongoose from "mongoose";
import { BUILTIN_FORMS } from "@/lib/form-definitions";
import { runWithOptionalTransaction } from "@/lib/db/transaction";
import { analyzeImportedSource } from "@/lib/forms/import-diagnostics";
import {
  FormDefinition,
  FORM_DEFINITION_AVAILABILITIES,
  FORM_DEFINITION_STATUSES,
  FORM_DEFINITION_VISIBILITIES,
  type FormDefinitionAvailability,
  type FormDefinitionStatus,
  type FormDefinitionVisibility,
} from "@/models/FormDefinition";
import { FormImport, FORM_IMPORT_STATUSES, type FormImportStatus } from "@/models/FormImport";
import { Lookup, normalizeLookupKey } from "@/models/Lookup";
import { NotificationFlow } from "@/models/NotificationFlow";
import { RequestModel } from "@/models/Request";

const DEFAULT_RESPONSE_SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() || process.env.GOOGLE_SHEETS_MASTER_ID?.trim() || "";

const RESERVED_NATIVE_SLUGS = new Set(BUILTIN_FORMS.map((form) => form.slug));

function sessionOptions(session: mongoose.ClientSession | null) {
  return session ? { session } : {};
}

function requestMirrorCollectionName(slug: string) {
  const normalized = String(slug || "requests")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `requests_${normalized || "general"}`;
}

function normalizeExternalFormUrl(input: string) {
  const value = String(input || "").trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("External form URL must start with http:// or https://");
    }
    return parsed.toString();
  } catch {
    throw new Error("External form URL must be a valid http:// or https:// link.");
  }
}

export function slugifyFormId(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function renameCollectionIfExists(oldName: string, nextName: string) {
  if (oldName === nextName) return;
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const hasOld = collections.some((entry) => entry.name === oldName);
  const hasNext = collections.some((entry) => entry.name === nextName);
  if (!hasOld || hasNext) return;
  await db.collection(oldName).rename(nextName);
}

async function updateMirrorCollectionSlug(collectionName: string, nextSlug: string) {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
  if (collections.length === 0) return;
  await db.collection(collectionName).updateMany({}, { $set: { formSlug: nextSlug } });
}

async function validateImportedSlugRename(currentSlug: string, nextSlug: string) {
  if (currentSlug === nextSlug) return;
  if (RESERVED_NATIVE_SLUGS.has(nextSlug)) {
    throw new Error(`The form ID "${nextSlug}" is reserved by a built-in form.`);
  }

  const existing = await FormDefinition.findOne({
    slug: nextSlug,
  })
    .select({ _id: 1 })
    .lean();
  if (existing) {
    throw new Error(`The form ID "${nextSlug}" is already in use.`);
  }

  const db = mongoose.connection.db;
  if (!db) return;
  const oldCollection = requestMirrorCollectionName(currentSlug);
  const nextCollection = requestMirrorCollectionName(nextSlug);
  if (oldCollection === nextCollection) return;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const hasOld = collections.some((entry) => entry.name === oldCollection);
  const hasNext = collections.some((entry) => entry.name === nextCollection);
  if (hasOld && hasNext) {
    throw new Error(
      `The request mirror collection for "${nextSlug}" already exists. Repair or remove it before renaming this form.`,
    );
  }
}

function buildImportedRegistrySeed(imported: {
  _id: unknown;
  slug: string;
  name: string;
  notes?: string;
  writeResponsesToSheet?: boolean;
  responseSheetName?: string;
  spreadsheetId?: string;
}) {
  return {
    slug: imported.slug,
    name: imported.name,
    routePath: `/forms/${imported.slug}`,
    source: "imported" as const,
    importSourceId: imported._id,
    notes: imported.notes || "",
    writeResponsesToSheet: Boolean(imported.writeResponsesToSheet),
    responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID || imported.spreadsheetId || "",
    responseSheetName: imported.responseSheetName || `${imported.name} Responses`,
  };
}

async function ensureImportedRegistryEntry(
  imported: {
    _id: unknown;
    slug: string;
    name: string;
    notes?: string;
    writeResponsesToSheet?: boolean;
    responseSheetName?: string;
    spreadsheetId?: string;
  },
  session: mongoose.ClientSession | null,
) {
  if (RESERVED_NATIVE_SLUGS.has(imported.slug)) {
    throw new Error(
      `The slug "${imported.slug}" is reserved by an existing built-in form. Create a new import with a different slug.`,
    );
  }

  const existing = await FormDefinition.findOne({ slug: imported.slug })
    .select({
      _id: 1,
      name: 1,
      description: 1,
      status: 1,
      visibility: 1,
      availability: 1,
      isImplemented: 1,
      showInNavbar: 1,
      sortOrder: 1,
      writeResponsesToSheet: 1,
      responseSpreadsheetId: 1,
      responseSheetName: 1,
      notes: 1,
    })
    .session(session)
    .lean();

  const seed = buildImportedRegistrySeed(imported);
  await FormDefinition.updateOne(
    { slug: imported.slug },
    existing
      ? {
          $set: {
            slug: seed.slug,
            routePath: seed.routePath,
            source: seed.source,
            importSourceId: seed.importSourceId,
          },
          $setOnInsert: {
            description: "Imported legacy form draft. Review and implement before publishing.",
            status: "draft",
            visibility: "admin",
            availability: "coming-soon",
            isImplemented: false,
            showInNavbar: false,
            sortOrder: 1000,
          },
        }
      : {
          $set: seed,
          $setOnInsert: {
            description: "Imported legacy form draft. Review and implement before publishing.",
            status: "draft",
            visibility: "admin",
            availability: "coming-soon",
            isImplemented: false,
            showInNavbar: false,
            sortOrder: 1000,
          },
        },
    {
      upsert: true,
      ...sessionOptions(session),
    },
  );
}

export async function saveImportDraft(input: {
  name: string;
  slug: string;
  spreadsheetId: string;
  spreadsheetBindings: unknown;
  writeResponsesToSheet: boolean;
  responseSheetName: string;
  htmlSource: string;
  appsScriptSource: string;
  notes: string;
  createdByEmail: string;
  createdByName: string;
  ensureRegistryEntry?: boolean;
}) {
  const diagnostics = analyzeImportedSource({
    name: input.name,
    slug: input.slug,
    htmlSource: input.htmlSource,
    appsScriptSource: input.appsScriptSource,
    spreadsheetBindings: input.spreadsheetBindings,
    writeResponsesToSheet: input.writeResponsesToSheet,
    responseSheetName: input.responseSheetName,
    spreadsheetId: input.spreadsheetId,
    defaultResponseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
  });

  return runWithOptionalTransaction(async (session) => {
    const existing = await FormImport.findOne({ slug: input.slug }).session(session).lean();
    const nextVersion =
      existing && existing.sourceChecksum && existing.sourceChecksum !== diagnostics.sourceChecksum
        ? Number(existing.sourceVersion ?? 1) + 1
        : Number(existing?.sourceVersion ?? 1);

    const created = await FormImport.findOneAndUpdate(
      { slug: input.slug },
      {
        $set: {
          name: input.name,
          slug: input.slug,
          sourceType: "google-apps-script",
          spreadsheetId: input.spreadsheetId,
          spreadsheetBindings: diagnostics.bindings,
          writeResponsesToSheet: input.writeResponsesToSheet,
          responseSheetName: input.responseSheetName,
          htmlSource: input.htmlSource,
          appsScriptSource: input.appsScriptSource,
          notes: input.notes,
          status: "draft",
          readinessState: diagnostics.readinessState,
          sourceChecksum: diagnostics.sourceChecksum,
          sourceVersion: nextVersion,
          lastParsedAt: new Date(),
          parseDiagnostics: diagnostics.parseDiagnostics,
          createdByEmail: input.createdByEmail,
          createdByName: input.createdByName,
          summary: diagnostics.summary,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        ...sessionOptions(session),
      },
    ).lean();

    if (!created) {
      throw new Error("Failed to save the import draft.");
    }

    await FormImport.deleteMany({ slug: input.slug, _id: { $ne: created._id } }, sessionOptions(session));
    if (input.ensureRegistryEntry ?? true) {
      await ensureImportedRegistryEntry(created, session);
    }

    return {
      importRecord: created,
      replaced: Boolean(existing),
      diagnostics,
    };
  });
}

export async function updateImportConfig(input: {
  id: string;
  spreadsheetId: string;
  spreadsheetBindings: unknown;
  writeResponsesToSheet: boolean;
  responseSheetName: string;
  notes: string;
}) {
  return runWithOptionalTransaction(async (session) => {
    const existing = await FormImport.findById(input.id).session(session).lean();
    if (!existing) {
      throw new Error("Import draft not found.");
    }

    const diagnostics = analyzeImportedSource({
      name: existing.name,
      slug: existing.slug,
      htmlSource: existing.htmlSource ?? "",
      appsScriptSource: existing.appsScriptSource ?? "",
      spreadsheetBindings: input.spreadsheetBindings,
      writeResponsesToSheet: input.writeResponsesToSheet,
      responseSheetName: input.responseSheetName,
      spreadsheetId: input.spreadsheetId,
      defaultResponseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
    });

    await FormImport.updateOne(
      { _id: existing._id },
      {
        $set: {
          spreadsheetId: input.spreadsheetId,
          spreadsheetBindings: diagnostics.bindings,
          writeResponsesToSheet: input.writeResponsesToSheet,
          responseSheetName: input.responseSheetName,
          notes: input.notes,
          sourceChecksum: diagnostics.sourceChecksum,
          readinessState: diagnostics.readinessState,
          lastParsedAt: new Date(),
          parseDiagnostics: diagnostics.parseDiagnostics,
          summary: diagnostics.summary,
        },
      },
      sessionOptions(session),
    );

    await FormDefinition.updateOne(
      { importSourceId: existing._id },
      {
        $set: {
          writeResponsesToSheet: input.writeResponsesToSheet,
          responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID || input.spreadsheetId,
          responseSheetName: input.responseSheetName || `${existing.name} Responses`,
          notes: input.notes,
        },
      },
      sessionOptions(session),
    );

    const updated = await FormImport.findById(existing._id).session(session).lean();
    return {
      before: existing,
      after: updated,
      diagnostics,
    };
  });
}

export async function createImportedRegistryEntry(input: { id: string }) {
  return runWithOptionalTransaction(async (session) => {
    const imported = await FormImport.findById(input.id).session(session).lean();
    if (!imported) {
      throw new Error("Import draft not found.");
    }
    await ensureImportedRegistryEntry(imported, session);
    const definition = await FormDefinition.findOne({ slug: imported.slug }).session(session).lean();
    return { importRecord: imported, definition };
  });
}

export async function publishImportedForm(input: { id: string; actorEmail?: string }) {
  return runWithOptionalTransaction(async (session) => {
    const imported = await FormImport.findById(input.id).session(session).lean();
    if (!imported) {
      throw new Error("Import draft not found.");
    }

    const diagnostics = analyzeImportedSource({
      name: imported.name,
      slug: imported.slug,
      htmlSource: imported.htmlSource ?? "",
      appsScriptSource: imported.appsScriptSource ?? "",
      spreadsheetBindings: imported.spreadsheetBindings ?? {},
      writeResponsesToSheet: Boolean(imported.writeResponsesToSheet),
      responseSheetName: imported.responseSheetName ?? "",
      spreadsheetId: imported.spreadsheetId ?? "",
      defaultResponseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
    });

    if (diagnostics.parseDiagnostics.blockers.length > 0) {
      throw new Error(`Publish blocked: ${diagnostics.parseDiagnostics.blockers.join(" ")}`);
    }

    await FormImport.updateOne(
      { _id: imported._id },
      {
        $set: {
          status: "implemented",
          sourceChecksum: diagnostics.sourceChecksum,
          readinessState: diagnostics.readinessState,
          lastParsedAt: new Date(),
          parseDiagnostics: diagnostics.parseDiagnostics,
          summary: diagnostics.summary,
          spreadsheetBindings: diagnostics.bindings,
        },
      },
      sessionOptions(session),
    );

    await ensureImportedRegistryEntry(imported, session);
    const definition = await FormDefinition.findOne({ slug: imported.slug }).session(session).lean();
    if (!definition) {
      throw new Error("Failed to create a registry entry for this import.");
    }

    await FormDefinition.updateOne(
      { _id: definition._id },
      {
        $set: {
          status: "published",
          visibility: "everyone",
          availability: "available",
          isImplemented: true,
          routePath: `/forms/${imported.slug}`,
          writeResponsesToSheet: Boolean(imported.writeResponsesToSheet),
          responseSpreadsheetId:
            String(definition.responseSpreadsheetId ?? "").trim() ||
            DEFAULT_RESPONSE_SPREADSHEET_ID ||
            imported.spreadsheetId ||
            "",
          responseSheetName:
            String(definition.responseSheetName ?? "").trim() ||
            imported.responseSheetName ||
            `${imported.name} Responses`,
          name: String(definition.name ?? "").trim() || imported.name,
          description:
            String(definition.description ?? "").trim() ||
            imported.notes?.trim() ||
            "Imported legacy form, now published for end users through the in-app runtime.",
          notes: String(definition.notes ?? "").trim() || imported.notes || "",
        },
      },
      sessionOptions(session),
    );

    const after = await FormDefinition.findById(definition._id).session(session).lean();
    return {
      importRecord: imported,
      definitionBefore: definition,
      definitionAfter: after,
      diagnostics,
    };
  });
}

export async function updateImportStatus(input: { id: string; status: FormImportStatus }) {
  if (!FORM_IMPORT_STATUSES.includes(input.status)) {
    throw new Error(`Invalid import status: ${input.status}`);
  }

  return runWithOptionalTransaction(async (session) => {
    const imported = await FormImport.findById(input.id).session(session).lean();
    if (!imported) {
      throw new Error("Import draft not found.");
    }

    await FormImport.updateOne(
      { _id: imported._id },
      { $set: { status: input.status } },
      sessionOptions(session),
    );
    await FormDefinition.updateOne(
      { importSourceId: imported._id },
      { $set: { isImplemented: input.status === "implemented" } },
      sessionOptions(session),
    );

    return {
      before: imported,
      after: await FormImport.findById(imported._id).session(session).lean(),
    };
  });
}

export async function deleteImportedForm(input: { id: string }) {
  return runWithOptionalTransaction(async (session) => {
    const imported = await FormImport.findById(input.id).session(session).lean();
    if (!imported) {
      throw new Error("Import draft not found.");
    }

    await FormImport.deleteOne({ _id: imported._id }, sessionOptions(session));
    await FormDefinition.deleteMany(
      {
        $or: [{ importSourceId: imported._id }, { source: "imported", slug: imported.slug }],
      },
      sessionOptions(session),
    );

    return { importRecord: imported };
  });
}

export async function updateFormDefinitionSettings(input: {
  id?: string;
  slug?: string;
  name: string;
  description: string;
  requestedSlug: string;
  routePath: string;
  externalFormUrl: string;
  notes: string;
  status: FormDefinitionStatus;
  visibility: FormDefinitionVisibility;
  availability: FormDefinitionAvailability;
  showInNavbar: boolean;
  isImplemented: boolean;
  writeResponsesToSheet: boolean;
  responseSpreadsheetId: string;
  responseSheetName: string;
}) {
  if (!FORM_DEFINITION_STATUSES.includes(input.status)) {
    throw new Error(`Invalid status: ${input.status}`);
  }
  if (!FORM_DEFINITION_VISIBILITIES.includes(input.visibility)) {
    throw new Error(`Invalid visibility: ${input.visibility}`);
  }
  if (!FORM_DEFINITION_AVAILABILITIES.includes(input.availability)) {
    throw new Error(`Invalid availability: ${input.availability}`);
  }

  const normalizedExternalFormUrl = normalizeExternalFormUrl(input.externalFormUrl);

  const form = input.id
    ? await FormDefinition.findById(input.id).lean()
    : await FormDefinition.findOne({ slug: input.slug }).lean();
  if (!form) {
    throw new Error("Form definition not found.");
  }

  if ((form.source === "native" || RESERVED_NATIVE_SLUGS.has(form.slug)) && input.requestedSlug !== form.slug) {
    throw new Error("Native form IDs are tied to code routes and cannot be renamed here.");
  }

  if (form.source === "imported" && input.requestedSlug !== form.slug) {
    await validateImportedSlugRename(form.slug, input.requestedSlug);
  }

  const nextRoutePath = form.source === "imported" ? `/forms/${input.requestedSlug}` : input.routePath;

  const result = await runWithOptionalTransaction(async (session) => {
    const linkedImport =
      form.source === "imported"
        ? form.importSourceId
          ? await FormImport.findById(form.importSourceId).select({ _id: 1, slug: 1 }).session(session).lean()
          : await FormImport.findOne({ slug: form.slug }).select({ _id: 1, slug: 1 }).session(session).lean()
        : null;

    if (form.source === "imported" && input.requestedSlug !== form.slug && !linkedImport) {
      throw new Error(
        "This imported form is missing its linked import record. Repair or re-import it before renaming the form ID.",
      );
    }

    const conflicting = await FormDefinition.findOne({
      slug: input.requestedSlug,
      _id: { $ne: form._id },
    })
      .select({ _id: 1 })
      .session(session)
      .lean();
    if (conflicting) {
      throw new Error(`The form ID "${input.requestedSlug}" is already in use.`);
    }

    await FormDefinition.updateOne(
      { _id: form._id },
      {
        $set: {
          slug: input.requestedSlug,
          name: input.name,
          description: input.description,
          routePath: nextRoutePath,
          externalFormUrl: normalizedExternalFormUrl,
          importSourceId: linkedImport?._id ?? form.importSourceId ?? null,
          notes: input.notes,
          status: input.status,
          visibility: input.visibility,
          availability: input.availability,
          showInNavbar: input.showInNavbar,
          isImplemented: input.isImplemented,
          writeResponsesToSheet: input.writeResponsesToSheet,
          responseSpreadsheetId: input.responseSpreadsheetId,
          responseSheetName: input.responseSheetName,
        },
      },
      sessionOptions(session),
    );

    if (form.source === "imported" && input.requestedSlug !== form.slug) {
      await Promise.all([
        FormImport.updateOne(
          { _id: linkedImport?._id },
          { $set: { slug: input.requestedSlug } },
          sessionOptions(session),
        ),
        NotificationFlow.updateOne(
          { formSlug: form.slug },
          { $set: { formSlug: input.requestedSlug } },
          sessionOptions(session),
        ),
        RequestModel.updateMany(
          { formSlug: form.slug },
          { $set: { formSlug: input.requestedSlug } },
          sessionOptions(session),
        ),
        Lookup.updateMany(
          { category: new RegExp(`^imported:${normalizeLookupKey(form.slug)}:`) },
          [
            {
              $set: {
                category: {
                  $replaceOne: {
                    input: "$category",
                    find: `imported:${normalizeLookupKey(form.slug)}:`,
                    replacement: `imported:${normalizeLookupKey(input.requestedSlug)}:`,
                  },
                },
              },
            },
          ] as any,
          sessionOptions(session),
        ),
      ]);
    }

    const after = await FormDefinition.findById(form._id).session(session).lean();
    return { before: form, after, nextRoutePath };
  });

  if (form.source === "imported" && input.requestedSlug !== form.slug) {
    await renameCollectionIfExists(
      requestMirrorCollectionName(form.slug),
      requestMirrorCollectionName(input.requestedSlug),
    );
    await updateMirrorCollectionSlug(requestMirrorCollectionName(input.requestedSlug), input.requestedSlug);
  }

  return result;
}

export async function hideFormDefinitionEntry(input: { id?: string; slug?: string }) {
  return runWithOptionalTransaction(async (session) => {
    const form = input.id
      ? await FormDefinition.findById(input.id).session(session).lean()
      : await FormDefinition.findOne({ slug: input.slug }).session(session).lean();
    if (!form) {
      throw new Error("Form definition not found.");
    }

    await FormDefinition.updateOne(
      { _id: form._id },
      {
        $set: {
          status: "draft",
          visibility: "admin",
          availability: "coming-soon",
          showInNavbar: false,
        },
      },
      sessionOptions(session),
    );

    return {
      before: form,
      after: await FormDefinition.findById(form._id).session(session).lean(),
    };
  });
}

export async function deleteFormDefinitionEntry(input: { id?: string; slug?: string }) {
  const form = input.id
    ? await FormDefinition.findById(input.id).lean()
    : await FormDefinition.findOne({ slug: input.slug }).lean();
  if (!form) {
    throw new Error("Form definition not found.");
  }

  if (form.source === "native" || RESERVED_NATIVE_SLUGS.has(form.slug)) {
    return runWithOptionalTransaction(async (session) => {
      await FormDefinition.updateOne(
        { _id: form._id },
        {
          $set: {
            isDeleted: true,
            status: "archived",
            visibility: "admin",
            availability: "coming-soon",
            showInNavbar: false,
            writeResponsesToSheet: false,
          },
        },
        sessionOptions(session),
      );

      return {
        mode: "archive-native" as const,
        before: form,
        after: await FormDefinition.findById(form._id).session(session).lean(),
      };
    });
  }

  return runWithOptionalTransaction(async (session) => {
    await FormDefinition.deleteOne({ _id: form._id }, sessionOptions(session));
    if (form.importSourceId) {
      await FormImport.updateOne(
        { _id: form.importSourceId },
        { $set: { status: "draft" } },
        sessionOptions(session),
      );
    }

    return {
      mode: "delete-imported" as const,
      before: form,
    };
  });
}
