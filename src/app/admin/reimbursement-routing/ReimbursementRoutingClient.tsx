"use client";

import { useEffect, useState } from "react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  AdminEmptyState,
  AdminHelpPanel,
  AdminPageHeader,
  AdminSection,
  AdminStatusPill,
} from "@/components/admin-ui";
import { AdminFilterTabs, AdminSearchField } from "@/components/admin-ui-client";
import { addRoute, deleteRoute, toggleRoute, updateRoute } from "./actions";

type RouteRow = {
  _id: string;
  department: string;
  costCenter: string;
  location: string;
  supervisorEmail: string;
  supervisorName: string;
  headEmail: string;
  headName: string;
  isActive: boolean;
};

type ViewFilter = "all" | "active" | "inactive";

export function ReimbursementRoutingClient({ routes }: { routes: RouteRow[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!showAddModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAddModal]);

  const filtered = routes.filter((route) => {
    const matchesQuery =
      !query ||
      [
        route.department,
        route.costCenter,
        route.location,
        route.supervisorName,
        route.supervisorEmail,
        route.headName,
        route.headEmail,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (view === "active") return route.isActive;
    if (view === "inactive") return !route.isActive;
    return true;
  });

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Approval routing"
        title="Reimbursement routing"
        description="Manage the rules that auto-fill the immediate superior and department head on the reimbursement form."
        actions={
          <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary">
            Add routing rule
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CompactMetricCard label="Total rules" value={routes.length} />
          <CompactMetricCard label="Active rules" value={routes.filter((item) => item.isActive).length} tone="ok" />
          <CompactMetricCard label="Inactive rules" value={routes.filter((item) => !item.isActive).length} />
          <CompactMetricCard label="Visible now" value={filtered.length} />
        </div>
        <AdminHelpPanel title="What this page does">
          Each rule matches a department, cost center, and location. When the reimbursement form finds a
          match, it uses that rule to prefill the approval people.
        </AdminHelpPanel>
      </div>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-4xl rounded-md border border-surface-border bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-surface-text">Add or update a routing rule</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-sm font-semibold text-surface-muted hover:text-surface-text">Close</button>
            </div>
            <form action={addRoute} className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <input name="department" placeholder="Department" required className="field-input" />
              <input name="costCenter" placeholder="Cost center" required className="field-input" />
              <input name="location" placeholder="Location" required className="field-input" />
              <input name="supervisorEmail" placeholder="Immediate superior email" className="field-input" />
              <input name="supervisorName" placeholder="Immediate superior name" className="field-input" />
              <div className="flex items-center justify-end">
                <PendingSubmitButton type="submit" idleLabel="Save rule" pendingLabel="Saving..." className="btn-primary w-full lg:w-auto" />
              </div>
              <input name="headEmail" placeholder="Department head email" className="field-input" />
              <input name="headName" placeholder="Department head name" className="field-input" />
              <div className="hidden lg:block" />
            </form>
          </div>
        </div>
      ) : null}

      <AdminSection
        title="Routing rules"
        description="Search by department, cost center, location, or approver."
        meta={`${filtered.length} of ${routes.length} shown`}
      >
        <div className="mb-5 flex flex-col gap-3">
          <AdminSearchField
            value={query}
            onChange={setQuery}
            placeholder="Search by department, cost center, location, or approver"
          />
          <AdminFilterTabs
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All rules" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState
            title="No routing rules match these filters"
            description="Try another search or switch back to a broader filter."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((route) => (
              <article key={route._id} className="border border-surface-border bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-surface-text">
                        {route.department} / {route.costCenter} / {route.location}
                      </h3>
                      <AdminStatusPill tone={route.isActive ? "ok" : "neutral"}>
                        {route.isActive ? "Active" : "Inactive"}
                      </AdminStatusPill>
                    </div>
                    <p className="mt-2 text-sm text-surface-muted">
                      Immediate superior: <strong>{route.supervisorName || "Not set"}</strong>
                      {" - "}
                      {route.supervisorEmail || "No email"}
                    </p>
                    <p className="mt-1 text-sm text-surface-muted">
                      Department head: <strong>{route.headName || "Not set"}</strong>
                      {" - "}
                      {route.headEmail || "No email"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {editingId === route._id ? (
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingId(route._id)}
                        className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                      >
                        Edit
                      </button>
                    )}
                    <form action={toggleRoute}>
                      <input type="hidden" name="id" value={route._id} />
                      <PendingSubmitButton
                        type="submit"
                        idleLabel={route.isActive ? "Deactivate" : "Activate"}
                        pendingLabel="Updating..."
                        className="border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-surface-muted transition hover:text-surface-text"
                      />
                    </form>
                    <form action={deleteRoute}>
                      <input type="hidden" name="id" value={route._id} />
                      <PendingSubmitButton
                        type="submit"
                        idleLabel="Delete"
                        pendingLabel="Deleting..."
                        className="border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                      />
                    </form>
                  </div>
                </div>

                {editingId === route._id ? (
                  <div className="mt-4 border border-surface-border bg-slate-50 p-4">
                    <form action={updateRoute} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <input type="hidden" name="id" value={route._id} />
                      <input name="department" defaultValue={route.department} required className="field-input" />
                      <input name="costCenter" defaultValue={route.costCenter} required className="field-input" />
                      <input name="location" defaultValue={route.location} required className="field-input lg:col-span-2" />
                      <input name="supervisorEmail" defaultValue={route.supervisorEmail} placeholder="Immediate superior email" className="field-input" />
                      <input name="supervisorName" defaultValue={route.supervisorName} placeholder="Immediate superior name" className="field-input" />
                      <input name="headEmail" defaultValue={route.headEmail} placeholder="Department head email" className="field-input" />
                      <input name="headName" defaultValue={route.headName} placeholder="Department head name" className="field-input" />
                      <div className="lg:col-span-2 flex justify-end">
                        <PendingSubmitButton type="submit" idleLabel="Save changes" pendingLabel="Saving..." className="btn-primary" />
                      </div>
                    </form>
                  </div>
                ) : null}
              </article>
            ))}
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
