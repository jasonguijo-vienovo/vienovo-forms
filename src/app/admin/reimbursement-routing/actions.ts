"use server";

import { revalidatePath } from "next/cache";
import { connectMongo } from "@/lib/db/mongo";
import { requireAdmin } from "@/lib/admin";
import { ReimbursementRoute } from "@/models/ReimbursementRoute";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function addRoute(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const department = s(formData, "department");
  const costCenter = s(formData, "costCenter");
  const location = s(formData, "location");
  const supervisorEmail = s(formData, "supervisorEmail").toLowerCase();
  const supervisorName = s(formData, "supervisorName");
  const headEmail = s(formData, "headEmail").toLowerCase();
  const headName = s(formData, "headName");

  if (!department || !costCenter || !location) return;

  const last = await ReimbursementRoute.findOne({}).sort({ sortOrder: -1 });
  await ReimbursementRoute.updateOne(
    { department, costCenter, location },
    {
      $setOnInsert: {
        department,
        costCenter,
        location,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        isActive: true,
      },
      $set: {
        supervisorEmail,
        supervisorName,
        headEmail,
        headName,
      },
    },
    { upsert: true }
  );

  revalidatePath("/admin/reimbursement-routing");
}

export async function updateRoute(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;

  await ReimbursementRoute.updateOne(
    { _id: id },
    {
      $set: {
        department: s(formData, "department"),
        costCenter: s(formData, "costCenter"),
        location: s(formData, "location"),
        supervisorEmail: s(formData, "supervisorEmail").toLowerCase(),
        supervisorName: s(formData, "supervisorName"),
        headEmail: s(formData, "headEmail").toLowerCase(),
        headName: s(formData, "headName"),
      },
    }
  );

  revalidatePath("/admin/reimbursement-routing");
}

export async function toggleRoute(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;

  const doc = await ReimbursementRoute.findById(id);
  if (!doc) return;
  doc.isActive = !doc.isActive;
  await doc.save();

  revalidatePath("/admin/reimbursement-routing");
}

export async function deleteRoute(formData: FormData) {
  await requireAdmin();
  await connectMongo();

  const id = s(formData, "id");
  if (!id) return;
  await ReimbursementRoute.findByIdAndDelete(id);

  revalidatePath("/admin/reimbursement-routing");
}

