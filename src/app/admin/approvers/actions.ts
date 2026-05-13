"use server";

import { revalidatePath } from "next/cache";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { requireAdmin } from "@/lib/admin";
import { Employee } from "@/models/Employee";
import { Approver, APPROVER_ROLES, type ApproverRole } from "@/models/Approver";
import { Lookup } from "@/models/Lookup";

function parseRoles(formData: FormData): string[] {
  const out = new Set<string>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("role_")) continue;
    if (String(value) !== "on") continue;
    const role = key.slice("role_".length).trim();
    if (role) out.add(role);
  }
  return Array.from(out);
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
  await syncRoleDrivenLookupCategories();
}

function normalizeKey(input: string) {
  return input.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function categoryLooksRoleDriven(category: string) {
  const key = normalizeKey(category);
  return (
    key.includes("manager") ||
    key.includes("supervisor") ||
    key.includes("approver") ||
    key.includes("processor") ||
    key.includes("head") ||
    key.includes("hr")
  );
}

function inferRolesForCategory(category: string, label: string, knownRoles: string[]): string[] {
  const key = `${normalizeKey(category)} ${normalizeKey(label)}`;
  if (key.includes("manager") || key.includes("supervisor")) return ["supervisor", "head", "sla"];
  if (key.includes("processor")) return ["processor"];
  if (key.includes("cashadvance")) return ["cashAdvanceApprover"];
  if (key.includes("hr")) return ["hr"];
  if (key.includes("head")) return ["head"];
  if (key.includes("sla")) return ["sla"];
  if (key.includes("approver")) return knownRoles;
  return [];
}

async function syncRoleDrivenLookupCategories() {
  const categories = (await Lookup.distinct("category")).filter((category) => categoryLooksRoleDriven(String(category)));
  if (categories.length === 0) return;

  const [approvers, roles] = await Promise.all([
    Approver.find({ isActive: true, email: { $ne: "" } }).select({ email: 1, name: 1, roles: 1 }).lean(),
    Approver.distinct("roles"),
  ]);
  const knownRoles = Array.from(new Set([...(roles || []), ...APPROVER_ROLES]));

  for (const category of categories) {
    const existing = await Lookup.find({ category }).sort({ sortOrder: 1, value: 1 }).lean();
    const sampleLabel = String(existing.find((entry) => entry.label)?.label ?? "");
    const targetRoles = inferRolesForCategory(String(category), sampleLabel, knownRoles);
    if (targetRoles.length === 0) continue;

    const desired = new Map<string, string>();
    for (const approver of approvers) {
      const approverRoles = Array.isArray(approver.roles) ? approver.roles : [];
      if (!approverRoles.some((role) => targetRoles.includes(role))) continue;
      const email = String(approver.email ?? "").trim().toLowerCase();
      if (!email) continue;
      desired.set(email, String(approver.name ?? "").trim());
    }

    const desiredEmails = new Set(desired.keys());
    const existingByEmail = new Map(existing.map((entry) => [String(entry.value ?? "").trim().toLowerCase(), entry]));

    const toDeleteIds: string[] = [];
    for (const entry of existing) {
      const email = String(entry.value ?? "").trim().toLowerCase();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!isEmail) continue;
      if (!desiredEmails.has(email)) toDeleteIds.push(String(entry._id));
    }
    if (toDeleteIds.length > 0) await Lookup.deleteMany({ _id: { $in: toDeleteIds } });

    const lastOrder = existing.length > 0 ? Math.max(...existing.map((entry) => entry.sortOrder ?? 0)) : -1;
    let nextOrder = lastOrder + 1;
    for (const [email, name] of desired) {
      const found = existingByEmail.get(email);
      if (!found) {
        await Lookup.create({
          category,
          value: email,
          label: name,
          sortOrder: nextOrder,
          isActive: true,
        });
        nextOrder += 1;
        continue;
      }
      if ((found.label ?? "") !== name || !found.isActive) {
        await Lookup.updateOne({ _id: found._id }, { $set: { label: name, isActive: true } });
      }
    }
  }
}

function normalizeEmail(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

async function resolveApproverProfile(input: {
  name: string;
  email: string;
  department?: string;
}) {
  const email = normalizeEmail(input.email);
  const employee = email
    ? await Employee.findOne({ email })
        .select({ fullName: 1, email: 1, employeeId: 1, department: 1, jobTitle: 1, isActive: 1 })
        .lean()
    : null;

  return {
    name: String(employee?.fullName ?? input.name ?? "").trim(),
    email,
    employeeId: String(employee?.employeeId ?? "").trim(),
    department: String(employee?.department ?? input.department ?? "").trim(),
    jobTitle: String(employee?.jobTitle ?? "").trim(),
    employeeFound: Boolean(employee),
    employeeIsActive: employee ? employee.isActive !== false : null,
  };
}

export async function addApprover(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const roles = parseRoles(formData);
  const profile = await resolveApproverProfile({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? ""),
    department: String(formData.get("department") ?? "").trim(),
  });

  if (!profile.name) {
    await setFlashToast({ tone: "error", message: "Name is required." });
    revalidatePath("/admin/approvers");
    return;
  }

  try {
    await Approver.create({
      name: profile.name,
      email: profile.email,
      employeeId: profile.employeeId,
      roles,
      department: profile.department,
      jobTitle: profile.jobTitle,
      emailNeedsReview: !profile.email,
      isActive: true,
    });
    await syncAutoLookupRoles();
    await setFlashToast({
      tone: "success",
      message: profile.employeeFound
        ? `Approver ${profile.name} added from the employee directory.`
        : `Approver ${profile.name} added.`,
    });
  } catch (error) {
    const duplicateName =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000;
    await setFlashToast({
      tone: "error",
      message: duplicateName
        ? `Approver "${profile.name}" already exists. Use a different name or edit the existing record.`
        : "Could not add approver. Please try again.",
    });
  }
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
}

export async function addApproverRole(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const roleRaw = String(formData.get("role") ?? "").trim();
  const role = roleRaw.replace(/\s+/g, "");
  if (!role) {
    await setFlashToast({ tone: "error", message: "Role name is required." });
    revalidatePath("/admin/approvers");
    return;
  }
  const allRoles = await Approver.distinct("roles");
  if (allRoles.includes(role) || APPROVER_ROLES.includes(role as ApproverRole)) {
    await setFlashToast({ tone: "success", message: `Role "${role}" already exists.` });
    revalidatePath("/admin/approvers");
    return;
  }
  await Approver.updateMany({}, { $addToSet: { roles: role } });
  await setFlashToast({ tone: "success", message: `Role "${role}" added and available in role dropdowns.` });
  revalidatePath("/admin/approvers");
}

export async function updateApprover(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  const roles = parseRoles(formData);
  const doc = await Approver.findById(id);
  if (!doc) return;
  const profile = await resolveApproverProfile({
    name: doc.name,
    email: String(formData.get("email") ?? ""),
    department: String(formData.get("department") ?? "").trim(),
  });
  doc.name = profile.name || doc.name;
  doc.email = profile.email;
  doc.employeeId = profile.employeeId;
  doc.department = profile.department;
  doc.jobTitle = profile.jobTitle;
  doc.roles = roles;
  doc.emailNeedsReview = !profile.email;
  await doc.save();
  await syncAutoLookupRoles();
  await setFlashToast({
    tone: "success",
    message: profile.employeeFound
      ? `${doc.name} was refreshed from the employee directory.`
      : `${doc.name} was updated.`,
  });
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
  await setFlashToast({
    tone: "success",
    message: `${doc.name} is now ${doc.isActive ? "active" : "inactive"}.`,
  });
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
}

export async function deleteApprover(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  const doc = await Approver.findByIdAndDelete(id);
  await syncAutoLookupRoles();
  await setFlashToast({
    tone: "success",
    message: doc ? `${doc.name} was removed.` : "Approver removed.",
  });
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
}
