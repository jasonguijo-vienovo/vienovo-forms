"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { writeAuditLog } from "@/lib/audit";
import { BUILTIN_FORMS } from "@/lib/form-definitions";
import {
  FormDefinition,
  FORM_DEFINITION_AVAILABILITIES,
  FORM_DEFINITION_STATUSES,
  FORM_DEFINITION_VISIBILITIES,
  type FormDefinitionAvailability,
  type FormDefinitionStatus,
  type FormDefinitionVisibility,
} from "@/models/FormDefinition";
import { FormImport } from "@/models/FormImport";
import { Lookup, normalizeLookupKey } from "@/models/Lookup";
import { NotificationFlow } from "@/models/NotificationFlow";
import { RequestModel } from "@/models/Request";
import mongoose from "mongoose";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bool(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

const BUILTIN_FORM_SLUGS = new Set(BUILTIN_FORMS.map((form) => form.slug));

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function requestMirrorCollectionName(slug: string) {
  const normalized = String(slug || "requests")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `requests_${normalized || "general"}`;
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

export async function updateFormDefinition(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const slug = s(formData, "slug");
  if (!id && !slug) return;

  const status = s(formData, "status") as FormDefinitionStatus;
  const visibility = s(formData, "visibility") as FormDefinitionVisibility;
  const availability = s(formData, "availability") as FormDefinitionAvailability;
  const requestedSlug = slugify(s(formData, "newSlug")) || slug;

  if (!FORM_DEFINITION_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  if (!FORM_DEFINITION_VISIBILITIES.includes(visibility)) {
    throw new Error(`Invalid visibility: ${visibility}`);
  }
  if (!FORM_DEFINITION_AVAILABILITIES.includes(availability)) {
    throw new Error(`Invalid availability: ${availability}`);
  }

  const form = id
    ? await FormDefinition.findById(id).lean()
    : await FormDefinition.findOne({ slug }).lean();
  if (!form) return;

  if ((form.source === "native" || BUILTIN_FORM_SLUGS.has(form.slug)) && requestedSlug !== form.slug) {
    throw new Error("Native form IDs are tied to code routes and cannot be renamed here.");
  }

  if (form.source === "imported" && requestedSlug !== form.slug) {
    const existingSlug = await FormDefinition.findOne({
      slug: requestedSlug,
      _id: { $ne: form._id },
    })
      .select({ _id: 1 })
      .lean();
    if (existingSlug) {
      throw new Error(`The form ID "${requestedSlug}" is already in use.`);
    }
  }

  const nextRoutePath =
    form.source === "imported" ? `/forms/${requestedSlug}` : s(formData, "routePath");

  await FormDefinition.updateOne(
    { _id: form._id },
    {
      $set: {
        slug: requestedSlug,
        name: s(formData, "name"),
        description: s(formData, "description"),
        routePath: nextRoutePath,
        notes: s(formData, "notes"),
        status,
        visibility,
        availability,
        showInNavbar: bool(formData, "showInNavbar"),
        isImplemented: bool(formData, "isImplemented"),
        writeResponsesToSheet: bool(formData, "writeResponsesToSheet"),
        responseSpreadsheetId: s(formData, "responseSpreadsheetId"),
        responseSheetName: s(formData, "responseSheetName"),
      },
    }
  );

  if (form.source === "imported" && requestedSlug !== form.slug) {
    await Promise.all([
      FormImport.updateOne({ _id: form.importSourceId }, { $set: { slug: requestedSlug } }),
      NotificationFlow.updateOne({ formSlug: form.slug }, { $set: { formSlug: requestedSlug } }),
      RequestModel.updateMany(
        { formSlug: form.slug },
        {
          $set: {
            formSlug: requestedSlug,
          },
        },
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
                  replacement: `imported:${normalizeLookupKey(requestedSlug)}:`,
                },
              },
            },
          },
        ] as any,
      ),
    ]);
    await renameCollectionIfExists(
      requestMirrorCollectionName(form.slug),
      requestMirrorCollectionName(requestedSlug),
    );
    await updateMirrorCollectionSlug(requestMirrorCollectionName(requestedSlug), requestedSlug);
  }

  await setFlashToast({ tone: "success", message: "Form settings saved." });
  await writeAuditLog({
    actorEmail: email,
    action: "update_form_definition",
    targetType: "form-definition",
    targetId: String(form._id),
    details: {
      previousSlug: form.slug,
      slug: requestedSlug,
      status,
      visibility,
      availability,
      routePath: nextRoutePath,
    },
  });

  revalidatePath("/admin/forms");
  revalidatePath("/admin/form-imports");
  revalidatePath("/admin/notifications");
  revalidatePath("/admin/lookups");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}

export async function hideFormDefinition(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const slug = s(formData, "slug");
  if (!id && !slug) return;

  await FormDefinition.updateOne(
    id ? { _id: id } : { slug },
    {
      $set: {
        status: "draft",
        visibility: "admin",
        availability: "coming-soon",
        showInNavbar: false,
      },
    }
  );
  await setFlashToast({ tone: "success", message: "Form hidden from users." });
  await writeAuditLog({
    actorEmail: email,
    action: "hide_form_definition",
    targetType: "form-definition",
    targetId: id || slug,
    details: { slug },
  });

  revalidatePath("/admin/forms");
  revalidatePath("/admin/form-imports");
  revalidatePath("/admin/notifications");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}

export async function deleteFormDefinition(formData: FormData) {
  const { email } = await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const slug = s(formData, "slug");
  if (!id && !slug) return;

  const form = id
    ? await FormDefinition.findById(id).lean()
    : await FormDefinition.findOne({ slug }).lean();
  if (!form) return;

  if (form.source === "native" || BUILTIN_FORM_SLUGS.has(form.slug)) {
    await FormDefinition.updateOne(
      id ? { _id: id } : { slug: form.slug },
      {
        $set: {
          isDeleted: true,
          status: "archived",
          visibility: "admin",
          availability: "coming-soon",
          showInNavbar: false,
          writeResponsesToSheet: false,
        },
      }
    );
    await setFlashToast({ tone: "success", message: "Native form deleted from the system." });
    await writeAuditLog({
      actorEmail: email,
      action: "delete_native_form_definition",
      targetType: "form-definition",
      targetId: form.slug,
      details: { source: form.source },
    });

    revalidatePath("/admin/forms");
    revalidatePath("/admin/form-imports");
    revalidatePath("/admin/notifications");
    revalidatePath("/dashboard");
    revalidatePath("/forms");
    return;
  }

  await FormDefinition.deleteOne(id ? { _id: id } : { slug: form.slug });

  if (form.importSourceId) {
    await FormImport.updateOne({ _id: form.importSourceId }, { $set: { status: "draft" } });
  }
  await setFlashToast({ tone: "success", message: "Registry entry deleted." });
  await writeAuditLog({
    actorEmail: email,
    action: "delete_form_definition",
    targetType: "form-definition",
    targetId: form.slug,
    details: { source: form.source, importSourceId: form.importSourceId ? String(form.importSourceId) : "" },
  });

  revalidatePath("/admin/forms");
  revalidatePath("/admin/form-imports");
  revalidatePath("/admin/notifications");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}
