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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin overview</h1>
        <p className="text-gray-500 text-sm mt-1">
          Start imports, publish forms, maintain dropdowns, and seed reference data.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Stat label="Live forms" value={liveFormCount} tone="ok" />
        <Stat label="Import drafts" value={importedDraftCount} />
        <Stat label="Dropdown values" value={lookupCount} />
        <Stat
          label="Approver emails to review"
          value={approverNeedsReview}
          tone={approverNeedsReview > 0 ? "warn" : "ok"}
        />
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
          Main workflow
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

      <section className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
            <Send className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-bold tracking-[0.1em] uppercase text-brand-700 border-l-[3px] border-brand-600 pl-3 mb-4">
              Seed initial data
            </h2>
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">
              Loads departments, airports, airlines, baggage options, and the approver roster. It
              also syncs imported-form dropdowns and any detected approver or processor people.
              Safe to re-run; existing entries are not overwritten.
            </p>
            <SeedButton />
          </div>
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
    <Link
      href={href}
      className="group rounded-xl border border-brand-100 bg-brand-50/30 p-4 transition hover:border-brand-300 hover:bg-brand-50"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-white p-2 text-brand-700 ring-1 ring-brand-100 transition group-hover:ring-brand-300">
          {icon}
        </div>
        <div>
          <p className="font-semibold text-gray-800">{title}</p>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</p>
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
      ? "text-amber-600"
      : tone === "ok"
        ? "text-green-700"
        : "text-gray-800";
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}
