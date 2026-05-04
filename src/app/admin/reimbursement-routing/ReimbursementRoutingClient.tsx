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
      />

      <AdminHelpPanel title="What this page does">
        Each rule matches a department, cost center, and location. When the reimbursement form finds a
        match, it uses that rule to prefill the approval people.
      </AdminHelpPanel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Total rules" value={routes.length} />
        <AdminMetricCard label="Active rules" value={routes.filter((item) => item.isActive).length} tone="ok" />
        <AdminMetricCard label="Inactive rules" value={routes.filter((item) => !item.isActive).length} />
        <AdminMetricCard label="Visible now" value={filtered.length} hint="Current filtered result" />
      </div>

      <AdminSection
        title="Add or update a routing rule"
        description="If the same department, cost center, and location already exist, saving here updates that rule."
      >
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
      </AdminSection>

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
          <div className="space-y-4">
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
                    <p className="mt-3 text-sm text-surface-muted">
                      Immediate superior: <strong>{route.supervisorName || "Not set"}</strong>
                      {" · "}
                      {route.supervisorEmail || "No email"}
                    </p>
                    <p className="mt-1 text-sm text-surface-muted">
                      Department head: <strong>{route.headName || "Not set"}</strong>
                      {" · "}
                      {route.headEmail || "No email"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
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

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand-700">Edit this rule</summary>
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
                </details>
              </article>
            ))}
          </div>
        )}
      </AdminSection>
    </div>
  );
}
