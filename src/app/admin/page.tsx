import { AlertTriangle, BellRing, Cog, FileInput, KeyRound, ListChecks, Route, Send, Users } from "lucide-react";
import Link from "next/link";
import {
  AdminHelpPanel,
  AdminMetricCard,
  AdminPageHeader,
  AdminSection,
} from "@/components/admin-ui";
import { AdminSystemReadiness } from "@/components/admin-system-readiness";
import { connectMongo } from "@/lib/db/mongo";
import { getAllFormDefinitionsForAdmin } from "@/lib/form-definitions";
import { getSystemReadinessSnapshot } from "@/lib/system-readiness";
import { AdminJob } from "@/models/AdminJob";
import { Approver } from "@/models/Approver";
import { Employee } from "@/models/Employee";
import { FormImport } from "@/models/FormImport";
import { Lookup } from "@/models/Lookup";
import { NotificationDeliveryLog } from "@/models/NotificationDeliveryLog";
import { RequestModel } from "@/models/Request";
import { SeedButton } from "./seed-button";

export default async function AdminOverviewPage() {
  await connectMongo();

  const [
    lookupCount,
    approverCount,
    approverNeedsReview,
    processorCount,
    importedDraftCount,
    blockedImportCount,
    reviewImportCount,
    overdueApprovalCount,
    needsProcessorCount,
    staleReturnedCount,
    returnedRequestCount,
    failedNotificationCount,
    graphSyncedEmployeeCount,
    lastGraphEmployeeSyncRow,
    runningAdminJobCount,
    failedAdminJobCount,
    recentAdminJobs,
    forms,
  ] = await Promise.all([
    Lookup.countDocuments({}),
    Approver.countDocuments({}),
    Approver.countDocuments({ emailNeedsReview: true }),
    Approver.countDocuments({ roles: "processor" }),
    FormImport.countDocuments({}),
    FormImport.countDocuments({ readinessState: "blocked" }),
    FormImport.countDocuments({ readinessState: "needs-review" }),
    RequestModel.countDocuments({
      status: "pending",
      queueBucket: { $in: ["pending-approval", "needs-processor"] },
      lastActionAt: { $lte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    }),
    RequestModel.countDocuments({
      status: "pending",
      queueBucket: "needs-processor",
    }),
    RequestModel.countDocuments({
      status: "returned",
      lastActionAt: { $lte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
    }),
    RequestModel.countDocuments({ status: "returned" }),
    NotificationDeliveryLog.countDocuments({
      status: "failed",
      sentAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
    Employee.countDocuments({ syncSource: "graph" }),
    Employee.findOne({ syncSource: "graph", lastSyncedAt: { $ne: null } })
      .sort({ lastSyncedAt: -1 })
      .select({ lastSyncedAt: 1, fullName: 1, email: 1 })
      .lean(),
    AdminJob.countDocuments({ status: "running" }),
    AdminJob.countDocuments({
      status: "failed",
      startedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
    AdminJob.find({})
      .sort({ startedAt: -1 })
      .limit(6)
      .select({ type: 1, status: 1, actorEmail: 1, summary: 1, errorMessage: 1, startedAt: 1, finishedAt: 1, durationMs: 1 })
      .lean(),
    getAllFormDefinitionsForAdmin(),
  ]);

  const liveFormCount = forms.filter(
    (form) => form.runtime.requesterCanOpen,
  ).length;
  const responseConnectedCount = forms.filter(
    (form) => form.writeResponsesToSheet && Boolean(form.responseSpreadsheetId?.trim()),
  ).length;
  const formsNeedingResponseSetup = forms.filter(
    (form) =>
      form.runtime.requesterCanOpen &&
      (!form.writeResponsesToSheet || !form.responseSpreadsheetId?.trim()),
  ).length;
  const readiness = getSystemReadinessSnapshot();
  const lastEmployeeSyncAt = lastGraphEmployeeSyncRow?.lastSyncedAt ? new Date(lastGraphEmployeeSyncRow.lastSyncedAt) : null;
  const employeeSyncIsStale =
    !lastEmployeeSyncAt || Date.now() - lastEmployeeSyncAt.getTime() > 2 * 24 * 60 * 60 * 1000;

  const nextSteps = buildNextSteps({
    importedDraftCount,
    blockedImportCount,
    reviewImportCount,
    approverNeedsReview,
    overdueApprovalCount,
    needsProcessorCount,
    staleReturnedCount,
    returnedRequestCount,
    failedNotificationCount,
    employeeSyncIsStale,
    runningAdminJobCount,
    failedAdminJobCount,
    liveFormCount,
  });

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Admin control center"
        title="Overview"
        description="This is the fastest place to see what still needs attention, open the right admin page, and keep the request system ready for non-technical users."
        actions={
          <>
            <Link href="/admin/form-imports" className="btn-primary">
              <FileInput className="h-4 w-4" />
              Import form
            </Link>
            <Link href="/admin/forms" className="btn-secondary">
              Manage live forms
            </Link>
          </>
        }
      />

      <AdminHelpPanel title="What this page does">
        Use the cards below to see whether forms are live, whether imported
        drafts still need work, and whether people or dropdown data still need
        cleanup.
      </AdminHelpPanel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <AdminMetricCard
          label="Live forms"
          value={liveFormCount}
          tone="ok"
          hint="Visible to requesters now"
        />
        <AdminMetricCard
          label="Import drafts"
          value={importedDraftCount}
          hint="Waiting in the importer"
        />
        <AdminMetricCard
          label="Dropdown values"
          value={lookupCount}
          hint="Across native and imported forms"
        />
        <AdminMetricCard
          label="Approvers needing review"
          value={approverNeedsReview}
          tone={approverNeedsReview > 0 ? "warn" : "ok"}
          hint="Emails that likely need fixing"
        />
        <AdminMetricCard
          label="Graph-synced employees"
          value={graphSyncedEmployeeCount}
          tone={graphSyncedEmployeeCount > 0 ? "ok" : "warn"}
          hint="Profiles backed by Entra/Graph"
        />
        <AdminMetricCard
          label="Forms with response tabs"
          value={responseConnectedCount}
          tone={responseConnectedCount > 0 ? "ok" : "warn"}
          hint="Writing submissions to Sheets"
        />
        <AdminMetricCard
          label="Live forms needing setup"
          value={formsNeedingResponseSetup}
          tone={formsNeedingResponseSetup > 0 ? "warn" : "ok"}
          hint="Live forms missing response-sheet setup"
        />
      </div>
      <div className="mt-4">
        <AdminSystemReadiness
          readiness={readiness}
          description="Open this to check email, Sheets, Drive, auth, and database readiness in one place."
        />
      </div>

      <AdminSection
        title="Operational exceptions"
        description="Issues that can block publishing, approvals, or reliable communication."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ExceptionCard
            href="/admin/form-imports?tab=manage"
            label="Blocked imports"
            value={blockedImportCount}
            detail="Cannot publish until blockers are fixed."
          />
          <ExceptionCard
            href="/admin/requests?view=pending-approval"
            label="Overdue approvals"
            value={overdueApprovalCount}
            detail="Pending more than 48 hours."
          />
          <ExceptionCard
            href="/admin/requests?view=needs-processor"
            label="Needs processor"
            value={needsProcessorCount}
            detail="Approved queue items waiting for processor action."
          />
          <ExceptionCard
            href="/admin/requests?status=returned"
            label="Returned requests"
            value={returnedRequestCount}
            detail="Waiting for requester corrections."
          />
          <ExceptionCard
            href="/admin/requests?status=returned"
            label="Returned >72h"
            value={staleReturnedCount}
            detail="Returned requests with no activity for over 72 hours."
          />
          <ExceptionCard
            href="/admin/notifications"
            label="Failed emails"
            value={failedNotificationCount}
            detail="Failures logged in the last 7 days."
          />
          <ExceptionCard
            href="/admin/users"
            label="Employee sync stale"
            value={employeeSyncIsStale ? 1 : 0}
            detail={
              lastEmployeeSyncAt
                ? `Last Graph sync: ${lastEmployeeSyncAt.toLocaleString()}`
                : "No Graph-backed employee sync recorded yet."
            }
          />
          <ExceptionCard
            href="/admin/jobs"
            label="Running admin jobs"
            value={runningAdminJobCount}
            detail="Tracked admin operations still in progress."
          />
          <ExceptionCard
            href="/admin/jobs"
            label="Failed admin jobs"
            value={failedAdminJobCount}
            detail="Failures logged in the last 7 days."
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Recent admin jobs"
        description="Latest tracked admin operations, starting with employee sync work."
      >
        {recentAdminJobs.length === 0 ? (
          <div className="border border-dashed border-surface-border bg-slate-50 px-6 py-10 text-center text-sm text-surface-muted">
            No admin jobs have been recorded yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentAdminJobs.map((job) => (
              <Link
                key={String(job._id)}
                href={jobLink(job.type)}
                className="border border-surface-border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-text">
                      {job.summary || humanizeJobType(job.type)}
                    </p>
                    <p className="mt-1 text-xs text-surface-muted">
                      {job.actorEmail || "System"} · {formatJobTime(job.startedAt)}
                    </p>
                  </div>
                  <span className={jobStatusBadgeClass(job.status)}>
                    {job.status}
                  </span>
                </div>
                <p className="mt-3 text-xs text-surface-muted">
                  {formatJobDuration(job.durationMs)}
                  {job.finishedAt ? ` · finished ${formatJobTime(job.finishedAt)}` : ""}
                </p>
                {job.errorMessage ? (
                  <p className="mt-2 text-xs text-red-700">{job.errorMessage}</p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection
        title="Recommended next steps"
        description="These suggestions are based on the current system state."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {nextSteps.map((step) => (
            <Link
              key={step.title}
              href={step.href}
              className="border border-surface-border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
            >
              <p className="font-semibold text-surface-text">{step.title}</p>
              <p className="mt-1 text-sm text-surface-muted">
                {step.description}
              </p>
            </Link>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="Main workflow"
        description="The system works best when admins follow this order from setup to live use."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AdminCard
            href="/admin/form-imports"
            icon={<FileInput className="h-5 w-5" />}
            title="Import and publish forms"
            description="Bring in a legacy form, link its spreadsheet, update dropdowns, preview it, then publish it."
          />
          <AdminCard
            href="/admin/forms"
            icon={<Route className="h-5 w-5" />}
            title="Forms registry"
            description="Decide which forms are visible to everyone, which are still internal, and which appear in the quick menu."
          />
          <AdminCard
            href="/admin/lookups"
            icon={<ListChecks className="h-5 w-5" />}
            title="Dropdown values"
            description="Keep the choices inside forms clear, current, and easy for requesters to use."
          />
          <AdminCard
            href="/admin/approvers"
            icon={<Users className="h-5 w-5" />}
            title="Approvers"
            description={`${approverCount} people available for approval roles. Fix email gaps before relying on notifications.`}
          />
          <AdminCard
            href="/admin/processors"
            icon={<Cog className="h-5 w-5" />}
            title="Processors"
            description={`${processorCount} processors currently loaded for final handling steps.`}
          />
          <AdminCard
            href="/admin/users"
            icon={<Users className="h-5 w-5" />}
            title="User info"
            description="Browse employee profiles, recent requests, and Graph sync coverage in one admin page."
          />
          <AdminCard
            href="/admin/user-roles"
            icon={<KeyRound className="h-5 w-5" />}
            title="User roles"
            description="Promote or demote who can access the admin console without mixing it into approver routing."
          />
          <AdminCard
            href="/admin/notifications"
            icon={<BellRing className="h-5 w-5" />}
            title="Notification flow"
            description="Turn per-form emails on or off and add extra recipients without changing routing."
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Response tab connections"
        description="Each form can copy submissions to one Google Sheets tab. This helps us scale as more forms are added."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {forms.map((form) => {
            const connected = form.writeResponsesToSheet && Boolean(form.responseSpreadsheetId?.trim());
            return (
              <div key={form.slug} className="border border-surface-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-surface-text">{form.name}</p>
                    <p className="mt-1 text-xs text-surface-muted">
                      Form ID: <code>{form.slug}</code>
                    </p>
                  </div>
                  <span
                    className={
                      connected
                        ? "inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
                        : "inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200"
                    }
                  >
                    {connected ? "Connected" : "Needs setup"}
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-sm text-surface-muted">
                  <p>
                    Export:{" "}
                    <strong className="text-surface-text">
                      {form.writeResponsesToSheet ? "Enabled" : "Off"}
                    </strong>
                  </p>
                  <p>
                    Spreadsheet:{" "}
                    {form.responseSpreadsheetId?.trim() ? (
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${form.responseSpreadsheetId.trim()}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-700 underline break-all"
                      >
                        {`https://docs.google.com/spreadsheets/d/${form.responseSpreadsheetId.trim()}`}
                      </a>
                    ) : (
                      <code>not set</code>
                    )}
                  </p>
                  <p>
                    Tab:{" "}
                    <code>{form.responseSheetName?.trim() || `${form.name} Responses`}</code>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </AdminSection>

      <AdminSection
        title="Load default setup data"
        description="Safe to run again. This does not delete existing records; it fills in missing default data."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-surface-text">
                Seed default dropdowns and people
              </p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-surface-muted">
                Loads departments, airports, airlines, baggage options,
                approvers, and imported-form sync candidates that have not been
                created yet.
              </p>
            </div>
          </div>
          <SeedButton />
        </div>
      </AdminSection>
    </div>
  );
}

function AdminCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="border border-surface-border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
          {icon}
        </div>
        <div>
          <p className="font-semibold text-surface-text">{title}</p>
          <p className="mt-1 text-sm leading-6 text-surface-muted">
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}

function ExceptionCard({
  href,
  label,
  value,
  detail,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
}) {
  const active = value > 0;
  return (
    <Link
      href={href}
      className={`border p-4 transition hover:border-brand-300 hover:shadow-sm ${
        active ? "border-amber-200 bg-amber-50" : "border-surface-border bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-surface-text">{label}</p>
          <p className="mt-1 text-xs text-surface-muted">{detail}</p>
        </div>
        {active ? <AlertTriangle className="h-4 w-4 text-amber-700" /> : null}
      </div>
      <p className={`mt-3 text-2xl font-semibold ${active ? "text-amber-800" : "text-surface-text"}`}>
        {value}
      </p>
    </Link>
  );
}

function humanizeJobType(type: string) {
  return type
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function jobLink(type: string) {
  if (type === "employee-sync") return "/admin/users";
  if (type === "import-sync" || type === "import-publish") return "/admin/form-imports?tab=manage";
  if (type === "bulk-approval") return "/approvals";
  return "/admin/jobs";
}

function formatJobTime(value: Date | string | null | undefined) {
  if (!value) return "unknown time";
  return new Date(value).toLocaleString();
}

function formatJobDuration(durationMs: number | null | undefined) {
  if (!durationMs || durationMs < 1000) return "under 1s";
  if (durationMs < 60_000) return `${Math.round(durationMs / 100) / 10}s`;
  return `${Math.round(durationMs / 6000) / 10}m`;
}

function jobStatusBadgeClass(status: string) {
  if (status === "succeeded") {
    return "inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200";
  }
  if (status === "failed") {
    return "inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200";
  }
  return "inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200";
}

function buildNextSteps({
  importedDraftCount,
  blockedImportCount,
  reviewImportCount,
  approverNeedsReview,
  overdueApprovalCount,
  needsProcessorCount,
  staleReturnedCount,
  returnedRequestCount,
  failedNotificationCount,
  employeeSyncIsStale,
  runningAdminJobCount,
  failedAdminJobCount,
  liveFormCount,
}: {
  importedDraftCount: number;
  blockedImportCount: number;
  reviewImportCount: number;
  approverNeedsReview: number;
  overdueApprovalCount: number;
  needsProcessorCount: number;
  staleReturnedCount: number;
  returnedRequestCount: number;
  failedNotificationCount: number;
  employeeSyncIsStale: boolean;
  runningAdminJobCount: number;
  failedAdminJobCount: number;
  liveFormCount: number;
}) {
  const steps: Array<{ title: string; description: string; href: string }> =
    [];

  if (blockedImportCount > 0) {
    steps.push({
      title: "Fix blocked imports",
      description: `${blockedImportCount} import${blockedImportCount === 1 ? " has" : "s have"} publish blockers. Open the importer and review readiness.`,
      href: "/admin/form-imports?tab=manage",
    });
  } else if (importedDraftCount > 0) {
    steps.push({
      title: "Review imported forms",
      description: `${importedDraftCount} draft form${importedDraftCount === 1 ? "" : "s"} still need review, sync, or publishing. ${reviewImportCount} need extra review.`,
      href: "/admin/form-imports?tab=manage",
    });
  }

  if (overdueApprovalCount > 0) {
    steps.push({
      title: "Clear overdue approvals",
      description: `${overdueApprovalCount} approval${overdueApprovalCount === 1 ? " is" : "s are"} older than 48 hours.`,
      href: "/admin/requests?view=pending-approval",
    });
  }

  if (needsProcessorCount > 0) {
    steps.push({
      title: "Process approved requests",
      description: `${needsProcessorCount} request${needsProcessorCount === 1 ? " is" : "s are"} waiting for processor follow-through.`,
      href: "/admin/requests?view=needs-processor",
    });
  }

  if (returnedRequestCount > 0) {
    steps.push({
      title: "Monitor returned requests",
      description: `${returnedRequestCount} request${returnedRequestCount === 1 ? " is" : "s are"} waiting for requester corrections.`,
      href: "/admin/requests?status=returned",
    });
  }

  if (staleReturnedCount > 0) {
    steps.push({
      title: "Escalate stale returns",
      description: `${staleReturnedCount} returned request${staleReturnedCount === 1 ? " has" : "s have"} been inactive for over 72 hours.`,
      href: "/admin/requests?status=returned",
    });
  }

  if (failedNotificationCount > 0) {
    steps.push({
      title: "Review failed emails",
      description: `${failedNotificationCount} notification failure${failedNotificationCount === 1 ? "" : "s"} were logged in the last 7 days.`,
      href: "/admin/notifications",
    });
  }

  if (employeeSyncIsStale) {
    steps.push({
      title: "Refresh employee sync",
      description: "Employee directory sync is stale or missing. Run a fresh Graph sync and review the recent job history.",
      href: "/admin/users",
    });
  }

  if (failedAdminJobCount > 0) {
    steps.push({
      title: "Inspect failed admin jobs",
      description: `${failedAdminJobCount} admin job failure${failedAdminJobCount === 1 ? "" : "s"} were recorded in the last 7 days.`,
      href: "/admin/users",
    });
  }

  if (runningAdminJobCount > 0) {
    steps.push({
      title: "Watch running admin jobs",
      description: `${runningAdminJobCount} admin job${runningAdminJobCount === 1 ? " is" : "s are"} still running.`,
      href: "/admin/users",
    });
  }

  if (approverNeedsReview > 0) {
    steps.push({
      title: "Fix approver emails",
      description: `${approverNeedsReview} approver email${approverNeedsReview === 1 ? " needs" : "s need"} cleanup before notifications are reliable.`,
      href: "/admin/approvers",
    });
  }

  if (liveFormCount === 0) {
    steps.push({
      title: "Publish your first live form",
      description:
        "No forms are visible to requesters yet. Open the registry or importer to publish one.",
      href: "/admin/forms",
    });
  }

  if (steps.length === 0) {
    steps.push({
      title: "System looks ready",
      description:
        "Your main setup areas are in a healthy state. You can review the queue or test notifications next.",
      href: "/admin/requests",
    });
  }

  return steps;
}
