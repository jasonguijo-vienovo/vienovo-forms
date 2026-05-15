import { connectMongo } from "@/lib/db/mongo";
import { hydrateImportedFormRuntime } from "@/lib/imported-forms";
import { Approver, type ApproverRole } from "@/models/Approver";
import { FormImport } from "@/models/FormImport";
import { Lookup, importedLookupCategory } from "@/models/Lookup";

function normalizeText(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function titleCase(input: string) {
  return input
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function shouldSyncPeopleField(field: { name: string; label: string }) {
  const key = normalizeText(`${field.name} ${field.label}`);
  return ["approver", "processor", "supervisor", "superior", "head"].some((hint) =>
    key.includes(hint)
  );
}

function inferApproverRoles(field: { name: string; label: string }) {
  const key = normalizeText(`${field.name} ${field.label}`);
  const roles = new Set<ApproverRole>();
  if (key.includes("processor")) roles.add("processor");
  if (key.includes("supervisor") || key.includes("superior")) roles.add("supervisor");
  if (key.includes("head")) roles.add("head");
  if (key.includes("cashadvance") && key.includes("approver")) roles.add("cashAdvanceApprover");
  return [...roles];
}

function deriveNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? email;
  return titleCase(localPart);
}

function firstEmail(...values: string[]) {
  const regex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  for (const value of values) {
    const match = value.match(regex);
    if (match) return match[0].toLowerCase();
  }
  return "";
}

function extractPeopleCandidates(field: {
  name: string;
  label: string;
  options?: Array<{ value: string; label: string }>;
}) {
  const roles = inferApproverRoles(field);
  const unique = new Map<string, { name: string; email: string; roles: ApproverRole[] }>();

  for (const option of field.options ?? []) {
    const rawLabel = option.label.trim();
    const rawValue = option.value.trim();
    const email = firstEmail(rawValue, rawLabel);
    const nameSource =
      rawLabel && normalizeText(rawLabel) !== normalizeText(email)
        ? rawLabel
        : rawValue && normalizeText(rawValue) !== normalizeText(email)
          ? rawValue
          : deriveNameFromEmail(email || rawLabel || rawValue);
    const name = titleCase(nameSource);
    if (!name && !email) continue;
    const key = email || normalizeText(name);
    unique.set(key, { name: name || deriveNameFromEmail(email), email, roles });
  }

  return [...unique.values()];
}

async function upsertImportedApprover(person: {
  name: string;
  email: string;
  roles: ApproverRole[];
}) {
  const existing = person.email
    ? await Approver.findOne({
        $or: [{ email: person.email }, { name: person.name }],
      })
        .select({ _id: 1 })
        .lean()
    : await Approver.findOne({ name: person.name }).select({ _id: 1 }).lean();

  const filter = existing
    ? { _id: existing._id }
    : person.email
      ? { email: person.email }
      : { name: person.name };

  const update: Record<string, unknown> = {
    $set: {
      name: person.name,
      email: person.email,
      emailNeedsReview: !person.email,
    },
    $setOnInsert: {
      isActive: true,
      roles: [],
    },
  };
  if (person.roles.length > 0) {
    update.$addToSet = { roles: { $each: person.roles } };
  }

  await Approver.updateOne(filter, update, { upsert: true });
}

export async function syncImportedLookupsForImport(importId: string) {
  await connectMongo();
  const imported = await FormImport.findById(importId).lean();
  if (!imported) {
    throw new Error("Imported form draft not found.");
  }

  const runtime = await hydrateImportedFormRuntime({
    slug: imported.slug,
    htmlSource: imported.htmlSource ?? "",
    spreadsheetId: imported.spreadsheetId ?? "",
    spreadsheetBindings: imported.spreadsheetBindings ?? {},
    preferLookupOptions: false,
  });

  let categoriesSynced = 0;
  let valuesSynced = 0;
  let peopleSynced = 0;
  let processorsSynced = 0;
  const seenPeople = new Set<string>();

  async function syncLookupCategory(category: string, options: string[]) {
    const uniqueOptions = [...new Set(options.map((option) => option.trim()).filter(Boolean))];
    if (uniqueOptions.length === 0) return;

    categoriesSynced += 1;
    valuesSynced += uniqueOptions.length;

    for (let i = 0; i < uniqueOptions.length; i += 1) {
      await Lookup.updateOne(
        { category, value: uniqueOptions[i] },
        {
          $set: {
            sortOrder: i,
            isActive: true,
          },
          $setOnInsert: {
            category,
            value: uniqueOptions[i],
          },
        },
        { upsert: true }
      );
    }

    await Lookup.deleteMany({
      category,
      value: { $nin: uniqueOptions },
    });
  }

  for (const field of runtime.fields) {
    if (!["select", "radio", "checkbox-group"].includes(field.type)) continue;
    const options = (field.options ?? [])
      .map((option) => option.value.trim())
      .filter(Boolean);
    if (options.length === 0) continue;

    const category = importedLookupCategory(imported.slug, field.name);
    await syncLookupCategory(category, options);

    if (shouldSyncPeopleField(field)) {
      const people = extractPeopleCandidates(field);
      for (const person of people) {
        const dedupeKey = person.email || normalizeText(person.name);
        if (!dedupeKey || seenPeople.has(dedupeKey)) continue;
        await upsertImportedApprover(person);
        seenPeople.add(dedupeKey);
        peopleSynced += 1;
        if (person.roles.includes("processor")) processorsSynced += 1;
      }
    }
  }

  for (const [key, options] of Object.entries(runtime.optionSets ?? {})) {
    await syncLookupCategory(
      importedLookupCategory(imported.slug, key),
      options.map((option) => option.value),
    );
  }

  return {
    importName: imported.name,
    slug: imported.slug,
    categoriesSynced,
    valuesSynced,
    peopleSynced,
    processorsSynced,
  };
}

export async function syncImportedLookupsForAllImports() {
  await connectMongo();
  const imports = await FormImport.find({}).select({ _id: 1 }).lean();

  let importsSynced = 0;
  let categoriesSynced = 0;
  let valuesSynced = 0;
  let peopleSynced = 0;
  let processorsSynced = 0;

  for (const imported of imports) {
    const result = await syncImportedLookupsForImport(String(imported._id));
    if (result.categoriesSynced > 0 || result.peopleSynced > 0) {
      importsSynced += 1;
      categoriesSynced += result.categoriesSynced;
      valuesSynced += result.valuesSynced;
      peopleSynced += result.peopleSynced;
      processorsSynced += result.processorsSynced;
    }
  }

  return { importsSynced, categoriesSynced, valuesSynced, peopleSynced, processorsSynced };
}
