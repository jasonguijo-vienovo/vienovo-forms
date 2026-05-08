"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, Clock3, MessageSquare, Square, ThumbsDown, ThumbsUp } from "lucide-react";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  approveFromQueue,
  bulkApproveFromQueue,
  bulkRejectFromQueue,
  rejectFromQueue,
} from "./actions";
import type { ApprovalQueueData, ApprovalQueueItem } from "@/lib/approval-queue";

type Props = {
  data: ApprovalQueueData;
};

const STATUS_TONES: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-green-200 bg-green-50 text-green-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  returned: "border-blue-200 bg-blue-50 text-blue-800",
  submitted: "border-sky-200 bg-sky-50 text-sky-800",
};

export function ApprovalsClient({ data }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkComment, setBulkComment] = useState("");

  const filteredPending = useMemo(
    () => data.pending.filter((item) => matchesQuery(item, query)),
    [data.pending, query],
  );
  const filteredApproved = useMemo(
    () => data.recentlyApproved.filter((item) => matchesQuery(item, query)),
    [data.recentlyApproved, query],
  );
  const filteredRejected = useMemo(
    () => data.recentlyRejected.filter((item) => matchesQuery(item, query)),
    [data.recentlyRejected, query],
  );

  const visiblePendingRefs = filteredPending.map((item) => item.referenceNo);
  const allVisibleSelected =
    visiblePendingRefs.length > 0 && visiblePendingRefs.every((referenceNo) => selected.includes(referenceNo));

  function toggle(referenceNo: string) {
    setSelected((current) =>
      current.includes(referenceNo)
        ? current.filter((item) => item !== referenceNo)
        : [...current, referenceNo],
    );
  }

  function toggleAllVisible() {
    setSelected((current) => {
      if (allVisibleSelected) {
        return current.filter((item) => !visiblePendingRefs.includes(item));
      }
      return Array.from(new Set([...current, ...visiblePendingRefs]));
    });
  }

  return (
    <main className="app-page space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-eyebrow">Approver workspace</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-surface-text">Approvals</h1>
          <p className="mt-1 text-sm text-surface-muted">
            Review requests assigned to you, leave notes, and move through approvals faster.
          </p>
        </div>
        <div className="w-full sm:w-80">
          <label className="mb-1 block text-sm font-semibold text-surface-text">Search</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Reference, form, requester, or email"
            className="field-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Waiting for me" value={data.metrics.pending} tone="warn" />
        <MetricCard label="Recently approved" value={data.metrics.approvedRecently} tone="ok" />
        <MetricCard label="Recently rejected" value={data.metrics.rejectedRecently} tone="danger" />
        <MetricCard label="Recent actions" value={data.metrics.actedRecently} />
      </div>

      <section className="app-panel p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-surface-text">Needs action</h2>
            <p className="text-sm text-surface-muted">
              Requests currently waiting on your approval decision.
            </p>
          </div>
          {filteredPending.length > 0 ? (
            <button
              type="button"
              onClick={toggleAllVisible}
              className="btn-secondary w-full sm:w-auto"
            >
              {allVisibleSelected ? (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Clear visible selection
                </>
              ) : (
                <>
                  <Square className="h-4 w-4" />
                  Select visible
                </>
              )}
            </button>
          ) : null}
        </div>

        {selected.length > 0 ? (
          <form className="mb-5">
            {selected.map((referenceNo) => (
              <input key={`selected-${referenceNo}`} type="hidden" name="referenceNo" value={referenceNo} />
            ))}
            <PendingFormState className="rounded-lg border border-brand-200 bg-brand-50 p-4">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-semibold text-surface-text">
                    Bulk actions for {selected.length} request(s)
                  </p>
                  <p className="mt-1 text-xs text-surface-muted">
                    Add one shared note if needed, then approve or reject all selected requests.
                  </p>
                </div>
                <textarea
                  name="comment"
                  value={bulkComment}
                  onChange={(event) => setBulkComment(event.target.value)}
                  placeholder="Optional shared note for all selected requests"
                  className="field-input min-h-24"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <PendingSubmitButton
                    type="submit"
                    formAction={bulkApproveFromQueue}
                    idleLabel={
                      <span className="inline-flex items-center gap-2">
                        <ThumbsUp className="h-4 w-4" />
                        Approve selected
                      </span>
                    }
                    pendingLabel="Approving..."
                    className="btn-primary flex-1"
                  />
                  <PendingSubmitButton
                    type="submit"
                    formAction={bulkRejectFromQueue}
                    idleLabel={
                      <span className="inline-flex items-center gap-2">
                        <ThumbsDown className="h-4 w-4" />
                        Reject selected
                      </span>
                    }
                    pendingLabel="Rejecting..."
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                  />
                </div>
              </div>
            </PendingFormState>
          </form>
        ) : null}

        {filteredPending.length === 0 ? (
          <EmptyState message={query ? "No pending approvals match this search." : "No requests are waiting for your action."} />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredPending.map((item) => (
              <PendingApprovalCard
                key={item.referenceNo}
                item={item}
                selected={selected.includes(item.referenceNo)}
                onToggle={() => toggle(item.referenceNo)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <HistorySection
          title="Recently approved"
          description="Requests you approved most recently."
          items={filteredApproved}
          emptyMessage={query ? "No recently approved requests match this search." : "No recently approved requests yet."}
        />
        <HistorySection
          title="Recently rejected"
          description="Requests you rejected most recently."
          items={filteredRejected}
          emptyMessage={query ? "No recently rejected requests match this search." : "No recently rejected requests yet."}
        />
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "border-green-200 bg-green-50 text-green-800"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-surface-border bg-white text-surface-text";

  return (
    <div className={`app-panel p-4 ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function PendingApprovalCard({
  item,
  selected,
  onToggle,
}: {
  item: ApprovalQueueItem;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <label className="mt-1 inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              className="h-4 w-4 rounded border-surface-border text-brand-700 focus:ring-brand-700"
            />
          </label>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/requests/${item.referenceNo}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                {item.referenceNo}
              </Link>
              <span className={`status-pill uppercase ${STATUS_TONES[item.status] ?? "border-surface-border bg-slate-50 text-slate-700"}`}>
                {item.status}
              </span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-surface-text">{item.formName}</h3>
            <p className="mt-1 text-sm text-surface-muted">
              Requester: {item.submittedBy.name || item.submittedBy.email || "Requester"}
            </p>
            <p className="mt-1 text-sm text-surface-muted">
              Waiting on step {item.activeStep?.step ?? item.currentStep} {item.activeStep?.role ? `(${item.activeStep.role})` : ""}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-surface-muted">
              <Clock3 className="h-3.5 w-3.5" />
              Submitted {formatDate(item.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/requests/${item.referenceNo}`} className="btn-secondary">
            Open details
          </Link>
          <Link href={`/requests/${item.referenceNo}/approve`} className="btn-secondary">
            Review page
          </Link>
        </div>
      </div>

      <form className="mt-4 space-y-3">
        <input type="hidden" name="referenceNo" value={item.referenceNo} />
        <div>
          <label className="mb-1 block text-sm font-semibold text-surface-text">
            Approval note
          </label>
          <textarea
            name="comment"
            placeholder="Optional note for your approval or rejection"
            className="field-input min-h-24"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PendingSubmitButton
            type="submit"
            formAction={approveFromQueue}
            idleLabel={
              <span className="inline-flex items-center gap-2">
                <ThumbsUp className="h-4 w-4" />
                Approve
              </span>
            }
            pendingLabel="Approving..."
            className="btn-primary flex-1"
          />
          <PendingSubmitButton
            type="submit"
            formAction={rejectFromQueue}
            idleLabel={
              <span className="inline-flex items-center gap-2">
                <ThumbsDown className="h-4 w-4" />
                Reject
              </span>
            }
            pendingLabel="Rejecting..."
            className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
          />
        </div>
      </form>
    </div>
  );
}

function HistorySection({
  title,
  description,
  items,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: ApprovalQueueItem[];
  emptyMessage: string;
}) {
  return (
    <section className="app-panel p-5">
      <h2 className="text-base font-semibold text-surface-text">{title}</h2>
      <p className="mt-1 text-sm text-surface-muted">{description}</p>

      {items.length === 0 ? (
        <EmptyState message={emptyMessage} className="pt-8" />
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={`${title}-${item.referenceNo}`} className="rounded-lg border border-surface-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/requests/${item.referenceNo}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                      {item.referenceNo}
                    </Link>
                    <span className={`status-pill uppercase ${STATUS_TONES[item.latestUserDecision?.status ?? item.status] ?? "border-surface-border bg-slate-50 text-slate-700"}`}>
                      {item.latestUserDecision?.status ?? item.status}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-surface-text">{item.formName}</h3>
                  <p className="mt-1 text-xs text-surface-muted">
                    {item.submittedBy.name || item.submittedBy.email || "Requester"}
                  </p>
                  <p className="mt-1 text-xs text-surface-muted">
                    {item.latestUserDecision?.status === "approved" ? "Approved" : "Rejected"} on{" "}
                    {formatDate(item.latestUserDecision?.actedAt ?? item.updatedAt ?? item.createdAt)}
                  </p>
                  {item.latestUserDecision?.comment ? (
                    <p className="mt-2 inline-flex items-start gap-2 text-xs text-surface-muted">
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{item.latestUserDecision.comment}</span>
                    </p>
                  ) : null}
                </div>
                <Link href={`/requests/${item.referenceNo}`} className="text-sm font-semibold text-brand-700 hover:underline">
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ message, className = "" }: { message: string; className?: string }) {
  return <div className={`text-sm text-surface-muted ${className}`}>{message}</div>;
}

function formatDate(value: string | null) {
  if (!value) return "unknown time";
  return new Date(value).toLocaleString();
}

function matchesQuery(item: ApprovalQueueItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    item.referenceNo,
    item.formName,
    item.formSlug,
    item.formType,
    item.submittedBy.name,
    item.submittedBy.email,
    item.activeStep?.role,
    item.latestUserDecision?.role,
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}
