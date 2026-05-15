"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckSquare, Clock3, MessageSquare, RotateCcw, Square, ThumbsDown, ThumbsUp } from "lucide-react";
import { PendingFormState } from "@/components/pending-form-state";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  approveFromQueue,
  bulkApproveFromQueue,
  bulkRejectFromQueue,
  bulkReturnFromQueue,
  createApprovalDelegation,
  rejectFromQueue,
  revokeApprovalDelegation,
  returnFromQueue,
} from "./actions";
import type { ApprovalQueueData, ApprovalQueueItem } from "@/lib/approval-queue";

type Props = {
  data: ApprovalQueueData;
};

type PendingView = "all" | "overdue" | "due-soon" | "normal";

const STATUS_TONES: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-green-200 bg-green-50 text-green-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  returned: "border-blue-200 bg-blue-50 text-blue-800",
  submitted: "border-sky-200 bg-sky-50 text-sky-800",
};

export function ApprovalsClient({ data }: Props) {
  const [query, setQuery] = useState("");
  const [pendingView, setPendingView] = useState<PendingView>("all");
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
  const overduePending = filteredPending.filter((item) => item.urgency === "overdue");
  const dueSoonPending = filteredPending.filter((item) => item.urgency === "due-soon");
  const normalPending = filteredPending.filter((item) => item.urgency === "normal");

  const pendingGroups = useMemo(
    () => [
      { key: "overdue" as const, title: "Overdue", tone: "danger" as const, items: overduePending },
      { key: "due-soon" as const, title: "Due soon", tone: "warn" as const, items: dueSoonPending },
      { key: "normal" as const, title: "Normal queue", tone: "neutral" as const, items: normalPending },
    ],
    [dueSoonPending, normalPending, overduePending],
  );

  const visibleGroups = useMemo(
    () => (pendingView === "all" ? pendingGroups : pendingGroups.filter((group) => group.key === pendingView)),
    [pendingGroups, pendingView],
  );

  const visiblePending = useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups],
  );

  const visiblePendingRefs = visiblePending.map((item) => item.referenceNo);
  const allVisibleSelected =
    visiblePendingRefs.length > 0 && visiblePendingRefs.every((referenceNo) => selected.includes(referenceNo));
  const hiddenSelectedCount = selected.filter((referenceNo) => !visiblePendingRefs.includes(referenceNo)).length;

  useEffect(() => {
    const validRefs = new Set(data.pending.map((item) => item.referenceNo));
    setSelected((current) => current.filter((referenceNo) => validRefs.has(referenceNo)));
  }, [data.pending]);

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
    <main className="app-page app-page--full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-eyebrow">Approver workspace</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-surface-text">Approvals</h1>
          <p className="mt-1 text-sm text-surface-muted">
            Review requests assigned to you, leave notes, and move through approvals faster.
          </p>
        </div>
        <div className="w-full sm:w-[26rem]">
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
        <MetricCard label="Overdue" value={data.metrics.overdue} tone="danger" />
        <MetricCard label="Due soon" value={data.metrics.dueSoon} tone="warn" />
        <MetricCard label="Recently approved" value={data.metrics.approvedRecently} tone="ok" />
      </div>

      <section className="app-panel p-5">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-base font-semibold text-surface-text">Delegation</h2>
          <p className="text-sm text-surface-muted">
            Temporarily let another approver act on requests assigned to you.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <form action={createApprovalDelegation} className="space-y-3 rounded border border-surface-border bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-surface-text">Delegate email</span>
                <input name="delegateEmail" type="email" className="field-input" placeholder="approver@vienovo.ph" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-surface-text">Delegate name</span>
                <input name="delegateName" className="field-input" placeholder="Optional" />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-surface-text">Reason</span>
                <input name="reason" className="field-input" placeholder="Leave, travel, temporary coverage" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-surface-text">Ends on</span>
                <input name="endsAt" type="date" className="field-input" />
              </label>
            </div>
            <PendingSubmitButton
              type="submit"
              idleLabel="Set delegation"
              pendingLabel="Saving delegation..."
              className="btn-primary"
            />
          </form>

          <div className="grid gap-3 md:grid-cols-2">
            <DelegationList title="Delegated to me" rows={data.delegations.toMe} mode="to-me" />
            <DelegationList title="My delegation" rows={data.delegations.fromMe} mode="from-me" />
          </div>
        </div>
      </section>

      <section className="app-panel p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-surface-text">Needs action</h2>
            <p className="text-sm text-surface-muted">
              Requests currently waiting on your approval decision.
            </p>
          </div>
          {visiblePending.length > 0 ? (
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
        <div className="mb-4 flex flex-wrap gap-2">
          <QueueFilterChip
            active={pendingView === "all"}
            onClick={() => setPendingView("all")}
            label={`All (${filteredPending.length})`}
          />
          <QueueFilterChip
            active={pendingView === "overdue"}
            onClick={() => setPendingView("overdue")}
            label={`Overdue (${overduePending.length})`}
            tone="danger"
          />
          <QueueFilterChip
            active={pendingView === "due-soon"}
            onClick={() => setPendingView("due-soon")}
            label={`Due soon (${dueSoonPending.length})`}
            tone="warn"
          />
          <QueueFilterChip
            active={pendingView === "normal"}
            onClick={() => setPendingView("normal")}
            label={`Normal (${normalPending.length})`}
          />
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
                    {hiddenSelectedCount > 0 ? ` ${hiddenSelectedCount} selected request(s) are outside this current view.` : ""}
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
                  <PendingSubmitButton
                    type="submit"
                    formAction={bulkReturnFromQueue}
                    idleLabel={
                      <span className="inline-flex items-center gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Return selected
                      </span>
                    }
                    pendingLabel="Returning..."
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                  />
                </div>
              </div>
            </PendingFormState>
          </form>
        ) : null}

        {visiblePending.length === 0 ? (
          <EmptyState message={query ? "No pending approvals match this search." : "No requests are waiting for your action."} />
        ) : (
          <div className="space-y-5">
            {visibleGroups.map((group) => (
              <PendingGroup
                key={group.key}
                title={group.title}
                items={group.items}
                selected={selected}
                onToggle={toggle}
                tone={group.tone}
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

function PendingGroup({
  title,
  items,
  selected,
  onToggle,
  tone,
}: {
  title: string;
  items: ApprovalQueueItem[];
  selected: string[];
  onToggle: (referenceNo: string) => void;
  tone: "danger" | "warn" | "neutral";
}) {
  if (items.length === 0) return null;
  const toneClass =
    tone === "danger"
      ? "text-red-800"
      : tone === "warn"
        ? "text-amber-800"
        : "text-surface-text";

  return (
    <section>
      <div className={`mb-2 flex items-center gap-2 text-sm font-semibold ${toneClass}`}>
        {tone !== "neutral" ? <AlertTriangle className="h-4 w-4" /> : null}
        <span>{title}</span>
        <span className="text-xs font-normal text-surface-muted">({items.length})</span>
      </div>
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        {items.map((item) => (
          <PendingApprovalCard
            key={item.referenceNo}
            item={item}
            selected={selected.includes(item.referenceNo)}
            onToggle={() => onToggle(item.referenceNo)}
          />
        ))}
      </div>
    </section>
  );
}

function QueueFilterChip({
  active,
  onClick,
  label,
  tone = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "neutral" | "warn" | "danger";
}) {
  const inactiveClass =
    tone === "danger"
      ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
      : tone === "warn"
        ? "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
        : "border-surface-border bg-white text-surface-text hover:bg-slate-50";
  const activeClass =
    tone === "danger"
      ? "border-red-300 bg-red-50 text-red-800"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-brand-200 bg-brand-50 text-brand-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-3 py-1.5 text-xs font-semibold transition ${active ? activeClass : inactiveClass}`}
    >
      {label}
    </button>
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
            {item.delegatedFromEmail ? (
              <p className="mt-1 text-xs font-semibold text-brand-700">
                Delegated from {item.delegatedFromName || item.delegatedFromEmail}
              </p>
            ) : null}
            <p className="mt-1 flex items-center gap-1 text-xs text-surface-muted">
              <Clock3 className="h-3.5 w-3.5" />
              Submitted {formatDate(item.createdAt)} · waiting about {formatAge(item.ageHours)}
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
          <PendingSubmitButton
            type="submit"
            formAction={returnFromQueue}
            idleLabel={
              <span className="inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Return for correction
              </span>
            }
            pendingLabel="Returning..."
            className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
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

function DelegationList({
  title,
  rows,
  mode,
}: {
  title: string;
  rows: ApprovalQueueData["delegations"]["toMe"];
  mode: "to-me" | "from-me";
}) {
  return (
    <div className="rounded border border-surface-border bg-white p-4">
      <p className="text-sm font-semibold text-surface-text">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-surface-muted">No active delegations.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded border border-surface-border bg-slate-50 p-3">
              <p className="text-sm font-semibold text-surface-text">
                {mode === "to-me"
                  ? row.delegatorName || row.delegatorEmail
                  : row.delegateName || row.delegateEmail}
              </p>
              <p className="mt-1 text-xs text-surface-muted">
                {mode === "to-me" ? row.delegatorEmail : row.delegateEmail}
                {row.endsAt ? ` · until ${formatDate(row.endsAt)}` : ""}
              </p>
              {row.reason ? <p className="mt-1 text-xs text-surface-muted">{row.reason}</p> : null}
              {mode === "from-me" ? (
                <form action={revokeApprovalDelegation} className="mt-2">
                  <input type="hidden" name="id" value={row.id} />
                  <PendingSubmitButton
                    type="submit"
                    idleLabel="Revoke"
                    pendingLabel="Revoking..."
                    className="btn-secondary"
                  />
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "unknown time";
  return new Date(value).toLocaleString();
}

function formatAge(ageHours: number) {
  if (ageHours < 1) return "less than 1 hour";
  if (ageHours < 24) return `${ageHours} hour${ageHours === 1 ? "" : "s"}`;
  const days = Math.floor(ageHours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
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
