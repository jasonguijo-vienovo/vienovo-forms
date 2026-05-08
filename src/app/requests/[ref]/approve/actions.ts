"use server";

import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { setFlashToast } from "@/lib/flash";
import { applyApprovalDecision } from "@/lib/request-approval";

const SALARY_LOAN_SHEET_NAME = "Salary Loan Application";
const EMPLOYEE_INFORMATION_SPREADSHEET_ID = "1-Ml75zLsLUvackWpjnitqcfJwaL1OtBBKyq7PRZ82vM";

function isSalaryLoanRequest(formSlug: string, formName: string, referenceNo: string) {
  const compact = (input: string) => String(input ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    compact(referenceNo).startsWith("sla") ||
    compact(formSlug).includes("salaryloan") ||
    compact(formName).includes("salaryloan")
  );
}

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function approveCurrentStep(referenceNo: string, formData: FormData) {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  const userName = session?.user?.name ?? userEmail ?? "";
  if (!userEmail) redirect("/sign-in");

  const comment = s(formData, "comment");
  const result = await applyApprovalDecision({
    referenceNo,
    userEmail,
    userName,
    decision: "approve",
    comment,
  });
  const nextStatus = isFinal ? "approved" : doc.status;
  const nextCurrentStep = isFinal ? doc.currentStep : nextStep;
  const historyEntry = {
    at: now,
    byEmail: userEmail,
    byName: userName,
    action: "approved",
    details: { step: doc.currentStep, role: current.role, comment },
  };
  const nextHistory = [...(((doc as any).history ?? []) as unknown[]), historyEntry];
  const queueFields = deriveRequestQueueFields({
    status: nextStatus,
    approvalChain: chain,
    currentStep: nextCurrentStep,
    history: nextHistory as any[],
    createdAt: (doc as any).createdAt,
    updatedAt: now,
    submittedBy: doc.submittedBy,
  });

  await setFlashToast({
    tone: "success",
    message: result.isFinal ? `Request approved: ${referenceNo}` : `Approval recorded for ${referenceNo}`,
  });

  redirect(`/requests/${referenceNo}`);
}

export async function rejectCurrentStep(referenceNo: string, formData: FormData) {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  const userName = session?.user?.name ?? userEmail ?? "";
  if (!userEmail) redirect("/sign-in");

  const comment = s(formData, "comment");
  await applyApprovalDecision({
    referenceNo,
    userEmail,
    userName,
    decision: "reject",
    comment,
  });
  const historyEntry = {
    at: now,
    byEmail: userEmail,
    byName: userName,
    action: "rejected",
    details: { step: doc.currentStep, role: current.role, comment },
  };
  const nextHistory = [...(((doc as any).history ?? []) as unknown[]), historyEntry];
  const queueFields = deriveRequestQueueFields({
    status: "rejected",
    approvalChain: chain,
    currentStep: doc.currentStep,
    history: nextHistory as any[],
    createdAt: (doc as any).createdAt,
    updatedAt: now,
    submittedBy: doc.submittedBy,
  });

  await setFlashToast({ tone: "success", message: `Request rejected: ${referenceNo}` });

  redirect(`/requests/${referenceNo}`);
}

