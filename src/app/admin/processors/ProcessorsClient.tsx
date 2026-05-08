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
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
        actions={
          <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary">
            Add processor
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CompactMetricCard label="Total processors" value={processors.length} />
          <CompactMetricCard label="Active processors" value={processors.filter((item) => item.isActive).length} tone="ok" />
          <CompactMetricCard label="Needs review" value={processors.filter((item) => item.emailNeedsReview).length} tone={processors.some((item) => item.emailNeedsReview) ? "warn" : "ok"} />
          <CompactMetricCard label="Visible now" value={filtered.length} />
        </div>
        <AdminHelpPanel title="What this page does">
          Processors are the people who do the final work after a request has been approved. Imported
          form sync may add processor candidates here when it finds them in spreadsheet-driven options.
        </AdminHelpPanel>
      </div>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-xl rounded-md border border-surface-border bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-surface-text">Add processor</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-sm font-semibold text-surface-muted hover:text-surface-text">
                Close
              </button>
            </div>
            <form action={addApprover} className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_2fr_auto]">
              <input type="hidden" name="role_processor" value="on" />
              <input type="text" name="name" placeholder="Full name" required className="field-input" />
              <input type="email" name="email" placeholder="email@vienovo.ph" className="field-input" />
              <PendingSubmitButton type="submit" idleLabel="Add processor" pendingLabel="Adding..." className="btn-primary" />
            </form>
          </div>
        </div>
      ) : null}

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
          <div className="admin-table-wrap">
            <table className="admin-table">
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
                      {editingId === processor._id ? (
                        <input
                          form={`processor-edit-${processor._id}`}
                          type="email"
                          name="email"
                          defaultValue={processor.email}
                          placeholder="email@vienovo.ph"
                          className={`field-input w-[260px] ${processor.emailNeedsReview ? "border-amber-300 bg-amber-50" : ""}`}
                        />
                      ) : (
                        <p className="text-sm text-surface-text">{processor.email}</p>
                      )}
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
                        {editingId === processor._id ? (
                          <>
                            <form id={`processor-edit-${processor._id}`} action={updateApprover}>
                              <input type="hidden" name="id" value={processor._id} />
                              <input type="hidden" name="department" value={processor.department || ""} />
                              <input type="hidden" name="role_processor" value="on" />
                              <PendingSubmitButton
                                type="submit"
                                idleLabel="Save"
                                pendingLabel="Saving..."
                                className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                              />
                            </form>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingId(processor._id)}
                            className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                          >
                            Edit
                          </button>
                        )}
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
