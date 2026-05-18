"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Clock3, Search } from "lucide-react";
import type { RequestRowData } from "./actions";

const STATUS_TONES: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-green-200 bg-green-50 text-green-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  returned: "border-blue-200 bg-blue-50 text-blue-800",
  submitted: "border-sky-200 bg-sky-50 text-sky-800",
};

const FORM_LABELS: Record<string, string> = {
  "travel-booking": "Travel Booking",
  "cash-advance": "Cash Advance",
  reimbursement: "Reimbursement",
  "request-for-payment": "Request for Payment",
  cashiering: "Cashiering",
  imported: "Imported Form",
};

function requestFormLabel(request: RequestRowData) {
  if (request.formName) return request.formName;
  return FORM_LABELS[request.formType] ?? request.formType;
}

function formatDatePH(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function Panel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-panel overflow-hidden">
      <div className="border-b border-surface-border bg-slate-50/70 px-5 py-4">
        {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
        <h2 className="text-base font-semibold text-surface-text">{title}</h2>
        <p className="mt-1 text-sm text-surface-muted">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyState({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[0.875rem] border border-dashed border-surface-border bg-slate-50 px-5 py-10 text-center text-sm text-surface-muted">
      {message}
      {children}
    </div>
  );
}

function RequestRow({
  request,
  userEmail,
}: {
  request: RequestRowData;
  userEmail?: string;
}) {
  const isPending = request.status === "pending" || request.status === "submitted";
  const isCurrentActor = !!(
    userEmail &&
    request.currentActorEmail &&
    request.currentActorEmail.toLowerCase() === userEmail.toLowerCase()
  );
  const showActions = isPending && isCurrentActor;
  const showWaiting = isPending && request.currentActorName;

  return (
    <div className="py-1.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <Link href={`/requests/${request.referenceNo}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-surface-text">
              {requestFormLabel(request)}
            </p>
            <span
              className={`status-pill shrink-0 uppercase text-[10px] leading-tight ${
                STATUS_TONES[request.status] ??
                "border-surface-border bg-slate-50 text-slate-700"
              }`}
            >
              {request.status}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-surface-muted">
            <span className="font-mono">{request.referenceNo}</span>
            <span>&bull;</span>
            <Clock3 className="h-3 w-3" />
            <span>{formatDatePH(request.createdAt)}</span>
            {showWaiting && (
              <>
                <span>&bull;</span>
                <span>
                  Waiting with{" "}
                  <span className="font-medium text-surface-text">
                    {request.currentActorName}
                  </span>
                </span>
              </>
            )}
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/requests/${request.referenceNo}`}
            className="text-[11px] font-semibold text-brand-700 hover:underline"
          >
            Open details
          </Link>
          {showActions && (
            <>
              <Link
                href={`/requests/${request.referenceNo}/approve`}
                className="rounded border border-green-300 bg-white px-2 py-0.5 text-[11px] font-bold text-green-700 transition hover:bg-green-50"
              >
                Approve
              </Link>
              <Link
                href={`/requests/${request.referenceNo}/approve`}
                className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-bold text-red-700 transition hover:bg-red-50"
              >
                Reject
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type Props = {
  userEmail: string;
  initialRequests: RequestRowData[];
  initialRequestTotal: number;
  initialPending: RequestRowData[];
};

export function DashboardPanels({
  userEmail,
  initialRequests,
  initialRequestTotal,
  initialPending,
}: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [requestTotal, setRequestTotal] = useState(initialRequestTotal);
  const [requestPage, setRequestPage] = useState(1);
  const [requestFilter, setRequestFilter] = useState("all");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);

  const [pending, setPending] = useState(initialPending);
  const [pendingLoading, setPendingLoading] = useState(false);

  const requestTotalPages = Math.max(1, Math.ceil(requestTotal / 5));

  const loadRequests = useCallback(
    async (status: string, query: string, page: number) => {
      setRequestLoading(true);
      const params = new URLSearchParams({ status, query, page: String(page) });
      try {
        const res = await fetch(`/dashboard/api/requests?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setRequests(data.items);
        setRequestTotal(data.total);
        setRequestPage(data.page);
      } catch {
        // ignore
      } finally {
        setRequestLoading(false);
      }
    },
    [],
  );

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await fetch("/dashboard/api/pending?page=1");
      if (!res.ok) return;
      const data = await res.json();
      setPending(data.items);
    } catch {
      // ignore
    } finally {
      setPendingLoading(false);
    }
  }, []);

  function handleRequestSearch(e: React.FormEvent) {
    e.preventDefault();
    setRequestFilter("all");
    setRequestPage(1);
    loadRequests("all", requestSearch, 1);
  }

  function handleRequestFilter(status: string) {
    setRequestFilter(status);
    setRequestPage(1);
    loadRequests(status, requestSearch, 1);
  }

  const STATUSES = ["all", "pending", "approved", "rejected", "returned", "submitted"];

  const needsApproval = pending.filter(
    (r) => r.currentActorEmail?.toLowerCase() === userEmail.toLowerCase(),
  );
  const trackedSteps = pending.filter(
    (r) => r.currentActorEmail?.toLowerCase() !== userEmail.toLowerCase(),
  );

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel
        eyebrow="Track requests"
        title="My request queue"
        description="Search your submissions, filter by status, and open the full history for any request."
      >
        <div className="mb-4 flex flex-col gap-2">
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleRequestSearch}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-muted" />
              <input
                type="text"
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                placeholder="Search reference or form"
                className="field-input w-full pl-8 sm:max-w-xs"
              />
            </div>
            <button type="submit" className="btn-secondary">
              Search
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => handleRequestFilter(status)}
                className={`rounded border px-2 py-1 text-xs font-semibold transition ${
                  requestFilter === status
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-surface-border bg-white text-surface-muted hover:border-brand-200 hover:text-brand-700"
                }`}
              >
                {status === "all" ? "All" : status}
              </button>
            ))}
            <span className="self-center text-xs text-surface-muted">
              Total: {requestTotal}
            </span>
          </div>
        </div>
        {requestLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : requests.length > 0 ? (
          <div className="divide-y divide-surface-border transition-opacity">
            {requests.map((request) => (
              <RequestRow key={request._id} request={request} />
            ))}
          </div>
        ) : (
          <EmptyState message="You haven't submitted any requests yet." />
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-surface-muted">
            Page {requestPage} of {requestTotalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={requestPage <= 1}
              onClick={() => {
                const prev = Math.max(1, requestPage - 1);
                setRequestPage(prev);
                loadRequests(requestFilter, requestSearch, prev);
              }}
              className={`btn-secondary ${
                requestPage <= 1 ? "pointer-events-none opacity-50" : ""
              }`}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={requestPage >= requestTotalPages}
              onClick={() => {
                const next = Math.min(requestTotalPages, requestPage + 1);
                setRequestPage(next);
                loadRequests(requestFilter, requestSearch, next);
              }}
              className={`btn-secondary ${
                requestPage >= requestTotalPages ? "pointer-events-none opacity-50" : ""
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </Panel>

      <div id="pending-approvals" className="flex flex-col gap-4">
        <Panel
          eyebrow="Needs your approval"
          title="Approve or reject"
          description="Requests waiting for your decision."
        >
          {pendingLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            </div>
          ) : needsApproval.length > 0 ? (
            <div className="divide-y divide-surface-border">
              {needsApproval.map((request) => (
                <RequestRow
                  key={request._id}
                  request={request}
                  userEmail={userEmail}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No requests waiting for your approval.">
              <Link href="/approvals" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">
                View all in approvals
              </Link>
            </EmptyState>
          )}
        </Panel>

        <Panel
          eyebrow="Tracked steps"
          title="Requests you're monitoring"
          description="Your own requests that are going through approval."
        >
          {pendingLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            </div>
          ) : trackedSteps.length > 0 ? (
            <div className="divide-y divide-surface-border">
              {trackedSteps.map((request) => (
                <RequestRow
                  key={request._id}
                  request={request}
                  userEmail={userEmail}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="No tracked requests." />
          )}
        </Panel>
      </div>
    </section>
  );
}
