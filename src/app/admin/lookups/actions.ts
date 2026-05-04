"use server";

import { revalidatePath } from "next/cache";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { Lookup, type LookupCategory } from "@/models/Lookup";
import { requireAdmin } from "@/lib/admin";

function parseCategory(value: FormDataEntryValue | null): LookupCategory {
  const v = String(value ?? "");
  if (!v.trim()) {
    throw new Error(`Invalid category: ${v}`);
  }
  return v.trim();
}

export async function addLookup(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const category = parseCategory(formData.get("category"));
  const value = String(formData.get("value") ?? "").trim();
  if (!value) return;
  const last = await Lookup.findOne({ category }).sort({ sortOrder: -1 });
  await Lookup.create({
    category,
    value,
    sortOrder: (last?.sortOrder ?? -1) + 1,
    isActive: true,
  });
  await setFlashToast({ tone: "success", message: `Added dropdown value: ${value}` });
  revalidatePath("/admin/lookups");
}

export async function toggleLookup(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  const doc = await Lookup.findById(id);
  if (!doc) return;
  doc.isActive = !doc.isActive;
  await doc.save();
  await setFlashToast({
    tone: "success",
    message: `${doc.value} ${doc.isActive ? "activated" : "deactivated"}.`,
  });
  revalidatePath("/admin/lookups");
}

export async function deleteLookup(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  const doc = await Lookup.findById(id).lean();
  await Lookup.findByIdAndDelete(id);
  await setFlashToast({
    tone: "success",
    message: `${doc?.value ?? "Dropdown value"} deleted.`,
  });
  revalidatePath("/admin/lookups");
}

export async function updateLookup(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  if (!value) return;
  const doc = await Lookup.findById(id);
  if (!doc) return;
  doc.value = value;
  await doc.save();
  await setFlashToast({ tone: "success", message: "Dropdown value updated." });
  revalidatePath("/admin/lookups");
}
