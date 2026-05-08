"use server";

import { revalidatePath } from "next/cache";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { requireAdmin } from "@/lib/admin";
import { Approver, APPROVER_ROLES, type ApproverRole } from "@/models/Approver";
import { Lookup } from "@/models/Lookup";

function parseRoles(formData: FormData): ApproverRole[] {
  const out: ApproverRole[] = [];
  for (const role of APPROVER_ROLES) {
    if (formData.get(`role_${role}`) === "on") out.push(role);
  }
  return out;
}

const AUTO_SYNC_ROLE_TO_CATEGORY: Array<{ role: ApproverRole; category: string }> = [
  { role: "sla", category: "cashAdvancePayableTo" },
];

async function syncApproverRoleLookupCategory(role: ApproverRole, category: string) {
  const approvers = await Approver.find({ isActive: true, roles: role, email: { $ne: "" } })
    .select({ name: 1, email: 1 })
    .lean();

  const existing = await Lookup.find({ category }).sort({ sortOrder: 1, value: 1 }).lean();
  const existingByValue = new Map(existing.map((item) => [String(item.value).trim().toLowerCase(), item]));

  const toInsert: Array<{ value: string; label: string }> = [];

  for (const approver of approvers) {
    const email = String(approver.email ?? "").trim().toLowerCase();
    const name = String(approver.name ?? "").trim();
    if (!email) continue;

    const match = existingByValue.get(email);
    if (match) {
      if ((match.label ?? "") !== name || !match.isActive) {
        await Lookup.updateOne({ _id: match._id }, { $set: { label: name, isActive: true } });
      }
      continue;
    }

    toInsert.push({ value: email, label: name });
  }

  if (toInsert.length > 0) {
    const last = existing[existing.length - 1];
    const startOrder = (last?.sortOrder ?? -1) + 1;
    await Lookup.insertMany(
      toInsert.map((item, idx) => ({
        category,
        value: item.value,
        label: item.label,
        sortOrder: startOrder + idx,
        isActive: true,
      })),
    );
  }
}

async function syncAutoLookupRoles() {
  for (const item of AUTO_SYNC_ROLE_TO_CATEGORY) {
    await syncApproverRoleLookupCategory(item.role, item.category);
  }
}

export async function addApprover(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!name) {
    await setFlashToast({ tone: "error", message: "Name is required." });
    revalidatePath("/admin/approvers");
    return;
  }
  const roles = parseRoles(formData);

  try {
    await Approver.create({
      name,
      email,
      roles,
      emailNeedsReview: !email,
      isActive: true,
    });
    await syncAutoLookupRoles();
    await setFlashToast({ tone: "success", message: `Approver ${name} added.` });
  } catch (error) {
    const duplicateName =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000;
    await setFlashToast({
      tone: "error",
      message: duplicateName
        ? `Approver "${name}" already exists. Use a different name or edit the existing record.`
        : "Could not add approver. Please try again.",
    });
  }
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
}

export async function updateApprover(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const department = String(formData.get("department") ?? "").trim();
  const roles = parseRoles(formData);
  const doc = await Approver.findById(id);
  if (!doc) return;
  doc.email = email;
  doc.department = department;
  doc.roles = roles;
  doc.emailNeedsReview = !email;
  await doc.save();
  await syncAutoLookupRoles();
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
}

export async function toggleApprover(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  const doc = await Approver.findById(id);
  if (!doc) return;
  doc.isActive = !doc.isActive;
  await doc.save();
  await syncAutoLookupRoles();
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
}

export async function deleteApprover(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  await Approver.findByIdAndDelete(id);
  await syncAutoLookupRoles();
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
}
