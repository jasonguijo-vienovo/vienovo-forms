"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FilterX,
  Layers3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AdminEmptyState,
  AdminHelpPanel,
  AdminMetricCard,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { humanizeQueueRole } from "@/lib/request-queue";
import type { ParsedAdminRequestsQuery } from "./query";

const ADMIN_REQUEST_STATUSES = ["all", "pending", "submitted", "approved", "returned", "rejected"] as const;
const ADMIN_REQUEST_SORTS = ["createdAt", "updatedAt", "age"] as const;
const ADMIN_REQUEST_VIEWS = [
  "all-open",
  "pending-approval",
  "returned",
  "waiting-3-days",
  "travel-booking",
  "reimbursement",
  "needs-processor",
] as const;
type AdminRequestSavedView = (typeof ADMIN_REQUEST_VIEWS)[number];

export type RequestQueueRow = {
  _id: string;
  referenceNo: string;
  formType: string;
  formSlug: string;
  formName: string;
  submittedBy?: {
    name?: string;
    email?: string;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
  currentActorEmail: string;
  currentActorName: string;
  currentRole: string;
  currentStep: number;
  totalSteps: number;
  queueBucket: string;
  lastActionAt: string;
  lastActionBy: string;
  approvalChain: Array<{
    step: number;
    role: string;
    approverEmail: string;
    approverName: string;
    status: string;
    actedAt: string;
    comment: string;
  }>;
  history: Array<{
    at: string;
    byEmail: string;
    byName: string;
    action: string;
  }>;
};

type RequestsClientProps = {
  rows: RequestQueueRow[];
  filters: ParsedAdminRequestsQuery;
  filteredCount: number;
  summary: {
    totalOpen: number;
    pendingApproval: number;
    needsProcessor: number;
    returned: number;
    rejected: number;
    submitted: number;
  };
  formOptions: Array<{ value: string; label: string }>;
  assigneeOptions: Array<{ value: string; label: string }>;
  pageInfo: {
    hasPrevious: boolean;
    hasNext: boolean;
    previousCursor: string;
    nextCursor: string;
  };
};

export function RequestsClient({
  rows,
  filters,
  filteredCount,
  summary,
  formOptions,
  assigneeOptions,
  pageInfo,
}: RequestsClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedRow = rows.find((row) => row._id === selectedId) ?? null;
  const current = searchParams.toString();
  const currentQueueHref = current ? `${pathname}?${current}` : pathname;

  useEffect(() => {
    if (!selectedId) return;
    if (!rows.some((row) => row._id === selectedId)) setSelectedId(null);
  }, [rows, selectedId]);

  useEffect(() => {
    if (!selectedRow) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedRow]);

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Operations"
        title="Admin queue"
        description="Server-backed queue navigation for every request across native and imported forms, with sharable filters and quick request context."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.9fr)]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MetricLink href={buildStatusHref(pathname, searchParams, { view: "all-open" })}>
            <CompactMetricCard label="Total open" value={summary.totalOpen} />
          </MetricLink>
          <MetricLink href={buildStatusHref(pathname, searchParams, { view: "pending-approval" })}>
            <CompactMetricCard label="Pending approval" value={summary.pendingApproval} tone="warn" />
          </MetricLink>
          <MetricLink href={buildStatusHref(pathname, searchParams, { status: "submitted" })}>
            <CompactMetricCard label="Submitted only" value={summary.submitted} />
          </MetricLink>
          <MetricLink href={buildStatusHref(pathname, searchParams, { status: "returned" })}>
            <CompactMetricCard label="Returned" value={summary.returned} tone="warn" />
          </MetricLink>
          <MetricLink href={buildStatusHref(pathname, searchParams, { status: "rejected" })}>
            <CompactMetricCard label="Rejected" value={summary.rejected} />
          </MetricLink>
        </div>
        <AdminHelpPanel title="How to use this queue">
          Use saved views to jump into common workloads, then narrow with search, assignee, form, and date
          filters. The URL keeps the exact queue state, so we can leave and come back without losing our
          place.
        </AdminHelpPanel>
      </div>

      <AdminSection
        title="Saved views"
        description="Preset queue slices for the most common admin workflows."
        meta={`${filteredCount} matching requests`}
      >
        <div className="flex flex-wrap gap-1.5">
          {ADMIN_REQUEST_VIEWS.map((view) => (
            <Link
              key={view}
              href={buildViewHref(pathname, view, filters)}
              className={[
              "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition",
                filters.view === view
                  ? "border-brand-700 bg-brand-50 text-brand-700"
                  : "border-surface-border bg-white text-surface-muted hover:text-surface-text",
              ].join(" ")}
            >
              {savedViewLabel(view, summary.needsProcessor)}
            </Link>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="Requests queue"
        description="Search every request, sort the table, and open a quick-detail drawer without leaving the queue."
        meta={`${rows.length} shown on this page`}
      >
        <div className="sticky top-[4.5rem] z-10 -mx-5 -mt-5 border-b border-surface-border bg-white/95 px-5 py-3 backdrop-blur md:-mx-6 md:px-6">
          <form method="get" className="space-y-4">
            <div className="grid gap-2.5 xl:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))]">
              <label className="flex items-center gap-2 rounded-md border border-surface-border bg-white px-3 py-2.5 text-sm text-surface-muted shadow-sm">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  name="q"
                  defaultValue={filters.q}
                  placeholder="Search by reference, requester, or form"
                  className="w-full bg-transparent text-surface-text outline-none placeholder:text-surface-muted"
                />
              </label>

              <select name="form" defaultValue={filters.form} className="field-input">
                <option value="">All forms</option>
                {formOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select name="assignee" defaultValue={filters.assignee} className="field-input">
                <option value="">All assignees</option>
                {assigneeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input name="from" type="date" defaultValue={filters.from} className="field-input" />
              <input name="to" type="date" defaultValue={filters.to} className="field-input" />

              <select name="limit" defaultValue={String(filters.limit)} className="field-input">
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
              </select>

              <div className="grid grid-cols-2 gap-3">
                <select name="sort" defaultValue={filters.sort} className="field-input">
                  {ADMIN_REQUEST_SORTS.map((sort) => (
                    <option key={sort} value={sort}>
                      {sortLabel(sort)}
                    </option>
                  ))}
                </select>
                <select name="direction" defaultValue={filters.direction} className="field-input">
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <StatusBar pathname={pathname} searchParams={searchParams} activeStatus={filters.status} />
                <button type="submit" className="btn-primary">
                  <SlidersHorizontal className="h-4 w-4" />
                  Apply
                </button>
                <Link href={pathname} className="btn-secondary">
                  <FilterX className="h-4 w-4" />
                  Clear
                </Link>
              </div>
            </div>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="pt-5">
            <AdminEmptyState
              title="No requests match this queue view"
              description="Try widening the date range, clearing the assignee filter, or switching to another saved view."
            />
          </div>
        ) : (
          <>
          <div className="space-y-2.5 pt-4 lg:hidden">
            {rows.map((row) => (
              <article key={row._id} className="admin-panel p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-surface-text">{row.referenceNo}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-surface-text">{row.formName || row.formSlug || row.formType}</p>
                    <p className="mt-1 text-xs text-surface-muted">{row.submittedBy?.name || row.submittedBy?.email || "Requester"}</p>
                  </div>
                  <AdminStatusPill tone={statusTone(row.status)}>{row.status}</AdminStatusPill>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-xs">
                  <div className="rounded border border-surface-border bg-slate-50 px-2 py-1.5 text-surface-muted">Step: {stepLabel(row)}</div>
                  <div className="rounded border border-surface-border bg-slate-50 px-2 py-1.5 text-surface-muted">Age: {formatAge(row.createdAt)}</div>
                  <div className="rounded border border-surface-border bg-slate-50 px-2 py-1.5 text-surface-muted col-span-2 truncate">
                    Assignee: {row.currentActorName || row.currentActorEmail || "Waiting"}
                  </div>
                </div>
                <div className="mt-2.5 flex gap-2">
                  <Link href={`/requests/${row.referenceNo}?from=${encodeURIComponent(currentQueueHref)}`} className="btn-secondary flex-1 justify-center">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open request
                  </Link>
                  <button type="button" onClick={() => setSelectedId(row._id)} className="btn-primary flex-1 justify-center">
                    <Layers3 className="h-4 w-4" />
                    Quick view
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="admin-table-wrap pt-4 hidden lg:block">
            <table className="admin-table text-left">
              <thead className="border-b border-surface-border bg-slate-50 text-xs uppercase tracking-[0.08em] text-surface-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Form</th>
                  <th className="px-4 py-3 font-semibold">Requester</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Current step</th>
                  <th className="px-4 py-3 font-semibold">Current assignee</th>
                  <th className="px-4 py-3 font-semibold">
                    <SortLink pathname={pathname} searchParams={searchParams} filters={filters} sort="createdAt">
                      Submitted
                    </SortLink>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <SortLink pathname={pathname} searchParams={searchParams} filters={filters} sort="updatedAt">
                      Last updated
                    </SortLink>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <SortLink pathname={pathname} searchParams={searchParams} filters={filters} sort="age">
                      Age
                    </SortLink>
                  </th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((row) => (
                  <tr key={row._id} className="bg-white align-top transition hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <span className="font-mono text-xs text-surface-text">{row.referenceNo}</span>
                        <p className="text-xs text-surface-muted">{row.queueBucket}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-surface-text">
                        {row.formName || row.formSlug || row.formType}
                      </p>
                      <p className="mt-1 text-xs text-surface-muted">{row.formSlug || row.formType}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-surface-text">{row.submittedBy?.name || "Requester"}</p>
                      <p className="mt-1 text-xs text-surface-muted">
                        {row.submittedBy?.email || "No email saved"}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <AdminStatusPill tone={statusTone(row.status)}>{row.status}</AdminStatusPill>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-surface-text">{stepLabel(row)}</p>
                      <p className="mt-1 text-xs text-surface-muted">{humanizeQueueRole(row.currentRole)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-surface-text">
                        {row.currentActorName || "No current assignee"}
                      </p>
                      <p className="mt-1 text-xs text-surface-muted">
                        {row.currentActorEmail || row.lastActionBy || "Waiting for queue action"}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-surface-muted">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-4 text-surface-muted">{formatDateTime(row.updatedAt)}</td>
                    <td className="px-4 py-4 text-surface-muted">{formatAge(row.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1.5">
                        <Link
                          href={`/requests/${row.referenceNo}?from=${encodeURIComponent(currentQueueHref)}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-surface-text hover:text-brand-700"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open request
                        </Link>
                        <button
                          type="button"
                          onClick={() => setSelectedId(row._id)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-surface-text hover:text-brand-700"
                        >
                          <Layers3 className="h-4 w-4" />
                          Quick view
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        <div className="mt-4 flex flex-col gap-2.5 border-t border-surface-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-surface-muted">
            Showing {rows.length} row{rows.length === 1 ? "" : "s"} from {filteredCount} matching request
            {filteredCount === 1 ? "" : "s"}.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={pageInfo.hasPrevious ? buildCursorHref(pathname, searchParams, "before", pageInfo.previousCursor) : "#"}
              aria-disabled={!pageInfo.hasPrevious}
              className={[
                "btn-secondary",
                !pageInfo.hasPrevious ? "pointer-events-none opacity-50" : "",
              ].join(" ")}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Link>
            <Link
              href={pageInfo.hasNext ? buildCursorHref(pathname, searchParams, "after", pageInfo.nextCursor) : "#"}
              aria-disabled={!pageInfo.hasNext}
              className={[
                "btn-secondary",
                !pageInfo.hasNext ? "pointer-events-none opacity-50" : "",
              ].join(" ")}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </AdminSection>

      {selectedRow ? (
        <RequestDrawer row={selectedRow} queueHref={currentQueueHref} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}

function StatusBar({
  pathname,
  searchParams,
  activeStatus,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  activeStatus: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ADMIN_REQUEST_STATUSES.map((status) => {
        const active = status === activeStatus;
        return (
          <Link
            key={status}
            href={buildStatusHref(pathname, searchParams, { status })}
            className={[
              "rounded-md border px-3 py-1.5 text-sm font-semibold transition",
              active
                ? "border-brand-700 bg-brand-50 text-brand-700"
                : "border-surface-border bg-white text-surface-muted hover:text-surface-text",
            ].join(" ")}
          >
            {statusLabel(status)}
          </Link>
        );
      })}
    </div>
  );
}

function SortLink({
  pathname,
  searchParams,
  filters,
  sort,
  children,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  filters: ParsedAdminRequestsQuery;
  sort: "createdAt" | "updatedAt" | "age";
  children: React.ReactNode;
}) {
  const active = filters.sort === sort;
  const direction = active && filters.direction === "desc" ? "asc" : "desc";

  return (
    <Link
      href={buildHref(pathname, searchParams, { sort, direction })}
      className="inline-flex items-center gap-1 text-surface-muted hover:text-surface-text"
    >
      <span>{children}</span>
      {active ? (
        filters.direction === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUp className="h-3.5 w-3.5" />
        )
      ) : (
        <ArrowDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </Link>
  );
}

function RequestDrawer({
  row,
  queueHref,
  onClose,
}: {
  row: RequestQueueRow;
  queueHref: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20">
      <button type="button" className="flex-1 cursor-default" onClick={onClose} aria-label="Close quick view" />
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-surface-border bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-surface-border bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">Quick view</p>
              <h2 className="mt-1 text-lg font-semibold text-surface-text">{row.referenceNo}</h2>
              <p className="mt-1 text-sm text-surface-muted">
                {row.formName || row.formSlug || row.formType}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-md border border-surface-border text-surface-muted transition hover:text-surface-text"
              aria-label="Close quick view"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <DrawerField label="Requester" value={row.submittedBy?.name || row.submittedBy?.email || "Unknown"} />
            <DrawerField label="Status" value={<AdminStatusPill tone={statusTone(row.status)}>{row.status}</AdminStatusPill>} />
            <DrawerField label="Current step" value={stepLabel(row)} />
            <DrawerField label="Current assignee" value={row.currentActorName || row.currentActorEmail || "No current assignee"} />
            <DrawerField label="Submitted" value={formatDateTime(row.createdAt)} />
            <DrawerField label="Last updated" value={formatDateTime(row.updatedAt)} />
            <DrawerField label="Last action by" value={row.lastActionBy || "Not recorded"} />
            <DrawerField label="Age" value={formatAge(row.createdAt)} />
          </div>

          <section className="admin-panel overflow-hidden">
            <div className="border-b border-surface-border bg-slate-50/70 px-4 py-3">
              <h3 className="text-sm font-semibold text-surface-text">Approval chain</h3>
            </div>
            <div className="space-y-3 p-4">
              {row.approvalChain.length > 0 ? (
                row.approvalChain.map((step) => {
                  const current = step.step === row.currentStep && row.status === "pending";
                  return (
                    <div
                      key={`${row._id}-${step.step}`}
                      className={[
                        "rounded-md border px-3 py-3",
                        current ? "border-brand-200 bg-brand-50/60" : "border-surface-border bg-white",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-surface-text">
                            Step {step.step} of {row.totalSteps}
                          </p>
                          <p className="mt-1 text-sm text-surface-text">
                            {step.approverName || step.approverEmail || "Unassigned"}
                          </p>
                          <p className="mt-1 text-xs text-surface-muted">
                            {humanizeQueueRole(step.role)}
                          </p>
                        </div>
                        <AdminStatusPill tone={statusTone(step.status)}>{step.status}</AdminStatusPill>
                      </div>
                      {step.actedAt ? (
                        <p className="mt-2 text-xs text-surface-muted">{formatDateTime(step.actedAt)}</p>
                      ) : null}
                      {step.comment ? (
                        <p className="mt-2 text-sm text-surface-muted">{step.comment}</p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-surface-muted">This request has no approval chain.</p>
              )}
            </div>
          </section>

          <section className="admin-panel overflow-hidden">
            <div className="border-b border-surface-border bg-slate-50/70 px-4 py-3">
              <h3 className="text-sm font-semibold text-surface-text">Recent history</h3>
            </div>
            <div className="space-y-3 p-4">
              {row.history.length > 0 ? (
                row.history.map((item, index) => (
                  <div key={`${row._id}-history-${index}`} className="rounded-md border border-surface-border px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-surface-text">{humanizeQueueRole(item.action)}</p>
                      <span className="text-xs text-surface-muted">{formatDateTime(item.at)}</span>
                    </div>
                    <p className="mt-1 text-sm text-surface-muted">{item.byName || item.byEmail || "System"}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-surface-muted">No recent history recorded.</p>
              )}
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/requests/${row.referenceNo}?from=${encodeURIComponent(queueHref)}`}
              className="btn-primary"
            >
              <ExternalLink className="h-4 w-4" />
              Open full request
            </Link>
            <button type="button" onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DrawerField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-surface-border bg-slate-50/60 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">{label}</p>
      <div className="mt-2 text-sm text-surface-text">{value}</div>
    </div>
  );
}

function MetricLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {children}
    </Link>
  );
}

function CompactMetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "ok" | "warn";
}) {
  const valueClass =
    tone === "ok" ? "text-brand-700" : tone === "warn" ? "text-amber-700" : "text-surface-text";
  return (
    <div className="admin-panel px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-surface-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold leading-none ${valueClass}`}>{value}</p>
    </div>
  );
}

function buildViewHref(
  pathname: string,
  view: AdminRequestSavedView,
  filters: ParsedAdminRequestsQuery,
) {
  const next = new URLSearchParams();
  next.set("limit", String(filters.limit));
  next.set("sort", filters.sort);
  next.set("direction", filters.direction);
  next.set("view", view);

  if (view === "travel-booking") next.set("form", "travel-booking");
  if (view === "reimbursement") next.set("form", "reimbursement");
  if (view === "returned") next.set("status", "returned");

  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildCursorHref(
  pathname: string,
  current: URLSearchParams,
  direction: "after" | "before",
  cursor: string,
) {
  const next = new URLSearchParams(current.toString());
  next.delete("after");
  next.delete("before");
  next.set(direction, cursor);
  return `${pathname}?${next.toString()}`;
}

function buildStatusHref(
  pathname: string,
  current: URLSearchParams,
  changes: { status?: string; view?: string },
) {
  const next = new URLSearchParams(current.toString());
  next.delete("after");
  next.delete("before");
  next.delete("view");
  next.delete("status");

  if (changes.view) {
    next.set("view", changes.view);
    if (changes.view === "returned") next.set("status", "returned");
  }
  if (changes.status && changes.status !== "all") {
    next.set("status", changes.status);
  }

  return `${pathname}?${next.toString()}`;
}

function buildHref(
  pathname: string,
  current: URLSearchParams,
  changes: Record<string, string>,
) {
  const next = new URLSearchParams(current.toString());
  next.delete("after");
  next.delete("before");
  next.delete("view");

  for (const [key, value] of Object.entries(changes)) {
    if (!value) next.delete(key);
    else next.set(key, value);
  }

  return `${pathname}?${next.toString()}`;
}

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "approved") return "ok";
  if (status === "pending" || status === "returned" || status === "submitted") return "warn";
  if (status === "rejected") return "danger";
  return "neutral";
}

function stepLabel(row: RequestQueueRow) {
  if (row.totalSteps === 0) {
    return row.status === "submitted" ? "Submitted without approval chain" : "No approval chain";
  }
  if (!row.currentStep) return `0 of ${row.totalSteps}`;
  return `Step ${row.currentStep} of ${row.totalSteps}`;
}

function formatDateTime(value: string) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function formatAge(value: string) {
  if (!value) return "Unknown";

  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function statusLabel(status: string) {
  return status === "all" ? "All" : humanizeQueueRole(status);
}

function sortLabel(sort: string) {
  if (sort === "createdAt") return "Submitted";
  if (sort === "updatedAt") return "Last updated";
  return "Age";
}

function savedViewLabel(view: AdminRequestSavedView, needsProcessorCount: number) {
  if (view === "all-open") return "All open";
  if (view === "pending-approval") return "Pending approval";
  if (view === "returned") return "Returned";
  if (view === "waiting-3-days") return "Waiting more than 3 days";
  if (view === "travel-booking") return "Travel Booking";
  if (view === "reimbursement") return "Reimbursement";
  return `Needs processor${needsProcessorCount > 0 ? ` (${needsProcessorCount})` : ""}`;
}
