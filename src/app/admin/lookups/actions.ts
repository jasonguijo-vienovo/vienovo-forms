"use server";

import { revalidatePath } from "next/cache";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { requireAdmin } from "@/lib/admin";
import { APPROVER_ROLES, Approver } from "@/models/Approver";
import { Lookup, parseImportedLookupCategory, type LookupCategory } from "@/models/Lookup";
import { SystemSetting } from "@/models/SystemSetting";

const APPROVER_CUSTOM_ROLES_KEY = "approver-custom-roles";
const LOOKUP_APPROVER_SYNC_KEY = "lookup-approver-sync";
const LOOKUP_USER_INFO_BINDINGS_KEY = "lookup-user-info-bindings";

const USER_INFO_BINDABLE_FIELDS = [
  { key: "department", label: "Department" },
  { key: "jobTitle", label: "Job Title" },
  { key: "employeeId", label: "Employee ID" },
  { key: "fullName", label: "Full Name" },
] as const;
type UserInfoBindableField = (typeof USER_INFO_BINDABLE_FIELDS)[number]["key"];

function parseCategory(value: FormDataEntryValue | null): LookupCategory {
  const v = String(value ?? "");
  if (!v.trim()) throw new Error(`Invalid category: ${v}`);
  return v.trim();
}

function normalizeKey(input: string) {
  return input.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeRoleTag(input: string) {
  return String(input ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

function parseUserInfoBindings(value: unknown) {
  if (!value || typeof value !== "object") return {} as Record<string, UserInfoBindableField>;
  const allowed = new Set<string>(USER_INFO_BINDABLE_FIELDS.map((item) => item.key));
  const out: Record<string, UserInfoBindableField> = {};
  for (const [category, field] of Object.entries(value as Record<string, unknown>)) {
    const normalizedCategory = String(category ?? "").trim();
    const normalizedField = String(field ?? "").trim();
    if (!normalizedCategory || !allowed.has(normalizedField)) continue;
    out[normalizedCategory] = normalizedField as UserInfoBindableField;
  }
  return out;
}

async function getKnownApproverRoles() {
  const [dynamicRoles, storedRoleDoc] = await Promise.all([
    Approver.distinct("roles"),
    SystemSetting.findOne({ key: APPROVER_CUSTOM_ROLES_KEY }).lean(),
  ]);

  const storedRoles = Array.isArray(storedRoleDoc?.value)
    ? (storedRoleDoc.value as unknown[]).map((item) => String(item ?? "").trim()).filter(Boolean)
    : typeof storedRoleDoc?.value === "string"
      ? storedRoleDoc.value
          .split(/[\n,;]+/g)
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];
  const roleMap = new Map<string, string>();
  for (const role of [...APPROVER_ROLES, ...dynamicRoles.map((item) => String(item ?? "").trim()), ...storedRoles]) {
    const value = String(role ?? "").trim();
    const key = normalizeRoleTag(value);
    if (!key) continue;
    if (!roleMap.has(key)) roleMap.set(key, value);
  }
  return [...roleMap.values()];
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

async function clearLookupCategoriesSynced(categories: string[]) {
  const unique = Array.from(new Set(categories.map((item) => String(item ?? "").trim()).filter(Boolean)));
  if (unique.length === 0) return;
  const doc = await SystemSetting.findOne({ key: LOOKUP_APPROVER_SYNC_KEY }).lean();
  if (!doc?.value || typeof doc.value !== "object") return;

  const current = parseApproverSyncMeta(doc.value);
  let changed = false;
  for (const category of unique) {
    if (!(category in current)) continue;
    delete current[category];
    changed = true;
  }
  if (!changed) return;

  await SystemSetting.updateOne(
    { key: LOOKUP_APPROVER_SYNC_KEY },
    { $set: { key: LOOKUP_APPROVER_SYNC_KEY, value: current } },
    { upsert: true },
  );
}

async function getLookupUserInfoBindings() {
  const doc = await SystemSetting.findOne({ key: LOOKUP_USER_INFO_BINDINGS_KEY }).lean();
  return parseUserInfoBindings(doc?.value);
}

async function resequenceCategoryAlphabetically(category: string) {
  const docs = await Lookup.find({ category })
    .select({ _id: 1, sortOrder: 1 })
    .sort({ value: 1, _id: 1 })
    .lean();
  const ops = docs
    .map((doc, idx) =>
      (doc.sortOrder ?? -1) === idx
        ? null
        : {
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: { sortOrder: idx } },
            },
          },
    )
    .filter(Boolean);
  if (ops.length > 0) {
    await Lookup.bulkWrite(ops as Parameters<typeof Lookup.bulkWrite>[0], { ordered: false });
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

async function syncLookupCategoryFromUserInfoField(input: {
  category: string;
  field: UserInfoBindableField;
}) {
  const { Employee } = await import("@/models/Employee");
  const rows = await Employee.find({
    isActive: true,
    [input.field]: { $exists: true, $nin: [null, ""] },
  })
    .select({ [input.field]: 1 })
    .lean();

  const uniqueIncoming: string[] = [];
  const seenIncoming = new Set<string>();
  for (const row of rows) {
    const value = String((row as Record<string, unknown>)[input.field] ?? "").trim();
    const key = normalizeKey(value);
    if (!key || seenIncoming.has(key)) continue;
    seenIncoming.add(key);
    uniqueIncoming.push(value);
  }

  if (uniqueIncoming.length === 0) {
    return { candidateCount: 0, addedCount: 0, updatedCount: 0, changed: false };
  }

  const existing = await Lookup.find({ category: input.category }).sort({ sortOrder: 1, value: 1 }).lean();
  const existingByKey = new Map(existing.map((item) => [normalizeKey(String(item.value ?? "")), item]));
  const toInsert: string[] = [];
  const ops: Array<Record<string, unknown>> = [];
  let updatedCount = 0;

  for (const value of uniqueIncoming) {
    const key = normalizeKey(value);
    const existingItem = existingByKey.get(key);
    if (!existingItem) {
      toInsert.push(value);
      continue;
    }

    if (!existingItem.isActive || (existingItem.label ?? "") !== "") {
      ops.push({
        updateOne: {
          filter: { _id: existingItem._id },
          update: { $set: { label: "", isActive: true } },
        },
      });
      updatedCount += 1;
    }
  }

  if (toInsert.length > 0) {
    const last = existing[existing.length - 1];
    const startOrder = (last?.sortOrder ?? -1) + 1;
    for (const [idx, value] of toInsert.entries()) {
      ops.push({
        insertOne: {
          document: {
            category: input.category,
            value,
            label: "",
            sortOrder: startOrder + idx,
            isActive: true,
          },
        },
      });
    }
  }

  if (ops.length > 0) {
    await Lookup.bulkWrite(ops as Parameters<typeof Lookup.bulkWrite>[0], { ordered: false });
    await resequenceCategoryAlphabetically(String(input.category));
  }

  return {
    candidateCount: uniqueIncoming.length,
    addedCount: toInsert.length,
    updatedCount,
    changed: ops.length > 0,
  };
}

type ApproverSyncRow = {
  name?: string;
  email?: string;
  roles?: string[];
};

async function syncLookupCategoryFromRoles(input: {
  category: string;
  targetRoles: string[];
  approvers?: ApproverSyncRow[];
}) {
  const targetRoleSet = new Set(input.targetRoles.map((role) => normalizeRoleTag(role)).filter(Boolean));
  if (targetRoleSet.size === 0) {
    return { candidateCount: 0, addedCount: 0, updatedCount: 0, changed: false };
  }

  const rawApprovers =
    input.approvers ??
    (await Approver.find({
      isActive: true,
      email: { $ne: "" },
      roles: { $in: [...targetRoleSet] },
    })
      .select({ name: 1, email: 1, roles: 1 })
      .lean());

  const matchedApprovers = rawApprovers.filter((approver) => {
    const roles = Array.isArray(approver.roles) ? approver.roles : [];
    return roles.some((role) => targetRoleSet.has(normalizeRoleTag(String(role))));
  });

  if (matchedApprovers.length === 0) {
    return { candidateCount: 0, addedCount: 0, updatedCount: 0, changed: false };
  }

  const existing = await Lookup.find({ category: input.category }).sort({ sortOrder: 1, value: 1 }).lean();
  const existingByKey = new Map(existing.map((item) => [normalizeKey(String(item.value ?? "")), item]));
  const seenIncoming = new Set<string>();
  const toInsert: Array<{ value: string; label: string }> = [];
  const ops: Array<Record<string, unknown>> = [];
  let updatedCount = 0;

  for (const approver of matchedApprovers) {
    const value = String(approver.email ?? "").trim().toLowerCase();
    const label = String(approver.name ?? "").trim();
    const key = normalizeKey(value);
    if (!key || seenIncoming.has(key)) continue;
    seenIncoming.add(key);

    const existingItem = existingByKey.get(key);
    if (!existingItem) {
      toInsert.push({ value, label });
      continue;
    }

    if ((existingItem.label ?? "") !== label || !existingItem.isActive) {
      ops.push({
        updateOne: {
          filter: { _id: existingItem._id },
          update: { $set: { label, isActive: true } },
        },
      });
      updatedCount += 1;
    }
  }

  if (toInsert.length > 0) {
    const last = existing[existing.length - 1];
    const startOrder = (last?.sortOrder ?? -1) + 1;
    for (const [idx, entry] of toInsert.entries()) {
      ops.push({
        insertOne: {
          document: {
            category: input.category,
            value: entry.value,
            label: entry.label,
            sortOrder: startOrder + idx,
            isActive: true,
          },
        },
      });
    }
  }

  if (ops.length > 0) {
    await Lookup.bulkWrite(ops as Parameters<typeof Lookup.bulkWrite>[0], { ordered: false });
    if (toInsert.length > 0) {
      await resequenceCategoryAlphabetically(String(input.category));
    }
  }

  return {
    candidateCount: matchedApprovers.length,
    addedCount: toInsert.length,
    updatedCount,
    changed: ops.length > 0,
  };
}

export async function addLookup(formData: FormData) {
  try {
    await requireAdmin();
    await connectMongo();
    const rawCategory = parseCategory(formData.get("category"));
    const category = await resolveImportedCategoryAlias(rawCategory);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const rawValue = String(formData.get("value") ?? "").trim();
    const value = email || rawValue;
    const label = name;

    if (!value) {
      await setFlashToast({ tone: "error", message: "Enter a value, or provide an email." });
      revalidatePath("/admin/lookups");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await setFlashToast({ tone: "error", message: "Email format is invalid." });
      revalidatePath("/admin/lookups");
      return;
    }

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
      label,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      isActive: true,
    });

    await resequenceCategoryAlphabetically(String(category));
    await setFlashToast({
      tone: "success",
      message: label ? `Added dropdown value: ${label} <${value}>` : `Added dropdown value: ${value}`,
    });
    revalidatePath("/admin/lookups");
  } catch (error) {
    await setFlashToast({
      tone: "error",
      message: error instanceof Error ? error.message : "Failed to add dropdown value.",
    });
    revalidatePath("/admin/lookups");
  }
}

export async function addLookupBulk(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const rawCategory = parseCategory(formData.get("category"));
  const category = await resolveImportedCategoryAlias(rawCategory);
  const raw = String(formData.get("bulkValues") ?? "");
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

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
      label: "",
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

export async function addLookupFromApproverRole(formData: FormData) {
  try {
    await requireAdmin();
    await connectMongo();
    const rawCategory = parseCategory(formData.get("category"));
    const category = await resolveImportedCategoryAlias(rawCategory);
    const selectedRole = String(formData.get("approverRole") ?? "").trim();
    if (!category) {
      await setFlashToast({ tone: "error", message: "Missing dropdown category." });
      revalidatePath("/admin/lookups");
      return;
    }

    const knownRoles = await getKnownApproverRoles();
    const role = knownRoles.find((item) => normalizeRoleTag(item) === normalizeRoleTag(selectedRole));
    if (!role) {
      await setFlashToast({ tone: "error", message: "Choose a valid approver role." });
      revalidatePath("/admin/lookups");
      return;
    }

    const result = await syncLookupCategoryFromRoles({
      category: String(category),
      targetRoles: [role],
    });

    if (result.candidateCount === 0) {
      await setFlashToast({ tone: "success", message: `No active approver emails found for role "${role}".` });
      revalidatePath("/admin/lookups");
      return;
    }

    if (result.changed) {
      await markLookupCategoriesSynced([String(category)]);
    }

    await setFlashToast({
      tone: "success",
      message:
        result.addedCount === 0 && result.updatedCount === 0
          ? `No changes needed for role "${role}".`
          : `Synced role "${role}": ${result.addedCount} added, ${result.updatedCount} refreshed.`,
    });
    revalidatePath("/admin/lookups");
  } catch (error) {
    await setFlashToast({
      tone: "error",
      message: error instanceof Error ? error.message : "Failed to add values from approver role.",
    });
    revalidatePath("/admin/lookups");
  }
}

export async function syncLookupCategoryFromApprovers(formData: FormData) {
  try {
    await requireAdmin();
    await connectMongo();
    const rawCategory = parseCategory(formData.get("category"));
    const category = await resolveImportedCategoryAlias(rawCategory);
    const knownRoles = await getKnownApproverRoles();

    const sample = await Lookup.findOne({ category }).select({ label: 1 }).lean();
    const categoryLabel = String(sample?.label ?? "");
    const targetRoles = inferRolesForCategory(String(category), categoryLabel, knownRoles);

    if (targetRoles.length === 0) {
      await setFlashToast({
        tone: "success",
        message: "This dropdown group does not match approver-role sync rules.",
      });
      revalidatePath("/admin/lookups");
      return;
    }

    const result = await syncLookupCategoryFromRoles({
      category: String(category),
      targetRoles,
    });

    if (result.changed) {
      await markLookupCategoriesSynced([String(category)]);
    }

    await setFlashToast({
      tone: "success",
      message:
        result.candidateCount === 0
          ? "No active approvers found for this dropdown role mapping."
          : result.addedCount === 0 && result.updatedCount === 0
            ? "No changes needed for this dropdown group."
            : `Category synced: ${result.addedCount} added, ${result.updatedCount} refreshed.`,
    });
    revalidatePath("/admin/lookups");
  } catch (error) {
    await setFlashToast({
      tone: "error",
      message: error instanceof Error ? error.message : "Failed to sync dropdown category from approvers.",
    });
    revalidatePath("/admin/lookups");
  }
}

export async function updateLookupCategoryUserInfoBinding(formData: FormData) {
  try {
    await requireAdmin();
    await connectMongo();
    const rawCategory = parseCategory(formData.get("category"));
    const category = await resolveImportedCategoryAlias(rawCategory);
    const selectedField = String(formData.get("userInfoField") ?? "").trim();
    const allowed = new Set<string>(USER_INFO_BINDABLE_FIELDS.map((item) => item.key));
    if (selectedField && !allowed.has(selectedField)) {
      throw new Error("Choose a valid user info field.");
    }

    const current = await getLookupUserInfoBindings();
    if (!selectedField) {
      delete current[String(category)];
    } else {
      current[String(category)] = selectedField as UserInfoBindableField;
    }

    await SystemSetting.updateOne(
      { key: LOOKUP_USER_INFO_BINDINGS_KEY },
      { $set: { key: LOOKUP_USER_INFO_BINDINGS_KEY, value: current } },
      { upsert: true },
    );

    await setFlashToast({
      tone: "success",
      message: selectedField
        ? "Dropdown connected to user info."
        : "User info connection removed from dropdown.",
    });
    revalidatePath("/admin/lookups");
  } catch (error) {
    await setFlashToast({
      tone: "error",
      message: error instanceof Error ? error.message : "Failed to update user info connection.",
    });
    revalidatePath("/admin/lookups");
  }
}

export async function syncLookupCategoryFromUserInfo(formData: FormData) {
  try {
    await requireAdmin();
    await connectMongo();
    const rawCategory = parseCategory(formData.get("category"));
    const category = await resolveImportedCategoryAlias(rawCategory);
    const bindings = await getLookupUserInfoBindings();
    const field = bindings[String(category)];
    if (!field) {
      throw new Error("Connect this dropdown to a user info field first.");
    }

    const result = await syncLookupCategoryFromUserInfoField({
      category: String(category),
      field,
    });

    await setFlashToast({
      tone: "success",
      message:
        result.candidateCount === 0
          ? "No user info values were found for this field."
          : result.changed
            ? `User info sync complete: ${result.addedCount} added, ${result.updatedCount} refreshed.`
            : "No user info dropdown changes were needed.",
    });
    revalidatePath("/admin/lookups");
  } catch (error) {
    await setFlashToast({
      tone: "error",
      message: error instanceof Error ? error.message : "Failed to sync dropdown from user info.",
    });
    revalidatePath("/admin/lookups");
  }
}

export async function toggleLookup(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  const doc = await Lookup.findById(id);
  if (!doc) return;
  doc.isActive = !doc.isActive;
  await doc.save();
  await setFlashToast({ tone: "success", message: `${doc.value} ${doc.isActive ? "activated" : "deactivated"}.` });
  revalidatePath("/admin/lookups");
}

export async function deleteLookup(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const id = String(formData.get("id") ?? "");
  const doc = await Lookup.findById(id).lean();
  await Lookup.findByIdAndDelete(id);
  await setFlashToast({ tone: "success", message: `${doc?.value ?? "Dropdown value"} deleted.` });
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

export async function deleteLookupCategory(formData: FormData) {
  await requireAdmin();
  await connectMongo();
  const rawCategory = parseCategory(formData.get("category"));
  const category = await resolveImportedCategoryAlias(rawCategory);
  const result = await Lookup.deleteMany({ category });
  await clearLookupCategoriesSynced([String(category)]);
  await setFlashToast({
    tone: "success",
    message: `Deleted ${result.deletedCount ?? 0} value(s) from dropdown group.`,
  });
  revalidatePath("/admin/lookups");
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

export async function scanRolesLookups() {
  await requireAdmin();
  await connectMongo();

  const categories = (await Lookup.distinct("category")).filter((category) => categoryLooksRoleDriven(String(category)));
  if (categories.length === 0) {
    await setFlashToast({ tone: "success", message: "No role-related dropdown categories found to scan." });
    revalidatePath("/admin/lookups");
    return;
  }

  const approvers = await Approver.find({ isActive: true, email: { $ne: "" } })
    .select({ email: 1, name: 1, roles: 1 })
    .lean();
  const knownRoles = await getKnownApproverRoles();

  let addedCount = 0;
  let refreshedCount = 0;
  let touchedCategories = 0;
  const syncedCategories: string[] = [];

  for (const category of categories) {
    const sample = await Lookup.findOne({ category }).select({ label: 1 }).lean();
    const categoryLabel = String(sample?.label ?? "");
    const targetRoles = inferRolesForCategory(String(category), categoryLabel, knownRoles);
    if (targetRoles.length === 0) continue;
    const result = await syncLookupCategoryFromRoles({
      category: String(category),
      targetRoles,
      approvers: approvers.map((approver) => ({
        name: String(approver.name ?? ""),
        email: String(approver.email ?? ""),
        roles: Array.isArray(approver.roles) ? approver.roles.map((role) => String(role)) : [],
      })),
    });

    if (!result.changed) continue;
    if (result.addedCount > 0) {
      addedCount += result.addedCount;
    }
    if (result.updatedCount > 0) {
      refreshedCount += result.updatedCount;
    }
    if (result.addedCount > 0 || result.updatedCount > 0) {
      touchedCategories += 1;
      syncedCategories.push(String(category));
    }
  }

  if (syncedCategories.length > 0) {
    await markLookupCategoriesSynced(syncedCategories);
  }

  await setFlashToast({
    tone: "success",
    message:
      addedCount > 0 || refreshedCount > 0
        ? `Scan complete: added ${addedCount} and refreshed ${refreshedCount} role-based value(s) across ${touchedCategories} dropdown group(s).`
        : "Scan complete: no role-based changes were needed.",
  });
  revalidatePath("/admin/lookups");
}
