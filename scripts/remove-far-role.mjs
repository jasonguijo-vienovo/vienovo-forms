import mongoose from "mongoose";

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not defined.");

  await mongoose.connect(mongoUri, { bufferCommands: false, serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const res = await db.collection("approvers").updateMany(
    { roles: "far" },
    { $pull: { roles: "far" } },
  );
  console.log(JSON.stringify({ matched: res.matchedCount ?? 0, modified: res.modifiedCount ?? 0 }));
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
