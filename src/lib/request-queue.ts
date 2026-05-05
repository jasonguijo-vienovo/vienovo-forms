export const OPEN_REQUEST_STATUSES = ["pending", "submitted", "returned"] as const;

export const REQUEST_QUEUE_BUCKETS = [
  "pending-approval",
  "needs-processor",
  "submitted",
  "returned",
  "approved",
  "rejected",
  "unknown",
] as const;

export type RequestQueueBucket = (typeof REQUEST_QUEUE_BUCKETS)[number];

type ApprovalStepLike = {
  step?: number;
  role?: string;
  approverEmail?: string;
  approverName?: string;
  status?: string;
  actedAt?: Date | string | null;
  comment?: string;
};

type HistoryLike = {
  at?: Date | string | null;
  byEmail?: string;
  byName?: string;
  action?: string;
  details?: unknown;
};

type QueueSource = {
  status?: string;
  approvalChain?: ApprovalStepLike[] | null;
  currentStep?: number | null;
  history?: HistoryLike[] | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  submittedBy?: {
    email?: string;
    name?: string;
  } | null;
};

export function getCurrentApprovalStep(source: {
  approvalChain?: ApprovalStepLike[] | null;
  currentStep?: number | null;
}) {
  const currentStep = Number(source.currentStep ?? 0);
  return (
    source.approvalChain?.find((step) => Number(step.step ?? 0) === currentStep) ?? null
  );
}

function latestHistoryEntry(history: HistoryLike[] | null | undefined) {
  if (!history || history.length === 0) return null;

  let latest = history[0] ?? null;
  for (const item of history) {
    if (!latest) {
      latest = item;
      continue;
    }

    const latestAt = latest.at ? new Date(latest.at).getTime() : 0;
    const itemAt = item.at ? new Date(item.at).getTime() : 0;
    if (itemAt >= latestAt) latest = item;
  }

  return latest;
}

export function deriveRequestQueueFields(source: QueueSource) {
  const status = String(source.status ?? "unknown");
  const current = status === "pending" ? getCurrentApprovalStep(source) : null;
  const latest = latestHistoryEntry(source.history);
  const fallbackActor =
    source.submittedBy?.name?.trim() || source.submittedBy?.email?.trim() || "";

  let queueBucket: RequestQueueBucket = "unknown";
  if (status === "pending") {
    queueBucket = current?.role === "processor" ? "needs-processor" : "pending-approval";
  } else if (status === "submitted") {
    queueBucket = "submitted";
  } else if (status === "returned") {
    queueBucket = "returned";
  } else if (status === "approved") {
    queueBucket = "approved";
  } else if (status === "rejected") {
    queueBucket = "rejected";
  }

  const lastActionAt = latest?.at
    ? new Date(latest.at)
    : source.updatedAt
      ? new Date(source.updatedAt)
      : source.createdAt
        ? new Date(source.createdAt)
        : new Date();

  return {
    currentActorEmail: current?.approverEmail?.trim().toLowerCase() ?? "",
    currentActorName: current?.approverName?.trim() ?? "",
    currentRole: current?.role?.trim() ?? "",
    queueBucket,
    lastActionAt,
    lastActionBy:
      latest?.byName?.trim() || latest?.byEmail?.trim().toLowerCase() || fallbackActor,
  };
}

export function isOpenRequestStatus(status: string) {
  return OPEN_REQUEST_STATUSES.includes(status as (typeof OPEN_REQUEST_STATUSES)[number]);
}

export function humanizeQueueRole(role: string) {
  if (!role) return "No current assignee";
  return role
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
