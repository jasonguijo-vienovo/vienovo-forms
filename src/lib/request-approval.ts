"use server";

import { connectMongo } from "@/lib/db/mongo";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { sendFlowNotification } from "@/lib/notifications/flow";
import { updateResponseSheetStatusByReference } from "@/lib/response-sheet";
import { RequestModel } from "@/models/Request";

export type ApprovalDecision = "approve" | "reject";

function normalizeComment(value: string | null | undefined) {
  return String(value ?? "").trim();
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
  await connectMongo();

  const normalizedEmail = String(userEmail).trim().toLowerCase();
  const normalizedName = String(userName ?? normalizedEmail).trim();
  const normalizedReference = String(referenceNo ?? "").trim();
  const note = normalizeComment(comment);

  const doc = await RequestModel.findOne({ referenceNo: normalizedReference }).lean();
  if (!doc) throw new Error("Request not found");

  const current = doc.approvalChain.find((step) => step.step === doc.currentStep) ?? null;
  if (!current || current.status !== "pending") {
    throw new Error("Nothing to act on.");
  }
  if (current.approverEmail !== normalizedEmail) {
    throw new Error("Forbidden: not the current approver.");
  }

  const isApprove = decision === "approve";
  const isFinal = doc.currentStep >= doc.approvalChain.length;
  const nextStep = isFinal ? doc.currentStep : doc.currentStep + 1;

  const approvalChain = doc.approvalChain.map((step) => {
    if (step.step === doc.currentStep) {
      return {
        ...step,
        status: isApprove ? "approved" : "rejected",
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

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        approvalChain,
        ...(isApprove
          ? {
              currentStep: isFinal ? doc.currentStep : nextStep,
              status: isFinal ? "approved" : doc.status,
            }
          : {
              status: "rejected",
            }),
      },
      $push: {
        history: {
          at: new Date(),
          byEmail: normalizedEmail,
          byName: normalizedName,
          action: isApprove ? "approved" : "rejected",
          details: {
            step: doc.currentStep,
            role: current.role,
            comment: note,
          },
        },
      },
    },
  );

  // Keep response sheets in sync with approval decisions for all forms that write responses.
  try {
    const formSlug = String(doc.formSlug || doc.formType || "").trim();
    const definition = formSlug ? await getFormDefinitionBySlug(formSlug) : null;
    const writeResponsesToSheet = Boolean(definition?.writeResponsesToSheet);
    const spreadsheetId =
      String(definition?.responseSpreadsheetId ?? "").trim() ||
      String((doc as any)?.formData?.spreadsheetId ?? "").trim() ||
      String(process.env.GOOGLE_SHEETS_RESPONSES_ID ?? "").trim() ||
      String(process.env.GOOGLE_SHEETS_MASTER_ID ?? "").trim();
    const configuredSheetTitle = String(definition?.responseSheetName ?? "").trim();
    const importedFormName = String((doc as any)?.formData?.importedFormName ?? "").trim();
    const sheetTitle = configuredSheetTitle || (importedFormName ? `${importedFormName} Responses` : "");

    const nextSheetStatus = isApprove ? (isFinal ? "approved" : "pending") : "rejected";
    if (writeResponsesToSheet && spreadsheetId && sheetTitle) {
      await updateResponseSheetStatusByReference({
        spreadsheetId,
        sheetTitle,
        referenceNo: normalizedReference,
        status: nextSheetStatus,
      });
    }
  } catch (sheetSyncError) {
    console.error("Response sheet status sync failed:", sheetSyncError);
  }

  const formSlug = doc.formSlug || doc.formType;
  const formName = doc.formName || doc.formType;
  const submittedByEmail = doc.submittedBy?.email ?? "";
  const nextApprover = approvalChain.find((step) => step.step === nextStep) ?? null;
  const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const requestUrl = appUrl ? `${appUrl}/requests/${encodeURIComponent(normalizedReference)}` : "";
  const approvalsUrl = appUrl ? `${appUrl}/approvals` : "";

  try {
    if (isApprove) {
      if (!isFinal && nextApprover?.approverEmail) {
        await sendFlowNotification({
          formSlug,
          formName,
          event: "next-approver",
          to: nextApprover.approverEmail,
          subject: `${formName} request needs your approval (${normalizedReference})`,
          text:
            `${formName} request ${normalizedReference} moved to your approval step.\n\n`,
          ctaUrl: approvalsUrl || requestUrl,
          ctaLabel: "Review / Approve Request",
        });
      } else if (submittedByEmail) {
        await sendFlowNotification({
          formSlug,
          formName,
          event: "approved",
          to: submittedByEmail,
          subject: `${formName} request approved (${normalizedReference})`,
          text:
            `Your ${formName} request has been fully approved.\n\n` +
            `Reference: ${normalizedReference}\n` +
            (requestUrl ? `Link: ${requestUrl}\n` : ""),
        });
      }
    } else if (submittedByEmail) {
      await sendFlowNotification({
        formSlug,
        formName,
        event: "rejected",
        to: submittedByEmail,
        subject: `${formName} request rejected (${normalizedReference})`,
        text:
          `Your ${formName} request was rejected.\n\n` +
          `Reference: ${normalizedReference}\n` +
          (note ? `Comment: ${note}\n` : "") +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
      });
    }
  } catch (error) {
    console.error(`${isApprove ? "Approval" : "Rejection"} notification failed:`, error);
  }

  return {
    referenceNo: normalizedReference,
    isFinal,
    decision,
  };
}
