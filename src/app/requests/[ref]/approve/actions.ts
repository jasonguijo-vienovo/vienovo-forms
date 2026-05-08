"use server";

import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { setFlashToast } from "@/lib/flash";
import { applyApprovalDecision } from "@/lib/request-approval";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function approveCurrentStep(referenceNo: string, formData: FormData) {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  const userName = session?.user?.name ?? userEmail ?? "";
  if (!userEmail) redirect("/sign-in");

  const comment = s(formData, "comment");
  const result = await applyApprovalDecision({
    referenceNo,
    userEmail,
    userName,
    decision: "approve",
    comment,
  });

  await setFlashToast({
    tone: "success",
    message: result.isFinal ? `Request approved: ${referenceNo}` : `Approval recorded for ${referenceNo}`,
  });

  redirect(`/requests/${referenceNo}`);
}

export async function rejectCurrentStep(referenceNo: string, formData: FormData) {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  const userName = session?.user?.name ?? userEmail ?? "";
  if (!userEmail) redirect("/sign-in");

  const comment = s(formData, "comment");
  await applyApprovalDecision({
    referenceNo,
    userEmail,
    userName,
    decision: "reject",
    comment,
  });

  await setFlashToast({ tone: "success", message: `Request rejected: ${referenceNo}` });

  redirect(`/requests/${referenceNo}`);
}

