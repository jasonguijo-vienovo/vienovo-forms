import { BellRing, Cog, FileInput, KeyRound, ListChecks, Route, Send, Users } from "lucide-react";
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
import { Approver } from "@/models/Approver";
import { FormImport } from "@/models/FormImport";
import { Lookup } from "@/models/Lookup";
import { SeedButton } from "./seed-button";

export default async function AdminOverviewPage() {
  await connectMongo();

  const [
    lookupCount,
    approverCount,
    approverNeedsReview,
    processorCount,
    importedDraftCount,
    forms,
  ] = await Promise.all([
    Lookup.countDocuments({}),
    Approver.countDocuments({}),
    Approver.countDocuments({ emailNeedsReview: true }),
    Approver.countDocuments({ roles: "processor" }),
    FormImport.countDocuments({}),
    getAllFormDefinitionsForAdmin(),
  ]);

  const liveFormCount = forms.filter(
    (form) =>
      form.status === "published" &&
      form.visibility === "everyone" &&
      form.availability === "available" &&
      form.isImplemented,
  ).length;
  const responseConnectedCount = forms.filter(
    (form) => form.writeResponsesToSheet && Boolean(form.responseSpreadsheetId?.trim()),
  ).length;
  const formsNeedingResponseSetup = forms.filter(
    (form) =>
      form.status === "published" &&
      form.visibility === "everyone" &&
      form.availability === "available" &&
      form.isImplemented &&
      (!form.writeResponsesToSheet || !form.responseSpreadsheetId?.trim()),
  ).length;
  const readiness = getSystemReadinessSnapshot();

  const nextSteps = buildNextSteps({
    importedDraftCount,
    approverNeedsReview,
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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
                    <code>{form.responseSpreadsheetId?.trim() || "not set"}</code>
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

function buildNextSteps({
  importedDraftCount,
  approverNeedsReview,
  liveFormCount,
}: {
  importedDraftCount: number;
  approverNeedsReview: number;
  liveFormCount: number;
}) {
  const steps: Array<{ title: string; description: string; href: string }> =
    [];

  if (importedDraftCount > 0) {
    steps.push({
      title: "Review imported forms",
      description: `${importedDraftCount} draft form${importedDraftCount === 1 ? "" : "s"} still need review, sync, or publishing.`,
      href: "/admin/form-imports",
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
