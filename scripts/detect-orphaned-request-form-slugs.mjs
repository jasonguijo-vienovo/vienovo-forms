import mongoose from "mongoose";

const BUILTIN_SLUGS = new Set([
  "travel-booking",
  "cash-advance",
  "reimbursement",
  "request-for-payment",
  "cashiering",
  "leave-request",
]);

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not defined.");

  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  });

  const db = mongoose.connection.db;
  const [definitions, requests] = await Promise.all([
    db.collection("formdefinitions").find({ isDeleted: { $ne: true } }, { projection: { slug: 1 } }).toArray(),
    db.collection("requests").find({}, { projection: { formSlug: 1 } }).toArray(),
  ]);

  const validSlugs = new Set([...BUILTIN_SLUGS, ...definitions.map((row) => String(row.slug ?? "").trim())]);
  const counts = new Map();
  for (const request of requests) {
    const slug = String(request.formSlug ?? "").trim();
    if (!slug || validSlugs.has(slug)) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  if (counts.size === 0) {
    console.log("No orphaned request form slugs found.");
  } else {
    console.log("Orphaned request form slugs:");
    for (const [slug, count] of counts.entries()) {
      console.log(`- ${slug}: ${count} request(s)`);
    }
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Detection failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
