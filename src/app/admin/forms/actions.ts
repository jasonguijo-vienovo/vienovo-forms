"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import {
  FormDefinition,
  FORM_DEFINITION_AVAILABILITIES,
  FORM_DEFINITION_STATUSES,
  FORM_DEFINITION_VISIBILITIES,
  type FormDefinitionAvailability,
  type FormDefinitionStatus,
  type FormDefinitionVisibility,
} from "@/models/FormDefinition";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bool(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

export async function updateFormDefinition(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;

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
    { _id: id },
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
