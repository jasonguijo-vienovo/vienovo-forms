"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckSquare, ChevronLeft, ChevronRight, Clock3, Filter, MessageSquare, RotateCcw, Square, ThumbsDown, ThumbsUp, X } from "lucide-react";
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
type QueueTab = "all" | "pending" | "approved" | "rejected";
const APPROVED_PAGE_SIZE = 5;

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
  const [activeTab, setActiveTab] = useState<QueueTab>("all");
  const [formFilter, setFormFilter] = useState("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkComment, setBulkComment] = useState("");
  const [approvedPage, setApprovedPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  const allQueueItems = useMemo(
    () => [...data.pending, ...data.recentlyApproved, ...data.recentlyRejected],
    [data.pending, data.recentlyApproved, data.recentlyRejected],
  );
  const formOptions = useMemo(
    () =>
      Array.from(
        new Set(allQueueItems.map((item) => item.formName || item.formSlug || item.formType).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [allQueueItems],
  );

  const filteredPending = useMemo(
    () => data.pending.filter((item) => matchesFilters(item, query, formFilter)),
    [data.pending, query, formFilter],
  );
  const filteredApproved = useMemo(
    () => data.recentlyApproved.filter((item) => matchesFilters(item, query, formFilter)),
    [data.recentlyApproved, query, formFilter],
  );
  const filteredRejected = useMemo(
    () => data.recentlyRejected.filter((item) => matchesFilters(item, query, formFilter)),
    [data.recentlyRejected, query, formFilter],
  );
  const approvedTotalPages = Math.max(1, Math.ceil(filteredApproved.length / APPROVED_PAGE_SIZE));
  const safeApprovedPage = Math.min(approvedPage, approvedTotalPages);
  const approvedPageStart = (safeApprovedPage - 1) * APPROVED_PAGE_SIZE;
  const paginatedApproved = filteredApproved.slice(
    approvedPageStart,
    approvedPageStart + APPROVED_PAGE_SIZE,
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

  useEffect(() => {
    setApprovedPage(1);
  }, [query, formFilter, activeTab]);

  useEffect(() => {
    if (approvedPage > approvedTotalPages) setApprovedPage(approvedTotalPages);
  }, [approvedPage, approvedTotalPages]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsFilterOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isFilterOpen) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isFilterOpen]);

  function openFilterPanel() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setIsFilterOpen(true);
  }

  function clearFilters() {
    setQuery("");
    setFormFilter("all");
    setPendingView("all");
    setActiveTab("all");
  }

  const hasActiveFilters =
    query.trim().length > 0 || formFilter !== "all" || pendingView !== "all" || activeTab !== "all";

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
        <div className="w-full sm:w-auto sm:min-w-[320px]">
          <button type="button" onClick={openFilterPanel} className="btn-secondary w-full sm:w-auto">
            <Filter className="h-4 w-4" />
            Open filters
          </button>
          <p className="mt-2 text-xs text-surface-muted">
            {hasActiveFilters ? "Filters active" : "No filters active"}{query ? ` · "${query}"` : ""}
          </p>
        </div>
      </div>

      {isFilterOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" onClick={() => setIsFilterOpen(false)}>
          <div className="w-full max-w-3xl rounded-lg border border-surface-border bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-surface-text">Filter approvals</h2>
                <p className="text-sm text-surface-muted">Use search and form filters to navigate the queue faster.</p>
              </div>
              <button type="button" onClick={() => setIsFilterOpen(false)} className="btn-secondary px-3">
                <X className="h-4 w-4" />
                Close
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-surface-text">Search</span>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Reference, form, requester, or email"
                  className="field-input"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-surface-text">Form</span>
                <select value={formFilter} onChange={(event) => setFormFilter(event.target.value)} className="field-input">
                  <option value="all">All forms</option>
                  {formOptions.map((form) => (
                    <option key={form} value={form}>{form}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <QueueFilterChip active={activeTab === "all"} onClick={() => setActiveTab("all")} label={`All queues (${filteredPending.length + filteredApproved.length + filteredRejected.length})`} />
              <QueueFilterChip active={activeTab === "pending"} onClick={() => setActiveTab("pending")} label={`Needs action (${filteredPending.length})`} tone="warn" />
              <QueueFilterChip active={activeTab === "approved"} onClick={() => setActiveTab("approved")} label={`Approved (${filteredApproved.length})`} />
              <QueueFilterChip active={activeTab === "rejected"} onClick={() => setActiveTab("rejected")} label={`Rejected (${filteredRejected.length})`} tone="danger" />
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={clearFilters} className="btn-secondary">Clear filters</button>
              <button type="button" onClick={() => setIsFilterOpen(false)} className="btn-primary">Apply filters</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Waiting for me" value={data.metrics.pending} tone="warn" />
        <MetricCard label="Overdue" value={data.metrics.overdue} tone="danger" />
        <MetricCard label="Due soon" value={data.metrics.dueSoon} tone="warn" />
        <MetricCard label="Recently approved" value={data.metrics.approvedRecently} tone="ok" />
      </div>

      {(activeTab === "all" || activeTab === "pending") ? (
      <>
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
      </>
      ) : null}

      {(activeTab === "all" || activeTab === "approved" || activeTab === "rejected") ? (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {(activeTab === "all" || activeTab === "approved") ? (
            <HistorySection
              title="Recently approved"
              description="Requests you approved most recently."
              items={paginatedApproved}
              emptyMessage={query ? "No recently approved requests match this search." : "No recently approved requests yet."}
              pagination={{
                page: safeApprovedPage,
                totalPages: approvedTotalPages,
                totalItems: filteredApproved.length,
                pageSize: APPROVED_PAGE_SIZE,
                onPrevious: () => setApprovedPage((page) => Math.max(1, page - 1)),
                onNext: () => setApprovedPage((page) => Math.min(approvedTotalPages, page + 1)),
              }}
            />
          ) : null}
          {(activeTab === "all" || activeTab === "rejected") ? (
            <HistorySection
              title="Recently rejected"
              description="Requests you rejected most recently."
              items={filteredRejected}
              emptyMessage={query ? "No recently rejected requests match this search." : "No recently rejected requests yet."}
            />
          ) : null}
        </section>
      ) : null}
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
  pagination,
}: {
  title: string;
  description: string;
  items: ApprovalQueueItem[];
  emptyMessage: string;
  pagination?: {
    page: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPrevious: () => void;
    onNext: () => void;
  };
}) {
  const rangeStart = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const rangeEnd = pagination
    ? Math.min(pagination.totalItems, pagination.page * pagination.pageSize)
    : 0;

  return (
    <section className="app-panel flex h-full flex-col p-5">
      <h2 className="text-base font-semibold text-surface-text">{title}</h2>
      <p className="mt-1 text-sm text-surface-muted">{description}</p>

      {items.length === 0 ? (
        <EmptyState message={emptyMessage} className="pt-8" />
      ) : (
        <div className="mt-4 min-h-[360px] space-y-3">
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
      {pagination ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-surface-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-surface-muted">
            Showing {pagination.totalItems === 0 ? 0 : rangeStart}-{rangeEnd} of {pagination.totalItems}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={pagination.onPrevious}
              disabled={pagination.page <= 1}
              className={`btn-secondary ${pagination.page <= 1 ? "pointer-events-none opacity-50" : ""}`}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-xs text-surface-muted">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              onClick={pagination.onNext}
              disabled={pagination.page >= pagination.totalPages}
              className={`btn-secondary ${pagination.page >= pagination.totalPages ? "pointer-events-none opacity-50" : ""}`}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
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

function matchesFilters(item: ApprovalQueueItem, query: string, formFilter: string) {
  if (formFilter !== "all") {
    const itemForm = item.formName || item.formSlug || item.formType;
    if (itemForm !== formFilter) return false;
  }

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
