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
  ageHours: number;
  urgency: "overdue" | "due-soon" | "normal";
};

export type ApprovalQueueData = {
  pending: ApprovalQueueItem[];
  recentlyApproved: ApprovalQueueItem[];
  recentlyRejected: ApprovalQueueItem[];
  metrics: {
    pending: number;
    overdue: number;
    dueSoon: number;
    approvedRecently: number;
    rejectedRecently: number;
    actedRecently: number;
  };
};

function normalizeText(value: string | null | undefined, fallback = "") {
  return String(value ?? fallback).trim();
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

function ageHoursFrom(value: Date | string | null | undefined) {
  const iso = toIso(value);
  if (!iso) return 0;
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  return Math.floor(elapsed / 3_600_000);
}

function urgencyForAge(ageHours: number): ApprovalQueueItem["urgency"] {
  if (ageHours >= 48) return "overdue";
  if (ageHours >= 24) return "due-soon";
  return "normal";
}

function mapRequest(doc: LeanRequest, email: string): ApprovalQueueItem {
  const activeStep = doc.approvalChain.find((step) => step.step === doc.currentStep) ?? null;
  const matchingUserSteps = doc.approvalChain
    .filter((step) => step.approverEmail === email && (step.status === "approved" || step.status === "rejected"))
    .sort((left, right) => {
      const rightAt = new Date(right.actedAt ?? 0).getTime();
      const leftAt = new Date(left.actedAt ?? 0).getTime();
      return rightAt - leftAt;
    });

  const latestUserDecision = matchingUserSteps[0] ?? null;
  const ageHours = ageHoursFrom(activeStep?.actedAt ?? doc.updatedAt ?? doc.createdAt);

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
    ageHours,
    urgency: urgencyForAge(ageHours),
  };
}

export async function getApprovalQueueData(email: string): Promise<ApprovalQueueData> {
  await connectMongo();

  const [pendingDocs, actedDocs] = await Promise.all([
    RequestModel.find({
      status: { $in: ["pending", "submitted", "returned"] },
      approvalChain: {
        $elemMatch: {
          approverEmail: email,
          status: "pending",
        },
      },
    })
      .sort({ createdAt: -1 })
      .lean<LeanRequest[]>(),
    RequestModel.find({
      approvalChain: {
        $elemMatch: {
          approverEmail: email,
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
      return activeStep?.approverEmail === email && activeStep?.status === "pending";
    })
    .map((doc) => mapRequest(doc, email))
    .sort((left, right) => {
      const urgencyRank = { overdue: 0, "due-soon": 1, normal: 2 };
      const rankDelta = urgencyRank[left.urgency] - urgencyRank[right.urgency];
      if (rankDelta !== 0) return rankDelta;
      return right.ageHours - left.ageHours;
    });

  const acted = actedDocs
    .map((doc) => mapRequest(doc, email))
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
      overdue: pending.filter((item) => item.urgency === "overdue").length,
      dueSoon: pending.filter((item) => item.urgency === "due-soon").length,
      approvedRecently: recentlyApproved.length,
      rejectedRecently: recentlyRejected.length,
      actedRecently: acted.length,
    },
  };
}
