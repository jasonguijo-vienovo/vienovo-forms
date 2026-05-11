"use server";

import { revalidatePath } from "next/cache";
import { safeAuth } from "@/lib/safe-auth";
import { isAdminUser } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import { getFormDefinitionBySlug } from "@/lib/form-definitions";
import { RequestModel } from "@/models/Request";
import { deriveRequestQueueFields } from "@/lib/request-queue";
import { updateResponseSheetStatusByReference } from "@/lib/response-sheet";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function rejectRequestFromQueue(formData: FormData) {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  if (!userEmail || !(await isAdminUser(userEmail))) {
    throw new Error("Forbidden");
  }

  const referenceNo = s(formData, "referenceNo");
  const reason = s(formData, "reason");
  if (!referenceNo) throw new Error("Missing request reference.");

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo }).lean();
  if (!doc) throw new Error("Request not found.");
  if (doc.status === "approved") {
    throw new Error("Approved requests cannot be cancelled from queue.");
  }
  if (doc.status === "rejected") {
    revalidatePath("/admin/requests");
    return;
  }

  const now = new Date();
  const updatedChain = (doc.approvalChain ?? []).map((step) => {
    if (step.status === "pending" || step.status === "waiting") {
      return { ...step, status: "skipped", actedAt: now, comment: reason || "Cancelled by admin queue." };
    }
    return step;
  });
  const historyEntry = {
    at: now,
    byEmail: userEmail,
    byName: session?.user?.name ?? userEmail,
    action: "rejected",
    details: {
      source: "admin-queue",
      reason: reason || "Cancelled by admin queue.",
    },
  };
  const nextHistory = [...(((doc as any).history ?? []) as unknown[]), historyEntry];
  const queueFields = deriveRequestQueueFields({
    status: "rejected",
    approvalChain: updatedChain,
    currentStep: doc.currentStep,
    history: nextHistory as any[],
    createdAt: (doc as any).createdAt,
    updatedAt: now,
    submittedBy: doc.submittedBy,
  });

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        status: "rejected",
        approvalChain: updatedChain,
        ...queueFields,
      },
      $push: { history: historyEntry },
    },
  );

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
    const sheetTitle = configuredSheetTitle || (importedFormName ? `${importedFormName} Responses` : "");

    if (writeResponsesToSheet && spreadsheetId && sheetTitle) {
      const synced = await updateResponseSheetStatusByReference({
        spreadsheetId,
        sheetTitle,
        referenceNo,
        status: "rejected",
      });
      await RequestModel.updateOne(
        { _id: (doc as any)._id },
        {
          $set: {
            sheetStatusSyncedAt: synced ? new Date() : null,
            sheetStatusSyncError: synced ? "" : "Admin queue sync failed to find reference row.",
          },
        },
      );
    }
  } catch (sheetSyncError) {
    console.error("Admin queue sheet status sync failed:", sheetSyncError);
    await RequestModel.updateOne(
      { _id: (doc as any)._id },
      {
        $set: {
          sheetStatusSyncedAt: null,
          sheetStatusSyncError:
            sheetSyncError instanceof Error ? sheetSyncError.message : "Unknown admin queue sheet sync error",
        },
      },
    );
  }

  revalidatePath("/admin/requests");
  revalidatePath("/dashboard");
  revalidatePath(`/requests/${encodeURIComponent(referenceNo)}`);
}

export async function syncRequestStatusToSheetNow(formData: FormData) {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  if (!userEmail || !(await isAdminUser(userEmail))) throw new Error("Forbidden");

  const referenceNo = s(formData, "referenceNo");
  if (!referenceNo) throw new Error("Missing request reference.");

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo }).lean();
  if (!doc) throw new Error("Request not found.");

  const formSlug = String(doc.formSlug || doc.formType || "").trim();
  const definition = formSlug ? await getFormDefinitionBySlug(formSlug) : null;
  const writeResponsesToSheet = Boolean(definition?.writeResponsesToSheet);
  if (!writeResponsesToSheet) return;

  const spreadsheetId =
    String((doc as any)?.responseSpreadsheetId ?? "").trim() ||
    String(definition?.responseSpreadsheetId ?? "").trim() ||
    String((doc as any)?.formData?.spreadsheetId ?? "").trim();
  const configuredSheetTitle =
    String((doc as any)?.responseSheetName ?? "").trim() ||
    String(definition?.responseSheetName ?? "").trim();
  const importedFormName = String((doc as any)?.formData?.importedFormName ?? "").trim();
  const sheetTitle = configuredSheetTitle || (importedFormName ? `${importedFormName} Responses` : "");
  if (!spreadsheetId || !sheetTitle) return;

  const status = String(doc.status ?? "").toLowerCase();
  const mappedStatus: "pending" | "approved" | "rejected" =
    status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending";
  const synced = await updateResponseSheetStatusByReference({
    spreadsheetId,
    sheetTitle,
    referenceNo,
    status: mappedStatus,
  });

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        sheetStatusSyncedAt: synced ? new Date() : null,
        sheetStatusSyncError: synced ? "" : "Manual sync did not find reference row.",
      },
    },
  );

  revalidatePath("/admin/requests");
  revalidatePath(`/requests/${encodeURIComponent(referenceNo)}`);
}
