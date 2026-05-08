"use server";

import { revalidatePath } from "next/cache";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { Lookup, parseImportedLookupCategory, type LookupCategory } from "@/models/Lookup";
import { requireAdmin } from "@/lib/admin";

function parseCategory(value: FormDataEntryValue | null): LookupCategory {
  const v = String(value ?? "");
  if (!v.trim()) {
    throw new Error(`Invalid category: ${v}`);
  }
  return v.trim();
}

function normalizeKey(input: string) {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

async function resequenceCategoryAlphabetically(category: string) {
  const docs = await Lookup.find({ category }).sort({ value: 1, _id: 1 });
  for (let idx = 0; idx < docs.length; idx += 1) {
    docs[idx].sortOrder = idx;
    await docs[idx].save();
  }
}

async function resolveImportedCategoryAlias(category: LookupCategory) {
  const parsed = parseImportedLookupCategory(String(category));
  if (!parsed) return category;

  const importedCategories = await Lookup.distinct("category", {
    category: new RegExp(`^imported:${parsed.slugKey}:`, "i"),
  });
  const targetKey = normalizeKey(parsed.fieldKey);

  const exact = importedCategories.find((candidate) => {
    const parsedCandidate = parseImportedLookupCategory(String(candidate));
    return parsedCandidate && normalizeKey(parsedCandidate.fieldKey) === targetKey;
  });

  return exact || category;
}

export async function addLookup(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const rawCategory = parseCategory(formData.get("category"));
  const category = await resolveImportedCategoryAlias(rawCategory);
  const value = String(formData.get("value") ?? "").trim();
  if (!value) return;
  const valueKey = normalizeKey(value);
  const existing = await Lookup.find({ category }).select({ value: 1 }).lean();
  const exists = existing.some((item) => normalizeKey(String(item.value)) === valueKey);
  if (exists) {
    await setFlashToast({ tone: "success", message: `Skipped: "${value}" already exists.` });
    revalidatePath("/admin/lookups");
    return;
  }
  const last = await Lookup.findOne({ category }).sort({ sortOrder: -1 });
  await Lookup.create({
    category,
    value,
    sortOrder: (last?.sortOrder ?? -1) + 1,
    isActive: true,
  });
  await resequenceCategoryAlphabetically(String(category));
  await setFlashToast({ tone: "success", message: `Added dropdown value: ${value}` });
  revalidatePath("/admin/lookups");
}

export async function addLookupBulk(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const rawCategory = parseCategory(formData.get("category"));
  const category = await resolveImportedCategoryAlias(rawCategory);
  const raw = String(formData.get("bulkValues") ?? "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    await setFlashToast({ tone: "error", message: "Paste at least one value (one per line)." });
    revalidatePath("/admin/lookups");
    return;
  }

  const existing = await Lookup.find({ category }).select({ value: 1 }).lean();
  const existingKeys = new Set(existing.map((item) => normalizeKey(String(item.value))));
  const incomingUnique: string[] = [];
  const incomingKeys = new Set<string>();

  for (const value of lines) {
    const key = normalizeKey(value);
    if (!key) continue;
    if (incomingKeys.has(key)) continue;
    incomingKeys.add(key);
    if (existingKeys.has(key)) continue;
    incomingUnique.push(value);
  }

  if (incomingUnique.length === 0) {
    await setFlashToast({
      tone: "success",
      message: `No new values added. All ${lines.length} pasted value(s) already exist.`,
    });
    revalidatePath("/admin/lookups");
    return;
  }

  const last = await Lookup.findOne({ category }).sort({ sortOrder: -1 }).lean();
  const startOrder = (last?.sortOrder ?? -1) + 1;
  await Lookup.insertMany(
    incomingUnique.map((value, idx) => ({
      category,
      value,
      sortOrder: startOrder + idx,
      isActive: true,
    })),
  );

  await resequenceCategoryAlphabetically(String(category));
  await setFlashToast({
    tone: "success",
    message: `Bulk add complete: ${incomingUnique.length} added, ${lines.length - incomingUnique.length} skipped.`,
  });
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
  await resequenceCategoryAlphabetically(String(doc.category));
  await setFlashToast({ tone: "success", message: "Dropdown value updated." });
  revalidatePath("/admin/lookups");
}
