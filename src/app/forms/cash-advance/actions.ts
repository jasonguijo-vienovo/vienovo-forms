"use server";

import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import {
  errorMessage,
  fail,
  okRedirect,
  type FormActionResult,
} from "@/lib/forms/action-result";
import { sendFlowNotification } from "@/lib/notifications/flow";
import { deriveRequestQueueFields } from "@/lib/request-queue";
import { generateReferenceNo } from "@/lib/reference-number";
import { syncRequestMirror } from "@/lib/request-mirror";
import { appendResponseSheetRow, buildResponseSheetRows } from "@/lib/response-sheet";
import { uploadAttachment } from "@/lib/storage/attachments";
import { Approver } from "@/models/Approver";
import { RequestModel } from "@/models/Request";
import { cashAdvanceFieldMap, diffFields } from "@/lib/request-fields";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bool(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

export async function submitCashAdvance(
  formData: FormData,
): Promise<FormActionResult> {
  try {
    const session = await auth();
    const submitterEmail = session?.user?.email?.toLowerCase();
    const submitterName = session?.user?.name ?? submitterEmail ?? "";
    if (!submitterEmail) throw new Error("Not signed in");

    await connectMongo();

    const approverId = s(formData, "approverId");
    const [approver, processor] = await Promise.all([
      approverId ? Approver.findById(approverId).lean() : null,
      Approver.findOne({ roles: "processor", isActive: true }).lean(),
    ]);

    if (!approver) throw new Error("Invalid Approver");
    if (!processor) throw new Error("No active processor configured. Ask an admin to assign one.");

    const referenceNo = await generateReferenceNo("cash-advance");

    const supportingFile = formData.get("supportingDocument");
    let supportingDocument: null | {
      fileName: string;
      mimeType: string;
      size: number;
      driveFileId: string;
      driveWebViewLink?: string;
      driveWebContentLink?: string;
    } = null;

    if (supportingFile instanceof File && supportingFile.size > 0) {
      const maxBytes = 10 * 1024 * 1024;
      if (supportingFile.size > maxBytes) throw new Error("Supporting document must be 10 MB or less.");
      const bytes = Buffer.from(await supportingFile.arrayBuffer());
      const uploaded = await uploadAttachment({
        folder: "cash-advance",
        fileName: `${referenceNo}_${supportingFile.name}`,
        mimeType: supportingFile.type || "application/octet-stream",
        bytes,
      });
      supportingDocument = {
        fileName: supportingFile.name,
        mimeType: supportingFile.type || "application/octet-stream",
        size: supportingFile.size,
        driveFileId: uploaded.id,
        driveWebViewLink: uploaded.webViewLink,
        driveWebContentLink: uploaded.webContentLink,
      };
    }

    const amountStr = s(formData, "amount");
    const amount = Number(amountStr.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid Amount");
    if (!bool(formData, "agreeAuthorization")) {
      throw new Error("You must agree to the Cash Advance Authorization Agreement.");
    }

    const formDataObj = {
      firstName: s(formData, "firstName"),
      lastName: s(formData, "lastName"),
      payablesTo: s(formData, "payablesTo"),
      payeeName: s(formData, "payeeName"),
      amount,
      reason: s(formData, "reason"),
      forApprovalNote: s(formData, "forApprovalNote"),
      agreedToAuthorization: true,
      supportingFileName: s(formData, "supportingFileName"),
      supportingDocument,
      dateOfRequest: new Date(),
    };

    const approvalChain = [
      {
        step: 1,
        role: "cashAdvanceApprover",
        approverEmail: approver.email,
        approverName: approver.name,
        status: "pending",
      },
      {
        step: 2,
        role: "processor",
        approverEmail: processor.email,
        approverName: processor.name,
        status: "waiting",
      },
    ];
    const history = [
      {
        at: new Date(),
        byEmail: submitterEmail,
        byName: submitterName,
        action: "submitted",
        details: {},
      },
    ];
    const queueFields = deriveRequestQueueFields({
      status: "pending",
      approvalChain,
      currentStep: 1,
      history,
      submittedBy: {
        email: submitterEmail,
        name: submitterName,
      },
    });

    const createdRequest = await RequestModel.create({
      formType: "cash-advance",
      formSlug: "cash-advance",
      formName: "Cash Advance",
      referenceNo,
      submittedBy: {
        email: submitterEmail,
        name: submitterName,
      },
      formData: formDataObj,
      approvalChain,
      currentStep: 1,
      status: "pending",
      history,
      ...queueFields,
    });

    await syncRequestMirror({
      requestId: String(createdRequest._id),
      referenceNo,
      formSlug: "cash-advance",
      formName: "Cash Advance",
      submittedBy: {
        email: submitterEmail,
        name: submitterName,
      },
      formData: formDataObj,
      approvalChain: createdRequest.approvalChain,
      currentStep: createdRequest.currentStep,
      status: createdRequest.status,
      history: createdRequest.history,
      createdAt: createdRequest.createdAt,
      updatedAt: createdRequest.updatedAt,
    });

    try {
      const definition = await getFormDefinitionBySlug("cash-advance");
      const spreadsheetId =
        definition?.responseSpreadsheetId?.trim() ||
        process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() ||
        process.env.GOOGLE_SHEETS_MASTER_ID?.trim() ||
        "";
      const sheetTitle = definition?.responseSheetName?.trim() || "Cash Advance Responses";
      if (definition?.writeResponsesToSheet && spreadsheetId) {
        await appendResponseSheetRow({
          spreadsheetId,
          sheetTitle,
          rowValues: buildResponseSheetRows({
            referenceNo,
            formSlug: "cash-advance",
            formName: "Cash Advance",
            submittedByEmail: submitterEmail,
            submittedByName: submitterName,
            values: formDataObj,
          }),
        });
      }
    } catch (error) {
      console.error("Cash Advance response export failed:", error);
    }

    const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
    const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";
    await setFlashToast({ tone: "success", message: `Cash Advance submitted: ${referenceNo}` });

    try {
      await sendFlowNotification({
        formSlug: "cash-advance",
        formName: "Cash Advance",
        event: "submitted",
        to: [approver.email, processor.email, submitterEmail],
        subject: `Cash Advance request submitted (${referenceNo})`,
        text:
          `A Cash Advance request has been submitted.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
      });
    } catch (e) {
      console.error("Email notification failed:", e);
    }

    return okRedirect(`/requests/${referenceNo}`);
  } catch (error) {
    return fail(errorMessage(error, "Could not submit this Cash Advance request."));
  }
}

export async function updateCashAdvance(
  referenceNo: string,
  formData: FormData,
): Promise<FormActionResult> {
  try {
    const session = await auth();
    const submitterEmail = session?.user?.email?.toLowerCase();
    const submitterName = session?.user?.name ?? submitterEmail ?? "";
    if (!submitterEmail) throw new Error("Not signed in");

    await connectMongo();

    const doc = await RequestModel.findOne({
      referenceNo,
      formType: "cash-advance",
      "submittedBy.email": submitterEmail,
    }).lean();
    if (!doc) throw new Error("Request not found or not editable.");

    const approverId = s(formData, "approverId");
    const [approver, fallbackProcessor] = await Promise.all([
      approverId ? Approver.findById(approverId).lean() : null,
      Approver.findOne({ roles: "processor", isActive: true }).lean(),
    ]);
    if (!approver) throw new Error("Invalid Approver");

    const existingProcessorEmail =
      doc.approvalChain?.find((s) => s.role === "processor")?.approverEmail ?? "";
    const processor =
      (existingProcessorEmail
        ? await Approver.findOne({ email: existingProcessorEmail }).lean()
        : null) ?? fallbackProcessor;
    if (!processor) throw new Error("No active processor configured. Ask an admin to assign one.");

    const supportingFile = formData.get("supportingDocument");
    let supportingDocument: any = (doc as any).formData?.supportingDocument ?? null;

    if (supportingFile instanceof File && supportingFile.size > 0) {
      const maxBytes = 10 * 1024 * 1024;
      if (supportingFile.size > maxBytes) throw new Error("Supporting document must be 10 MB or less.");
      const bytes = Buffer.from(await supportingFile.arrayBuffer());
      const uploaded = await uploadAttachment({
        folder: "cash-advance",
        fileName: `${referenceNo}_${supportingFile.name}`,
        mimeType: supportingFile.type || "application/octet-stream",
        bytes,
      });
      supportingDocument = {
        fileName: supportingFile.name,
        mimeType: supportingFile.type || "application/octet-stream",
        size: supportingFile.size,
        driveFileId: uploaded.id,
        driveWebViewLink: uploaded.webViewLink,
        driveWebContentLink: uploaded.webContentLink,
      };
    }

    const amountStr = s(formData, "amount");
    const amount = Number(amountStr.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid Amount");
    if (!bool(formData, "agreeAuthorization")) {
      throw new Error("You must agree to the Cash Advance Authorization Agreement.");
    }

    const formDataObj = {
      ...(doc as any).formData,
      firstName: s(formData, "firstName"),
      lastName: s(formData, "lastName"),
      payablesTo: s(formData, "payablesTo"),
      payeeName: s(formData, "payeeName"),
      amount,
      reason: s(formData, "reason"),
      forApprovalNote: s(formData, "forApprovalNote"),
      agreedToAuthorization: true,
      supportingFileName: s(formData, "supportingFileName"),
      supportingDocument,
    };

    const changedFields = diffFields(
      cashAdvanceFieldMap((doc as any).formData ?? {}),
      cashAdvanceFieldMap(formDataObj),
    );

    const nextApprovalChain = [
      {
        step: 1,
        role: "cashAdvanceApprover",
        approverEmail: approver.email,
        approverName: approver.name,
        status: "pending",
      },
      {
        step: 2,
        role: "processor",
        approverEmail: processor.email,
        approverName: processor.name,
        status: "waiting",
      },
    ];

    const historyEntry = {
      at: new Date(),
      byEmail: submitterEmail,
      byName: submitterName,
      action: "edited",
      details: { resetToStep: 1, changedFields },
    };
    const nextHistory = [...(((doc as any).history ?? []) as unknown[]), historyEntry];
    const queueFields = deriveRequestQueueFields({
      status: "pending",
      approvalChain: nextApprovalChain,
      currentStep: 1,
      history: nextHistory as any[],
      createdAt: (doc as any).createdAt,
      updatedAt: historyEntry.at,
      submittedBy: {
        email: submitterEmail,
        name: submitterName,
      },
    });

    await RequestModel.updateOne(
      { _id: (doc as any)._id },
      {
        $set: {
          formData: formDataObj,
          approvalChain: nextApprovalChain,
          currentStep: 1,
          status: "pending",
          ...queueFields,
        },
        $push: {
          history: historyEntry,
        },
      },
    );

    await syncRequestMirror({
      requestId: String((doc as any)._id),
      referenceNo,
      formSlug: "cash-advance",
      formName: "Cash Advance",
      submittedBy: {
        email: submitterEmail,
        name: submitterName,
      },
      formData: formDataObj,
      approvalChain: nextApprovalChain,
      currentStep: 1,
      status: "pending",
      history: nextHistory,
      createdAt: (doc as any).createdAt,
      updatedAt: historyEntry.at,
    });

    const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
    const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";
    await setFlashToast({ tone: "success", message: `Cash Advance updated: ${referenceNo}` });

    try {
      await sendFlowNotification({
        formSlug: "cash-advance",
        formName: "Cash Advance",
        event: "resubmitted",
        to: [approver.email, submitterEmail],
        subject: `Cash Advance request updated (${referenceNo})`,
        text:
          `A Cash Advance request has been updated and returned to Step 1 for approval.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
      });
    } catch (e) {
      console.error("Email notification failed:", e);
    }

    return okRedirect(`/requests/${referenceNo}`);
  } catch (error) {
    return fail(errorMessage(error, "Could not update this Cash Advance request."));
  }
}
