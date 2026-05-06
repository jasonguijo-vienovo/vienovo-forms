"use server";

import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { setFlashToast } from "@/lib/flash";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { getFormUserAccess } from "@/lib/forms/runtime-state";
import { errorMessage, fail, okRedirect, type FormActionResult } from "@/lib/forms/action-result";
import { sendFlowNotification } from "@/lib/notifications/flow";
import { deriveRequestQueueFields } from "@/lib/request-queue";
import { generateReferenceNo } from "@/lib/reference-number";
import { syncRequestMirror } from "@/lib/request-mirror";
import { RequestModel } from "@/models/Request";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function submitGeneralRequest(formData: FormData): Promise<FormActionResult> {
  try {
    const session = await auth();
    const submitterEmail = session?.user?.email?.toLowerCase();
    const submitterName = session?.user?.name ?? submitterEmail ?? "";
    if (!submitterEmail) throw new Error("Not signed in");

    await connectMongo();

    const definition = await getFormDefinitionBySlug("general-request");
    if (!definition || !getFormUserAccess(definition, { isAdmin: false }).canSubmit) {
      throw new Error("This form is not available right now.");
    }

    const requestTitle = s(formData, "requestTitle");
    const requestDetails = s(formData, "requestDetails");
    const fullName = s(formData, "fullName") || submitterName;

    if (!requestTitle) throw new Error("Request title is required.");
    if (!requestDetails) throw new Error("Request details are required.");

    const referenceNo = await generateReferenceNo("imported");

    const approvalChain = [] as any[];
    const history = [{ at: new Date(), byEmail: submitterEmail, byName: submitterName, action: "submitted", details: {} }];

    const queueFields = deriveRequestQueueFields({
      status: "submitted",
      approvalChain,
      currentStep: 0,
      history,
      submittedBy: { email: submitterEmail, name: submitterName },
    });

    const created = await RequestModel.create({
      formType: "imported",
      formSlug: "general-request",
      formName: "General Request",
      referenceNo,
      submittedBy: { email: submitterEmail, name: fullName },
      formData: { requestTitle, requestDetails, fullName },
      approvalChain,
      currentStep: 0,
      status: "submitted",
      history,
      ...queueFields,
    });

    await syncRequestMirror({
      requestId: String(created._id),
      referenceNo,
      formSlug: "general-request",
      formName: "General Request",
      submittedBy: { email: submitterEmail, name: fullName },
      formData: { requestTitle, requestDetails, fullName },
      approvalChain: created.approvalChain,
      currentStep: created.currentStep,
      status: created.status,
      history: created.history,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });

    await setFlashToast({ tone: "success", message: `General Request submitted: ${referenceNo}` });

    try {
      await sendFlowNotification({
        formSlug: "general-request",
        formName: "General Request",
        event: "submitted",
        to: [submitterEmail],
        subject: `General Request submitted (${referenceNo})`,
        text: `Your request has been submitted.\n\nReference: ${referenceNo}`,
      });
    } catch (error) {
      console.error("General request notification failed:", error);
    }

    return okRedirect(`/requests/${referenceNo}`);
  } catch (error) {
    return fail(errorMessage(error, "Could not submit this request."));
  }
}
