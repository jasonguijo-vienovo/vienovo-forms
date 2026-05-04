"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { RequestModel } from "@/models/Request";
import { Approver } from "@/models/Approver";
import { Employee } from "@/models/Employee";
import { generateReferenceNo } from "@/lib/reference-number";
import { uploadToDriveFolder } from "@/lib/google/drive";
import { sendFlowNotification } from "@/lib/notifications/flow";
import { diffFields, reimbursementFieldMap } from "@/lib/request-fields";
import {
  REIMBURSEMENT_EXPENSE_ACCOUNTS,
  reimbursementExpenseFieldName,
  parseMoneyInput,
} from "@/lib/forms/reimbursement";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function d(formData: FormData, key: string) {
  const v = s(formData, key);
  return v ? new Date(v) : null;
}

function bool(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

function readExpenses(formData: FormData) {
  const selectedRaw = s(formData, "selectedExpenseCodes");
  let selected: string[] = [];
  try {
    const parsed = JSON.parse(selectedRaw || "[]");
    if (Array.isArray(parsed)) selected = parsed.map((v) => String(v));
  } catch {
    selected = [];
  }

  const allowed = new Set(REIMBURSEMENT_EXPENSE_ACCOUNTS.map((a) => a.code));
  selected = [...new Set(selected)].filter((c) => allowed.has(c));

  const expensesByCode: Record<string, number> = {};
  let total = 0;
  for (const code of selected) {
    const raw = formData.get(reimbursementExpenseFieldName(code));
    const amount = parseMoneyInput(raw);
    if (amount > 0) total += amount;
    expensesByCode[code] = amount;
  }
  total = Math.round(total * 100) / 100;
  return { expensesByCode, total, selectedExpenseCodes: selected };
}

async function requireCashAdvanceReference(opts: {
  submitterEmail: string;
  cashAdvanceReferenceNo: string;
}) {
  const ref = String(opts.cashAdvanceReferenceNo ?? "").trim();
  if (!ref) throw new Error("Cash Advance Reference # is required for CA Liquidation.");
  const linked = await RequestModel.findOne({
    referenceNo: ref,
    formType: "cash-advance",
    "submittedBy.email": opts.submitterEmail,
  })
    .select({ _id: 1 })
    .lean();
  if (!linked) {
    throw new Error("Invalid Cash Advance Reference #. It must be a Cash Advance you submitted.");
  }
  return ref;
}

export async function submitReimbursement(formData: FormData) {
  const session = await auth();
  const submitterEmail = session?.user?.email?.toLowerCase();
  const submitterName = session?.user?.name ?? submitterEmail ?? "";
  if (!submitterEmail) throw new Error("Not signed in");

  await connectMongo();

  const supervisorId = s(formData, "supervisorId");
  const headId = s(formData, "headId");

  const [supervisor, head, processor] = await Promise.all([
    supervisorId ? Approver.findById(supervisorId).lean() : null,
    headId ? Approver.findById(headId).lean() : null,
    Approver.findOne({ roles: "processor", isActive: true }).lean(),
  ]);

  if (!supervisor) throw new Error("Invalid Immediate Superior");
  if (!head) throw new Error("Invalid Department Head");
  if (!processor) throw new Error("No active processor configured. Ask an admin to assign one.");

  const department = s(formData, "department");
  const costCenter = s(formData, "costCenter");
  const location = s(formData, "location");
  if (!department) throw new Error("Department is required.");
  if (!costCenter) throw new Error("Cost Center is required.");
  if (!location) throw new Error("Location is required.");

  const formType = s(formData, "formType");
  const cashAdvanceReferenceNo =
    formType === "CA Liquidation"
      ? await requireCashAdvanceReference({
          submitterEmail,
          cashAdvanceReferenceNo: s(formData, "cashAdvanceReferenceNo"),
        })
      : "";

  const { expensesByCode, total, selectedExpenseCodes } = readExpenses(formData);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Total Expenses must be greater than 0.");
  if (selectedExpenseCodes.length === 0) throw new Error("Select at least one expense account.");
  if (!bool(formData, "agreeCertification")) {
    throw new Error("You must agree to the reimbursement certification.");
  }

  const referenceNo = await generateReferenceNo("reimbursement");

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
    const folderId = process.env.GOOGLE_DRIVE_REIMBURSEMENT_FOLDER_ID;
    if (!folderId) throw new Error("Missing GOOGLE_DRIVE_REIMBURSEMENT_FOLDER_ID for Reimbursement attachments.");
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

  const formDataObj = {
    firstName: s(formData, "firstName"),
    lastName: s(formData, "lastName"),
    department,
    totalExpenses: total,
    formType,
    cashAdvanceReferenceNo,
    reason: s(formData, "reason"),
    dateFrom: d(formData, "dateFrom"),
    dateTo: d(formData, "dateTo"),
    costCenter,
    location,
    liquidationType: s(formData, "liquidationType"),
    transactionNumber: s(formData, "transactionNumber"),
    psNumber: s(formData, "psNumber"),
    businessPartner: s(formData, "businessPartner"),
    jvNo: s(formData, "jvNo"),
    expensesByCode,
    selectedExpenseCodes,
    agreedToCertification: true,
    supportingFileName: s(formData, "supportingFileName"),
    supportingDocument,
    dateOfRequest: new Date(),
  };

  await RequestModel.create({
    formType: "reimbursement",
    formSlug: "reimbursement",
    formName: "Reimbursement",
    referenceNo,
    submittedBy: { email: submitterEmail, name: submitterName },
    formData: formDataObj,
    approvalChain: [
      {
        step: 1,
        role: "supervisor",
        approverEmail: supervisor.email,
        approverName: supervisor.name,
        status: "pending",
      },
      {
        step: 2,
        role: "head",
        approverEmail: head.email,
        approverName: head.name,
        status: "waiting",
      },
      {
        step: 3,
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

  const fullName = `${formDataObj.firstName} ${formDataObj.lastName}`.trim();
  await Employee.updateOne(
    { email: submitterEmail },
    {
      $set: {
        email: submitterEmail,
        fullName,
        department: formDataObj.department,
        supervisorEmail: supervisor.email,
        departmentHeadEmail: head.email,
        isActive: true,
      },
    },
    { upsert: true }
  );

  const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";
  await setFlashToast({ tone: "success", message: `Reimbursement submitted: ${referenceNo}` });

  try {
    await sendFlowNotification({
      formSlug: "reimbursement",
      formName: "Reimbursement",
      event: "submitted",
      to: [supervisor.email, processor.email, submitterEmail],
      subject: `Reimbursement request submitted (${referenceNo})`,
      text:
        `A Reimbursement request has been submitted.\n\n` +
        `Reference: ${referenceNo}\n` +
        (requestUrl ? `Link: ${requestUrl}\n` : ""),
    });
  } catch (e) {
    console.error("Email notification failed:", e);
  }

  redirect(`/requests/${referenceNo}`);
}

export async function updateReimbursement(referenceNo: string, formData: FormData) {
  const session = await auth();
  const submitterEmail = session?.user?.email?.toLowerCase();
  const submitterName = session?.user?.name ?? submitterEmail ?? "";
  if (!submitterEmail) throw new Error("Not signed in");

  await connectMongo();

  const doc = await RequestModel.findOne({
    referenceNo,
    formType: "reimbursement",
    "submittedBy.email": submitterEmail,
  }).lean();
  if (!doc) throw new Error("Request not found or not editable.");

  const supervisorId = s(formData, "supervisorId");
  const headId = s(formData, "headId");

  const [supervisor, head, fallbackProcessor] = await Promise.all([
    supervisorId ? Approver.findById(supervisorId).lean() : null,
    headId ? Approver.findById(headId).lean() : null,
    Approver.findOne({ roles: "processor", isActive: true }).lean(),
  ]);
  if (!supervisor) throw new Error("Invalid Immediate Superior");
  if (!head) throw new Error("Invalid Department Head");

  const existingProcessorEmail =
    doc.approvalChain?.find((s) => s.role === "processor")?.approverEmail ?? "";
  const processor =
    (existingProcessorEmail
      ? await Approver.findOne({ email: existingProcessorEmail }).lean()
      : null) ?? fallbackProcessor;
  if (!processor) throw new Error("No active processor configured. Ask an admin to assign one.");

  const department = s(formData, "department");
  const costCenter = s(formData, "costCenter");
  const location = s(formData, "location");
  if (!department) throw new Error("Department is required.");
  if (!costCenter) throw new Error("Cost Center is required.");
  if (!location) throw new Error("Location is required.");

  const formType = s(formData, "formType");
  const cashAdvanceReferenceNo =
    formType === "CA Liquidation"
      ? await requireCashAdvanceReference({
          submitterEmail,
          cashAdvanceReferenceNo: s(formData, "cashAdvanceReferenceNo"),
        })
      : "";

  const { expensesByCode, total, selectedExpenseCodes } = readExpenses(formData);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Total Expenses must be greater than 0.");
  if (selectedExpenseCodes.length === 0) throw new Error("Select at least one expense account.");
  if (!bool(formData, "agreeCertification")) {
    throw new Error("You must agree to the reimbursement certification.");
  }

  const supportingFile = formData.get("supportingDocument");
  let supportingDocument: any = (doc as any).formData?.supportingDocument ?? null;

  if (supportingFile instanceof File && supportingFile.size > 0) {
    const maxBytes = 10 * 1024 * 1024;
    if (supportingFile.size > maxBytes) throw new Error("Supporting document must be 10 MB or less.");
    const folderId = process.env.GOOGLE_DRIVE_REIMBURSEMENT_FOLDER_ID;
    if (!folderId) throw new Error("Missing GOOGLE_DRIVE_REIMBURSEMENT_FOLDER_ID for Reimbursement attachments.");
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

  const formDataObj = {
    ...(doc as any).formData,
    firstName: s(formData, "firstName"),
    lastName: s(formData, "lastName"),
    department,
    totalExpenses: total,
    formType,
    cashAdvanceReferenceNo,
    reason: s(formData, "reason"),
    dateFrom: d(formData, "dateFrom"),
    dateTo: d(formData, "dateTo"),
    costCenter,
    location,
    liquidationType: s(formData, "liquidationType"),
    transactionNumber: s(formData, "transactionNumber"),
    psNumber: s(formData, "psNumber"),
    businessPartner: s(formData, "businessPartner"),
    jvNo: s(formData, "jvNo"),
    expensesByCode,
    selectedExpenseCodes,
    agreedToCertification: true,
    supportingFileName: s(formData, "supportingFileName"),
    supportingDocument,
  };

  const changedFields = diffFields(
    reimbursementFieldMap((doc as any).formData ?? {}),
    reimbursementFieldMap(formDataObj)
  );

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        formData: formDataObj,
        approvalChain: [
          {
            step: 1,
            role: "supervisor",
            approverEmail: supervisor.email,
            approverName: supervisor.name,
            status: "pending",
          },
          {
            step: 2,
            role: "head",
            approverEmail: head.email,
            approverName: head.name,
            status: "waiting",
          },
          {
            step: 3,
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
          details: { changedFields },
        },
      },
    }
  );

  const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
  const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";
  await setFlashToast({ tone: "success", message: `Reimbursement updated: ${referenceNo}` });

  try {
    await sendFlowNotification({
      formSlug: "reimbursement",
      formName: "Reimbursement",
      event: "resubmitted",
      to: [supervisor.email, submitterEmail],
      subject: `Reimbursement request updated (${referenceNo})`,
      text:
        `A Reimbursement request has been updated and returned to Step 1.\n\n` +
        `Reference: ${referenceNo}\n` +
        (requestUrl ? `Link: ${requestUrl}\n` : ""),
    });
  } catch (e) {
    console.error("Email notification failed:", e);
  }

  redirect(`/requests/${referenceNo}`);
}
