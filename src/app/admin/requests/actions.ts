"use server";

import { revalidatePath } from "next/cache";
import { safeAuth } from "@/lib/safe-auth";
import { isAdminUser } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { RequestModel } from "@/models/Request";
import { deriveRequestQueueFields } from "@/lib/request-queue";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function rejectRequestFromQueue(formData: FormData) {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  if (!userEmail || !(await isAdminUser(userEmail))) {
    throw new Error("Forbidden");
  }

  const referenceNo = s(formData, "referenceNo");
  const reason = s(formData, "reason");
  if (!referenceNo) throw new Error("Missing request reference.");

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo }).lean();
  if (!doc) throw new Error("Request not found.");
  if (doc.status === "approved") {
    throw new Error("Approved requests cannot be cancelled from queue.");
  }
  if (doc.status === "rejected") {
    revalidatePath("/admin/requests");
    return;
  }

  const now = new Date();
  const updatedChain = (doc.approvalChain ?? []).map((step) => {
    if (step.status === "pending" || step.status === "waiting") {
      return { ...step, status: "skipped", actedAt: now, comment: reason || "Cancelled by admin queue." };
    }
    return step;
  });
  const historyEntry = {
    at: now,
    byEmail: userEmail,
    byName: session?.user?.name ?? userEmail,
    action: "rejected",
    details: {
      source: "admin-queue",
      reason: reason || "Cancelled by admin queue.",
    },
  };
  const nextHistory = [...(((doc as any).history ?? []) as unknown[]), historyEntry];
  const queueFields = deriveRequestQueueFields({
    status: "rejected",
    approvalChain: updatedChain,
    currentStep: doc.currentStep,
    history: nextHistory as any[],
    createdAt: (doc as any).createdAt,
    updatedAt: now,
    submittedBy: doc.submittedBy,
  });

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        status: "rejected",
        approvalChain: updatedChain,
        ...queueFields,
      },
      $push: { history: historyEntry },
    },
  );

  revalidatePath("/admin/requests");
  revalidatePath("/dashboard");
  revalidatePath(`/requests/${encodeURIComponent(referenceNo)}`);
}

