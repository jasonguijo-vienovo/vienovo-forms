"use server";

import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import {
  errorMessage,
  fail,
  okRedirect,
  type FormActionResult,
} from "@/lib/forms/action-result";
import { uploadToDriveFolder } from "@/lib/google/drive";
import { sendFlowNotification } from "@/lib/notifications/flow";
import { generateReferenceNo } from "@/lib/reference-number";
import { Approver } from "@/models/Approver";
import { Employee } from "@/models/Employee";
import { RequestModel } from "@/models/Request";
import { diffFields, travelBookingFieldMap } from "@/lib/request-fields";

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
      const uploaded = await uploadToDriveFolder({
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
      activityScheduleFileName: s(formData, "activityScheduleFileName"),
      activitySchedule,
    };

    await RequestModel.create({
      formType: "travel-booking",
      formSlug: "travel-booking",
      formName: "Travel Booking",
      referenceNo,
      submittedBy: {
        email: submitterEmail,
        name: submitterName,
      },
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
        $setOnInsert: { employeeId: "" },
      },
      { upsert: true },
    );

    const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
    const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";
    await setFlashToast({ tone: "success", message: `Travel Booking submitted: ${referenceNo}` });

    try {
      await sendFlowNotification({
        formSlug: "travel-booking",
        formName: "Travel Booking",
        event: "submitted",
        to: [supervisor.email, processor.email, submitterEmail],
        subject: `Travel Booking request submitted (${referenceNo})`,
        text:
          `A Travel Booking request has been submitted.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
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

    const doc = await RequestModel.findOne({
      referenceNo,
      formType: "travel-booking",
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

    const activityFile = formData.get("activitySchedule");
    let activitySchedule: any = (doc as any).formData?.activitySchedule ?? null;

    if (activityFile instanceof File && activityFile.size > 0) {
      const maxBytes = 10 * 1024 * 1024;
      if (activityFile.size > maxBytes) throw new Error("Activity Schedule file must be 10 MB or less.");
      const bytes = Buffer.from(await activityFile.arrayBuffer());
      const uploaded = await uploadToDriveFolder({
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
      activityScheduleFileName: s(formData, "activityScheduleFileName"),
      activitySchedule,
    };

    const changedFields = diffFields(
      travelBookingFieldMap((doc as any).formData ?? {}),
      travelBookingFieldMap(formDataObj),
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
            details: { resetToStep: 1, changedFields },
          },
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
        $setOnInsert: { employeeId: "" },
      },
      { upsert: true },
    );

    const appUrl = (process.env.AUTH_URL || "").replace(/\/$/, "");
    const requestUrl = appUrl ? `${appUrl}/requests/${referenceNo}` : "";
    await setFlashToast({ tone: "success", message: `Travel Booking updated: ${referenceNo}` });

    try {
      await sendFlowNotification({
        formSlug: "travel-booking",
        formName: "Travel Booking",
        event: "resubmitted",
        to: [supervisor.email, submitterEmail],
        subject: `Travel Booking request updated (${referenceNo})`,
        text:
          `A Travel Booking request has been updated and returned to Step 1 for approval.\n\n` +
          `Reference: ${referenceNo}\n` +
          (requestUrl ? `Link: ${requestUrl}\n` : ""),
      });
    } catch (e) {
      console.error("Email notification failed:", e);
    }

    return okRedirect(`/requests/${referenceNo}`);
  } catch (error) {
    return fail(errorMessage(error, "Could not update this travel request."));
  }
}
