"use server";

import { revalidatePath } from "next/cache";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { Approver, APPROVER_ROLES, type ApproverRole } from "@/models/Approver";
import { requireAdmin } from "@/lib/admin";

function parseRoles(formData: FormData): ApproverRole[] {
  const out: ApproverRole[] = [];
  for (const role of APPROVER_ROLES) {
    if (formData.get(`role_${role}`) === "on") out.push(role);
  }
  return out;
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
  revalidatePath("/admin/approvers");
}

export async function toggleApprover(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  const doc = await Approver.findById(id);
  if (!doc) return;
  doc.isActive = !doc.isActive;
  await doc.save();
  revalidatePath("/admin/approvers");
}

export async function deleteApprover(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  await Approver.findByIdAndDelete(id);
  revalidatePath("/admin/approvers");
}
