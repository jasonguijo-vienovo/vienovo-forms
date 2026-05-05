import { connectMongo } from "@/lib/db/mongo";
import { Lookup } from "@/models/Lookup";
import { Approver } from "@/models/Approver";
import { SeedButton } from "./seed-button";

export default async function AdminOverviewPage() {
  await connectMongo();

  const [lookupCount, approverCount, approverNeedsReview] = await Promise.all([
    Lookup.countDocuments({}),
    Approver.countDocuments({}),
    Approver.countDocuments({ emailNeedsReview: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin overview</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage dropdown values, approvers, and reference data.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Dropdown values" value={lookupCount} />
        <Stat label="Approvers" value={approverCount} />
        <Stat
          label="Approver emails to review"
          value={approverNeedsReview}
          tone={approverNeedsReview > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 border-l-[3px] border-brand-600 pl-3 text-xs font-bold uppercase tracking-[0.1em] text-brand-700">
          Seed initial data
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-gray-500">
          Loads departments, airports, airlines, baggage options, and the
          approver roster from the confirmed lookup values. Safe to re-run -
          existing entries are not overwritten.
        </p>
        <SeedButton />
      </div>
    </div>
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
    tone === "warn" && value > 0 ? "text-amber-600" : "text-gray-800";

  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
