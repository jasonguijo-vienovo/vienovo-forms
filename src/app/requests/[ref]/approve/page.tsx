import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { findActiveDelegation } from "@/lib/approval-delegations";
import { connectMongo } from "@/lib/db/mongo";
import { buildStoredRequestDetailRows } from "@/lib/request-fields";
import { safeAuth } from "@/lib/safe-auth";
import { humanizeWorkflowRole } from "@/lib/workflow-routing";
import { RequestModel } from "@/models/Request";
import { approveCurrentStep, rejectCurrentStep, returnCurrentStep } from "./actions";

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export default async function ApproveRequestPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const decodedRef = decodeURIComponent(ref);
  const session = await safeAuth();
  if (!session?.user?.email) redirect("/sign-in");
  const userEmail = session.user.email.toLowerCase();

  await connectMongo();
  const doc = await RequestModel.findOne({ referenceNo: decodedRef }).lean();
  if (!doc) notFound();

  const current = doc.approvalChain.find((step) => step.step === doc.currentStep) ?? null;
  if (!current || current.status !== "pending") redirect(`/requests/${encodeURIComponent(decodedRef)}`);

  const currentApproverEmail = normalizeEmail(current.approverEmail);
  const activeDelegation =
    currentApproverEmail === userEmail
      ? null
      : await findActiveDelegation({
          delegatorEmail: currentApproverEmail,
          delegateEmail: userEmail,
        });

  if (currentApproverEmail !== userEmail && !activeDelegation) {
    redirect(`/requests/${encodeURIComponent(decodedRef)}`);
  }

  const currentRoleLabel = humanizeWorkflowRole(current.role) || current.role;
  const submittedBy = doc.submittedBy?.name || doc.submittedBy?.email || "Requester";
  const detailRows = buildStoredRequestDetailRows(doc.formType, (doc as any).formData ?? {});

  const approveAction = approveCurrentStep.bind(null, decodedRef);
  const rejectAction = rejectCurrentStep.bind(null, decodedRef);
  const returnAction = returnCurrentStep.bind(null, decodedRef);

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
                    Approval action
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                    Review request {doc.referenceNo}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-white/85">
                    Use the same workflow language as the request detail page, then choose the action that best matches the current state.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="status-pill border-white/20 bg-white/10 text-white">
                    {currentRoleLabel}
                  </span>
                  <span className="status-pill border-white/20 bg-white/10 font-mono text-white">
                    {doc.referenceNo}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              {activeDelegation ? (
                <div className="rounded-[0.875rem] border border-blue-200 bg-blue-50 px-4 py-4">
                  <p className="text-sm font-semibold text-surface-text">
                    You are acting as a delegate for{" "}
                    {activeDelegation.delegatorName || activeDelegation.delegatorEmail}.
                  </p>
                  <p className="mt-1 text-sm text-surface-muted">
                    The action you take here will apply to the current approval step on their behalf.
                  </p>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-3">
                <InfoCard label="Current approver" value={current.approverName || current.approverEmail} />
                <InfoCard label="Submitted by" value={submittedBy} />
                <InfoCard label="Current stage" value={currentRoleLabel} />
              </div>

              <div className="rounded-[0.875rem] border border-surface-border bg-slate-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-surface-text">How to use this page</p>
                <p className="mt-1 text-sm text-surface-muted">
                  Add a note when it helps the requester or the next approver understand your decision. Use return when the request can continue after corrections, and reject when it should stop entirely.
                </p>
              </div>

              {detailRows.length > 0 ? (
                <section className="rounded-[0.875rem] border border-surface-border bg-white p-5">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-surface-text">Request details</p>
                    <p className="mt-1 text-sm text-surface-muted">
                      Review the saved request details before taking action.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {detailRows.map((row) => (
                      <div key={row.key} className="flex items-start justify-between gap-4">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {row.label}
                        </span>
                        <span className="max-w-[60%] break-words text-right text-sm text-gray-700">
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-3">
                <ActionCard
                  id="approve"
                  title="Approve and continue"
                  description="Use this when the request is ready to move to the next stage or finish."
                  placeholder="Optional approval note"
                  action={approveAction}
                  buttonClassName="btn-primary w-full justify-center"
                  idleLabel="Approve request"
                  pendingLabel="Approving..."
                />
                <ActionCard
                  id="return"
                  title="Return for correction"
                  description="Use this when the requester can fix the issue and submit again."
                  placeholder="Correction note required"
                  action={returnAction}
                  buttonClassName="w-full justify-center rounded-[0.625rem] bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700"
                  idleLabel="Return to requester"
                  pendingLabel="Returning..."
                />
                <ActionCard
                  id="reject"
                  title="Reject request"
                  description="Use this when the request should stop and not proceed in its current form."
                  placeholder="Reason for rejection"
                  action={rejectAction}
                  buttonClassName="w-full justify-center rounded-[0.625rem] bg-red-600 px-4 py-2.5 font-semibold text-white transition hover:bg-red-700"
                  idleLabel="Reject request"
                  pendingLabel="Rejecting..."
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Link href={`/requests/${encodeURIComponent(decodedRef)}`} className="btn-secondary w-full justify-center sm:w-auto">
                  Back to request details
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-[0.875rem] border border-surface-border bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">{label}</p>
      <div className="mt-2 text-sm font-semibold text-surface-text">{value}</div>
    </div>
  );
}

function ActionCard({
  id,
  title,
  description,
  placeholder,
  action,
  buttonClassName,
  idleLabel,
  pendingLabel,
}: {
  id: string;
  title: string;
  description: string;
  placeholder: string;
  action: (formData: FormData) => Promise<void>;
  buttonClassName: string;
  idleLabel: string;
  pendingLabel: string;
}) {
  return (
    <section id={id} className="app-panel p-5">
      <p className="section-eyebrow">{title}</p>
      <p className="mt-2 text-sm text-surface-muted">{description}</p>
      <form action={action} className="mt-4">
        <PendingFormState className="space-y-3">
          <textarea
            name="comment"
            placeholder={placeholder}
            className="field-input min-h-[132px]"
          />
          <PendingSubmitButton
            type="submit"
            idleLabel={idleLabel}
            pendingLabel={pendingLabel}
            className={buttonClassName}
          />
        </PendingFormState>
      </form>
    </section>
  );
}
