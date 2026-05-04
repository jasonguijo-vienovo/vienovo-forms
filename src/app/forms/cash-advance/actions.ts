"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { RequestModel } from "@/models/Request";
import { Approver } from "@/models/Approver";
import { generateReferenceNo } from "@/lib/reference-number";
import { uploadToDriveFolder } from "@/lib/google/drive";
import { sendNotificationEmail } from "@/lib/notifications/email";
import { cashAdvanceFieldMap, diffFields } from "@/lib/request-fields";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function bool(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

export async function submitCashAdvance(formData: FormData) {
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
    const folderId = process.env.GOOGLE_DRIVE_CASH_ADVANCE_FOLDER_ID;
    if (!folderId) throw new Error("Missing GOOGLE_DRIVE_CASH_ADVANCE_FOLDER_ID for Cash Advance attachments.");
    const bytes = Buffer.from(await supportingFile.arrayBuffer());
    const uploaded = await uploadToDriveFolder({
      folderId,
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

  await RequestModel.create({
    formType: "cash-advance",
    formSlug: "cash-advance",
    formName: "Cash Advance",
    referenceNo,
    submittedBy: {
      email: submitterEmail,
      name: submitterName,
    },
    formData: formDataObj,
    approvalChain: [
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
    ],
    currentStep: 1,
    status: "pending",
    history: [
      {
        at: new Date(),
        byEmail: submitterEmail,
        byName: submitterName,
        action: "submitted",
        details: {},
      },
    ],
  });

  const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";

  try {
    await sendNotificationEmail({
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

  redirect(`/requests/${referenceNo}`);
}

export async function updateCashAdvance(referenceNo: string, formData: FormData) {
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
    const folderId = process.env.GOOGLE_DRIVE_CASH_ADVANCE_FOLDER_ID;
    if (!folderId) throw new Error("Missing GOOGLE_DRIVE_CASH_ADVANCE_FOLDER_ID for Cash Advance attachments.");
    const bytes = Buffer.from(await supportingFile.arrayBuffer());
    const uploaded = await uploadToDriveFolder({
      folderId,
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
    cashAdvanceFieldMap(formDataObj)
  );

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        formData: formDataObj,
        approvalChain: [
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
        ],
        currentStep: 1,
        status: "pending",
      },
      $push: {
        history: {
          at: new Date(),
          byEmail: submitterEmail,
          byName: submitterName,
          action: "edited",
          details: { resetToStep: 1, changedFields },
        },
      },
    }
  );

  const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";

  try {
    await sendNotificationEmail({
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

  redirect(`/requests/${referenceNo}`);
}
