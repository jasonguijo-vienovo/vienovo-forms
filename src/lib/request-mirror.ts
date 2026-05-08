import mongoose from "mongoose";
import { deriveRequestQueueFields } from "@/lib/request-queue";

function collectionNameForFormSlug(formSlug: string) {
  const normalized = String(formSlug || "requests")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `requests_${normalized || "general"}`;
}

export async function syncRequestMirror(opts: {
  requestId?: string;
  referenceNo: string;
  formSlug: string;
  formName: string;
  submittedBy: { email: string; name: string };
  formData: Record<string, unknown>;
  approvalChain?: unknown[];
  currentStep?: number;
  status: string;
  history?: unknown[];
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Mongo database connection is not ready.");

  const now = new Date();
  const collection = db.collection(collectionNameForFormSlug(opts.formSlug));
  const queueFields = deriveRequestQueueFields({
    status: opts.status,
    approvalChain: opts.approvalChain as any[] | undefined,
    currentStep: opts.currentStep ?? 0,
    history: opts.history as any[] | undefined,
    createdAt: opts.createdAt ?? now,
    updatedAt: opts.updatedAt ?? now,
    submittedBy: opts.submittedBy,
  });
  await collection.updateOne(
    { referenceNo: opts.referenceNo },
    {
      $set: {
        requestId: opts.requestId || "",
        referenceNo: opts.referenceNo,
        formSlug: opts.formSlug,
        formName: opts.formName,
        submittedBy: opts.submittedBy,
        formData: opts.formData,
        approvalChain: opts.approvalChain ?? [],
        currentStep: opts.currentStep ?? 0,
        status: opts.status,
        history: opts.history ?? [],
        ...queueFields,
        mirroredAt: now,
        createdAt: opts.createdAt ?? now,
        updatedAt: opts.updatedAt ?? now,
      },
    },
    { upsert: true },
  );
}
