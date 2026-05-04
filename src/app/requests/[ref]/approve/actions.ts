"use server";

import { redirect } from "next/navigation";
import { safeAuth } from "@/lib/safe-auth";
import { connectMongo } from "@/lib/db/mongo";
import { RequestModel } from "@/models/Request";

function s(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function approveCurrentStep(referenceNo: string, formData: FormData) {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  const userName = session?.user?.name ?? userEmail ?? "";
  if (!userEmail) redirect("/sign-in");

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo }).lean();
  if (!doc) throw new Error("Request not found");

  const current = doc.approvalChain.find((a) => a.step === doc.currentStep) ?? null;
  if (!current || current.status !== "pending") throw new Error("Nothing to approve.");
  if (current.approverEmail !== userEmail) throw new Error("Forbidden: not the current approver.");

  const comment = s(formData, "comment");

  const isFinal = doc.currentStep >= doc.approvalChain.length;
  const nextStep = isFinal ? doc.currentStep : doc.currentStep + 1;

  const chain = doc.approvalChain.map((a) => {
    if (a.step === doc.currentStep) {
      return { ...a, status: "approved", actedAt: new Date(), comment };
    }
    if (!isFinal && a.step === nextStep) {
      return { ...a, status: "pending" };
    }
    return a;
  });

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        approvalChain: chain,
        currentStep: isFinal ? doc.currentStep : nextStep,
        status: isFinal ? "approved" : doc.status,
      },
      $push: {
        history: {
          at: new Date(),
          byEmail: userEmail,
          byName: userName,
          action: "approved",
          details: { step: doc.currentStep, role: current.role, comment },
        },
      },
    }
  );

  redirect(`/requests/${referenceNo}`);
}

export async function rejectCurrentStep(referenceNo: string, formData: FormData) {
  const session = await safeAuth();
  const userEmail = session?.user?.email?.toLowerCase();
  const userName = session?.user?.name ?? userEmail ?? "";
  if (!userEmail) redirect("/sign-in");

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo }).lean();
  if (!doc) throw new Error("Request not found");

  const current = doc.approvalChain.find((a) => a.step === doc.currentStep) ?? null;
  if (!current || current.status !== "pending") throw new Error("Nothing to reject.");
  if (current.approverEmail !== userEmail) throw new Error("Forbidden: not the current approver.");

  const comment = s(formData, "comment");

  const chain = doc.approvalChain.map((a) => {
    if (a.step === doc.currentStep) {
      return { ...a, status: "rejected", actedAt: new Date(), comment };
    }
    return a;
  });

  await RequestModel.updateOne(
    { _id: (doc as any)._id },
    {
      $set: {
        approvalChain: chain,
        status: "rejected",
      },
      $push: {
        history: {
          at: new Date(),
          byEmail: userEmail,
          byName: userName,
          action: "rejected",
          details: { step: doc.currentStep, role: current.role, comment },
        },
      },
    }
  );

  redirect(`/requests/${referenceNo}`);
}

