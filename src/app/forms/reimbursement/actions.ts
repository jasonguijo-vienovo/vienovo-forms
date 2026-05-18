"use server";

import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { getFormUserAccess } from "@/lib/forms/runtime-state";
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
import {
  buildPendingStepNotificationCopy,
  humanizeWorkflowRole,
  resolveAssignedProcessor,
} from "@/lib/workflow-routing";
import { Approver } from "@/models/Approver";
import { Employee } from "@/models/Employee";
import { RequestModel } from "@/models/Request";
import {
  buildApprovalChainDetails,
  buildAttachmentDetails,
  buildChangedFieldDetails,
  buildNotificationDetailsFromFieldMap,
  diffFields,
  reimbursementFieldMap,
} from "@/lib/request-fields";
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

export async function submitReimbursement(
  formData: FormData,
): Promise<FormActionResult> {
  try {
    const session = await auth();
    const submitterEmail = session?.user?.email?.toLowerCase();
    const submitterName = session?.user?.name ?? submitterEmail ?? "";
    if (!submitterEmail) throw new Error("Not signed in");

    await connectMongo();
    const definition = await getFormDefinitionBySlug("reimbursement");
    if (!definition || !getFormUserAccess(definition, { isAdmin: false }).canSubmit) {
      throw new Error("This form is not available right now.");
    }

    const supervisorId = s(formData, "supervisorId");
    const headId = s(formData, "headId");

    const [supervisor, head, processor] = await Promise.all([
      supervisorId ? Approver.findById(supervisorId).lean() : null,
      headId ? Approver.findById(headId).lean() : null,
      resolveAssignedProcessor({ definition }),
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
      const bytes = Buffer.from(await supportingFile.arrayBuffer());
      const uploaded = await uploadAttachment({
        folder: "reimbursement",
        requestReference: referenceNo,
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
      immediateSuperiorName: supervisor.name,
      immediateSuperiorEmail: supervisor.email,
      departmentHeadName: head.name,
      departmentHeadEmail: head.email,
      supportingFileName: s(formData, "supportingFileName"),
      supportingDocument,
      dateOfRequest: new Date(),
    };

    const approvalChain = [
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
      submittedBy: { email: submitterEmail, name: submitterName },
    });

    const createdRequest = await RequestModel.create({
      formType: "reimbursement",
      formSlug: "reimbursement",
      formName: "Reimbursement",
      referenceNo,
      submittedBy: { email: submitterEmail, name: submitterName },
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
      formSlug: "reimbursement",
      formName: "Reimbursement",
      submittedBy: { email: submitterEmail, name: submitterName },
      formData: formDataObj,
      approvalChain: createdRequest.approvalChain,
      currentStep: createdRequest.currentStep,
      status: createdRequest.status,
      history: createdRequest.history,
      createdAt: createdRequest.createdAt,
      updatedAt: createdRequest.updatedAt,
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
      { upsert: true },
    );

    try {
      const definition = await getFormDefinitionBySlug("reimbursement");
      const spreadsheetId =
        definition?.responseSpreadsheetId?.trim() ||
        process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() ||
        process.env.GOOGLE_SHEETS_MASTER_ID?.trim() ||
        "";
      const sheetTitle = definition?.responseSheetName?.trim() || "Reimbursement Responses";
      if (definition?.writeResponsesToSheet && spreadsheetId) {
        await appendResponseSheetRow({
          spreadsheetId,
          sheetTitle,
          rowValues: buildResponseSheetRows({
            referenceNo,
            formSlug: "reimbursement",
            formName: "Reimbursement",
            submittedByEmail: submitterEmail,
            submittedByName: submitterName,
            requestVersion: 1,
            requestRevisionStatus: "Original submission",
            requestRevisionNote: "Version 1 - Original submission",
            values: formDataObj,
          }),
        });
      }
    } catch (error) {
      console.error("Reimbursement response export failed:", error);
    }

    const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
    const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";
    const approvalPageUrl = requestUrl ? `${requestUrl}/approve` : "";
    const approvalsUrl = appUrl ? `${appUrl}/approvals` : "";
    const nextStepCopy = buildPendingStepNotificationCopy({
      formName: "Reimbursement",
      referenceNo,
      role: "supervisor",
    });
    const notificationDetails = buildNotificationDetailsFromFieldMap(reimbursementFieldMap(formDataObj), {
      preferredKeys: [
        "firstName",
        "lastName",
        "department",
        "costCenter",
        "location",
        "totalExpenses",
        "formType",
        "cashAdvanceReferenceNo",
        "immediateSuperiorName",
        "departmentHeadName",
        "reason",
      ],
      maxRows: 10,
    });
    const attachmentDetails = buildAttachmentDetails([
      {
        label: "Supporting document",
        fileName: supportingDocument?.fileName || formDataObj.supportingFileName,
        url: supportingDocument?.driveWebViewLink,
      },
    ]);
    await setFlashToast({ tone: "success", message: `Reimbursement submitted: ${referenceNo}` });

    try {
      await sendFlowNotification({
        formSlug: "reimbursement",
        formName: "Reimbursement",
        event: "submitted",
        to: [submitterEmail],
        primaryRecipientRole: "requester",
        subject: `Reimbursement request submitted (${referenceNo})`,
        summary: "A Reimbursement request has been submitted and is waiting in the approval workflow.",
        details: [
          { label: "Reference No.", value: referenceNo },
          { label: "Requester", value: submitterName || submitterEmail },
          { label: "Level 1 approver", value: supervisor.name },
          { label: "Level 2 approver", value: head.name },
          ...notificationDetails,
          ...attachmentDetails,
        ],
        text:
          `A Reimbursement request has been submitted.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
        ctaUrl: requestUrl,
        ctaLabel: "Open request",
      });
      await sendFlowNotification({
        formSlug: "reimbursement",
        formName: "Reimbursement",
        event: "next-approver",
        to: supervisor.email,
        primaryRecipientRole: "supervisor",
        subject: nextStepCopy.subject,
        summary: nextStepCopy.summary,
        details: [
          { label: "Reference No.", value: referenceNo },
          { label: "Requester", value: submitterName || submitterEmail },
          { label: "Current role", value: supervisor.roles?.[0] || "Approver" },
          { label: "Status", value: nextStepCopy.statusLabel },
          ...notificationDetails,
          ...attachmentDetails,
        ],
        text:
          nextStepCopy.text +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
        ctaUrl: approvalPageUrl || requestUrl,
        ctaLabel: nextStepCopy.ctaLabel,
        approveUrl: approvalPageUrl ? `${approvalPageUrl}#approve` : requestUrl,
        rejectUrl: approvalPageUrl ? `${approvalPageUrl}#reject` : requestUrl,
        commentUrl: approvalPageUrl ? `${approvalPageUrl}#comment` : requestUrl,
        viewAllUrl: approvalsUrl || requestUrl,
      });
      await sendFlowNotification({
        formSlug: "reimbursement",
        formName: "Reimbursement",
        event: "submitted",
        to: processor.email,
        primaryRecipientRole: "processor",
        subject: `Reimbursement request submitted for processing awareness (${referenceNo})`,
        summary:
          "A Reimbursement request has entered the workflow. You are the assigned Processor and will receive another notification when it reaches your step.",
        details: [
          { label: "Reference No.", value: referenceNo },
          { label: "Requester", value: submitterName || submitterEmail },
          { label: "Current workflow step", value: humanizeWorkflowRole("supervisor") || "Immediate Superior" },
          { label: "Status", value: "Pending approval" },
          ...notificationDetails,
          ...attachmentDetails,
        ],
        text:
          `A Reimbursement request has entered the workflow.\n\n` +
          `You are the assigned Processor for this request and will receive another notification when it reaches your step.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
        ctaUrl: requestUrl,
        ctaLabel: "Open request",
      });
    } catch (e) {
      console.error("Email notification failed:", e);
    }

    return okRedirect(`/requests/${referenceNo}`);
  } catch (error) {
    return fail(errorMessage(error, "Could not submit this reimbursement request."));
  }
}

export async function updateReimbursement(
  referenceNo: string,
  formData: FormData,
): Promise<FormActionResult> {
  try {
    const session = await auth();
    const submitterEmail = session?.user?.email?.toLowerCase();
    const submitterName = session?.user?.name ?? submitterEmail ?? "";
    if (!submitterEmail) throw new Error("Not signed in");

    await connectMongo();
    const definition = await getFormDefinitionBySlug("reimbursement");

    const doc = await RequestModel.findOne({
      referenceNo,
      formType: "reimbursement",
      "submittedBy.email": submitterEmail,
    }).lean();
    if (!doc) throw new Error("Request not found or not editable.");

    const supervisorId = s(formData, "supervisorId");
    const headId = s(formData, "headId");

    const [supervisor, head, processor] = await Promise.all([
      supervisorId ? Approver.findById(supervisorId).lean() : null,
      headId ? Approver.findById(headId).lean() : null,
      resolveAssignedProcessor({
        definition,
        existingProcessorEmail: doc.approvalChain?.find((s) => s.role === "processor")?.approverEmail ?? "",
      }),
    ]);
    if (!supervisor) throw new Error("Invalid Immediate Superior");
    if (!head) throw new Error("Invalid Department Head");

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
      const bytes = Buffer.from(await supportingFile.arrayBuffer());
      const uploaded = await uploadAttachment({
        folder: "reimbursement",
        requestReference: referenceNo,
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
      immediateSuperiorName: supervisor.name,
      immediateSuperiorEmail: supervisor.email,
      departmentHeadName: head.name,
      departmentHeadEmail: head.email,
      supportingFileName: s(formData, "supportingFileName"),
      supportingDocument,
    };

    const changedFields = diffFields(
      reimbursementFieldMap((doc as any).formData ?? {}),
      reimbursementFieldMap(formDataObj),
    );

    const nextApprovalChain = [
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
      submittedBy: { email: submitterEmail, name: submitterName },
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
      formSlug: "reimbursement",
      formName: "Reimbursement",
      submittedBy: { email: submitterEmail, name: submitterName },
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
    const approvalPageUrl = requestUrl ? `${requestUrl}/approve` : "";
    const approvalsUrl = appUrl ? `${appUrl}/approvals` : "";
    const nextStepCopy = buildPendingStepNotificationCopy({
      formName: "Reimbursement",
      referenceNo,
      role: "supervisor",
    });
    const notificationDetails = buildNotificationDetailsFromFieldMap(reimbursementFieldMap(formDataObj), {
      preferredKeys: [
        "firstName",
        "lastName",
        "department",
        "costCenter",
        "location",
        "totalExpenses",
        "formType",
        "cashAdvanceReferenceNo",
        "immediateSuperiorName",
        "departmentHeadName",
        "reason",
      ],
      maxRows: 10,
    });
    const attachmentDetails = buildAttachmentDetails([
      {
        label: "Supporting document",
        fileName: supportingDocument?.fileName || formDataObj.supportingFileName,
        url: supportingDocument?.driveWebViewLink,
      },
    ]);
    const approvalRoutingDetails = buildApprovalChainDetails(nextApprovalChain);
    const changedFieldDetails = buildChangedFieldDetails(changedFields, {
      omitKeys: ["supportingDriveLink", "immediateSuperiorEmail", "departmentHeadEmail"],
      maxRows: 8,
    });
    const requestVersion = 1 + nextHistory.filter((item: any) => item.action === "edited").length;
    try {
      const spreadsheetId =
        definition?.responseSpreadsheetId?.trim() ||
        process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() ||
        process.env.GOOGLE_SHEETS_MASTER_ID?.trim() ||
        "";
      const sheetTitle = definition?.responseSheetName?.trim() || "Reimbursement Responses";
      if (definition?.writeResponsesToSheet && spreadsheetId) {
        await appendResponseSheetRow({
          spreadsheetId,
          sheetTitle,
          rowValues: buildResponseSheetRows({
            referenceNo,
            formSlug: "reimbursement",
            formName: "Reimbursement",
            submittedByEmail: submitterEmail,
            submittedByName: submitterName,
            status: "pending",
            submittedAt: historyEntry.at,
            requestVersion,
            requestRevisionStatus: "Updated request",
            requestRevisionNote: `Version ${requestVersion} - Updated request; approval restarted at level 1`,
            values: formDataObj,
          }),
        });
      }
    } catch (error) {
      console.error("Reimbursement update export failed:", error);
    }
    await setFlashToast({ tone: "success", message: `Reimbursement updated: ${referenceNo}` });

    try {
      await sendFlowNotification({
        formSlug: "reimbursement",
        formName: "Reimbursement",
        event: "resubmitted",
        to: [submitterEmail],
        primaryRecipientRole: "requester",
        subject: `Reimbursement request updated (${referenceNo})`,
        summary:
          "Your Reimbursement request was updated. Approval restarted from level 1, and the latest approvers are shown below.",
        details: [
          { label: "Reference No.", value: referenceNo },
          { label: "Requester", value: submitterName || submitterEmail },
          { label: "Approval restart", value: "Level 1" },
          ...approvalRoutingDetails,
          ...changedFieldDetails,
          ...notificationDetails,
          ...attachmentDetails,
        ],
        text:
          `A Reimbursement request has been updated and returned to Step 1.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
        ctaUrl: requestUrl,
        ctaLabel: "Open request",
      });
      await sendFlowNotification({
        formSlug: "reimbursement",
        formName: "Reimbursement",
        event: "next-approver",
        to: supervisor.email,
        primaryRecipientRole: "supervisor",
        subject: nextStepCopy.subject,
        summary: nextStepCopy.summary,
        details: [
          { label: "Reference No.", value: referenceNo },
          { label: "Requester", value: submitterName || submitterEmail },
          { label: "Current role", value: supervisor.roles?.[0] || "Approver" },
          { label: "Status", value: nextStepCopy.statusLabel },
          ...notificationDetails,
          ...attachmentDetails,
        ],
        text:
          nextStepCopy.text +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
        ctaUrl: approvalPageUrl || requestUrl,
        ctaLabel: nextStepCopy.ctaLabel,
        approveUrl: approvalPageUrl ? `${approvalPageUrl}#approve` : requestUrl,
        rejectUrl: approvalPageUrl ? `${approvalPageUrl}#reject` : requestUrl,
        commentUrl: approvalPageUrl ? `${approvalPageUrl}#comment` : requestUrl,
        viewAllUrl: approvalsUrl || requestUrl,
      });
      await sendFlowNotification({
        formSlug: "reimbursement",
        formName: "Reimbursement",
        event: "resubmitted",
        to: processor.email,
        primaryRecipientRole: "processor",
        subject: `Reimbursement request updated for processing awareness (${referenceNo})`,
        summary:
          "A Reimbursement request was updated and restarted from level 1. You are the assigned Processor and will receive another notification when it reaches your step.",
        details: [
          { label: "Reference No.", value: referenceNo },
          { label: "Requester", value: submitterName || submitterEmail },
          { label: "Current workflow step", value: humanizeWorkflowRole("supervisor") || "Immediate Superior" },
          { label: "Status", value: "Pending approval" },
          ...approvalRoutingDetails,
          ...changedFieldDetails,
          ...notificationDetails,
          ...attachmentDetails,
        ],
        text:
          `A Reimbursement request was updated and restarted from level 1.\n\n` +
          `You are the assigned Processor for this request and will receive another notification when it reaches your step.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
        ctaUrl: requestUrl,
        ctaLabel: "Open request",
      });
    } catch (e) {
      console.error("Email notification failed:", e);
    }

    return okRedirect(`/requests/${referenceNo}`);
  } catch (error) {
    return fail(errorMessage(error, "Could not update this reimbursement request."));
  }
}
