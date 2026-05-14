"use server";

import { connectMongo } from "@/lib/db/mongo";
import { findActiveDelegation } from "@/lib/approval-delegations";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { sendFlowNotification } from "@/lib/notifications/flow";
import { deriveRequestQueueFields } from "@/lib/request-queue";
import {
  buildStoredRequestAttachmentDetails,
  buildStoredRequestSummaryDetails,
} from "@/lib/request-fields";
import { updateResponseSheetStatusByReference } from "@/lib/response-sheet";
import { buildPendingStepNotificationCopy } from "@/lib/workflow-routing";
import { RequestModel } from "@/models/Request";
const SALARY_LOAN_SHEET_NAME = "Salary Loan Application";

function normalizeKey(input: string) {
  return String(input ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isSalaryLoanRequest(formSlug: string, formName: string, referenceNo: string) {
  const slugKey = normalizeKey(formSlug);
  const nameKey = normalizeKey(formName);
  const refKey = normalizeKey(referenceNo);
  return (
    refKey.startsWith("sla") ||
    slugKey.includes("salaryloan") ||
    nameKey.includes("salaryloan")
  );
}

export type ApprovalDecision = "approve" | "reject" | "return";

function normalizeComment(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export async function applyApprovalDecision({
  referenceNo,
  userEmail,
  userName,
  decision,
  comment,
}: {
  referenceNo: string;
  userEmail: string;
  userName: string;
  decision: ApprovalDecision;
  comment?: string | null;
}) {
  const startedAt = Date.now();
  await connectMongo();

  const normalizedEmail = normalizeEmail(userEmail);
  const normalizedName = String(userName ?? normalizedEmail).trim();
  const normalizedReference = String(referenceNo ?? "").trim();
  const note = normalizeComment(comment);

  const doc = await RequestModel.findOne({ referenceNo: normalizedReference }).lean();
  if (!doc) throw new Error("Request not found");

  const current = doc.approvalChain.find((step) => step.step === doc.currentStep) ?? null;
  if (!current || current.status !== "pending") {
    throw new Error("Nothing to act on.");
  }
  const currentApproverEmail = normalizeEmail(current.approverEmail);
  const activeDelegation =
    currentApproverEmail === normalizedEmail
      ? null
      : await findActiveDelegation({
          delegatorEmail: currentApproverEmail,
          delegateEmail: normalizedEmail,
        });
  if (currentApproverEmail !== normalizedEmail && !activeDelegation) {
    throw new Error("Forbidden: not the current approver.");
  }

  const isApprove = decision === "approve";
  const isReturn = decision === "return";
  if (isReturn && !note) {
    throw new Error("A correction note is required when returning a request.");
  }
  const isFinal = doc.currentStep >= doc.approvalChain.length;
  const nextStep = isFinal ? doc.currentStep : doc.currentStep + 1;

  const approvalChain = doc.approvalChain.map((step) => {
    if (step.step === doc.currentStep) {
      return {
        ...step,
        status: isApprove ? "approved" : isReturn ? "returned" : "rejected",
        actedAt: new Date(),
        comment: note,
      };
    }
    if (isApprove && !isFinal && step.step === nextStep) {
      return {
        ...step,
        status: "pending",
      };
    }
    return step;
  });
  const historyEntry = {
    at: new Date(),
    byEmail: normalizedEmail,
    byName: normalizedName,
    action: isApprove ? "approved" : isReturn ? "returned" : "rejected",
    details: {
      step: doc.currentStep,
      role: current.role,
      comment: note,
      actedForEmail: current.approverEmail !== normalizedEmail ? current.approverEmail : "",
      actedForName: current.approverEmail !== normalizedEmail ? current.approverName || "" : "",
      delegationId: activeDelegation?._id ? String(activeDelegation._id) : "",
    },
  };
  const nextStatus = isApprove ? (isFinal ? "approved" : doc.status) : isReturn ? "returned" : "rejected";
  const nextCurrentStep = isApprove && !isFinal ? nextStep : doc.currentStep;
  const nextHistory = [...(((doc as any).history ?? []) as any[]), historyEntry];
  const queueFields = deriveRequestQueueFields({
    status: nextStatus,
    approvalChain,
    currentStep: nextCurrentStep,
    history: nextHistory,
    createdAt: (doc as any).createdAt,
    updatedAt: historyEntry.at,
    submittedBy: doc.submittedBy,
  });

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        approvalChain,
        currentStep: nextCurrentStep,
        status: nextStatus,
        ...queueFields,
      },
      $push: {
        history: historyEntry,
      },
    },
  );

  // Keep response sheets in sync with approval decisions for all forms that write responses.
  try {
    const formSlug = String(doc.formSlug || doc.formType || "").trim();
    const definition = formSlug ? await getFormDefinitionBySlug(formSlug) : null;
    const writeResponsesToSheet = Boolean(definition?.writeResponsesToSheet);
    const spreadsheetId =
      String((doc as any)?.responseSpreadsheetId ?? "").trim() ||
      String(definition?.responseSpreadsheetId ?? "").trim() ||
      String((doc as any)?.formData?.spreadsheetId ?? "").trim() ||
      String(process.env.GOOGLE_SHEETS_RESPONSES_ID ?? "").trim() ||
      String(process.env.GOOGLE_SHEETS_MASTER_ID ?? "").trim();
    const configuredSheetTitle =
      String((doc as any)?.responseSheetName ?? "").trim() ||
      String(definition?.responseSheetName ?? "").trim();
    const importedFormName = String((doc as any)?.formData?.importedFormName ?? "").trim();
    const forceSalaryLoanSheet = isSalaryLoanRequest(
      String(doc.formSlug || doc.formType || ""),
      String(doc.formName || ""),
      normalizedReference,
    );
    const sheetTitle = forceSalaryLoanSheet
      ? SALARY_LOAN_SHEET_NAME
      : configuredSheetTitle || (importedFormName ? `${importedFormName} Responses` : "");

    const nextSheetStatus = isApprove ? (isFinal ? "approved" : "pending") : isReturn ? "returned" : "rejected";
    if (writeResponsesToSheet && spreadsheetId && sheetTitle) {
      let synced = false;
      let attempts = 0;
      while (!synced && attempts < 3) {
        attempts += 1;
        synced = await updateResponseSheetStatusByReference({
          spreadsheetId,
          sheetTitle,
          referenceNo: normalizedReference,
          status: nextSheetStatus,
        });
        if (!synced) {
          await new Promise((resolve) => setTimeout(resolve, attempts * 150));
        }
      }
      await RequestModel.updateOne(
        { _id: (doc as any)._id },
        {
          $set: {
            sheetStatusSyncedAt: synced ? new Date() : null,
            sheetStatusSyncError: synced ? "" : `Status sync failed after ${attempts} attempts.`,
          },
        },
      );
    }
  } catch (sheetSyncError) {
    console.error("Response sheet status sync failed:", sheetSyncError);
    await RequestModel.updateOne(
      { _id: (doc as any)._id },
      {
        $set: {
          sheetStatusSyncedAt: null,
          sheetStatusSyncError:
            sheetSyncError instanceof Error ? sheetSyncError.message : "Unknown sheet status sync error",
        },
      },
    );
  }

  const formSlug = doc.formSlug || doc.formType;
  const formName = doc.formName || doc.formType;
  const submittedByEmail = doc.submittedBy?.email ?? "";
  const nextApprover = approvalChain.find((step) => step.step === nextStep) ?? null;
  const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const requestUrl = appUrl ? `${appUrl}/requests/${encodeURIComponent(normalizedReference)}` : "";
  const approvalPageUrl = requestUrl ? `${requestUrl}/approve` : "";
  const approvalsUrl = appUrl ? `${appUrl}/approvals` : "";
  const summaryDetails = buildStoredRequestSummaryDetails(String(formSlug || ""), (doc as any).formData ?? {});
  const attachmentDetails = buildStoredRequestAttachmentDetails(String(formSlug || ""), (doc as any).formData ?? {});

  try {
    if (isApprove) {
      if (!isFinal && nextApprover?.approverEmail) {
        const nextStepCopy = buildPendingStepNotificationCopy({
          formName,
          referenceNo: normalizedReference,
          role: nextApprover.role || "",
        });
        await sendFlowNotification({
          formSlug,
          formName,
          event: "next-approver",
          to: normalizeEmail(nextApprover.approverEmail),
          subject: nextStepCopy.subject,
          summary: nextStepCopy.summary,
          details: [
            { label: "Reference No.", value: normalizedReference },
            { label: "Requester", value: doc.submittedBy?.name || doc.submittedBy?.email || "" },
            { label: "Current role", value: nextApprover.role || "" },
            { label: "Status", value: nextStepCopy.statusLabel },
            ...summaryDetails,
            ...attachmentDetails,
          ].filter((detail) => detail.value),
          text: nextStepCopy.text,
          ctaUrl: approvalPageUrl || requestUrl,
          ctaLabel: nextStepCopy.ctaLabel,
          approveUrl: approvalPageUrl ? `${approvalPageUrl}#approve` : requestUrl,
          rejectUrl: approvalPageUrl ? `${approvalPageUrl}#reject` : requestUrl,
          commentUrl: approvalPageUrl ? `${approvalPageUrl}#comment` : requestUrl,
          viewAllUrl: approvalsUrl || requestUrl,
        });
      } else if (submittedByEmail) {
        await sendFlowNotification({
          formSlug,
          formName,
          event: "approved",
          to: submittedByEmail,
          subject: `${formName} request approved (${normalizedReference})`,
          summary: `Your ${formName} request has been fully approved.`,
          details: [
            { label: "Reference No.", value: normalizedReference },
            { label: "Status", value: "Approved" },
            ...summaryDetails,
            ...attachmentDetails,
          ],
          text:
            `Your ${formName} request has been fully approved.\n\n` +
            `Reference: ${normalizedReference}\n` +
            (requestUrl ? `Link: ${requestUrl}\n` : ""),
          ctaUrl: requestUrl,
          ctaLabel: "Open request",
        });
      }
    } else if (isReturn && submittedByEmail) {
      await sendFlowNotification({
        formSlug,
        formName,
        event: "returned",
        to: submittedByEmail,
        subject: `${formName} request returned for correction (${normalizedReference})`,
        summary: `Your ${formName} request was returned for correction.`,
        details: [
          { label: "Reference No.", value: normalizedReference },
          { label: "Status", value: "Returned for correction" },
          { label: "Current role", value: current.role || "" },
          { label: "Correction note", value: note },
          ...summaryDetails,
          ...attachmentDetails,
        ].filter((detail) => detail.value),
        text:
          `Your ${formName} request was returned for correction.\n\n` +
          `Reference: ${normalizedReference}\n` +
          `Correction note: ${note}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
        ctaUrl: requestUrl,
        ctaLabel: "Open request",
      });
    } else if (submittedByEmail) {
      await sendFlowNotification({
        formSlug,
        formName,
        event: "rejected",
        to: submittedByEmail,
        subject: `${formName} request rejected (${normalizedReference})`,
        summary: `Your ${formName} request was rejected.`,
        details: [
          { label: "Reference No.", value: normalizedReference },
          { label: "Status", value: "Rejected" },
          ...(note ? [{ label: "Comment", value: note }] : []),
          ...summaryDetails,
          ...attachmentDetails,
        ],
        text:
          `Your ${formName} request was rejected.\n\n` +
          `Reference: ${normalizedReference}\n` +
          (note ? `Comment: ${note}\n` : "") +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
        ctaUrl: requestUrl,
        ctaLabel: "Open request",
      });
    }
  } catch (error) {
    console.error(`${isApprove ? "Approval" : isReturn ? "Return" : "Rejection"} notification failed:`, error);
  }

  console.log("applyApprovalDecision timing", {
    referenceNo: normalizedReference,
    decision,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    referenceNo: normalizedReference,
    isFinal,
    decision,
  };
}
