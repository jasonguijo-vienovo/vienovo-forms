"use server";

import { redirect } from "next/navigation";
import { setFlashToast } from "@/lib/flash";
import { safeAuth } from "@/lib/safe-auth";
import { applyApprovalDecision } from "@/lib/request-approval";

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

async function handleSingleDecision(formData: FormData, decision: "approve" | "reject") {
  const { userEmail, userName } = await getApproverIdentity();
  const referenceNo = readRequiredReference(formData);
  const comment = readComment(formData);

  await applyApprovalDecision({
    referenceNo,
    userEmail,
    userName,
    decision,
    comment,
  });

  await setFlashToast({
    tone: "success",
    message: `${decision === "approve" ? "Approved" : "Rejected"} ${referenceNo}.`,
  });

  redirect("/approvals");
}

async function handleBulkDecision(formData: FormData, decision: "approve" | "reject") {
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

  const successes: string[] = [];
  const failures: Array<{ referenceNo: string; error: string }> = [];

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
    await setFlashToast({
      tone: "success",
      message:
        failures.length > 0
          ? `${decision === "approve" ? "Approved" : "Rejected"} ${successes.length} request(s). ${failures.length} skipped.`
          : `${decision === "approve" ? "Approved" : "Rejected"} ${successes.length} request(s).`,
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

export async function bulkApproveFromQueue(formData: FormData) {
  await handleBulkDecision(formData, "approve");
}

export async function bulkRejectFromQueue(formData: FormData) {
  await handleBulkDecision(formData, "reject");
}
