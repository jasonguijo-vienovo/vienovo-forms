"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectMongo } from "@/lib/db/mongo";
import { syncEmployeesFromGraph } from "@/lib/employee-sync";
import { setFlashToast } from "@/lib/flash";
import { requireAdmin } from "@/lib/admin";
import { Employee } from "@/models/Employee";
import { Approver, APPROVER_ROLES, type ApproverRole } from "@/models/Approver";
import { Lookup } from "@/models/Lookup";
import { SystemSetting } from "@/models/SystemSetting";

const APPROVER_CUSTOM_ROLES_KEY = "approver-custom-roles";
const LOOKUP_APPROVER_SYNC_KEY = "lookup-approver-sync";

function normalizeRoleTag(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseApproverSyncMeta(value: unknown) {
  if (!value || typeof value !== "object") return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const category = String(key ?? "").trim();
    const at = String(raw ?? "").trim();
    if (!category || !at) continue;
    out[category] = at;
  }
  return out;
}

async function markLookupCategoriesSynced(categories: string[]) {
  const unique = Array.from(new Set(categories.map((item) => String(item ?? "").trim()).filter(Boolean)));
  if (unique.length === 0) return;

  const doc = await SystemSetting.findOne({ key: LOOKUP_APPROVER_SYNC_KEY }).lean();
  const current = parseApproverSyncMeta(doc?.value);
  const now = new Date().toISOString();
  for (const category of unique) current[category] = now;

  await SystemSetting.updateOne(
    { key: LOOKUP_APPROVER_SYNC_KEY },
    { $set: { key: LOOKUP_APPROVER_SYNC_KEY, value: current } },
    { upsert: true },
  );
}

async function getStoredCustomRoles() {
  const doc = await SystemSetting.findOne({ key: APPROVER_CUSTOM_ROLES_KEY }).lean();
  if (Array.isArray(doc?.value)) {
    return Array.from(new Set((doc.value as unknown[]).map((item) => normalizeRoleTag(String(item))).filter(Boolean)));
  }
  if (typeof doc?.value === "string") {
    return Array.from(
      new Set(
        doc.value
          .split(/[\n,;]+/g)
          .map((item) => normalizeRoleTag(item))
          .filter(Boolean),
      ),
    );
  }
  return [] as string[];
}

async function saveStoredCustomRoles(roles: string[]) {
  const normalized = Array.from(new Set(roles.map((role) => normalizeRoleTag(role)).filter(Boolean)));
  await SystemSetting.updateOne(
    { key: APPROVER_CUSTOM_ROLES_KEY },
    { $set: { key: APPROVER_CUSTOM_ROLES_KEY, value: normalized } },
    { upsert: true },
  );
  return normalized;
}

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
  let changed = false;

  for (const approver of approvers) {
    const email = String(approver.email ?? "").trim().toLowerCase();
    const name = String(approver.name ?? "").trim();
    if (!email) continue;

    const match = existingByValue.get(email);
    if (match) {
      if ((match.label ?? "") !== name || !match.isActive) {
        await Lookup.updateOne({ _id: match._id }, { $set: { label: name, isActive: true } });
        changed = true;
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
    changed = true;
  }
  return changed;
}

async function syncAutoLookupRoles() {
  const touchedCategories = new Set<string>();
  for (const item of AUTO_SYNC_ROLE_TO_CATEGORY) {
    const changed = await syncApproverRoleLookupCategory(item.role, item.category);
    if (changed) touchedCategories.add(item.category);
  }
  const roleDrivenTouched = await syncRoleDrivenLookupCategories();
  for (const category of roleDrivenTouched) touchedCategories.add(category);
  if (touchedCategories.size > 0) {
    await markLookupCategoriesSynced([...touchedCategories]);
  }
  return {
    touchedCategories: touchedCategories.size,
    categories: [...touchedCategories],
  };
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
  if (categories.length === 0) return [] as string[];

  const [approvers, roles] = await Promise.all([
    Approver.find({ isActive: true, email: { $ne: "" } }).select({ email: 1, name: 1, roles: 1 }).lean(),
    Approver.distinct("roles"),
  ]);
  const knownRoles = Array.from(new Set([...(roles || []), ...APPROVER_ROLES]));
  const touchedCategories: string[] = [];

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
    const ops: Array<Record<string, unknown>> = [];
    if (toDeleteIds.length > 0) {
      ops.push({ deleteMany: { filter: { _id: { $in: toDeleteIds } } } });
    }

    const lastOrder = existing.length > 0 ? Math.max(...existing.map((entry) => entry.sortOrder ?? 0)) : -1;
    let nextOrder = lastOrder + 1;
    for (const [email, name] of desired) {
      const found = existingByEmail.get(email);
      if (!found) {
        ops.push({
          insertOne: {
            document: {
              category,
              value: email,
              label: name,
              sortOrder: nextOrder,
              isActive: true,
            },
          },
        });
        nextOrder += 1;
        continue;
      }
      if ((found.label ?? "") !== name || !found.isActive) {
        ops.push({
          updateOne: {
            filter: { _id: found._id },
            update: { $set: { label: name, isActive: true } },
          },
        });
      }
    }

    if (ops.length > 0) {
      await Lookup.bulkWrite(
        ops as Parameters<typeof Lookup.bulkWrite>[0],
        { ordered: false },
      );
      touchedCategories.push(String(category));
    }
  }
  return touchedCategories;
}

export async function syncLookupDropdownsFromApprovers() {
  await requireAdmin();
  await connectMongo();
  const result = await syncAutoLookupRoles();
  await setFlashToast({
    tone: "success",
    message:
      result.touchedCategories > 0
        ? `Dropdown sync complete: updated ${result.touchedCategories} dropdown group(s) from approvers.`
        : "Dropdown sync complete: no role-driven dropdown changes were needed.",
  });
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
}

function normalizeEmail(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

type EmployeeDirectoryRow = {
  email: string;
  employeeId: string;
  fullName: string;
  department: string;
  jobTitle: string;
  isActive: boolean;
};

function findEmployeeMatchForApprover(
  approver: {
    email?: string;
    employeeId?: string;
  },
  employeesByEmail: Map<string, EmployeeDirectoryRow>,
  employeesById: Map<string, EmployeeDirectoryRow>,
) {
  const approverEmployeeId = String(approver.employeeId ?? "").trim();
  if (approverEmployeeId) {
    const byId = employeesById.get(approverEmployeeId);
    if (byId) return byId;
  }

  const approverEmail = normalizeEmail(String(approver.email ?? ""));
  if (!approverEmail) return null;
  return employeesByEmail.get(approverEmail) ?? null;
}

async function refreshApproversFromEmployeeDirectory() {
  const [approvers, employees] = await Promise.all([
    Approver.find({}).lean(),
    Employee.find({})
      .select({ email: 1, employeeId: 1, fullName: 1, department: 1, jobTitle: 1, isActive: 1 })
      .lean(),
  ]);

  const employeeRows: EmployeeDirectoryRow[] = employees.map((employee) => ({
    email: normalizeEmail(String(employee.email ?? "")),
    employeeId: String(employee.employeeId ?? "").trim(),
    fullName: String(employee.fullName ?? "").trim(),
    department: String(employee.department ?? "").trim(),
    jobTitle: String(employee.jobTitle ?? "").trim(),
    isActive: employee.isActive !== false,
  }));

  const employeesByEmail = new Map(employeeRows.filter((row) => row.email).map((row) => [row.email, row]));
  const employeesById = new Map(employeeRows.filter((row) => row.employeeId).map((row) => [row.employeeId, row]));

  const ops: Parameters<typeof Approver.bulkWrite>[0] = [];
  let matched = 0;
  let updated = 0;
  let inactiveMatches = 0;

  for (const approver of approvers) {
    const match = findEmployeeMatchForApprover(approver, employeesByEmail, employeesById);
    if (!match) continue;

    matched += 1;
    if (!match.isActive) inactiveMatches += 1;

    const nextName = match.fullName || String(approver.name ?? "").trim();
    const nextEmail = match.email;
    const nextEmployeeId = match.employeeId;
    const nextDepartment = match.department;
    const nextJobTitle = match.jobTitle;
    const nextEmailNeedsReview = !nextEmail;

    const changed =
      nextName !== String(approver.name ?? "").trim() ||
      nextEmail !== normalizeEmail(String(approver.email ?? "")) ||
      nextEmployeeId !== String(approver.employeeId ?? "").trim() ||
      nextDepartment !== String(approver.department ?? "").trim() ||
      nextJobTitle !== String(approver.jobTitle ?? "").trim() ||
      nextEmailNeedsReview !== Boolean(approver.emailNeedsReview);

    if (!changed) continue;

    updated += 1;
    ops.push({
      updateOne: {
        filter: { _id: approver._id },
        update: {
          $set: {
            name: nextName,
            email: nextEmail,
            employeeId: nextEmployeeId,
            department: nextDepartment,
            jobTitle: nextJobTitle,
            emailNeedsReview: nextEmailNeedsReview,
          },
        },
      },
    });
  }

  if (ops.length > 0) {
    await Approver.bulkWrite(ops, { ordered: false });
  }

  return {
    approverCount: approvers.length,
    matched,
    updated,
    unmatched: Math.max(0, approvers.length - matched),
    inactiveMatches,
  };
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
  try {
    await requireAdmin();
    await connectMongo();
    const name = String(formData.get("name") ?? "").trim();
    const roleRaw = String(formData.get("tags") ?? "").trim();
    const role = normalizeRoleTag(roleRaw);
    if (!name || !role) {
      await setFlashToast({ tone: "error", message: "Both Name and Tags are required." });
      revalidatePath("/admin/approvers");
      return;
    }
    const [allRoles, stored] = await Promise.all([Approver.distinct("roles"), getStoredCustomRoles()]);
    const allRoleKeys = new Set([
      ...allRoles.map((item) => normalizeRoleTag(String(item))),
      ...stored.map((item) => normalizeRoleTag(item)),
      ...APPROVER_ROLES.map((item) => normalizeRoleTag(String(item))),
    ]);
    if (allRoleKeys.has(role)) {
      await setFlashToast({ tone: "success", message: `Role "${role}" already exists.` });
      revalidatePath("/admin/approvers");
      redirect("/admin/approvers");
    }

    const nextRoles = Array.from(new Set([...stored, role].map((item) => normalizeRoleTag(item)).filter(Boolean)));
    await SystemSetting.findOneAndUpdate(
      { key: APPROVER_CUSTOM_ROLES_KEY },
      { $set: { key: APPROVER_CUSTOM_ROLES_KEY, value: nextRoles } },
      { upsert: true, new: true },
    );

    await setFlashToast({
      tone: "success",
      message: `Role "${name}" saved. Tag "${role}" will be used when assigned to approvers.`,
    });
    revalidatePath("/admin/approvers");
    redirect("/admin/approvers");
  } catch (error) {
    const digest =
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest?: unknown }).digest ?? "")
        : "";
    if (digest.startsWith("NEXT_REDIRECT")) throw error;
    await setFlashToast({
      tone: "error",
      message: error instanceof Error ? error.message : "Failed to add role.",
    });
    revalidatePath("/admin/approvers");
    redirect("/admin/approvers");
  }
}

export async function recoverApproverEmails() {
  await requireAdmin();
  await connectMongo();

  const invalidEmail = /^(?![^\s@]+@[^\s@]+\.[^\s@]+$).*/;
  const candidates = await Approver.find({
    $or: [{ emailNeedsReview: true }, { email: "" }, { email: { $regex: invalidEmail } }],
  });

  let recovered = 0;

  for (const doc of candidates) {
    let employee: { email?: string; employeeId?: string } | null = null;
    const employeeId = String(doc.employeeId ?? "").trim();
    const name = String(doc.name ?? "").trim();
    const currentEmail = String(doc.email ?? "").trim().toLowerCase();

    if (currentEmail) {
      employee = await Employee.findOne({ email: currentEmail }).select({ email: 1, employeeId: 1 }).lean();
    }
    if (!employee && employeeId) {
      employee = await Employee.findOne({ employeeId }).select({ email: 1, employeeId: 1 }).lean();
    }
    if (!employee && name) {
      employee = await Employee.findOne({ fullName: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
        .select({ email: 1, employeeId: 1 })
        .lean();
    }
    if (!employee?.email) continue;

    const recoveredEmail = String(employee.email).trim().toLowerCase();
    const previousEmail = String(doc.email ?? "").trim().toLowerCase();
    const changed = recoveredEmail !== previousEmail || doc.emailNeedsReview || !doc.employeeId;
    if (!changed) continue;

    doc.email = recoveredEmail;
    doc.employeeId = String(employee.employeeId ?? doc.employeeId ?? "").trim();
    doc.emailNeedsReview = false;
    await doc.save();
    recovered += 1;
  }

  if (recovered > 0) await syncAutoLookupRoles();
  await setFlashToast({
    tone: "success",
    message: recovered > 0 ? `Recovered ${recovered} approver email(s).` : "No recoverable approver emails found.",
  });
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
}

export async function editApproverRole(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const previousRole = String(formData.get("previousRole") ?? "").trim();
  const nextRoleRaw = String(formData.get("tags") ?? "").trim();
  const nextRole = normalizeRoleTag(nextRoleRaw);

  if (!previousRole || !nextRole) {
    await setFlashToast({ tone: "error", message: "Current role and new tag are required." });
    revalidatePath("/admin/approvers");
    return;
  }

  const previousRoleKey = normalizeRoleTag(previousRole);
  if (previousRoleKey === nextRole) {
    await setFlashToast({ tone: "success", message: "No changes detected for this role." });
    revalidatePath("/admin/approvers");
    return;
  }

  await Approver.updateMany(
    { roles: previousRole },
    { $addToSet: { roles: nextRole }, $pull: { roles: previousRole } },
  );
  const stored = await getStoredCustomRoles();
  const nextStored = stored.map((item) => (normalizeRoleTag(item) === previousRoleKey ? nextRole : item));
  await saveStoredCustomRoles(nextStored);
  await syncAutoLookupRoles();
  await setFlashToast({
    tone: "success",
    message: `Role tag updated from "${previousRole}" to "${nextRole}".`,
  });
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
  redirect("/admin/approvers");
}

export async function deleteApproverRole(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const role = String(formData.get("role") ?? "").trim();
  if (!role) {
    await setFlashToast({ tone: "error", message: "Role is required." });
    revalidatePath("/admin/approvers");
    return;
  }

  await Approver.updateMany({ roles: role }, { $pull: { roles: role } });
  const stored = await getStoredCustomRoles();
  await saveStoredCustomRoles(stored.filter((item) => item !== role));
  await syncAutoLookupRoles();
  await setFlashToast({ tone: "success", message: `Role "${role}" removed from all approvers.` });
  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
  redirect("/admin/approvers");
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

export async function syncApproversFromIntune() {
  await requireAdmin();
  await connectMongo();

  try {
    const employeeResult = await syncEmployeesFromGraph();
    const approverResult = await refreshApproversFromEmployeeDirectory();
    const lookupResult = await syncAutoLookupRoles();

    const message =
      `Intune sync completed. ${employeeResult.processed} employee records refreshed, ` +
      `${approverResult.updated} approvers updated from ${approverResult.matched} matched employee records` +
      `${approverResult.unmatched > 0 ? `, ${approverResult.unmatched} approvers had no employee match` : ""}` +
      `${approverResult.inactiveMatches > 0 ? `, ${approverResult.inactiveMatches} matched employees are inactive` : ""}` +
      `${lookupResult.touchedCategories > 0 ? `, ${lookupResult.touchedCategories} dropdown groups were synced.` : "."}`;

    await setFlashToast({
      tone: "success",
      message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approver sync failed.";
    await setFlashToast({
      tone: "error",
      message,
      persistent: true,
    });
  }

  revalidatePath("/admin/approvers");
  revalidatePath("/admin/lookups");
  revalidatePath("/admin/users");
}
