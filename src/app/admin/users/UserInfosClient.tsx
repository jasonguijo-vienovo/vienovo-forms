"use client";

import { useMemo, useState } from "react";
import { Database, RefreshCcw, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import {
  AdminEmptyState,
  AdminHelpPanel,
  AdminMetricCard,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import type { AdminEmployeeListRow } from "@/lib/employee-admin";
import { syncEmployeesDirectory } from "./actions";

type EmployeeView = "all" | "active" | "inactive" | "unsynced";
type RecentJob = {
  id: string;
  status: "running" | "succeeded" | "failed";
  actorEmail: string;
  summary: string;
  errorMessage: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number | null;
};

function formatDate(value: string) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function statusTone(value: string): "ok" | "warn" | "danger" | "neutral" {
  if (!value) return "neutral";
  if (value === "approved") return "ok";
  if (value === "rejected") return "danger";
  return "warn";
}

function syncTone(row: AdminEmployeeListRow): "ok" | "warn" | "brand" {
  if (row.syncSource === "graph") return "ok";
  if (row.syncSource) return "brand";
  return "warn";
}

function syncLabel(row: AdminEmployeeListRow) {
  return row.syncSource === "graph"
    ? "Graph synced"
    : row.syncSource
      ? row.syncSource
      : "Needs sync";
}

export function UserInfosClient({
  employees,
  graphReady,
  syncEnabled,
  deviceSyncEnabled,
  recentJobs,
}: {
  employees: AdminEmployeeListRow[];
  graphReady: boolean;
  syncEnabled: boolean;
  deviceSyncEnabled: boolean;
  recentJobs: RecentJob[];
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<EmployeeView>("all");

  const filtered = useMemo(() => {
    return employees.filter((employee) => {
      const haystack = [
        employee.fullName,
        employee.email,
        employee.employeeId,
        employee.department,
        employee.jobTitle,
      ]
        .join(" ")
        .toLowerCase();

      if (query && !haystack.includes(query.toLowerCase())) return false;
      if (view === "active") return employee.isActive;
      if (view === "inactive") return !employee.isActive;
      if (view === "unsynced") return employee.syncSource !== "graph";
      return true;
    });
  }, [employees, query, view]);

  const activeCount = employees.filter((employee) => employee.isActive).length;
  const syncedCount = employees.filter((employee) => employee.syncSource === "graph").length;
  const recentRequesterCount = employees.filter((employee) => employee.recentRequests30d > 0).length;

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Employee directory"
        title="User info"
        description="Review company employees, see their recent request activity, and open a safe profile view that avoids highly personal fields."
        actions={
          <form action={syncEmployeesDirectory}>
            <PendingSubmitButton
              type="submit"
              idleLabel={
                <span className="inline-flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4" />
                  <span>Sync from Graph</span>
                </span>
              }
              pendingLabel="Syncing employees..."
              className="btn-primary"
              disabled={!graphReady || !syncEnabled}
            />
          </form>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminMetricCard label="Employees" value={employees.length} />
          <AdminMetricCard label="Active" value={activeCount} tone="ok" />
          <AdminMetricCard label="Graph synced" value={syncedCount} tone={syncedCount > 0 ? "ok" : "warn"} />
          <AdminMetricCard
            label="Recent requesters"
            value={recentRequesterCount}
            hint="Had requests in the last 30 days"
          />
        </div>
        <AdminHelpPanel title="What this page does">
          This directory is admin-only and intentionally shows safe work information such as department,
          employee ID, title, and recent request history. It does not show highly personal profile data.
          {!graphReady ? " Microsoft Graph credentials are still missing." : ""}
          {graphReady && !syncEnabled ? " Employee sync is configured but still disabled by INTUNE_SYNC_ENABLED." : ""}
          {deviceSyncEnabled
            ? " Device summaries are enabled."
            : " Device summaries are off unless INTUNE_SYNC_INCLUDE_DEVICES is enabled."}
        </AdminHelpPanel>
      </div>

      <AdminSection
        title="Recent sync jobs"
        description="This is the first step toward background job visibility for admin operations."
        meta={`${recentJobs.length} recent run${recentJobs.length === 1 ? "" : "s"}`}
      >
        {recentJobs.length === 0 ? (
          <AdminEmptyState
            title="No sync jobs yet"
            description="Run the employee sync once to start recording operational history."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {recentJobs.map((job) => (
              <div key={job.id} className="rounded border border-surface-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-text">
                      {job.summary || "Employee sync run"}
                    </p>
                    <p className="mt-1 text-xs text-surface-muted">
                      Started {formatDate(job.startedAt)}
                      {job.actorEmail ? ` by ${job.actorEmail}` : ""}
                    </p>
                  </div>
                  <AdminStatusPill tone={jobTone(job.status)}>
                    {job.status}
                  </AdminStatusPill>
                </div>
                <div className="mt-3 text-xs text-surface-muted">
                  <p>
                    Duration: {formatDuration(job.durationMs)}
                    {job.finishedAt ? ` · Finished ${formatDate(job.finishedAt)}` : ""}
                  </p>
                  {job.errorMessage ? (
                    <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                      {job.errorMessage}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection
        title="Directory"
        description="Search employees and jump into a more detailed profile view."
        meta={`${filtered.length} of ${employees.length} shown`}
      >
        <div className="mb-5 flex flex-col gap-3">
          <AdminSearchField
            value={query}
            onChange={setQuery}
            placeholder="Search by name, email, department, title, or employee ID"
          />
          <AdminFilterTabs
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All employees" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "unsynced", label: "Needs sync" },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState
            title="No matching employees"
            description="Try another search or run a sync once the Graph credentials are configured."
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead className="border-b border-surface-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Recent requests</th>
                  <th className="px-4 py-3">Latest request</th>
                  <th className="px-4 py-3">Sync status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map((employee) => (
                  <tr key={employee.email} className="bg-white align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                          {employee.isActive ? (
                            <ShieldCheck className="h-4 w-4" />
                          ) : (
                            <UserRound className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-surface-text">
                            {employee.fullName}
                          </p>
                          <p className="truncate text-xs text-surface-muted">{employee.email}</p>
                          <p className="truncate text-xs text-surface-muted">
                            {employee.employeeId || "No employee ID"}
                            {employee.jobTitle ? ` - ${employee.jobTitle}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-surface-text">
                          {employee.department || "Not set"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <AdminStatusPill tone={employee.isActive ? "ok" : "warn"}>
                            {employee.isActive ? "Active" : "Inactive"}
                          </AdminStatusPill>
                          {employee.deviceSummary.deviceCount > 0 ? (
                            <AdminStatusPill tone="brand">
                              <span className="inline-flex items-center gap-1">
                                <Database className="h-3 w-3" />
                                <span>
                                  {employee.deviceSummary.deviceCount} device
                                  {employee.deviceSummary.deviceCount === 1 ? "" : "s"}
                                </span>
                              </span>
                            </AdminStatusPill>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-text">
                      <p>{employee.totalRequests} total</p>
                      <p className="mt-1 text-xs text-surface-muted">
                        {employee.recentRequests30d} in the last 30 days
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {employee.lastRequestReferenceNo ? (
                        <div className="space-y-1">
                          <Link
                            href={`/requests/${employee.lastRequestReferenceNo}?from=${encodeURIComponent("/admin/users")}`}
                            className="text-sm font-semibold text-surface-text hover:text-brand-700"
                          >
                            {employee.lastRequestReferenceNo}
                          </Link>
                          <p className="text-xs text-surface-muted">
                            {employee.lastRequestFormName || "Request"} - {formatDate(employee.lastRequestAt)}
                          </p>
                          <AdminStatusPill tone={statusTone(employee.lastRequestStatus)}>
                            {employee.lastRequestStatus || "Unknown"}
                          </AdminStatusPill>
                        </div>
                      ) : (
                        <p className="text-sm text-surface-muted">No requests yet</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <AdminStatusPill tone={syncTone(employee)}>
                          {syncLabel(employee)}
                        </AdminStatusPill>
                        <p className="text-xs text-surface-muted">
                          {employee.lastSyncedAt
                            ? `Last sync: ${formatDate(employee.lastSyncedAt)}`
                            : "No sync recorded"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/users/${encodeURIComponent(employee.email)}`}
                        className="btn-secondary"
                      >
                        View profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function jobTone(status: RecentJob["status"]): "ok" | "warn" | "danger" | "neutral" {
  if (status === "succeeded") return "ok";
  if (status === "failed") return "danger";
  if (status === "running") return "warn";
  return "neutral";
}

function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs < 1000) return "under 1s";
  if (durationMs < 60_000) return `${Math.round(durationMs / 100) / 10}s`;
  return `${Math.round(durationMs / 6000) / 10}m`;
}
