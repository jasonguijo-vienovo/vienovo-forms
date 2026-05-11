import Link from "next/link";
import { AdminEmptyState, AdminMetricCard, AdminPageHeader, AdminSection, AdminStatusPill } from "@/components/admin-ui";
import { connectMongo } from "@/lib/db/mongo";
import { AdminJob } from "@/models/AdminJob";

export default async function AdminJobsPage() {
  await connectMongo();
  const [jobs, counts] = await Promise.all([
    AdminJob.find({})
      .sort({ startedAt: -1, queuedAt: -1, createdAt: -1 })
      .limit(80)
      .lean(),
    AdminJob.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const countByStatus = new Map(counts.map((item: any) => [String(item._id), Number(item.count ?? 0)]));

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Operations"
        title="Admin jobs"
        description="Track syncs, imports, publishes, and bulk operations from one operational ledger."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AdminMetricCard label="Queued" value={countByStatus.get("queued") ?? 0} />
        <AdminMetricCard label="Running" value={countByStatus.get("running") ?? 0} tone={(countByStatus.get("running") ?? 0) > 0 ? "warn" : "default"} />
        <AdminMetricCard label="Succeeded" value={countByStatus.get("succeeded") ?? 0} tone="ok" />
        <AdminMetricCard label="Failed" value={countByStatus.get("failed") ?? 0} tone={(countByStatus.get("failed") ?? 0) > 0 ? "warn" : "ok"} />
        <AdminMetricCard label="Cancelled" value={countByStatus.get("cancelled") ?? 0} />
      </div>

      <AdminSection
        title="Recent jobs"
        description="Newest tracked operations. Retry actions stay on the owning workflow page when extra context is needed."
        meta={`${jobs.length} shown`}
      >
        {jobs.length === 0 ? (
          <AdminEmptyState title="No jobs recorded yet" description="Run employee sync or an import operation to start the ledger." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table text-left">
              <thead className="border-b border-surface-border bg-slate-50 text-xs uppercase tracking-[0.08em] text-surface-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Job</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Started</th>
                  <th className="px-4 py-3 font-semibold">Duration</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {jobs.map((job: any) => (
                  <tr key={String(job._id)} className="bg-white align-top">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-surface-text">{job.summary || humanizeJobType(job.type)}</p>
                      <p className="mt-1 text-xs text-surface-muted">
                        {humanizeJobType(job.type)} {job.targetType ? `· ${job.targetType}` : ""}
                      </p>
                      {job.errorMessage ? (
                        <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                          {job.errorMessage}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <AdminStatusPill tone={statusTone(job.status)}>{job.status}</AdminStatusPill>
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-muted">{job.actorEmail || "System"}</td>
                    <td className="px-4 py-3 text-sm text-surface-muted">{formatDate(job.startedAt || job.queuedAt || job.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-surface-muted">{formatDuration(job.durationMs)}</td>
                    <td className="px-4 py-3">
                      <Link href={jobLink(job.type)} className="btn-secondary">
                        Open workflow
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

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "succeeded") return "ok";
  if (status === "failed") return "danger";
  if (status === "running" || status === "queued") return "warn";
  return "neutral";
}

function humanizeJobType(type: string) {
  return String(type || "job")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function jobLink(type: string) {
  if (type === "employee-sync") return "/admin/users";
  if (type === "import-sync" || type === "import-publish") return "/admin/form-imports?tab=manage";
  if (type === "bulk-approval") return "/approvals";
  return "/admin";
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function formatDuration(durationMs: number | null | undefined) {
  if (!durationMs || durationMs < 1000) return "under 1s";
  if (durationMs < 60_000) return `${Math.round(durationMs / 100) / 10}s`;
  return `${Math.round(durationMs / 6000) / 10}m`;
}
