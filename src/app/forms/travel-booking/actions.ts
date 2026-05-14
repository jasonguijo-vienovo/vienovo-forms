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
import {
  appendSpreadsheetRow,
  ensureSpreadsheetSheet,
  listSpreadsheetSheets,
  readSpreadsheetMatrix,
  writeSpreadsheetRow,
} from "@/lib/google/sheets";
import { uploadAttachment } from "@/lib/storage/attachments";
import { buildPendingStepNotificationCopy, resolveAssignedProcessor } from "@/lib/workflow-routing";
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

const TRAVEL_BOOKING_RESPONSE_HEADERS = [
  "Timestamp",
  "Status",
  "Ref #",
  "Email Address",
  "Full Name",
  "Birthday",
  "Origin",
  "Destination To",
  "Departure Date",
  "Preferred Time of Departure",
  "Multi City Departure (Optional)",
  "Multi City Deaprture Date (Optional)",
  "Preferred Time of Departure ",
  "Airlines",
  "Travel Purpose",
  "Baggage (Kg)",
  "Hotel Accommodation",
  "Immediate Superior",
  "Department Head",
  "Contact Number",
  "SERVICE/PICKUP",
  "Land/Air",
  "ID NUMBER",
  "Activity Schedule",
  "Department",
  "Request #",
] as const;

function normalizeSpreadsheetId(input: string) {
  const value = String(input || "").trim();
  if (!value) return "";
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || value;
}

function normalizeSheetHeader(input: string) {
  return String(input || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function formatSheetTimestamp(value: Date) {
  return value.toLocaleString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Manila",
  });
}

function formatSheetDate(value: Date | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(separator);
}

function buildTravelBookingMultiCityText(multiCity: any) {
  const trips = [multiCity?.trip1, multiCity?.trip2].filter(Boolean);
  return joinNonEmpty(
    trips.map((trip: any) => joinNonEmpty([trip?.origin, trip?.destination], " -> ")),
    " | ",
  );
}

function buildTravelBookingMultiCityDates(multiCity: any) {
  const trips = [multiCity?.trip1, multiCity?.trip2].filter(Boolean);
  return joinNonEmpty(
    trips.map((trip: any) => formatSheetDate(trip?.date ? new Date(trip.date) : null)),
    " | ",
  );
}

function buildTravelBookingMultiCityTimes(multiCity: any) {
  const trips = [multiCity?.trip1, multiCity?.trip2].filter(Boolean);
  return joinNonEmpty(
    trips.map((trip: any) => trip?.time),
    " | ",
  );
}

function buildTravelBookingSheetRow(input: {
  referenceNo: string;
  requestNumber: number;
  submittedByEmail: string;
  formData: any;
}) {
  const formData = input.formData ?? {};
  const hotelAccommodation = joinNonEmpty(
    [
      formData.hotelAccommodation,
      formData.hotelOther,
    ],
    formData.hotelAccommodation && formData.hotelOther ? " - " : "",
  );
  const attachmentValue =
    String(formData?.activitySchedule?.driveWebViewLink || "").trim() ||
    String(formData?.activitySchedule?.fileName || "").trim() ||
    String(formData?.activityScheduleFileName || "").trim();
  const requestNumberText = String(input.requestNumber);

  return [
    formatSheetTimestamp(new Date()),
    "pending",
    input.referenceNo,
    input.submittedByEmail,
    String(formData.fullName || "").trim(),
    formatSheetDate(formData.birthday ? new Date(formData.birthday) : null),
    String(formData.origin || "").trim(),
    String(formData.destination || "").trim(),
    formatSheetDate(formData.departureDate ? new Date(formData.departureDate) : null),
    String(formData.preferredTime || "").trim(),
    buildTravelBookingMultiCityText(formData.multiCity),
    buildTravelBookingMultiCityDates(formData.multiCity),
    buildTravelBookingMultiCityTimes(formData.multiCity),
    String(formData.airline || "").trim(),
    String(formData.travelPurpose || "").trim(),
    String(formData.baggage || "").trim(),
    hotelAccommodation,
    String(formData.immediateSuperiorName || "").trim(),
    String(formData.departmentHeadName || "").trim(),
    String(formData.contactNumber || "").trim(),
    String(formData.servicePickup || "").trim(),
    String(formData.landAir || "").trim(),
    String(formData.employeeId || "").trim(),
    attachmentValue,
    String(formData.department || "").trim(),
    requestNumberText,
  ];
}

function getNextTravelBookingRequestNumber(rows: string[][], headers: string[]) {
  const requestColumnIndex = headers.findIndex((header) => normalizeSheetHeader(header) === "request");
  if (requestColumnIndex < 0) return 1;

  let maxValue = 0;
  for (const row of rows.slice(1)) {
    const raw = String(row?.[requestColumnIndex] ?? "").trim();
    const value = Number.parseInt(raw, 10);
    if (Number.isFinite(value) && value > maxValue) {
      maxValue = value;
    }
  }

  return maxValue + 1;
}

function headersMatchExpected(headers: string[], expectedHeaders: readonly string[]) {
  return (
    headers.length >= expectedHeaders.length &&
    expectedHeaders.every((header, index) => normalizeSheetHeader(headers[index]) === normalizeSheetHeader(header))
  );
}

async function resolveTravelBookingSheetTitle(spreadsheetId: string, preferredSheetTitle: string) {
  const expectedHeaders = [...TRAVEL_BOOKING_RESPONSE_HEADERS];
  const preferred = String(preferredSheetTitle || "").trim();
  const sheetTitles = await listSpreadsheetSheets(spreadsheetId);

  if (preferred && sheetTitles.includes(preferred)) {
    const preferredHeaders = (await readSpreadsheetMatrix(spreadsheetId, `${preferred}!A1:Z1`))[0] ?? [];
    if (headersMatchExpected(preferredHeaders, expectedHeaders) || preferredHeaders.length === 0) {
      return preferred;
    }
  }

  for (const title of sheetTitles) {
    const headers = (await readSpreadsheetMatrix(spreadsheetId, `${title}!A1:Z1`))[0] ?? [];
    if (headersMatchExpected(headers, expectedHeaders)) {
      return title;
    }
  }

  return preferred || "Travel Booking Responses";
}

async function appendTravelBookingResponseRow(input: {
  spreadsheetId: string;
  sheetTitle: string;
  referenceNo: string;
  submittedByEmail: string;
  formData: any;
}): Promise<{ spreadsheetId: string; sheetTitle: string }> {
  const spreadsheetId = normalizeSpreadsheetId(input.spreadsheetId);
  if (!spreadsheetId) {
    throw new Error("Travel Booking response spreadsheet ID is not configured.");
  }

  const resolvedSheetTitle = await resolveTravelBookingSheetTitle(spreadsheetId, input.sheetTitle);
  await ensureSpreadsheetSheet(spreadsheetId, resolvedSheetTitle);
  const matrix = await readSpreadsheetMatrix(spreadsheetId, `${resolvedSheetTitle}!A1:Z5000`);
  const currentHeaders = (matrix[0] ?? []).map((cell) => String(cell ?? "").trim());
  const expectedHeaders = [...TRAVEL_BOOKING_RESPONSE_HEADERS];
  const headersMatch = headersMatchExpected(currentHeaders, expectedHeaders);
  const requestNumber = getNextTravelBookingRequestNumber(
    matrix,
    currentHeaders.length > 0 ? currentHeaders : expectedHeaders,
  );

  if (!headersMatch && currentHeaders.length > 0 && matrix.slice(1).some((row) => row.some((cell) => String(cell || "").trim()))) {
    throw new Error(
      `Existing sheet "${resolvedSheetTitle}" does not match the expected Travel Booking headers. Update the response sheet tab in Forms Registry or align the sheet headers first.`,
    );
  }

  if (!headersMatch) {
    await writeSpreadsheetRow({
      spreadsheetId,
      range: `${resolvedSheetTitle}!A1`,
      values: expectedHeaders,
    });
  }

  await appendSpreadsheetRow({
    spreadsheetId,
    sheetTitle: resolvedSheetTitle,
    values: [
      ...buildTravelBookingSheetRow({
        referenceNo: input.referenceNo,
        requestNumber,
        submittedByEmail: input.submittedByEmail,
        formData: input.formData,
      }),
      ...Array(Math.max(currentHeaders.length - expectedHeaders.length, 0)).fill(""),
    ],
  });

  return {
    spreadsheetId,
    sheetTitle: resolvedSheetTitle,
  };
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

    const [supervisor, head, processor] = await Promise.all([
      supervisorId ? Approver.findById(supervisorId).lean() : null,
      headId ? Approver.findById(headId).lean() : null,
      resolveAssignedProcessor({ definition }),
    ]);

    if (!supervisor) throw new Error("Invalid Immediate Superior");
    if (!head) throw new Error("Invalid Department Head");
    if (!processor) throw new Error("No active processor configured. Ask an admin to assign one.");

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
      immediateSuperiorName: supervisor.name,
      immediateSuperiorEmail: supervisor.email,
      departmentHeadName: head.name,
      departmentHeadEmail: head.email,
      activityScheduleFileName: s(formData, "activityScheduleFileName"),
      activitySchedule,
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
          supervisorEmail: supervisor.email,
          departmentHeadEmail: head.email,
          isActive: true,
        },
      },
      { upsert: true },
    );

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
            sheetStatusSyncError: error instanceof Error ? error.message : "Unknown response export error",
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
      role: "supervisor",
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
    await setFlashToast({ tone: "success", message: `Travel Booking submitted: ${referenceNo}` });

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
        to: supervisor.email,
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
      immediateSuperiorName: supervisor.name,
      immediateSuperiorEmail: supervisor.email,
      departmentHeadName: head.name,
      departmentHeadEmail: head.email,
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
          supervisorEmail: supervisor.email,
          departmentHeadEmail: head.email,
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
      role: "supervisor",
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
        to: supervisor.email,
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
    } catch (e) {
      console.error("Email notification failed:", e);
    }

    return okRedirect(`/requests/${referenceNo}`);
  } catch (error) {
    return fail(errorMessage(error, "Could not update this travel request."));
  }
}
