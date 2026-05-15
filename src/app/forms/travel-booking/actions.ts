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
import { uploadAttachment } from "@/lib/storage/attachments";
import {
  appendTravelBookingResponseRow,
  normalizeSpreadsheetId,
} from "@/lib/travel-booking-sheet";
import {
  buildPendingStepNotificationCopy,
  resolveAssignedProcessor,
  resolveConfiguredApprover,
  resolveDefaultCeoApprover,
} from "@/lib/workflow-routing";
import { Approver } from "@/models/Approver";
import { Employee } from "@/models/Employee";
import { RequestModel } from "@/models/Request";
import {
  buildAttachmentDetails,
  buildNotificationDetailsFromFieldMap,
  diffFields,
  travelBookingFieldMap,
} from "@/lib/request-fields";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function d(formData: FormData, key: string) {
  const v = s(formData, key);
  return v ? new Date(v) : null;
}

export async function submitTravelBooking(
  formData: FormData,
): Promise<FormActionResult> {
  try {
    const session = await auth();
    const submitterEmail = session?.user?.email?.toLowerCase();
    const submitterName = session?.user?.name ?? submitterEmail ?? "";
    if (!submitterEmail) throw new Error("Not signed in");

    await connectMongo();
    const definition = await getFormDefinitionBySlug("travel-booking");
    if (!definition || !getFormUserAccess(definition, { isAdmin: false }).canSubmit) {
      throw new Error("This form is not available right now.");
    }

    const supervisorId = s(formData, "supervisorId");
    const headId = s(formData, "headId");

    const [supervisor, head, processor, configuredLevelOne, configuredLevelTwo] = await Promise.all([
      supervisorId ? Approver.findById(supervisorId).lean() : null,
      headId ? Approver.findById(headId).lean() : null,
      resolveAssignedProcessor({ definition }),
      resolveConfiguredApprover({
        approverId: definition.levelOneApproverId,
        approverEmail: definition.levelOneApproverEmail,
        label: "Level 1 approver",
      }),
      resolveConfiguredApprover({
        approverId: definition.levelTwoApproverId,
        approverEmail: definition.levelTwoApproverEmail,
        label: "Level 2 approver",
      }),
    ]);

    if (!processor) throw new Error("No active processor configured. Ask an admin to assign one.");
    if (!configuredLevelOne && !supervisor) throw new Error("Invalid Immediate Superior");
    if (!configuredLevelTwo && !head) throw new Error("Invalid Department Head");
    const resolvedLevelOne = supervisor ?? configuredLevelOne;
    const resolvedLevelTwo = head ?? configuredLevelTwo;
    const requiresCeoStep = Boolean(configuredLevelOne || configuredLevelTwo);
    const ceoApprover = requiresCeoStep ? await resolveDefaultCeoApprover() : null;

    const referenceNo = await generateReferenceNo("travel-booking");

    const activityFile = formData.get("activitySchedule");
    let activitySchedule: null | {
      fileName: string;
      mimeType: string;
      size: number;
      driveFileId: string;
      driveWebViewLink?: string;
      driveWebContentLink?: string;
    } = null;

    if (activityFile instanceof File && activityFile.size > 0) {
      const maxBytes = 10 * 1024 * 1024;
      if (activityFile.size > maxBytes) throw new Error("Activity Schedule file must be 10 MB or less.");
      const bytes = Buffer.from(await activityFile.arrayBuffer());
      const uploaded = await uploadAttachment({
        folder: "travel-booking",
        requestReference: referenceNo,
        fileName: `${referenceNo}_${activityFile.name}`,
        mimeType: activityFile.type || "application/octet-stream",
        bytes,
      });
      activitySchedule = {
        fileName: activityFile.name,
        mimeType: activityFile.type || "application/octet-stream",
        size: activityFile.size,
        driveFileId: uploaded.id,
        driveWebViewLink: uploaded.webViewLink,
        driveWebContentLink: uploaded.webContentLink,
      };
    }

    const tripType = s(formData, "tripType") || "roundtrip";

    const formDataObj = {
      employeeId: s(formData, "employeeId"),
      department: s(formData, "department"),
      fullName: s(formData, "fullName"),
      birthday: d(formData, "birthday"),
      contactNumber: s(formData, "contactNumber"),
      landAir: s(formData, "landAir"),
      tripType,
      origin: s(formData, "origin"),
      destination: s(formData, "destination"),
      departureDate: d(formData, "departureDate"),
      returnDate: tripType === "roundtrip" ? d(formData, "returnDate") : null,
      preferredTime: s(formData, "preferredTime"),
      multiCity:
        tripType === "multicity"
          ? {
              trip1: {
                origin: s(formData, "mc1Origin"),
                destination: s(formData, "mc1Destination"),
                date: d(formData, "mc1Date"),
                time: s(formData, "mc1Time"),
              },
              trip2: {
                origin: s(formData, "mc2Origin"),
                destination: s(formData, "mc2Destination"),
                date: d(formData, "mc2Date"),
                time: s(formData, "mc2Time"),
              },
            }
          : null,
      airline: s(formData, "airline"),
      travelPurpose: s(formData, "travelPurpose"),
      baggage: s(formData, "baggage"),
      hotelAccommodation: s(formData, "hotelAccommodation"),
      hotelOther: s(formData, "hotelOther"),
      servicePickup: s(formData, "servicePickup"),
      immediateSuperiorName: resolvedLevelOne!.name,
      immediateSuperiorEmail: resolvedLevelOne!.email,
      departmentHeadName: resolvedLevelTwo!.name,
      departmentHeadEmail: resolvedLevelTwo!.email,
      activityScheduleFileName: s(formData, "activityScheduleFileName"),
      activitySchedule,
    };

    const approvalChain = [
      {
        step: 1,
        role: configuredLevelOne ? "level1" : "supervisor",
        approverEmail: resolvedLevelOne!.email,
        approverName: resolvedLevelOne!.name,
        status: "pending",
      },
      {
        step: 2,
        role: configuredLevelTwo ? "level2" : "head",
        approverEmail: resolvedLevelTwo!.email,
        approverName: resolvedLevelTwo!.name,
        status: "waiting",
      },
      ...(ceoApprover
        ? [
            {
              step: 3,
              role: "ceo",
              approverEmail: ceoApprover.email,
              approverName: ceoApprover.name,
              status: "waiting",
            },
          ]
        : []),
      {
        step: ceoApprover ? 4 : 3,
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
      formType: "travel-booking",
      formSlug: "travel-booking",
      formName: "Travel Booking",
      referenceNo,
      submittedBy: {
        email: submitterEmail,
        name: submitterName,
      },
      formData: formDataObj,
      approvalChain,
      currentStep: 1,
      status: "pending",
      responseSpreadsheetId: String(definition.responseSpreadsheetId || "").trim(),
      responseSheetName: String(definition.responseSheetName || "").trim(),
      history,
      ...queueFields,
    });

    await syncRequestMirror({
      requestId: String(createdRequest._id),
      referenceNo,
      formSlug: "travel-booking",
      formName: "Travel Booking",
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

    await Employee.updateOne(
      { email: submitterEmail },
      {
        $set: {
          email: submitterEmail,
          employeeId: formDataObj.employeeId,
          fullName: formDataObj.fullName,
          department: formDataObj.department,
          contactNumber: formDataObj.contactNumber,
          birthday: formDataObj.birthday,
          supervisorEmail: resolvedLevelOne!.email,
          departmentHeadEmail: resolvedLevelTwo!.email,
          isActive: true,
        },
      },
      { upsert: true },
    );

    let sheetExportErrorMessage = "";
    try {
      const responseSpreadsheetId =
        normalizeSpreadsheetId(definition.responseSpreadsheetId?.trim() || "") ||
        process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() ||
        process.env.GOOGLE_SHEETS_MASTER_ID?.trim() ||
        "";
      const sheetTitle = definition.responseSheetName?.trim() || "Travel Booking Responses";
      if (definition.writeResponsesToSheet && responseSpreadsheetId) {
        const sheetWrite = await appendTravelBookingResponseRow({
          spreadsheetId: responseSpreadsheetId,
          sheetTitle,
          referenceNo,
          submittedByEmail: submitterEmail,
          formData: formDataObj,
          submittedAt: createdRequest.createdAt,
        });
        await RequestModel.updateOne(
          { _id: createdRequest._id },
          {
            $set: {
              responseSpreadsheetId: sheetWrite.spreadsheetId,
              responseSheetName: sheetWrite.sheetTitle,
              sheetStatusSyncedAt: new Date(),
              sheetStatusSyncError: "",
            },
          },
        );
      }
    } catch (error) {
      console.error("Travel Booking response export failed:", error);
      sheetExportErrorMessage =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Travel Booking response export failed.";
      await RequestModel.updateOne(
        { _id: createdRequest._id },
        {
          $set: {
            responseSpreadsheetId:
              normalizeSpreadsheetId(definition.responseSpreadsheetId?.trim() || "") ||
              process.env.GOOGLE_SHEETS_RESPONSES_ID?.trim() ||
              process.env.GOOGLE_SHEETS_MASTER_ID?.trim() ||
              "",
            responseSheetName: definition.responseSheetName?.trim() || "Travel Booking Responses",
            sheetStatusSyncedAt: null,
            sheetStatusSyncError: sheetExportErrorMessage || "Unknown response export error",
          },
        },
      );
    }

    const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
    const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";
    const approvalPageUrl = requestUrl ? `${requestUrl}/approve` : "";
    const approvalsUrl = appUrl ? `${appUrl}/approvals` : "";
    const nextStepCopy = buildPendingStepNotificationCopy({
      formName: "Travel Booking",
      referenceNo,
      role: approvalChain[0]?.role || "supervisor",
    });
    const notificationDetails = buildNotificationDetailsFromFieldMap(travelBookingFieldMap(formDataObj), {
      preferredKeys: [
        "fullName",
        "employeeId",
        "department",
        "landAir",
        "tripType",
        "origin",
        "destination",
        "departureDate",
        "returnDate",
        "immediateSuperiorName",
        "departmentHeadName",
        "travelPurpose",
      ],
      omitKeys: ["birthday", "contactNumber"],
      maxRows: 10,
    });
    const attachmentDetails = buildAttachmentDetails([
      {
        label: "Activity schedule",
        fileName: activitySchedule?.fileName || formDataObj.activityScheduleFileName,
        url: activitySchedule?.driveWebViewLink,
      },
    ]);
    await setFlashToast({
      tone: sheetExportErrorMessage ? "error" : "success",
      message: sheetExportErrorMessage
        ? `Travel Booking submitted as ${referenceNo}, but sheet export failed: ${sheetExportErrorMessage}`
        : `Travel Booking submitted: ${referenceNo}`,
      persistent: Boolean(sheetExportErrorMessage),
    });

    try {
      await sendFlowNotification({
        formSlug: "travel-booking",
        formName: "Travel Booking",
        event: "submitted",
        to: [submitterEmail],
        subject: `Travel Booking request submitted (${referenceNo})`,
        summary: "A Travel Booking request has been submitted and routed for review.",
        details: [
          { label: "Reference No.", value: referenceNo },
          { label: "Requester", value: submitterName || submitterEmail },
          { label: "Level 1 approver", value: resolvedLevelOne!.name },
          { label: "Level 2 approver", value: resolvedLevelTwo!.name },
          ...notificationDetails,
          ...attachmentDetails,
        ],
        text:
          `A Travel Booking request has been submitted.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
        ctaUrl: requestUrl,
        ctaLabel: "Open request",
      });
      await sendFlowNotification({
        formSlug: "travel-booking",
        formName: "Travel Booking",
        event: "next-approver",
        to: resolvedLevelOne!.email,
        subject: nextStepCopy.subject,
        summary: nextStepCopy.summary,
        details: [
          { label: "Reference No.", value: referenceNo },
          { label: "Requester", value: submitterName || submitterEmail },
          { label: "Current role", value: resolvedLevelOne!.roles?.[0] || "Approver" },
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
    } catch (e) {
      console.error("Email notification failed:", e);
    }

    return okRedirect(`/requests/${referenceNo}`);
  } catch (error) {
    return fail(errorMessage(error, "Could not submit this travel request."));
  }
}

export async function updateTravelBooking(
  referenceNo: string,
  formData: FormData,
): Promise<FormActionResult> {
  try {
    const session = await auth();
    const submitterEmail = session?.user?.email?.toLowerCase();
    const submitterName = session?.user?.name ?? submitterEmail ?? "";
    if (!submitterEmail) throw new Error("Not signed in");

    await connectMongo();
    const definition = await getFormDefinitionBySlug("travel-booking");

    const doc = await RequestModel.findOne({
      referenceNo,
      formType: "travel-booking",
      "submittedBy.email": submitterEmail,
    }).lean();
    if (!doc) throw new Error("Request not found or not editable.");

    const supervisorId = s(formData, "supervisorId");
    const headId = s(formData, "headId");

    const [supervisor, head, processor, configuredLevelOne, configuredLevelTwo] = await Promise.all([
      supervisorId ? Approver.findById(supervisorId).lean() : null,
      headId ? Approver.findById(headId).lean() : null,
      resolveAssignedProcessor({
        definition,
        existingProcessorEmail: doc.approvalChain?.find((s) => s.role === "processor")?.approverEmail ?? "",
      }),
      resolveConfiguredApprover({
        approverId: definition?.levelOneApproverId,
        approverEmail: definition?.levelOneApproverEmail,
        label: "Level 1 approver",
      }),
      resolveConfiguredApprover({
        approverId: definition?.levelTwoApproverId,
        approverEmail: definition?.levelTwoApproverEmail,
        label: "Level 2 approver",
      }),
    ]);

    if (!configuredLevelOne && !supervisor) throw new Error("Invalid Immediate Superior");
    if (!configuredLevelTwo && !head) throw new Error("Invalid Department Head");
    const resolvedLevelOne = supervisor ?? configuredLevelOne;
    const resolvedLevelTwo = head ?? configuredLevelTwo;
    const requiresCeoStep = Boolean(configuredLevelOne || configuredLevelTwo);
    const ceoApprover = requiresCeoStep ? await resolveDefaultCeoApprover() : null;

    const activityFile = formData.get("activitySchedule");
    let activitySchedule: any = (doc as any).formData?.activitySchedule ?? null;

    if (activityFile instanceof File && activityFile.size > 0) {
      const maxBytes = 10 * 1024 * 1024;
      if (activityFile.size > maxBytes) throw new Error("Activity Schedule file must be 10 MB or less.");
      const bytes = Buffer.from(await activityFile.arrayBuffer());
      const uploaded = await uploadAttachment({
        folder: "travel-booking",
        requestReference: referenceNo,
        fileName: `${referenceNo}_${activityFile.name}`,
        mimeType: activityFile.type || "application/octet-stream",
        bytes,
      });
      activitySchedule = {
        fileName: activityFile.name,
        mimeType: activityFile.type || "application/octet-stream",
        size: activityFile.size,
        driveFileId: uploaded.id,
        driveWebViewLink: uploaded.webViewLink,
        driveWebContentLink: uploaded.webContentLink,
      };
    }

    const tripType = s(formData, "tripType") || "roundtrip";

    const formDataObj = {
      employeeId: s(formData, "employeeId"),
      department: s(formData, "department"),
      fullName: s(formData, "fullName"),
      birthday: d(formData, "birthday"),
      contactNumber: s(formData, "contactNumber"),
      landAir: s(formData, "landAir"),
      tripType,
      origin: s(formData, "origin"),
      destination: s(formData, "destination"),
      departureDate: d(formData, "departureDate"),
      returnDate: tripType === "roundtrip" ? d(formData, "returnDate") : null,
      preferredTime: s(formData, "preferredTime"),
      multiCity:
        tripType === "multicity"
          ? {
              trip1: {
                origin: s(formData, "mc1Origin"),
                destination: s(formData, "mc1Destination"),
                date: d(formData, "mc1Date"),
                time: s(formData, "mc1Time"),
              },
              trip2: {
                origin: s(formData, "mc2Origin"),
                destination: s(formData, "mc2Destination"),
                date: d(formData, "mc2Date"),
                time: s(formData, "mc2Time"),
              },
            }
          : null,
      airline: s(formData, "airline"),
      travelPurpose: s(formData, "travelPurpose"),
      baggage: s(formData, "baggage"),
      hotelAccommodation: s(formData, "hotelAccommodation"),
      hotelOther: s(formData, "hotelOther"),
      servicePickup: s(formData, "servicePickup"),
      immediateSuperiorName: resolvedLevelOne!.name,
      immediateSuperiorEmail: resolvedLevelOne!.email,
      departmentHeadName: resolvedLevelTwo!.name,
      departmentHeadEmail: resolvedLevelTwo!.email,
      activityScheduleFileName: s(formData, "activityScheduleFileName"),
      activitySchedule,
    };

    const changedFields = diffFields(
      travelBookingFieldMap((doc as any).formData ?? {}),
      travelBookingFieldMap(formDataObj),
    );

    const nextApprovalChain = [
      {
        step: 1,
        role: configuredLevelOne ? "level1" : "supervisor",
        approverEmail: resolvedLevelOne!.email,
        approverName: resolvedLevelOne!.name,
        status: "pending",
      },
      {
        step: 2,
        role: configuredLevelTwo ? "level2" : "head",
        approverEmail: resolvedLevelTwo!.email,
        approverName: resolvedLevelTwo!.name,
        status: "waiting",
      },
      ...(ceoApprover
        ? [
            {
              step: 3,
              role: "ceo",
              approverEmail: ceoApprover.email,
              approverName: ceoApprover.name,
              status: "waiting",
            },
          ]
        : []),
      {
        step: ceoApprover ? 4 : 3,
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

    await Employee.updateOne(
      { email: submitterEmail },
      {
        $set: {
          email: submitterEmail,
          employeeId: formDataObj.employeeId,
          fullName: formDataObj.fullName,
          department: formDataObj.department,
          contactNumber: formDataObj.contactNumber,
          birthday: formDataObj.birthday,
          supervisorEmail: resolvedLevelOne!.email,
          departmentHeadEmail: resolvedLevelTwo!.email,
          isActive: true,
        },
      },
      { upsert: true },
    );

    await syncRequestMirror({
      requestId: String((doc as any)._id),
      referenceNo,
      formSlug: "travel-booking",
      formName: "Travel Booking",
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
    const approvalPageUrl = requestUrl ? `${requestUrl}/approve` : "";
    const approvalsUrl = appUrl ? `${appUrl}/approvals` : "";
    const nextStepCopy = buildPendingStepNotificationCopy({
      formName: "Travel Booking",
      referenceNo,
      role: nextApprovalChain[0]?.role || "supervisor",
    });
    const notificationDetails = buildNotificationDetailsFromFieldMap(travelBookingFieldMap(formDataObj), {
      preferredKeys: [
        "fullName",
        "employeeId",
        "department",
        "landAir",
        "tripType",
        "origin",
        "destination",
        "departureDate",
        "returnDate",
        "immediateSuperiorName",
        "departmentHeadName",
        "travelPurpose",
      ],
      omitKeys: ["birthday", "contactNumber"],
      maxRows: 10,
    });
    const attachmentDetails = buildAttachmentDetails([
      {
        label: "Activity schedule",
        fileName: activitySchedule?.fileName || formDataObj.activityScheduleFileName,
        url: activitySchedule?.driveWebViewLink,
      },
    ]);
    await setFlashToast({ tone: "success", message: `Travel Booking updated: ${referenceNo}` });

    try {
      await sendFlowNotification({
        formSlug: "travel-booking",
        formName: "Travel Booking",
        event: "resubmitted",
        to: [submitterEmail],
        subject: `Travel Booking request updated (${referenceNo})`,
        summary: "Your Travel Booking request was updated and sent back into the approval workflow.",
        details: [
          { label: "Reference No.", value: referenceNo },
          { label: "Requester", value: submitterName || submitterEmail },
          { label: "Level 1 approver", value: resolvedLevelOne!.name },
          { label: "Level 2 approver", value: resolvedLevelTwo!.name },
          ...notificationDetails,
          ...attachmentDetails,
        ],
        text:
          `A Travel Booking request has been updated and returned to Step 1 for approval.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
        ctaUrl: requestUrl,
        ctaLabel: "Open request",
      });
      await sendFlowNotification({
        formSlug: "travel-booking",
        formName: "Travel Booking",
        event: "next-approver",
        to: resolvedLevelOne!.email,
        subject: nextStepCopy.subject,
        summary: nextStepCopy.summary,
        details: [
          { label: "Reference No.", value: referenceNo },
          { label: "Requester", value: submitterName || submitterEmail },
          { label: "Current role", value: resolvedLevelOne!.roles?.[0] || "Approver" },
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
    } catch (e) {
      console.error("Email notification failed:", e);
    }

    return okRedirect(`/requests/${referenceNo}`);
  } catch (error) {
    return fail(errorMessage(error, "Could not update this travel request."));
  }
}
