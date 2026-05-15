import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { safeAuth } from "@/lib/safe-auth";
import { Navbar } from "@/components/navbar";
import { connectMongo } from "@/lib/db/mongo";
import { RequestModel } from "@/models/Request";
import { isAdminUser } from "@/lib/admin";
import {
  cashAdvanceFieldMap,
  importedFieldMap,
  reimbursementFieldMap,
  travelBookingFieldMap,
} from "@/lib/request-fields";
import { humanizeWorkflowRole } from "@/lib/workflow-routing";

const FORM_LABELS: Record<string, string> = {
  "travel-booking": "Travel Booking",
  "cash-advance": "Cash Advance",
  "reimbursement": "Reimbursement",
  "request-for-payment": "Request for Payment",
  "cashiering": "Cashiering",
  imported: "Imported Form",
};

const STATUS_TONES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  returned: "bg-blue-100 text-blue-800 border-blue-200",
  submitted: "bg-sky-100 text-sky-800 border-sky-200",
};

const STEP_STATUS_TONES: Record<string, string> = {
  waiting: "bg-slate-100 text-slate-600 border-slate-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  returned: "bg-blue-100 text-blue-800 border-blue-200",
  edited: "bg-purple-100 text-purple-800 border-purple-200",
  skipped: "bg-slate-100 text-slate-600 border-slate-200",
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
  const isApprover = doc.approvalChain.some((s) => s.approverEmail === userEmail);
  const canView = isOwner || isApprover || (await isAdminUser(userEmail));
  if (!canView) redirect("/dashboard");

  const currentStep = doc.approvalChain.find((s) => s.step === doc.currentStep) ?? null;
  const hasEditableRuntime = ["travel-booking", "cash-advance", "reimbursement"].includes(doc.formType);

  const lastEdit = [...(doc.history ?? [])]
    .reverse()
    .find((h) => h.action === "edited") as any;
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

  const formLabel =
    doc.formName
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
        : `Current status: ${doc.status}`;
  const returnHref =
    typeof resolvedSearchParams.from === "string" && resolvedSearchParams.from.startsWith("/")
      ? resolvedSearchParams.from
      : "/dashboard";
  const returnLabel = returnHref.startsWith("/admin/requests") ? "Back to admin queue" : "Back to dashboard";
  const historyItems = [...(doc.history ?? [])]
    .slice()
    .sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const submittedAt =
    historyItems.find((entry: any) => entry.action === "submitted")?.at ??
    (doc as any).createdAt ??
    null;
  const latestActivityAt =
    historyItems[0]?.at ??
    (doc as any).updatedAt ??
    (doc as any).createdAt ??
    null;
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

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 overflow-hidden">
          <div className="bg-gradient-to-r from-brand-700 to-brand-500 px-6 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white">
              {formLabel}
            </h1>
            <p className="text-green-100 text-sm mt-1">
              {headerSubtitle}
            </p>
          </div>
          <div className="p-6">
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-3 mb-5">
              <Row
                label="Reference #"
                value={
                  <span className="font-mono font-bold text-brand-700 tracking-widest">
                    {doc.referenceNo}
                  </span>
                }
              />
              <div className="border-t border-brand-100"></div>
              <Row
                label="Status"
                value={
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                      STATUS_TONES[doc.status] ?? ""
                    }`}
                  >
                    {doc.status}
                  </span>
                }
              />
              <div className="border-t border-brand-100"></div>
              <Row
                label="Submitted by"
                value={
                  <span className="text-sm text-gray-700">
                    {submittedByName || submittedByEmail}
                  </span>
                }
              />
            </div>

            {doc.approvalChain.length > 0 && (
              <>
                <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-3">
                  Request tracker
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <TrackerStat
                    label="Submitted"
                    value={formatTrackerDateTime(submittedAt)}
                    tone="sky"
                  />
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
                <ol className="space-y-3 mb-6">
                  {doc.approvalChain.map((step) => {
                    const isCurrent = step.step === doc.currentStep;
                    const roleLabel = humanizeWorkflowRole(step.role) || step.role;
                    const actedAt = step.actedAt ? formatTrackerDateTime(step.actedAt) : "";
                    return (
                      <li
                        key={step.step}
                        className={`rounded-xl border px-4 py-3 ${
                          isCurrent
                            ? "border-brand-300 bg-brand-50"
                            : "border-gray-100 bg-white"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                              step.status === "approved"
                                ? "bg-green-600 text-white"
                                : step.status === "rejected"
                                  ? "bg-red-600 text-white"
                                  : step.status === "returned"
                                    ? "bg-blue-600 text-white"
                                    : isCurrent
                                      ? "bg-brand-600 text-white"
                                      : "bg-gray-200 text-gray-500"
                            }`}
                          >
                            {step.step}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-gray-800">
                                {roleLabel}
                              </p>
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                  STEP_STATUS_TONES[step.status] ?? "bg-slate-100 text-slate-600 border-slate-200"
                                }`}
                              >
                                {humanizeStatus(step.status)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">
                              {step.approverName || step.approverEmail}
                            </p>
                            {step.approverEmail && step.approverName ? (
                              <p className="text-xs text-gray-500 mt-1">{step.approverEmail}</p>
                            ) : null}
                            <p className="text-xs text-gray-500 mt-2">
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
                              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                {step.comment}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}

            {historyItems.length > 0 && (
              <>
                <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-3">
                  Activity log
                </h2>
                <div className="mb-6 rounded-2xl border border-brand-100 bg-white p-4">
                  <ol className="space-y-3">
                    {historyItems.slice(0, 8).map((item: any, index: number) => (
                      <li key={`${item.action}-${item.at}-${index}`} className="flex gap-3">
                        <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">
                            {humanizeHistoryAction(item.action)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatTrackerDateTime(item.at)}{item.byName || item.byEmail ? ` • ${item.byName || item.byEmail}` : ""}
                          </p>
                          {buildHistorySummary(item.details) ? (
                            <p className="text-xs text-gray-600 mt-1">{buildHistorySummary(item.details)}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            )}

            {Object.keys(fieldMap).length > 0 && (
              <>
                <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-3">
                  Request details
                </h2>
                <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5 mb-6">
                  <div className="space-y-3">
                    {Object.entries(fieldMap)
                      .filter(([k, v]) => Boolean(v) || Boolean(changedFields[k]))
                      .map(([k, v]) => (
                        <DetailRow
                          key={k}
                          label={humanizeKey(k)}
                          value={v}
                          changed={changedFields[k]}
                        />
                      ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2">
              {isOwner && (doc.status === "pending" || doc.status === "returned") && hasEditableRuntime && (
                <Link
                  href={`/requests/${encodeURIComponent(doc.referenceNo)}/edit`}
                  className="flex-1 text-center bg-white border border-brand-200 text-brand-700 font-semibold py-2.5 rounded-lg hover:bg-brand-50 transition"
                >
                  Edit request
                </Link>
              )}
              <Link
                href={returnHref}
                className="flex-1 text-center bg-gradient-to-br from-brand-600 to-brand-700 text-white font-semibold py-2.5 rounded-lg hover:opacity-95 active:scale-[0.99] transition"
              >
                {returnLabel}
              </Link>
            </div>
          </div>
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
    .replace(/\b\w/g, (m) => m.toUpperCase());
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
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label}
      </span>
      {value}
    </div>
  );
}

function humanizeKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
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
  return (
    <div className="flex justify-between items-start gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {label}
          </span>
          {changed && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Edited
            </span>
          )}
        </div>
        {changed?.from ? (
          <div className="text-[11px] text-gray-400 mt-1">
            Previous: <span className="font-mono">{changed.from}</span>
          </div>
        ) : null}
      </div>
      <div className="text-sm text-gray-700 text-right break-words max-w-[60%]">
        {value}
      </div>
    </div>
  );
}
