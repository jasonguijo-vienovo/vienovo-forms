import mongoose from "mongoose";

const BUILTIN_SLUGS = [
  "travel-booking",
  "cash-advance",
  "reimbursement",
  "request-for-payment",
  "cashiering",
  "leave-request",
];

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined.");
  }

  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  });

  const db = mongoose.connection.db;
  const [imports, definitions, requests, flows] = await Promise.all([
    db.collection("formimports").find({}).toArray(),
    db.collection("formdefinitions").find({}).toArray(),
    db.collection("requests").find({}, { projection: { formSlug: 1 } }).toArray(),
    db.collection("notificationflows").find({}, { projection: { formSlug: 1 } }).toArray(),
  ]);

  const issues = [];
  const importCounts = new Map();
  for (const imported of imports) {
    const slug = String(imported.slug ?? "").trim();
    importCounts.set(slug, (importCounts.get(slug) ?? 0) + 1);
  }
  for (const [slug, count] of importCounts.entries()) {
    if (slug && count > 1) issues.push(`Duplicate import slug "${slug}" (${count} records).`);
  }

  const definitionBySlug = new Map(definitions.map((row) => [String(row.slug ?? "").trim(), row]));
  for (const imported of imports) {
    const definition = definitionBySlug.get(String(imported.slug ?? "").trim());
    if (!definition) {
      issues.push(`Import "${imported.slug}" is missing a registry entry.`);
      continue;
    }
    if (String(definition.source ?? "") !== "imported") {
      issues.push(`Import "${imported.slug}" is linked to a non-imported registry entry.`);
    }
    if (String(definition.importSourceId ?? "") !== String(imported._id)) {
      issues.push(`Import "${imported.slug}" has a mismatched importSourceId on its registry entry.`);
    }
  }

  const importIds = new Set(imports.map((row) => String(row._id)));
  for (const definition of definitions) {
    if (String(definition.source ?? "") !== "imported") continue;
    const sourceId = String(definition.importSourceId ?? "");
    if (!sourceId || !importIds.has(sourceId)) {
      issues.push(`Imported registry entry "${definition.slug}" points to a missing import source.`);
    }
  }

  const validSlugs = new Set([...BUILTIN_SLUGS, ...definitions.filter((row) => !row.isDeleted).map((row) => String(row.slug))]);
  const orphanRequestSlugs = new Set();
  for (const request of requests) {
    const slug = String(request.formSlug ?? "").trim();
    if (slug && !validSlugs.has(slug)) orphanRequestSlugs.add(slug);
  }
  for (const slug of orphanRequestSlugs) {
    issues.push(`Requests still reference unknown form slug "${slug}".`);
  }

  const orphanFlowSlugs = new Set();
  for (const flow of flows) {
    const slug = String(flow.formSlug ?? "").trim();
    if (slug && !validSlugs.has(slug)) orphanFlowSlugs.add(slug);
  }
  for (const slug of orphanFlowSlugs) {
    issues.push(`Notification flow references unknown form slug "${slug}".`);
  }

  if (issues.length === 0) {
    console.log("No importer/registry consistency issues found.");
  } else {
    console.log(`Found ${issues.length} consistency issue(s):`);
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Validation failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
