"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
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

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bool(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

const BUILTIN_FORM_SLUGS = new Set(BUILTIN_FORMS.map((form) => form.slug));

export async function updateFormDefinition(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const slug = s(formData, "slug");
  if (!id && !slug) return;

  const status = s(formData, "status") as FormDefinitionStatus;
  const visibility = s(formData, "visibility") as FormDefinitionVisibility;
  const availability = s(formData, "availability") as FormDefinitionAvailability;

  if (!FORM_DEFINITION_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  if (!FORM_DEFINITION_VISIBILITIES.includes(visibility)) {
    throw new Error(`Invalid visibility: ${visibility}`);
  }
  if (!FORM_DEFINITION_AVAILABILITIES.includes(availability)) {
    throw new Error(`Invalid availability: ${availability}`);
  }

  await FormDefinition.updateOne(
    id ? { _id: id } : { slug },
    {
      $set: {
        name: s(formData, "name"),
        description: s(formData, "description"),
        routePath: s(formData, "routePath"),
        notes: s(formData, "notes"),
        status,
        visibility,
        availability,
        showInNavbar: bool(formData, "showInNavbar"),
        isImplemented: bool(formData, "isImplemented"),
      },
    }
  );

  revalidatePath("/admin/forms");
  revalidatePath("/admin/form-imports");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}

export async function hideFormDefinition(formData: FormData) {
  await requireAdmin();
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

  revalidatePath("/admin/forms");
  revalidatePath("/admin/form-imports");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}

export async function deleteFormDefinition(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  const slug = s(formData, "slug");
  if (!id && !slug) return;

  const form = id
    ? await FormDefinition.findById(id).lean()
    : await FormDefinition.findOne({ slug }).lean();
  if (!form) return;
  if (form.source === "native" || BUILTIN_FORM_SLUGS.has(form.slug)) {
    throw new Error("Built-in forms cannot be deleted. Hide them by changing status/availability instead.");
  }

  await FormDefinition.deleteOne(id ? { _id: id } : { slug: form.slug });

  if (form.importSourceId) {
    await FormImport.updateOne({ _id: form.importSourceId }, { $set: { status: "draft" } });
  }

  revalidatePath("/admin/forms");
  revalidatePath("/admin/form-imports");
  revalidatePath("/dashboard");
  revalidatePath("/forms");
}
