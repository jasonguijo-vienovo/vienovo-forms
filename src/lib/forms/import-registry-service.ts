import mongoose from "mongoose";
import { BUILTIN_FORMS } from "@/lib/form-definitions";
import { runWithOptionalTransaction } from "@/lib/db/transaction";
import { analyzeImportedSource } from "@/lib/forms/import-diagnostics";
import { normalizeTriggerUrl } from "@/lib/forms/triggers";
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
import { FormImportVersion, type FormImportVersionEvent } from "@/models/FormImportVersion";
import { Lookup, normalizeLookupKey } from "@/models/Lookup";
import { NotificationFlow } from "@/models/NotificationFlow";
import { NotificationDeliveryLog } from "@/models/NotificationDeliveryLog";
import { RequestModel } from "@/models/Request";
import { Approver } from "@/models/Approver";

const DEFAULT_RESPONSE_SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() || process.env.GOOGLE_SHEETS_MASTER_ID?.trim() || "";

const RESERVED_NATIVE_SLUGS = new Set(BUILTIN_FORMS.map((form) => form.slug));

function sessionOptions(session: mongoose.ClientSession | null) {
  return session ? { session } : {};
}

export function requestMirrorCollectionName(slug: string) {
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

function normalizeSpreadsheetIdInput(input: string) {
  const value = String(input || "").trim();
  if (!value) return "";

  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];

  return value;
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

async function dropMirrorCollectionIfExists(slug: string) {
  const db = mongoose.connection.db;
  if (!db) return false;
  const collectionName = requestMirrorCollectionName(slug);
  const collections = await db.listCollections({ name: collectionName }, { nameOnly: true }).toArray();
  if (collections.length === 0) return false;
  await db.collection(collectionName).drop();
  return true;
}

async function recordImportVersionSnapshot(
  imported: any,
  event: FormImportVersionEvent,
  actorEmail = "",
  session: mongoose.ClientSession | null = null,
) {
  if (!imported?._id) return;

  await FormImportVersion.create(
    [
      {
        importId: imported._id,
        slug: imported.slug,
        name: imported.name,
        sourceVersion: Number(imported.sourceVersion ?? 1),
        event,
        sourceChecksum: imported.sourceChecksum ?? "",
        readinessState: imported.readinessState ?? "",
        parseDiagnostics: imported.parseDiagnostics ?? {},
        summary: imported.summary ?? {},
        htmlSource: imported.htmlSource ?? "",
        appsScriptSource: imported.appsScriptSource ?? "",
        spreadsheetBindings: imported.spreadsheetBindings ?? {},
        externalFormUrl: imported.externalFormUrl ?? "",
        createdByEmail: actorEmail || imported.createdByEmail || "",
      },
    ],
    sessionOptions(session),
  );
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
  externalFormUrl?: string;
  notes?: string;
  writeResponsesToSheet?: boolean;
  responseSheetName?: string;
  spreadsheetId?: string;
}) {
  return {
    slug: imported.slug,
    name: imported.name,
    routePath: `/forms/${imported.slug}`,
    externalFormUrl: normalizeExternalFormUrl(imported.externalFormUrl || ""),
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
    externalFormUrl?: string;
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
            externalFormUrl: seed.externalFormUrl,
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
  externalFormUrl: string;
  notes: string;
  createdByEmail: string;
  createdByName: string;
  ensureRegistryEntry?: boolean;
}) {
  const normalizedSpreadsheetId = normalizeSpreadsheetIdInput(input.spreadsheetId);
  const normalizedExternalFormUrl = normalizeExternalFormUrl(input.externalFormUrl);
  const diagnostics = analyzeImportedSource({
    name: input.name,
    slug: input.slug,
    htmlSource: input.htmlSource,
    appsScriptSource: input.appsScriptSource,
    externalFormUrl: normalizedExternalFormUrl,
    spreadsheetBindings: input.spreadsheetBindings,
    writeResponsesToSheet: input.writeResponsesToSheet,
    responseSheetName: input.responseSheetName,
    spreadsheetId: normalizedSpreadsheetId,
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
          sourceType: normalizedExternalFormUrl && !input.htmlSource.trim() && !input.appsScriptSource.trim() ? "external-link" : "google-apps-script",
          externalFormUrl: normalizedExternalFormUrl,
          spreadsheetId: normalizedSpreadsheetId,
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
    await recordImportVersionSnapshot(created, "draft-saved", input.createdByEmail, session);

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
  externalFormUrl: string;
  notes: string;
}) {
  return runWithOptionalTransaction(async (session) => {
    const existing = await FormImport.findById(input.id).session(session).lean();
    if (!existing) {
      throw new Error("Import draft not found.");
    }

    const normalizedSpreadsheetId = normalizeSpreadsheetIdInput(input.spreadsheetId);
    const normalizedExternalFormUrl = normalizeExternalFormUrl(input.externalFormUrl);
    const diagnostics = analyzeImportedSource({
      name: existing.name,
      slug: existing.slug,
      htmlSource: existing.htmlSource ?? "",
      appsScriptSource: existing.appsScriptSource ?? "",
      externalFormUrl: normalizedExternalFormUrl,
      spreadsheetBindings: input.spreadsheetBindings,
      writeResponsesToSheet: input.writeResponsesToSheet,
      responseSheetName: input.responseSheetName,
      spreadsheetId: normalizedSpreadsheetId,
      defaultResponseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
    });

    await FormImport.updateOne(
      { _id: existing._id },
      {
        $set: {
          externalFormUrl: normalizedExternalFormUrl,
          spreadsheetId: normalizedSpreadsheetId,
          spreadsheetBindings: diagnostics.bindings,
          writeResponsesToSheet: input.writeResponsesToSheet,
          responseSheetName: input.responseSheetName,
          notes: input.notes,
          sourceType: normalizedExternalFormUrl && !String(existing.htmlSource ?? "").trim() && !String(existing.appsScriptSource ?? "").trim()
            ? "external-link"
            : "google-apps-script",
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
          externalFormUrl: normalizedExternalFormUrl,
          writeResponsesToSheet: input.writeResponsesToSheet,
          responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID || normalizedSpreadsheetId,
          responseSheetName: input.responseSheetName || `${existing.name} Responses`,
          notes: input.notes,
        },
      },
      sessionOptions(session),
    );

    const updated = await FormImport.findById(existing._id).session(session).lean();
    await recordImportVersionSnapshot(updated, "draft-saved", "", session);
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
      externalFormUrl: imported.externalFormUrl ?? "",
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
          externalFormUrl: normalizeExternalFormUrl(imported.externalFormUrl ?? ""),
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
    const updatedImport = await FormImport.findById(imported._id).session(session).lean();
    await recordImportVersionSnapshot(updatedImport ?? imported, "published", input.actorEmail ?? "", session);
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
          isImplemented: String(imported.htmlSource ?? "").trim().length > 0,
          routePath: `/forms/${imported.slug}`,
          externalFormUrl: normalizeExternalFormUrl(imported.externalFormUrl ?? ""),
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
      importRecord: updatedImport ?? imported,
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
  levelOneApproverId: string;
  levelTwoApproverId: string;
  processorApproverId: string;
  writeResponsesToSheet: boolean;
  responseSpreadsheetId: string;
  responseSheetName: string;
  triggerEnabled: boolean;
  triggerUrl: string;
  triggerSource: string;
  triggerEvent: string;
  triggerFunctionName: string;
  triggerNotes: string;
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
  const normalizedResponseSpreadsheetId = normalizeSpreadsheetIdInput(input.responseSpreadsheetId);
  const normalizedTriggerUrl = normalizeTriggerUrl(input.triggerUrl);
  const normalizedLevelOneApproverId = String(input.levelOneApproverId || "").trim();
  const normalizedLevelTwoApproverId = String(input.levelTwoApproverId || "").trim();
  const normalizedProcessorApproverId = String(input.processorApproverId || "").trim();
  if (input.triggerEnabled && !normalizedTriggerUrl) {
    throw new Error("Turn off trigger automation or provide a valid trigger URL.");
  }

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

  const levelOneApprover = normalizedLevelOneApproverId
    ? await Approver.findById(normalizedLevelOneApproverId)
        .select({ _id: 1, name: 1, email: 1, isActive: 1 })
        .lean()
    : null;
  if (normalizedLevelOneApproverId) {
    if (!levelOneApprover || !levelOneApprover.isActive || !String(levelOneApprover.email ?? "").trim()) {
      throw new Error("Level 1 approver is invalid. Choose an active approver with an email address.");
    }
  }

  const levelTwoApprover = normalizedLevelTwoApproverId
    ? await Approver.findById(normalizedLevelTwoApproverId)
        .select({ _id: 1, name: 1, email: 1, isActive: 1 })
        .lean()
    : null;
  if (normalizedLevelTwoApproverId) {
    if (!levelTwoApprover || !levelTwoApprover.isActive || !String(levelTwoApprover.email ?? "").trim()) {
      throw new Error("Level 2 approver is invalid. Choose an active approver with an email address.");
    }
  }

  const processorApprover = normalizedProcessorApproverId
    ? await Approver.findById(normalizedProcessorApproverId)
        .select({ _id: 1, name: 1, email: 1, roles: 1, isActive: 1 })
        .lean()
    : null;
  if (normalizedProcessorApproverId) {
    if (!processorApprover || !processorApprover.roles?.includes("processor")) {
      throw new Error("Assigned processor is invalid. Pick an active processor-capable approver.");
    }
    if (!processorApprover.isActive) {
      throw new Error("Assigned processor is inactive. Choose an active processor.");
    }
    if (!String(processorApprover.email ?? "").trim()) {
      throw new Error("Assigned processor is missing an email address.");
    }
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
          levelOneApproverId: normalizedLevelOneApproverId,
          levelOneApproverName: levelOneApprover ? String(levelOneApprover.name || "").trim() : "",
          levelOneApproverEmail: levelOneApprover ? String(levelOneApprover.email || "").trim().toLowerCase() : "",
          levelTwoApproverId: normalizedLevelTwoApproverId,
          levelTwoApproverName: levelTwoApprover ? String(levelTwoApprover.name || "").trim() : "",
          levelTwoApproverEmail: levelTwoApprover ? String(levelTwoApprover.email || "").trim().toLowerCase() : "",
          processorApproverId: normalizedProcessorApproverId,
          processorApproverName: processorApprover ? String(processorApprover.name || "").trim() : "",
          processorApproverEmail: processorApprover ? String(processorApprover.email || "").trim().toLowerCase() : "",
          writeResponsesToSheet: input.writeResponsesToSheet,
          responseSpreadsheetId: normalizedResponseSpreadsheetId,
          responseSheetName: input.responseSheetName,
          triggerEnabled: input.triggerEnabled,
          triggerUrl: normalizedTriggerUrl,
          triggerSource: String(input.triggerSource || "").trim(),
          triggerEvent: String(input.triggerEvent || "").trim(),
          triggerFunctionName: String(input.triggerFunctionName || "").trim(),
          triggerNotes: String(input.triggerNotes || "").trim(),
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

export async function updateFormTriggerSettings(input: {
  id?: string;
  slug?: string;
  triggerEnabled: boolean;
  triggerUrl: string;
  triggerSource: string;
  triggerEvent: string;
  triggerFunctionName: string;
  triggerNotes: string;
}) {
  const normalizedTriggerUrl = normalizeTriggerUrl(input.triggerUrl);
  if (input.triggerEnabled && !normalizedTriggerUrl) {
    throw new Error("Turn off trigger automation or provide a valid trigger URL.");
  }

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
          triggerEnabled: input.triggerEnabled,
          triggerUrl: normalizedTriggerUrl,
          triggerSource: String(input.triggerSource || "").trim(),
          triggerEvent: String(input.triggerEvent || "").trim(),
          triggerFunctionName: String(input.triggerFunctionName || "").trim(),
          triggerNotes: String(input.triggerNotes || "").trim(),
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

export async function repairImportedFormLinkage(input: { id: string }) {
  return runWithOptionalTransaction(async (session) => {
    const imported = await FormImport.findById(input.id).session(session).lean();
    if (!imported) {
      throw new Error("Import draft not found.");
    }

    const normalizedExternalFormUrl = normalizeExternalFormUrl(imported.externalFormUrl ?? "");
    const diagnostics = analyzeImportedSource({
      name: imported.name,
      slug: imported.slug,
      htmlSource: imported.htmlSource ?? "",
      appsScriptSource: imported.appsScriptSource ?? "",
      spreadsheetBindings: imported.spreadsheetBindings ?? {},
      writeResponsesToSheet: Boolean(imported.writeResponsesToSheet),
      responseSheetName: imported.responseSheetName ?? "",
      spreadsheetId: imported.spreadsheetId ?? "",
      externalFormUrl: normalizedExternalFormUrl,
      defaultResponseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID,
    });

    const definitionBefore =
      (await FormDefinition.findOne({
        $or: [{ importSourceId: imported._id }, { slug: imported.slug }],
      })
        .session(session)
        .lean()) ?? null;

    await FormImport.updateOne(
      { _id: imported._id },
      {
        $set: {
          externalFormUrl: normalizedExternalFormUrl,
          spreadsheetBindings: diagnostics.bindings,
          sourceType:
            normalizedExternalFormUrl &&
            !String(imported.htmlSource ?? "").trim() &&
            !String(imported.appsScriptSource ?? "").trim()
              ? "external-link"
              : "google-apps-script",
          sourceChecksum: diagnostics.sourceChecksum,
          readinessState: diagnostics.readinessState,
          lastParsedAt: new Date(),
          parseDiagnostics: diagnostics.parseDiagnostics,
          summary: diagnostics.summary,
        },
      },
      sessionOptions(session),
    );

    await ensureImportedRegistryEntry(
      {
        ...imported,
        externalFormUrl: normalizedExternalFormUrl,
      },
      session,
    );

    const definitionCurrent = await FormDefinition.findOne({ slug: imported.slug }).session(session).lean();
    if (!definitionCurrent) {
      throw new Error("Failed to rebuild a registry entry for this import.");
    }

    await FormDefinition.updateOne(
      { _id: definitionCurrent._id },
      {
        $set: {
          slug: imported.slug,
          routePath: `/forms/${imported.slug}`,
          source: "imported",
          importSourceId: imported._id,
          externalFormUrl: normalizedExternalFormUrl,
          writeResponsesToSheet: Boolean(imported.writeResponsesToSheet),
          responseSpreadsheetId:
            String(definitionCurrent.responseSpreadsheetId ?? "").trim() ||
            DEFAULT_RESPONSE_SPREADSHEET_ID ||
            imported.spreadsheetId ||
            "",
          responseSheetName:
            String(definitionCurrent.responseSheetName ?? "").trim() ||
            imported.responseSheetName ||
            `${imported.name} Responses`,
        },
      },
      sessionOptions(session),
    );

    const definitionAfter = await FormDefinition.findById(definitionCurrent._id).session(session).lean();
    const updatedImport = await FormImport.findById(imported._id).session(session).lean();
    await recordImportVersionSnapshot(updatedImport ?? imported, "repaired", "", session);

    return {
      importRecord: updatedImport,
      definitionBefore,
      definitionAfter,
      diagnostics,
      repaired: {
        registryWasMissing: !definitionBefore,
        importSourceLinked:
          String(definitionAfter?.importSourceId ?? "") === String(imported._id),
        routeAligned: String(definitionAfter?.routePath ?? "") === `/forms/${imported.slug}`,
        externalUrlAligned:
          String(definitionAfter?.externalFormUrl ?? "") === normalizedExternalFormUrl,
      },
    };
  });
}

export async function deleteFormEverywhere(input: { id?: string; slug?: string; importId?: string }) {
  const requestedSlug = slugifyFormId(input.slug || "");
  const baseForm = input.id
    ? await FormDefinition.findById(input.id).lean()
    : requestedSlug
      ? await FormDefinition.findOne({ slug: requestedSlug }).lean()
      : null;
  const baseImport = input.importId
    ? await FormImport.findById(input.importId).lean()
    : requestedSlug
      ? await FormImport.findOne({ slug: requestedSlug }).lean()
      : null;

  const targetSlug = baseForm?.slug || baseImport?.slug || requestedSlug;
  if (!targetSlug) {
    throw new Error("Form definition is missing its identity.");
  }

  const relatedForms = await FormDefinition.find({
    $or: [
      { slug: targetSlug },
      ...(baseImport?._id ? [{ importSourceId: baseImport._id }] : []),
      ...(baseForm?.importSourceId ? [{ importSourceId: baseForm.importSourceId }] : []),
    ],
  }).lean();

  const importIds = new Set<string>();
  if (baseImport?._id) importIds.add(String(baseImport._id));
  if (baseForm?.importSourceId) importIds.add(String(baseForm.importSourceId));
  for (const form of relatedForms) {
    if (form.importSourceId) importIds.add(String(form.importSourceId));
  }

  const relatedImports = importIds.size
    ? await FormImport.find({
        $or: [{ slug: targetSlug }, { _id: { $in: [...importIds] } }],
      }).lean()
    : await FormImport.find({ slug: targetSlug }).lean();

  const slugs = [...new Set([targetSlug, ...relatedForms.map((form) => form.slug), ...relatedImports.map((item) => item.slug)])];
  const formsToArchive = relatedForms.filter((form) => form.source === "native" || RESERVED_NATIVE_SLUGS.has(form.slug));
  const formsToDelete = relatedForms.filter((form) => !formsToArchive.some((entry) => String(entry._id) === String(form._id)));

  const summary = await runWithOptionalTransaction(async (session) => {
    let archivedRegistryCount = 0;
    if (formsToArchive.length > 0) {
      const archivedIds = formsToArchive.map((form) => form._id);
      const archiveResult = await FormDefinition.updateMany(
        { _id: { $in: archivedIds } },
        {
          $set: {
            isDeleted: true,
            status: "archived",
            visibility: "admin",
            availability: "coming-soon",
            showInNavbar: false,
            writeResponsesToSheet: false,
            importSourceId: null,
          },
        },
        sessionOptions(session),
      );
      archivedRegistryCount = Number(archiveResult.modifiedCount ?? 0);
    }

    let deletedRegistryCount = 0;
    if (formsToDelete.length > 0) {
      const deleteResult = await FormDefinition.deleteMany(
        { _id: { $in: formsToDelete.map((form) => form._id) } },
        sessionOptions(session),
      );
      deletedRegistryCount = Number(deleteResult.deletedCount ?? 0);
    }

    let deletedImportCount = 0;
    if (relatedImports.length > 0) {
      const deleteResult = await FormImport.deleteMany(
        { _id: { $in: relatedImports.map((item) => item._id) } },
        sessionOptions(session),
      );
      deletedImportCount = Number(deleteResult.deletedCount ?? 0);
    }

    const requestResult = await RequestModel.deleteMany(
      { formSlug: { $in: slugs } },
      sessionOptions(session),
    );
    const notificationFlowResult = await NotificationFlow.deleteMany(
      { formSlug: { $in: slugs } },
      sessionOptions(session),
    );
    const notificationLogResult = await NotificationDeliveryLog.deleteMany(
      { formSlug: { $in: slugs } },
      sessionOptions(session),
    );
    const lookupResult =
      slugs.length > 0
        ? await Lookup.deleteMany(
            {
              $or: slugs.map((slug) => ({
                category: new RegExp(`^imported:${normalizeLookupKey(slug)}:`, "i"),
              })),
            },
            sessionOptions(session),
          )
        : { deletedCount: 0 };

    return {
      targetSlug,
      targetName:
        baseForm?.name ||
        baseImport?.name ||
        relatedForms[0]?.name ||
        relatedImports[0]?.name ||
        targetSlug,
      slugs,
      before: {
        forms: relatedForms.map((form) => ({
          id: String(form._id),
          slug: form.slug,
          source: form.source,
          importSourceId: form.importSourceId ? String(form.importSourceId) : "",
        })),
        imports: relatedImports.map((item) => ({
          id: String(item._id),
          slug: item.slug,
          status: item.status,
        })),
      },
      archivedRegistryCount,
      deletedRegistryCount,
      deletedImportCount,
      deletedRequestCount: Number(requestResult.deletedCount ?? 0),
      deletedNotificationFlowCount: Number(notificationFlowResult.deletedCount ?? 0),
      deletedNotificationLogCount: Number(notificationLogResult.deletedCount ?? 0),
      deletedLookupCount: Number(lookupResult.deletedCount ?? 0),
    };
  });

  let droppedMirrorCollectionCount = 0;
  for (const slug of slugs) {
    if (await dropMirrorCollectionIfExists(slug)) droppedMirrorCollectionCount += 1;
  }

  return {
    ...summary,
    droppedMirrorCollectionCount,
  };
}
