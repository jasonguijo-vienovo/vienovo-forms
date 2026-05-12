import { connectMongo } from "@/lib/db/mongo";
import { RequestModel } from "@/models/Request";

type LeanApprovalStep = {
  step: number;
  role: string;
  approverEmail: string;
  approverName?: string;
  status: string;
  actedAt?: Date | string | null;
  comment?: string;
};

type LeanRequest = {
  _id: unknown;
  referenceNo: string;
  formType: string;
  formSlug?: string;
  formName?: string;
  status: string;
  currentStep: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  submittedBy?: {
    name?: string;
    email?: string;
  };
  approvalChain: LeanApprovalStep[];
};

export type ApprovalQueueItem = {
  id: string;
  referenceNo: string;
  formType: string;
  formSlug: string;
  formName: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  submittedBy: {
    name: string;
    email: string;
  };
  currentStep: number;
  activeStep: {
    step: number;
    role: string;
    approverEmail: string;
    approverName: string;
    status: string;
    actedAt: string | null;
    comment: string;
  } | null;
  latestUserDecision: {
    step: number;
    role: string;
    status: "approved" | "rejected";
    actedAt: string | null;
    comment: string;
  } | null;
};

export type ApprovalQueueData = {
  pending: ApprovalQueueItem[];
  recentlyApproved: ApprovalQueueItem[];
  recentlyRejected: ApprovalQueueItem[];
  metrics: {
    pending: number;
    approvedRecently: number;
    rejectedRecently: number;
    actedRecently: number;
  };
};

function normalizeText(value: string | null | undefined, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compareByMostRecentAction(a: ApprovalQueueItem, b: ApprovalQueueItem) {
  const aValue =
    a.latestUserDecision?.actedAt ??
    a.activeStep?.actedAt ??
    a.updatedAt ??
    a.createdAt;
  const bValue =
    b.latestUserDecision?.actedAt ??
    b.activeStep?.actedAt ??
    b.updatedAt ??
    b.createdAt;
  return new Date(bValue ?? 0).getTime() - new Date(aValue ?? 0).getTime();
}

function mapRequest(doc: LeanRequest, email: string): ApprovalQueueItem {
  const normalizedEmail = normalizeEmail(email);
  const activeStep = doc.approvalChain.find((step) => step.step === doc.currentStep) ?? null;
  const matchingUserSteps = doc.approvalChain
    .filter(
      (step) =>
        normalizeEmail(step.approverEmail) === normalizedEmail &&
        (step.status === "approved" || step.status === "rejected"),
    )
    .sort((left, right) => {
      const rightAt = new Date(right.actedAt ?? 0).getTime();
      const leftAt = new Date(left.actedAt ?? 0).getTime();
      return rightAt - leftAt;
    });

  const latestUserDecision = matchingUserSteps[0] ?? null;

  return {
    id: String(doc._id),
    referenceNo: doc.referenceNo,
    formType: doc.formType,
    formSlug: normalizeText(doc.formSlug, doc.formType),
    formName: normalizeText(doc.formName, doc.formSlug || doc.formType),
    status: doc.status,
    createdAt: toIso(doc.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(doc.updatedAt),
    submittedBy: {
      name: normalizeText(doc.submittedBy?.name, "Requester"),
      email: normalizeText(doc.submittedBy?.email),
    },
    currentStep: doc.currentStep,
    activeStep: activeStep
      ? {
          step: activeStep.step,
          role: normalizeText(activeStep.role),
          approverEmail: normalizeText(activeStep.approverEmail),
          approverName: normalizeText(activeStep.approverName),
          status: normalizeText(activeStep.status),
          actedAt: toIso(activeStep.actedAt),
          comment: normalizeText(activeStep.comment),
        }
      : null,
    latestUserDecision: latestUserDecision
      ? {
          step: latestUserDecision.step,
          role: normalizeText(latestUserDecision.role),
          status: latestUserDecision.status as "approved" | "rejected",
          actedAt: toIso(latestUserDecision.actedAt),
          comment: normalizeText(latestUserDecision.comment),
        }
      : null,
  };
}

export async function getApprovalQueueData(email: string): Promise<ApprovalQueueData> {
  await connectMongo();
  const normalizedEmail = normalizeEmail(email);
  const emailMatch = new RegExp(`^${escapeRegExp(normalizedEmail)}$`, "i");

  const [pendingDocs, actedDocs] = await Promise.all([
    RequestModel.find({
      status: { $in: ["pending", "submitted", "returned"] },
      approvalChain: {
        $elemMatch: {
          approverEmail: emailMatch,
          status: "pending",
        },
      },
    })
      .sort({ createdAt: -1 })
      .lean<LeanRequest[]>(),
    RequestModel.find({
      approvalChain: {
        $elemMatch: {
          approverEmail: emailMatch,
          status: { $in: ["approved", "rejected"] },
        },
      },
    })
      .sort({ updatedAt: -1 })
      .limit(80)
      .lean<LeanRequest[]>(),
  ]);

  const pending = pendingDocs
    .filter((doc) => {
      const activeStep = doc.approvalChain.find((step) => step.step === doc.currentStep);
      return (
        normalizeEmail(activeStep?.approverEmail) === normalizedEmail &&
        activeStep?.status === "pending"
      );
    })
    .map((doc) => mapRequest(doc, normalizedEmail));

  const acted = actedDocs
    .map((doc) => mapRequest(doc, normalizedEmail))
    .filter((doc) => doc.latestUserDecision);

  const recentlyApproved = acted
    .filter((doc) => doc.latestUserDecision?.status === "approved")
    .sort(compareByMostRecentAction);
  const recentlyRejected = acted
    .filter((doc) => doc.latestUserDecision?.status === "rejected")
    .sort(compareByMostRecentAction);

  return {
    pending,
    recentlyApproved,
    recentlyRejected,
    metrics: {
      pending: pending.length,
      approvedRecently: recentlyApproved.length,
      rejectedRecently: recentlyRejected.length,
      actedRecently: acted.length,
    },
  };
}
