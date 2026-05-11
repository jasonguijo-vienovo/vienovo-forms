"use server";

import { redirect } from "next/navigation";
import { setFlashToast } from "@/lib/flash";
import { connectMongo } from "@/lib/db/mongo";
import { completeAdminJob, failAdminJob, startAdminJob } from "@/lib/admin-jobs";
import { safeAuth } from "@/lib/safe-auth";
import { applyApprovalDecision } from "@/lib/request-approval";
import { ApprovalDelegation } from "@/models/ApprovalDelegation";

function readRequiredReference(formData: FormData) {
  const referenceNo = String(formData.get("referenceNo") ?? "").trim();
  if (!referenceNo) throw new Error("Missing request reference.");
  return referenceNo;
}

function readComment(formData: FormData) {
  return String(formData.get("comment") ?? "").trim();
}

function readSelectedReferences(formData: FormData) {
  return Array.from(
    new Set(
      formData
        .getAll("referenceNo")
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

async function getApproverIdentity() {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  const userName = session?.user?.name ?? userEmail ?? "";
  if (!userEmail) redirect("/sign-in?callbackUrl=/approvals");
  return { userEmail, userName };
}

async function handleSingleDecision(formData: FormData, decision: "approve" | "reject" | "return") {
  const { userEmail, userName } = await getApproverIdentity();
  const referenceNo = readRequiredReference(formData);
  const comment = readComment(formData);
  if (decision === "return" && !comment) {
    await setFlashToast({
      tone: "error",
      message: "Add a correction note before returning a request.",
    });
    redirect("/approvals");
  }

  await applyApprovalDecision({
    referenceNo,
    userEmail,
    userName,
    decision,
    comment,
  });

  await setFlashToast({
    tone: "success",
    message: `${decision === "approve" ? "Approved" : decision === "return" ? "Returned for correction" : "Rejected"} ${referenceNo}.`,
  });

  redirect("/approvals");
}

async function handleBulkDecision(formData: FormData, decision: "approve" | "reject" | "return") {
  const { userEmail, userName } = await getApproverIdentity();
  const references = readSelectedReferences(formData);
  const comment = readComment(formData);

  if (references.length === 0) {
    await setFlashToast({
      tone: "error",
      message: "Select at least one request first.",
    });
    redirect("/approvals");
  }
  if (decision === "return" && !comment) {
    await setFlashToast({
      tone: "error",
      message: "Add a shared correction note before returning selected requests.",
    });
    redirect("/approvals");
  }

  const successes: string[] = [];
  const failures: Array<{ referenceNo: string; error: string }> = [];
  await connectMongo();
  const job = await startAdminJob({
    type: "bulk-approval",
    actorEmail: userEmail,
    targetType: "approval-queue",
    targetId: decision,
    summary: `Bulk ${decision} started for ${references.length} request(s).`,
    metadata: { references, decision },
  });

  for (const referenceNo of references) {
    try {
      await applyApprovalDecision({
        referenceNo,
        userEmail,
        userName,
        decision,
        comment,
      });
      successes.push(referenceNo);
    } catch (error) {
      failures.push({
        referenceNo,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (successes.length > 0) {
    await completeAdminJob(String(job._id), {
      summary: `Bulk ${decision} completed for ${successes.length} request(s).`,
      metadata: { references, successes, failures, decision },
    });
  } else {
    await failAdminJob(String(job._id), {
      summary: `Bulk ${decision} failed.`,
      errorMessage: failures[0]?.error || "No requests could be processed.",
      metadata: { references, failures, decision },
    });
  }

  if (successes.length > 0) {
    await setFlashToast({
      tone: "success",
      message:
        failures.length > 0
          ? `${decision === "approve" ? "Approved" : decision === "return" ? "Returned" : "Rejected"} ${successes.length} request(s). ${failures.length} skipped.`
          : `${decision === "approve" ? "Approved" : decision === "return" ? "Returned" : "Rejected"} ${successes.length} request(s).`,
    });
  } else {
    await setFlashToast({
      tone: "error",
      message: failures[0]?.error || "No requests could be processed.",
    });
  }

  redirect("/approvals");
}

export async function approveFromQueue(formData: FormData) {
  await handleSingleDecision(formData, "approve");
}

export async function rejectFromQueue(formData: FormData) {
  await handleSingleDecision(formData, "reject");
}

export async function returnFromQueue(formData: FormData) {
  await handleSingleDecision(formData, "return");
}

export async function bulkApproveFromQueue(formData: FormData) {
  await handleBulkDecision(formData, "approve");
}

export async function bulkRejectFromQueue(formData: FormData) {
  await handleBulkDecision(formData, "reject");
}

export async function bulkReturnFromQueue(formData: FormData) {
  await handleBulkDecision(formData, "return");
}

export async function createApprovalDelegation(formData: FormData) {
  const { userEmail, userName } = await getApproverIdentity();
  const delegateEmail = String(formData.get("delegateEmail") ?? "").trim().toLowerCase();
  const delegateName = String(formData.get("delegateName") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();

  if (!delegateEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(delegateEmail)) {
    await setFlashToast({ tone: "error", message: "Enter a valid delegate email." });
    redirect("/approvals");
  }
  if (delegateEmail === userEmail) {
    await setFlashToast({ tone: "error", message: "Choose someone else as your delegate." });
    redirect("/approvals");
  }

  const endsAt = endsAtRaw ? new Date(`${endsAtRaw}T23:59:59.999Z`) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    await setFlashToast({ tone: "error", message: "Delegation end date is invalid." });
    redirect("/approvals");
  }

  await connectMongo();
  await ApprovalDelegation.updateMany(
    { delegatorEmail: userEmail, isActive: true },
    { $set: { isActive: false, revokedAt: new Date(), revokedByEmail: userEmail } },
  );
  await ApprovalDelegation.create({
    delegatorEmail: userEmail,
    delegatorName: userName,
    delegateEmail,
    delegateName,
    reason,
    startsAt: new Date(),
    endsAt,
    isActive: true,
    createdByEmail: userEmail,
  });

  await setFlashToast({ tone: "success", message: `Approval delegation set for ${delegateEmail}.` });
  redirect("/approvals");
}

export async function revokeApprovalDelegation(formData: FormData) {
  const { userEmail } = await getApproverIdentity();
  const id = String(formData.get("id") ?? "").trim();
  await connectMongo();

  await ApprovalDelegation.updateOne(
    { _id: id, delegatorEmail: userEmail, isActive: true },
    {
      $set: {
        isActive: false,
        revokedAt: new Date(),
        revokedByEmail: userEmail,
      },
    },
  );
  await setFlashToast({ tone: "success", message: "Approval delegation revoked." });
  redirect("/approvals");
}
