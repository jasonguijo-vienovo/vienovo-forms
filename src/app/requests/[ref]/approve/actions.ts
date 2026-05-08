"use server";

import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { sendFlowNotification } from "@/lib/notifications/flow";
import { deriveRequestQueueFields } from "@/lib/request-queue";
import { updateResponseSheetStatusByReference } from "@/lib/response-sheet";
import { syncRequestMirror } from "@/lib/request-mirror";
import { RequestModel } from "@/models/Request";

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

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo }).lean();
  if (!doc) throw new Error("Request not found");

  const current = doc.approvalChain.find((a) => a.step === doc.currentStep) ?? null;
  if (!current || current.status !== "pending") throw new Error("Nothing to approve.");
  if (current.approverEmail !== userEmail) throw new Error("Forbidden: not the current approver.");

  const comment = s(formData, "comment");
  const now = new Date();

  const isFinal = doc.currentStep >= doc.approvalChain.length;
  const nextStep = isFinal ? doc.currentStep : doc.currentStep + 1;

  const chain = doc.approvalChain.map((a) => {
    if (a.step === doc.currentStep) {
      return { ...a, status: "approved", actedAt: now, comment };
    }
    if (!isFinal && a.step === nextStep) {
      return { ...a, status: "pending" };
    }
    return a;
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

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        approvalChain: chain,
        currentStep: nextCurrentStep,
        status: nextStatus,
        ...queueFields,
      },
      $push: {
        history: historyEntry,
      },
    }
  );

  const formSlug = doc.formSlug || doc.formType;
  const formName = doc.formName || doc.formType;
  const submittedByEmail = doc.submittedBy?.email ?? "";
  if (isSalaryLoanRequest(formSlug, formName, referenceNo)) {
    try {
      await updateResponseSheetStatusByReference({
        spreadsheetId: EMPLOYEE_INFORMATION_SPREADSHEET_ID,
        sheetTitle: SALARY_LOAN_SHEET_NAME,
        referenceNo,
        status: nextStatus === "approved" ? "approved" : "pending",
      });
    } catch (error) {
      console.error("Failed to sync salary loan status to sheet:", error);
    }
  }

  await syncRequestMirror({
    requestId: String((doc as any)._id),
    referenceNo,
    formSlug,
    formName,
    submittedBy: {
      email: submittedByEmail,
      name: doc.submittedBy?.name ?? "",
    },
    formData: (doc as any).formData ?? {},
    approvalChain: chain,
    currentStep: nextCurrentStep,
    status: nextStatus,
    history: nextHistory,
    createdAt: (doc as any).createdAt,
    updatedAt: now,
  });
  const nextApprover = chain.find((step) => step.step === nextStep) ?? null;
  const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";

  await setFlashToast({
    tone: "success",
    message: isFinal ? `Request approved: ${referenceNo}` : `Approval recorded for ${referenceNo}`,
  });

  try {
    if (!isFinal && nextApprover?.approverEmail) {
      await sendFlowNotification({
        formSlug,
        formName,
        event: "next-approver",
        to: nextApprover.approverEmail,
        subject: `${formName} request needs your approval (${referenceNo})`,
        text:
          `${formName} request ${referenceNo} moved to your approval step.\n\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
      });
    } else if (submittedByEmail) {
      await sendFlowNotification({
        formSlug,
        formName,
        event: "approved",
        to: submittedByEmail,
        subject: `${formName} request approved (${referenceNo})`,
        text:
          `Your ${formName} request has been fully approved.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
      });
    }
  } catch (error) {
    console.error("Approval notification failed:", error);
  }

  redirect(`/requests/${referenceNo}`);
}

export async function rejectCurrentStep(referenceNo: string, formData: FormData) {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  const userName = session?.user?.name ?? userEmail ?? "";
  if (!userEmail) redirect("/sign-in");

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo }).lean();
  if (!doc) throw new Error("Request not found");

  const current = doc.approvalChain.find((a) => a.step === doc.currentStep) ?? null;
  if (!current || current.status !== "pending") throw new Error("Nothing to reject.");
  if (current.approverEmail !== userEmail) throw new Error("Forbidden: not the current approver.");

  const comment = s(formData, "comment");
  const now = new Date();

  const chain = doc.approvalChain.map((a) => {
    if (a.step === doc.currentStep) {
      return { ...a, status: "rejected", actedAt: now, comment };
    }
    return a;
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

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        approvalChain: chain,
        status: "rejected",
        ...queueFields,
      },
      $push: {
        history: historyEntry,
      },
    }
  );

  const formSlug = doc.formSlug || doc.formType;
  const formName = doc.formName || doc.formType;
  const submittedByEmail = doc.submittedBy?.email ?? "";
  if (isSalaryLoanRequest(formSlug, formName, referenceNo)) {
    try {
      await updateResponseSheetStatusByReference({
        spreadsheetId: EMPLOYEE_INFORMATION_SPREADSHEET_ID,
        sheetTitle: SALARY_LOAN_SHEET_NAME,
        referenceNo,
        status: "rejected",
      });
    } catch (error) {
      console.error("Failed to sync salary loan rejection to sheet:", error);
    }
  }

  await syncRequestMirror({
    requestId: String((doc as any)._id),
    referenceNo,
    formSlug,
    formName,
    submittedBy: {
      email: submittedByEmail,
      name: doc.submittedBy?.name ?? "",
    },
    formData: (doc as any).formData ?? {},
    approvalChain: chain,
    currentStep: doc.currentStep,
    status: "rejected",
    history: nextHistory,
    createdAt: (doc as any).createdAt,
    updatedAt: now,
  });
  const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";

  await setFlashToast({ tone: "success", message: `Request rejected: ${referenceNo}` });

  try {
    if (submittedByEmail) {
      await sendFlowNotification({
        formSlug,
        formName,
        event: "rejected",
        to: submittedByEmail,
        subject: `${formName} request rejected (${referenceNo})`,
        text:
          `Your ${formName} request was rejected.\n\n` +
          `Reference: ${referenceNo}\n` +
          (comment ? `Comment: ${comment}\n` : "") +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
      });
    }
  } catch (error) {
    console.error("Rejection notification failed:", error);
  }

  redirect(`/requests/${referenceNo}`);
}

