import mongoose from "mongoose";

const DEFAULT_RESPONSE_SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() || process.env.GOOGLE_SHEETS_MASTER_ID?.trim() || "";

function useApplyMode() {
  return process.argv.includes("--apply");
}

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
  const imports = await db.collection("formimports").find({}).toArray();
  const definitions = await db.collection("formdefinitions").find({}).toArray();
  const apply = useApplyMode();
  const definitionBySlug = new Map(definitions.map((row) => [String(row.slug ?? "").trim(), row]));

  let created = 0;
  let updated = 0;

  for (const imported of imports) {
    const slug = String(imported.slug ?? "").trim();
    if (!slug) continue;

    const nextDefinition = {
      slug,
      name: String(imported.name ?? "").trim() || slug,
      routePath: `/forms/${slug}`,
      source: "imported",
      importSourceId: imported._id,
      notes: String(imported.notes ?? ""),
      writeResponsesToSheet: Boolean(imported.writeResponsesToSheet),
      responseSpreadsheetId: DEFAULT_RESPONSE_SPREADSHEET_ID || String(imported.spreadsheetId ?? ""),
      responseSheetName:
        String(imported.responseSheetName ?? "").trim() || `${String(imported.name ?? slug)} Responses`,
    };

    const existing = definitionBySlug.get(slug);
    if (!existing) {
      created += 1;
      console.log(`[create] ${slug}`);
      if (apply) {
        await db.collection("formdefinitions").updateOne(
          { slug },
          {
            $set: nextDefinition,
            $setOnInsert: {
              description: "Imported legacy form draft. Review and implement before publishing.",
              status: "draft",
              visibility: "admin",
              availability: "coming-soon",
              isImplemented: false,
              showInNavbar: false,
              sortOrder: 1000,
            },
          },
          { upsert: true },
        );
      }
      continue;
    }

    const needsUpdate =
      String(existing.source ?? "") !== "imported" ||
      String(existing.importSourceId ?? "") !== String(imported._id) ||
      String(existing.routePath ?? "") !== `/forms/${slug}`;

    if (!needsUpdate) continue;

    updated += 1;
    console.log(`[update] ${slug}`);
    if (apply) {
      await db.collection("formdefinitions").updateOne(
        { _id: existing._id },
        {
          $set: {
            source: "imported",
            importSourceId: imported._id,
            routePath: `/forms/${slug}`,
          },
        },
      );
    }
  }

  console.log(apply ? "Repair applied." : "Dry run only. Re-run with --apply to write changes.");
  console.log(`Missing entries to create: ${created}`);
  console.log(`Existing entries to repair: ${updated}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Repair failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
