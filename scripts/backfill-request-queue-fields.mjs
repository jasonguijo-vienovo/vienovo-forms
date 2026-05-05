import mongoose from "mongoose";

function getCurrentApprovalStep(approvalChain = [], currentStep = 0) {
  return approvalChain.find((step) => Number(step?.step ?? 0) === Number(currentStep ?? 0)) ?? null;
}

function latestHistoryEntry(history = []) {
  if (!Array.isArray(history) || history.length === 0) return null;

  let latest = history[0] ?? null;
  for (const item of history) {
    if (!latest) {
      latest = item;
      continue;
    }

    const latestAt = latest?.at ? new Date(latest.at).getTime() : 0;
    const itemAt = item?.at ? new Date(item.at).getTime() : 0;
    if (itemAt >= latestAt) latest = item;
  }

  return latest;
}

function deriveQueueFields(request) {
  const status = String(request?.status ?? "unknown");
  const current = status === "pending" ? getCurrentApprovalStep(request?.approvalChain ?? [], request?.currentStep ?? 0) : null;
  const latest = latestHistoryEntry(request?.history ?? []);
  const fallbackActor =
    String(request?.submittedBy?.name ?? "").trim() ||
    String(request?.submittedBy?.email ?? "").trim().toLowerCase() ||
    "";

  let queueBucket = "unknown";
  if (status === "pending") {
    queueBucket = current?.role === "processor" ? "needs-processor" : "pending-approval";
  } else if (status === "submitted") {
    queueBucket = "submitted";
  } else if (status === "returned") {
    queueBucket = "returned";
  } else if (status === "approved") {
    queueBucket = "approved";
  } else if (status === "rejected") {
    queueBucket = "rejected";
  }

  const lastActionAt = latest?.at
    ? new Date(latest.at)
    : request?.updatedAt
      ? new Date(request.updatedAt)
      : request?.createdAt
        ? new Date(request.createdAt)
        : new Date();

  return {
    currentActorEmail: String(current?.approverEmail ?? "").trim().toLowerCase(),
    currentActorName: String(current?.approverName ?? "").trim(),
    currentRole: String(current?.role ?? "").trim(),
    queueBucket,
    lastActionAt,
    lastActionBy:
      String(latest?.byName ?? "").trim() ||
      String(latest?.byEmail ?? "").trim().toLowerCase() ||
      fallbackActor,
  };
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

  const collection = mongoose.connection.db.collection("requests");
  const cursor = collection.find(
    {},
    {
      projection: {
        status: 1,
        approvalChain: 1,
        currentStep: 1,
        history: 1,
        createdAt: 1,
        updatedAt: 1,
        submittedBy: 1,
      },
    },
  );

  let scanned = 0;
  let updated = 0;
  const operations = [];

  while (await cursor.hasNext()) {
    const request = await cursor.next();
    if (!request) continue;
    scanned += 1;

    operations.push({
      updateOne: {
        filter: { _id: request._id },
        update: {
          $set: deriveQueueFields(request),
        },
      },
    });

    if (operations.length >= 200) {
      const result = await collection.bulkWrite(operations, { ordered: false });
      updated += result.modifiedCount;
      operations.length = 0;
    }
  }

  if (operations.length > 0) {
    const result = await collection.bulkWrite(operations, { ordered: false });
    updated += result.modifiedCount;
  }

  console.log(`Scanned ${scanned} requests.`);
  console.log(`Updated ${updated} requests with queue fields.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Backfill failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
