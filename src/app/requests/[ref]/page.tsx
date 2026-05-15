import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { isAdminUser } from "@/lib/admin";
import { connectMongo } from "@/lib/db/mongo";
import {
  cashAdvanceFieldMap,
  importedFieldMap,
  reimbursementFieldMap,
  travelBookingFieldMap,
} from "@/lib/request-fields";
import { safeAuth } from "@/lib/safe-auth";
import { humanizeWorkflowRole } from "@/lib/workflow-routing";
import { RequestModel } from "@/models/Request";

const FORM_LABELS: Record<string, string> = {
  "travel-booking": "Travel Booking",
  "cash-advance": "Cash Advance",
  reimbursement: "Reimbursement",
  "request-for-payment": "Request for Payment",
  cashiering: "Cashiering",
  imported: "Imported Form",
};

const STATUS_TONES: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-green-200 bg-green-50 text-green-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  returned: "border-blue-200 bg-blue-50 text-blue-800",
  submitted: "border-sky-200 bg-sky-50 text-sky-800",
};

const STEP_STATUS_TONES: Record<string, string> = {
  waiting: "border-slate-200 bg-slate-100 text-slate-600",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-green-200 bg-green-50 text-green-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  returned: "border-blue-200 bg-blue-50 text-blue-800",
  edited: "border-purple-200 bg-purple-50 text-purple-800",
  skipped: "border-slate-200 bg-slate-100 text-slate-600",
};

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams?: Promise<{ from?: string }>;
}) {
  const { ref } = await params;
  const decodedRef = decodeURIComponent(ref);
  const resolvedSearchParams = (await searchParams) ?? {};
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo: decodedRef }).lean();
  if (!doc) notFound();

  const userEmail = session.user.email.toLowerCase();
  const submittedByEmail = doc.submittedBy?.email ?? "";
  const submittedByName = doc.submittedBy?.name ?? "";
  const isOwner = submittedByEmail === userEmail;
  const isApprover = doc.approvalChain.some((step) => step.approverEmail === userEmail);
  const canView = isOwner || isApprover || (await isAdminUser(userEmail));
  if (!canView) redirect("/dashboard");

  const currentStep = doc.approvalChain.find((step) => step.step === doc.currentStep) ?? null;
  const isCurrentApprover =
    currentStep?.approverEmail === userEmail && currentStep?.status === "pending";
  const hasEditableRuntime = ["travel-booking", "cash-advance", "reimbursement"].includes(
    doc.formType,
  );
  const ownerCanEdit =
    isOwner && (doc.status === "pending" || doc.status === "returned") && hasEditableRuntime;

  const lastEdit = [...(doc.history ?? [])]
    .reverse()
    .find((item) => item.action === "edited") as any;
  const changedFields: Record<string, { from: string; to: string }> =
    (lastEdit?.details?.changedFields as any) ?? {};

  const fieldMap =
    doc.formType === "travel-booking"
      ? travelBookingFieldMap((doc as any).formData ?? {})
      : doc.formType === "cash-advance"
        ? cashAdvanceFieldMap((doc as any).formData ?? {})
        : doc.formType === "reimbursement"
          ? reimbursementFieldMap((doc as any).formData ?? {})
          : doc.formType === "imported"
            ? importedFieldMap((doc as any).formData ?? {})
            : {};

  const formLabel = doc.formName
    ? String(doc.formName)
    : doc.formType === "imported"
      ? (doc as any).formData?.importedFormName || FORM_LABELS[doc.formType]
      : FORM_LABELS[doc.formType] ?? doc.formType;
  const headerSubtitle =
    doc.status === "returned"
      ? "This request was returned for correction."
      : doc.status === "submitted" && doc.approvalChain.length === 0
        ? "This imported form was received and saved in the system."
        : currentStep?.approverName
          ? `Pending approval from ${currentStep.approverName}`
          : `Current status: ${humanizeStatus(doc.status)}`;
  const returnHref =
    typeof resolvedSearchParams.from === "string" && resolvedSearchParams.from.startsWith("/")
      ? resolvedSearchParams.from
      : "/dashboard";
  const returnLabel = returnHref.startsWith("/admin/requests")
    ? "Back to admin queue"
    : "Back to dashboard";
  const historyItems = [...(doc.history ?? [])]
    .slice()
    .sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const submittedAt =
    historyItems.find((entry: any) => entry.action === "submitted")?.at ??
    (doc as any).createdAt ??
    null;
  const latestActivityAt =
    historyItems[0]?.at ?? (doc as any).updatedAt ?? (doc as any).createdAt ?? null;
  const currentStageLabel =
    doc.status === "approved"
      ? "Fully approved"
      : doc.status === "rejected"
        ? "Rejected"
        : doc.status === "returned"
          ? "Returned for correction"
          : currentStep
            ? `${humanizeWorkflowRole(currentStep.role) || currentStep.role} review`
            : "Submitted";
  const approveHref = isCurrentApprover
    ? `/requests/${encodeURIComponent(doc.referenceNo)}/approve`
    : null;
  const latestEditRestartedApproval =
    lastEdit?.details?.resetToStep === 1 && doc.status === "pending" && doc.currentStep === 1;

  return (
    <>
      <Navbar />
      <main className="app-page app-page--full">
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="app-panel overflow-hidden border-brand-100 bg-white/90">
            <div className="border-b border-brand-100 bg-gradient-to-r from-brand-700 via-brand-700 to-brand-600 px-5 py-6 text-white sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                    Request detail
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {formLabel}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-white/85">{headerSubtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`status-pill ${STATUS_TONES[doc.status] ?? "border-white/20 bg-white/10 text-white"}`}>
                    {humanizeStatus(doc.status)}
                  </span>
                  <span className="status-pill border-white/20 bg-white/10 font-mono text-white">
                    {doc.referenceNo}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <div className="grid gap-4 md:grid-cols-3">
                <TrackerStat label="Submitted" value={formatTrackerDateTime(submittedAt)} tone="sky" />
                <TrackerStat
                  label="Current stage"
                  value={currentStageLabel}
                  tone={doc.status === "approved" ? "green" : doc.status === "rejected" ? "red" : "brand"}
                />
                <TrackerStat
                  label="Last activity"
                  value={formatTrackerDateTime(latestActivityAt)}
                  tone="slate"
                />
              </div>

              {approveHref ? (
                <ActionBanner
                  tone="brand"
                  title="You have an action waiting on this request."
                  description="Open the approval page to approve, reject, or return it with a note."
                  action={<Link href={approveHref} className="btn-primary justify-center">Open approval actions</Link>}
                />
              ) : null}

              {ownerCanEdit ? (
                <ActionBanner
                  tone={doc.status === "returned" ? "info" : "brand"}
                  title={
                    doc.status === "returned"
                      ? "This request needs corrections."
                      : "You can still update this request."
                  }
                  description={
                    doc.status === "returned"
                      ? "Review the activity log and approval notes below, then edit the request to resubmit the corrected details."
                      : "If something is missing or outdated, update the request before the workflow moves further."
                  }
                  action={
                    <Link href={`/requests/${encodeURIComponent(doc.referenceNo)}/edit`} className="btn-secondary justify-center">
                      Edit request
                    </Link>
                  }
                />
              ) : null}

              {latestEditRestartedApproval ? (
                <ActionBanner
                  tone="info"
                  title="Approval restarted from level 1 after your edit."
                  description="The saved request details below are current, and the approval tracker has been reset so level 1 review happens again from the start."
                />
              ) : null}

              <div className="grid gap-4 md:grid-cols-3">
                <RequestInfoCard
                  label="Reference number"
                  value={<span className="font-mono text-sm font-semibold text-brand-700">{doc.referenceNo}</span>}
                />
                <RequestInfoCard
                  label="Submitted by"
                  value={<span>{submittedByName || submittedByEmail}</span>}
                />
                <RequestInfoCard
                  label="Current status"
                  value={<span>{humanizeStatus(doc.status)}</span>}
                />
              </div>

              {doc.approvalChain.length > 0 ? (
                <section className="space-y-3">
                  <SectionHeading
                    title="Approval tracker"
                    description="This screen and the approval actions page use the same stage and status language."
                  />
                  <ol className="space-y-3">
                    {doc.approvalChain.map((step) => {
                      const isCurrent = step.step === doc.currentStep;
                      const roleLabel = humanizeWorkflowRole(step.role) || step.role;
                      const actedAt = step.actedAt ? formatTrackerDateTime(step.actedAt) : "";
                      return (
                        <li
                          key={step.step}
                          className={`rounded-[0.875rem] border px-4 py-4 ${
                            isCurrent ? "border-brand-300 bg-brand-50" : "border-surface-border bg-white"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                step.status === "approved"
                                  ? "bg-green-600 text-white"
                                  : step.status === "rejected"
                                    ? "bg-red-600 text-white"
                                    : step.status === "returned"
                                      ? "bg-blue-600 text-white"
                                      : isCurrent
                                        ? "bg-brand-600 text-white"
                                        : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {step.step}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-surface-text">{roleLabel}</p>
                                <span className={`status-pill ${STEP_STATUS_TONES[step.status] ?? "border-slate-200 bg-slate-100 text-slate-600"}`}>
                                  {humanizeStatus(step.status)}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-slate-700">
                                {step.approverName || step.approverEmail}
                              </p>
                              {step.approverEmail && step.approverName ? (
                                <p className="mt-1 text-xs text-surface-muted">{step.approverEmail}</p>
                              ) : null}
                              <p className="mt-2 text-xs text-surface-muted">
                                {step.status === "approved"
                                  ? `Approved${actedAt ? ` on ${actedAt}` : ""}`
                                  : step.status === "rejected"
                                    ? `Rejected${actedAt ? ` on ${actedAt}` : ""}`
                                    : step.status === "returned"
                                      ? `Returned for correction${actedAt ? ` on ${actedAt}` : ""}`
                                      : step.status === "pending"
                                        ? isCurrent
                                          ? "Waiting for action now"
                                          : "Queued for action"
                                        : step.status === "waiting"
                                          ? "Waiting for earlier steps to finish"
                                          : humanizeStatus(step.status)}
                              </p>
                              {step.comment ? (
                                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                  {step.comment}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ) : null}

              {historyItems.length > 0 ? (
                <section className="space-y-3">
                  <SectionHeading
                    title="Activity log"
                    description="Use this timeline to understand what changed, who acted, and why."
                  />
                  <div className="rounded-[0.875rem] border border-surface-border bg-white p-4">
                    <ol className="space-y-3">
                      {historyItems.slice(0, 8).map((item: any, index: number) => (
                        <li key={`${item.action}-${item.at}-${index}`} className="flex gap-3">
                          <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-surface-text">
                              {humanizeHistoryAction(item.action)}
                            </p>
                            <p className="mt-1 text-xs text-surface-muted">
                              {formatTrackerDateTime(item.at)}
                              {item.byName || item.byEmail ? ` - ${item.byName || item.byEmail}` : ""}
                            </p>
                            {buildHistorySummary(item.details) ? (
                              <p className="mt-1 text-xs text-slate-600">
                                {buildHistorySummary(item.details)}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </section>
              ) : null}

              {Object.keys(fieldMap).length > 0 ? (
                <section className="space-y-3">
                  <SectionHeading
                    title="Request details"
                    description="These fields reflect the current saved version of the request."
                  />
                  <div className="rounded-[0.875rem] border border-surface-border bg-white p-5">
                    <div className="space-y-3">
                      {Object.entries(fieldMap)
                        .filter(([key, value]) => Boolean(value) || Boolean(changedFields[key]))
                        .map(([key, value]) => (
                          <DetailRow
                            key={key}
                            label={humanizeKey(key)}
                            value={value}
                            changed={changedFields[key]}
                          />
                        ))}
                    </div>
                  </div>
                </section>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                {ownerCanEdit ? (
                  <Link
                    href={`/requests/${encodeURIComponent(doc.referenceNo)}/edit`}
                    className="btn-secondary w-full justify-center sm:w-auto"
                  >
                    Edit request
                  </Link>
                ) : null}
                <Link href={returnHref} className="btn-primary w-full justify-center sm:w-auto">
                  {returnLabel}
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function formatTrackerDateTime(value: Date | string | null | undefined) {
  if (!value) return "Not available";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
}

function humanizeStatus(status: string) {
  return String(status || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function humanizeHistoryAction(action: string) {
  if (action === "submitted") return "Request submitted";
  if (action === "approved") return "Approval recorded";
  if (action === "rejected") return "Request rejected";
  if (action === "returned") return "Returned for correction";
  if (action === "edited") return "Request updated";
  return humanizeStatus(action);
}

function buildHistorySummary(details: any) {
  if (!details || typeof details !== "object") return "";
  if (details.resetToStep) {
    const changedCount =
      details.changedFields && typeof details.changedFields === "object"
        ? Object.keys(details.changedFields).length
        : 0;
    return changedCount > 0
      ? `Request updated. Approval restarted at level ${details.resetToStep}. ${changedCount} field${changedCount === 1 ? "" : "s"} changed.`
      : `Request updated. Approval restarted at level ${details.resetToStep}.`;
  }
  if (details.role) {
    const roleLabel = humanizeWorkflowRole(details.role) || String(details.role);
    if (details.comment) return `${roleLabel}: ${details.comment}`;
    return roleLabel;
  }
  if (details.comment) return String(details.comment);
  if (details.step) return `Step ${details.step}`;
  return "";
}

function TrackerStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "brand" | "green" | "red" | "sky" | "slate";
}) {
  const tones: Record<typeof tone, string> = {
    brand: "border-brand-100 bg-brand-50 text-brand-700",
    green: "border-green-100 bg-green-50 text-green-700",
    red: "border-red-100 bg-red-50 text-red-700",
    sky: "border-sky-100 bg-sky-50 text-sky-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <div className={`rounded-[0.875rem] border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="section-eyebrow">{title}</p>
      <p className="mt-1 text-sm text-surface-muted">{description}</p>
    </div>
  );
}

function RequestInfoCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-[0.875rem] border border-surface-border bg-slate-50/70 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">{label}</p>
      <div className="mt-2 text-sm font-semibold text-surface-text">{value}</div>
    </div>
  );
}

function ActionBanner({
  tone,
  title,
  description,
  action,
}: {
  tone: "brand" | "info";
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const toneClass =
    tone === "info" ? "border-blue-200 bg-blue-50" : "border-brand-100 bg-brand-50";

  return (
    <div className={`rounded-[0.875rem] border px-4 py-4 ${toneClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-surface-text">{title}</p>
          <p className="mt-1 text-sm text-surface-muted">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

function humanizeKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function DetailRow({
  label,
  value,
  changed,
}: {
  label: string;
  value: React.ReactNode;
  changed?: { from: string; to: string };
}) {
  const formattedValue = formatDetailValue(label, value);
  const previousValue = changed?.from ? formatDetailString(label, changed.from) : "";

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
          {changed ? (
            <span className="status-pill border-amber-200 bg-amber-50 text-amber-800">Edited</span>
          ) : null}
        </div>
        {previousValue ? (
          <div className="mt-1 text-[11px] text-gray-400">
            Previous: <span className="font-mono">{previousValue}</span>
          </div>
        ) : null}
      </div>
      <div className="max-w-[60%] break-words text-right text-sm text-gray-700">{formattedValue}</div>
    </div>
  );
}

function formatDetailValue(label: string, value: React.ReactNode) {
  if (typeof value !== "string") return value;
  return formatDetailString(label, value);
}

function formatDetailString(label: string, value: string) {
  if (!/status/i.test(label)) return value;
  return humanizeStatus(value);
}
