import { BellRing, Cog, FileInput, ListChecks, Route, Send, Users } from "lucide-react";
import Link from "next/link";
import { connectMongo } from "@/lib/db/mongo";
import { getAllFormDefinitionsForAdmin } from "@/lib/form-definitions";
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
      form.isImplemented
  ).length;

  return (
    <div className="admin-page">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-eyebrow">Admin control center</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-surface-text">Overview</h1>
          <p className="mt-1 text-sm text-surface-muted">
            Import forms, publish request flows, maintain dropdowns, and seed reference data.
          </p>
        </div>
        <Link href="/admin/form-imports" className="btn-primary w-full sm:w-auto">
          <FileInput className="h-4 w-4" />
          Import Form
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Live forms" value={liveFormCount} tone="ok" />
        <Stat label="Import drafts" value={importedDraftCount} />
        <Stat label="Dropdown values" value={lookupCount} />
        <Stat
          label="Approver review"
          value={approverNeedsReview}
          tone={approverNeedsReview > 0 ? "warn" : "ok"}
        />
      </div>

      <section className="admin-panel overflow-hidden">
        <div className="border-b border-surface-border px-5 py-4">
          <h2 className="text-base font-semibold text-surface-text">Main workflow</h2>
          <p className="mt-1 text-sm text-surface-muted">
            The operational path follows import, review, sync, publish, then notification control.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          <AdminCard
            href="/admin/form-imports"
            icon={<FileInput className="h-5 w-5" />}
            title="Import and publish forms"
            description="Save Apps Script source, sync dropdowns, preview as requester, and publish."
          />
          <AdminCard
            href="/admin/forms"
            icon={<Route className="h-5 w-5" />}
            title="Forms registry"
            description="Control visibility, availability, navbar display, and live status."
          />
          <AdminCard
            href="/admin/lookups"
            icon={<ListChecks className="h-5 w-5" />}
            title="Manage dropdowns"
            description="Edit native and imported dropdown values after syncing or seeding."
          />
          <AdminCard
            href="/admin/approvers"
            icon={<Users className="h-5 w-5" />}
            title="Approvers"
            description={`${approverCount} approvers loaded. Review emails that need cleanup.`}
          />
          <AdminCard
            href="/admin/processors"
            icon={<Cog className="h-5 w-5" />}
            title="Processors"
            description={`${processorCount} processors configured for final processing steps.`}
          />
          <AdminCard
            href="/admin/notifications"
            icon={<BellRing className="h-5 w-5" />}
            title="Notification flow"
            description="Control submission and approval email behavior for every form."
          />
        </div>
      </section>

      <section className="admin-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-surface-text">Seed initial data</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-surface-muted">
                Loads departments, airports, airlines, baggage options, and the approver roster. It also
                syncs imported-form dropdowns and detected approver or processor people. Safe to re-run;
                existing entries are not overwritten.
              </p>
            </div>
          </div>
          <SeedButton />
        </div>
      </section>
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
    <Link href={href} className="group border border-surface-border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-50 text-brand-700 ring-1 ring-brand-100 transition group-hover:ring-brand-300">
          {icon}
        </div>
        <div>
          <p className="font-semibold text-surface-text">{title}</p>
          <p className="mt-1 text-sm leading-6 text-surface-muted">{description}</p>
        </div>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  const valueClass =
    tone === "warn" && value > 0
      ? "text-amber-700"
      : tone === "ok"
        ? "text-brand-700"
        : "text-surface-text";
  return (
    <div className="admin-panel p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}
