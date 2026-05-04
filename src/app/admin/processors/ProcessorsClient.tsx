"use client";

import { useState } from "react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  AdminEmptyState,
  AdminHelpPanel,
  AdminMetricCard,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";
import { addApprover, deleteApprover, toggleApprover, updateApprover } from "../approvers/actions";

type ProcessorRow = {
  _id: string;
  name: string;
  email: string;
  isActive: boolean;
  emailNeedsReview: boolean;
  department?: string;
};

type ViewFilter = "all" | "active" | "inactive" | "review";

export function ProcessorsClient({ processors }: { processors: ProcessorRow[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("all");

  const filtered = processors.filter((processor) => {
    const matchesQuery =
      !query ||
      [processor.name, processor.email].join(" ").toLowerCase().includes(query.toLowerCase());

    if (!matchesQuery) return false;
    if (view === "active") return processor.isActive;
    if (view === "inactive") return !processor.isActive;
    if (view === "review") return processor.emailNeedsReview;
    return true;
  });

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="People setup"
        title="Processors"
        description="Manage the people who handle requests after approval. This keeps the processor roster clean without changing approval or submission logic."
      />

      <AdminHelpPanel title="What this page does">
        Processors are the people who do the final work after a request has been approved. Imported
        form sync may add processor candidates here when it finds them in spreadsheet-driven options.
      </AdminHelpPanel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Total processors" value={processors.length} />
        <AdminMetricCard label="Active processors" value={processors.filter((item) => item.isActive).length} tone="ok" />
        <AdminMetricCard label="Needs review" value={processors.filter((item) => item.emailNeedsReview).length} tone={processors.some((item) => item.emailNeedsReview) ? "warn" : "ok"} />
        <AdminMetricCard label="Visible now" value={filtered.length} hint="Current filtered result" />
      </div>

      <AdminSection
        title="Add a processor"
        description="Use this when a new person should be selectable as a final processor."
      >
        <form action={addApprover} className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_2fr_auto]">
          <input type="hidden" name="role_processor" value="on" />
          <input type="text" name="name" placeholder="Full name" required className="field-input" />
          <input type="email" name="email" placeholder="email@vienovo.ph" className="field-input" />
          <PendingSubmitButton type="submit" idleLabel="Add processor" pendingLabel="Adding..." className="btn-primary" />
        </form>
      </AdminSection>

      <AdminSection
        title="Processor list"
        description="Search by name or email, then activate, deactivate, or fix details."
        meta={`${filtered.length} of ${processors.length} shown`}
      >
        <div className="mb-5 flex flex-col gap-3">
          <AdminSearchField value={query} onChange={setQuery} placeholder="Search by name or email" />
          <AdminFilterTabs
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "review", label: "Needs review" },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState
            title="No processors match these filters"
            description="Try another search or switch back to a broader filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead className="border-b border-surface-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map((processor) => (
                  <tr key={processor._id} className="bg-white">
                    <td className="px-4 py-4 font-medium text-surface-text">{processor.name}</td>
                    <td className="px-4 py-4">
                      <form action={updateApprover} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={processor._id} />
                        <input type="hidden" name="department" value={processor.department || ""} />
                        <input type="hidden" name="role_processor" value="on" />
                        <input
                          type="email"
                          name="email"
                          defaultValue={processor.email}
                          placeholder="email@vienovo.ph"
                          className={`field-input w-[260px] ${processor.emailNeedsReview ? "border-amber-300 bg-amber-50" : ""}`}
                        />
                        <PendingSubmitButton
                          type="submit"
                          idleLabel="Save email"
                          pendingLabel="Saving..."
                          className="text-sm font-semibold text-brand-700 hover:underline"
                        />
                      </form>
                      {processor.emailNeedsReview ? (
                        <p className="mt-2 text-xs text-amber-700">This email still needs review.</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <AdminStatusPill tone={processor.isActive ? "ok" : "neutral"}>
                        {processor.isActive ? "Active" : "Inactive"}
                      </AdminStatusPill>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <form action={toggleApprover}>
                          <input type="hidden" name="id" value={processor._id} />
                          <PendingSubmitButton
                            type="submit"
                            idleLabel={processor.isActive ? "Deactivate" : "Activate"}
                            pendingLabel="Updating..."
                            className="border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-surface-muted transition hover:text-surface-text"
                          />
                        </form>
                        <form action={deleteApprover}>
                          <input type="hidden" name="id" value={processor._id} />
                          <PendingSubmitButton
                            type="submit"
                            idleLabel="Delete"
                            pendingLabel="Deleting..."
                            className="border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                          />
                        </form>
                      </div>
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
