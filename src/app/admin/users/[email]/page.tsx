import { ArrowLeft, Database } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AdminMetricCard,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { getAdminEmployeeDetailByEmail } from "@/lib/employee-admin";
import { isEmployeeDeviceSyncEnabled } from "@/lib/employee-sync";

function formatDate(value: string) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function formatValue(value: string) {
  return value || "Not available";
}

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "approved") return "ok";
  if (status === "pending" || status === "returned" || status === "submitted") return "warn";
  if (status === "rejected") return "danger";
  return "neutral";
}

function DrawerField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-surface-border bg-slate-50/60 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">{label}</p>
      <div className="mt-2 text-sm text-surface-text">{value}</div>
    </div>
  );
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  const { email } = await params;
  const detail = await getAdminEmployeeDetailByEmail(email);
  if (!detail) notFound();

  const { employee, requestSummary, recentRequests } = detail;
  const deviceSyncEnabled = isEmployeeDeviceSyncEnabled();

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Employee profile"
        title={employee.fullName}
        description="Safe admin profile view with work information and recent request history. Personal residence and other highly sensitive fields are intentionally excluded."
        actions={
          <Link href="/admin/users" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            Back to directory
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AdminMetricCard label="Total requests" value={requestSummary.total} />
        <AdminMetricCard label="Last 30 days" value={requestSummary.recent30d} tone={requestSummary.recent30d > 0 ? "ok" : "default"} />
        <AdminMetricCard label="Pending" value={requestSummary.pending + requestSummary.submitted} tone={requestSummary.pending + requestSummary.submitted > 0 ? "warn" : "default"} />
        <AdminMetricCard label="Approved" value={requestSummary.approved} tone="ok" />
        <AdminMetricCard label="Returned / Rejected" value={requestSummary.returned + requestSummary.rejected} tone={requestSummary.returned + requestSummary.rejected > 0 ? "warn" : "default"} />
      </div>

      <AdminSection
        title="Employee information"
        description="Only work-relevant fields are shown here."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <DrawerField label="Work email" value={employee.email} />
          <DrawerField label="Employee ID" value={formatValue(employee.employeeId)} />
          <DrawerField label="Department" value={formatValue(employee.department)} />
          <DrawerField label="Job title" value={formatValue(employee.jobTitle)} />
          <DrawerField label="Immediate superior" value={formatValue(employee.supervisorEmail)} />
          <DrawerField label="Department head" value={formatValue(employee.departmentHeadEmail)} />
          <DrawerField
            label="Employment status"
            value={
              <AdminStatusPill tone={employee.isActive ? "ok" : "warn"}>
                {employee.isActive ? "Active" : "Inactive"}
              </AdminStatusPill>
            }
          />
          <DrawerField
            label="Sync source"
            value={
              <AdminStatusPill tone={employee.syncSource === "graph" ? "ok" : "warn"}>
                {employee.syncSource || "Not synced yet"}
              </AdminStatusPill>
            }
          />
          <DrawerField label="Last sync" value={formatDate(employee.lastSyncedAt)} />
          {deviceSyncEnabled ? (
            <DrawerField
              label="Managed devices"
              value={
                <div className="space-y-1">
                  <p>{employee.deviceSummary.deviceCount} device{employee.deviceSummary.deviceCount === 1 ? "" : "s"}</p>
                  <p className="text-xs text-surface-muted">
                    {employee.deviceSummary.compliantDeviceCount} compliant, {employee.deviceSummary.nonCompliantDeviceCount} not compliant
                  </p>
                  {employee.deviceSummary.lastSyncAt ? (
                    <p className="inline-flex items-center gap-1 text-xs text-surface-muted">
                      <Database className="h-3 w-3" />
                      <span>Last Intune sync {formatDate(employee.deviceSummary.lastSyncAt)}</span>
                    </p>
                  ) : null}
                </div>
              }
            />
          ) : null}
        </div>
      </AdminSection>

      <AdminSection
        title="Recent requests"
        description="Latest request activity submitted by this employee."
        meta={`${recentRequests.length} row${recentRequests.length === 1 ? "" : "s"}`}
      >
        {recentRequests.length === 0 ? (
          <p className="text-sm text-surface-muted">No requests have been submitted by this employee yet.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead className="border-b border-surface-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Form</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Last updated</th>
                  <th className="px-4 py-3">Current assignee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {recentRequests.map((request) => (
                  <tr key={request.referenceNo} className="bg-white align-top">
                    <td className="px-4 py-3">
                      <Link
                        href={`/requests/${request.referenceNo}?from=${encodeURIComponent(`/admin/users/${encodeURIComponent(employee.email)}`)}`}
                        className="text-sm font-semibold text-surface-text hover:text-brand-700"
                      >
                        {request.referenceNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-surface-text">
                        {request.formName || request.formSlug || "Request"}
                      </p>
                      <p className="mt-1 text-xs text-surface-muted">{request.formSlug || "No form slug"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <AdminStatusPill tone={statusTone(request.status)}>{request.status}</AdminStatusPill>
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-muted">{formatDate(request.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-surface-muted">{formatDate(request.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-surface-text">
                        {request.currentActorName || request.currentActorEmail || "Waiting"}
                      </p>
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
