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
  const isCurrentApprover = currentStep?.approverEmail === userEmail && currentStep?.status === "pending";
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
    doc.status === "submitted" && doc.approvalChain.length === 0
      ? "This imported form was received and saved in the system."
      : currentStep?.approverName
        ? `Pending approval from ${currentStep.approverName}`
        : `Current status: ${doc.status}`;
  const returnHref =
    typeof resolvedSearchParams.from === "string" && resolvedSearchParams.from.startsWith("/")
      ? resolvedSearchParams.from
      : "/dashboard";
  const returnLabel = returnHref.startsWith("/admin/requests") ? "Back to admin queue" : "Back to dashboard";

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
                  Approval chain
                </h2>
                <ol className="space-y-2 mb-6">
                  {doc.approvalChain.map((step) => {
                    const isCurrent = step.step === doc.currentStep;
                    return (
                      <li
                        key={step.step}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                          isCurrent
                            ? "border-brand-300 bg-brand-50"
                            : "border-gray-100"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            step.status === "approved"
                              ? "bg-green-600 text-white"
                              : step.status === "rejected"
                                ? "bg-red-600 text-white"
                                : isCurrent
                                  ? "bg-brand-600 text-white"
                                  : "bg-gray-200 text-gray-500"
                          }`}
                        >
                          {step.step}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {step.approverName}
                          </p>
                          <p className="text-xs text-gray-500 capitalize">
                            {step.role}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          {step.status}
                        </span>
                      </li>
                    );
                  })}
                </ol>
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
              {isOwner && doc.status === "pending" && hasEditableRuntime && (
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
