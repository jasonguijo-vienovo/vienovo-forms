import mongoose from "mongoose";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not defined.");
  await mongoose.connect(mongoUri, { bufferCommands: false, serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;

  const approvers = await db.collection("approvers").find({
    $or: [
      { emailNeedsReview: true },
      { email: "" },
      { email: { $not: emailRegex } },
    ],
  }).toArray();

  let recovered = 0;
  for (const a of approvers) {
    const currentEmail = String(a.email || "").trim().toLowerCase();
    const employeeId = String(a.employeeId || "").trim();
    const name = String(a.name || "").trim();

    let employee = null;
    if (currentEmail) {
      employee = await db.collection("employees").findOne({ email: currentEmail }, { projection: { email: 1, employeeId: 1 } });
    }
    if (!employee && employeeId) {
      employee = await db.collection("employees").findOne({ employeeId }, { projection: { email: 1, employeeId: 1 } });
    }
    if (!employee && name) {
      employee = await db.collection("employees").findOne({ fullName: { $regex: `^${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, $options: "i" } }, { projection: { email: 1, employeeId: 1 } });
    }
    if (!employee?.email) continue;

    const recoveredEmail = String(employee.email).trim().toLowerCase();
    if (!recoveredEmail || !emailRegex.test(recoveredEmail)) continue;

    const changed = recoveredEmail !== currentEmail || a.emailNeedsReview || !a.employeeId;
    if (!changed) continue;

    await db.collection("approvers").updateOne(
      { _id: a._id },
      {
        $set: {
          email: recoveredEmail,
          employeeId: String(employee.employeeId || a.employeeId || "").trim(),
          emailNeedsReview: false,
        },
      },
    );
    recovered += 1;
  }

  const remaining = await db.collection("approvers").countDocuments({
    $or: [
      { emailNeedsReview: true },
      { email: "" },
      { email: { $not: emailRegex } },
    ],
  });

  console.log(JSON.stringify({ scanned: approvers.length, recovered, remaining }));
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
