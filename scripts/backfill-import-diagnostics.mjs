import { createHash } from "node:crypto";
import mongoose from "mongoose";

function matchCount(source, regex) {
  return source.match(regex)?.length ?? 0;
}

function summarize(htmlSource, appsScriptSource) {
  return {
    inputCount: matchCount(htmlSource, /<input\b/gi),
    selectCount: matchCount(htmlSource, /<select\b/gi),
    textareaCount: matchCount(htmlSource, /<textarea\b/gi),
    scriptFunctionCount: matchCount(appsScriptSource, /\bfunction\s+[A-Za-z0-9_]+\s*\(/g),
  };
}

function parseFieldNames(htmlSource) {
  return [...htmlSource.matchAll(/<(?:input|select|textarea)\b[^>]*(?:name|id)=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .map((name) => String(name).trim())
    .filter(Boolean);
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not defined.");

  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  });

  const collection = mongoose.connection.db.collection("formimports");
  const imports = await collection.find({}).toArray();
  let updated = 0;

  for (const imported of imports) {
    const htmlSource = String(imported.htmlSource ?? "");
    const appsScriptSource = String(imported.appsScriptSource ?? "");
    const fieldNames = parseFieldNames(htmlSource);
    const blockers = [];
    if (!htmlSource.trim()) blockers.push("HTML source is required.");
    if (!appsScriptSource.trim()) blockers.push("Apps Script source is required.");
    if (fieldNames.length === 0) blockers.push("No supported fields were detected in the imported HTML.");

    const warnings = Array.isArray(imported?.parseDiagnostics?.warnings)
      ? imported.parseDiagnostics.warnings
      : [];
    const checksum = createHash("sha256")
      .update(`${String(imported.slug ?? "")}\n${htmlSource}\n${appsScriptSource}`)
      .digest("hex");

    await collection.updateOne(
      { _id: imported._id },
      {
        $set: {
          sourceChecksum: checksum,
          sourceVersion: Number(imported.sourceVersion ?? 1) || 1,
          lastParsedAt: imported.lastParsedAt ?? imported.updatedAt ?? imported.createdAt ?? new Date(),
          readinessState: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "needs-review" : "ready",
          parseDiagnostics: {
            parsedTitle: String(imported?.parseDiagnostics?.parsedTitle ?? imported.name ?? ""),
            parsedDescription: String(imported?.parseDiagnostics?.parsedDescription ?? ""),
            parsedFieldCount: fieldNames.length,
            fieldNames,
            missingBindings: Array.isArray(imported?.parseDiagnostics?.missingBindings)
              ? imported.parseDiagnostics.missingBindings
              : [],
            warnings,
            blockers,
            warningCount: warnings.length,
            blockerCount: blockers.length,
          },
          summary: summarize(htmlSource, appsScriptSource),
        },
      },
    );
    updated += 1;
  }

  console.log(`Updated ${updated} import records with diagnostics.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Backfill failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
