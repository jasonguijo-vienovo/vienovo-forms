"use client";

import { useState } from "react";
import Link from "next/link";
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
import { addApprover, deleteApprover, toggleApprover, updateApprover } from "./actions";

type ApproverRow = {
  _id: string;
  name: string;
  email: string;
  roles: string[];
  isActive: boolean;
  emailNeedsReview: boolean;
  department?: string;
};

type ViewFilter = "all" | "review" | "active" | "inactive" | "hr_missing_email";

const ROLE_TONE: Record<string, string> = {
  supervisor: "border-blue-200 bg-blue-50 text-blue-700",
  departmenthead: "border-indigo-200 bg-indigo-50 text-indigo-700",
  sla: "border-cyan-200 bg-cyan-50 text-cyan-700",
  cashadvance: "border-emerald-200 bg-emerald-50 text-emerald-700",
  finalapprover: "border-amber-200 bg-amber-50 text-amber-700",
  processor: "border-violet-200 bg-violet-50 text-violet-700",
  approver: "border-slate-200 bg-slate-50 text-slate-700",
};

export function ApproversClient({
  approvers,
  roles,
}: {
  approvers: ApproverRow[];
  roles: string[];
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewFilter>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = approvers.filter((approver) => {
    const matchesQuery =
      !query ||
      [approver.name, approver.email, approver.roles.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());

    if (!matchesQuery) return false;
    if (roleFilter !== "all" && !approver.roles.includes(roleFilter)) return false;
    if (view === "review") return approver.emailNeedsReview;
    if (view === "active") return approver.isActive;
    if (view === "inactive") return !approver.isActive;
    if (view === "hr_missing_email") return approver.roles.includes("hr") && (!approver.email || approver.emailNeedsReview);
    return true;
  });

  const needsReview = approvers.filter((item) => item.emailNeedsReview).length;
  const activeCount = approvers.filter((item) => item.isActive).length;

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="People setup"
        title="Approvers"
        description="Manage the people who approve requests. This page controls who can appear in approval steps, without changing the approval logic itself."
        actions={
          <>
            <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary">
              Add a new approver
            </button>
            <Link href="/admin/processors" className="btn-secondary">
              Open processors list
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CompactMetricCard label="Total approvers" value={approvers.length} />
          <CompactMetricCard label="Active approvers" value={activeCount} tone="ok" />
          <CompactMetricCard label="Needs review" value={needsReview} tone={needsReview > 0 ? "warn" : "ok"} />
          <CompactMetricCard label="Processor-capable" value={approvers.filter((item) => item.roles.includes("processor")).length} />
        </div>
        <AdminHelpPanel title="What this page does">
          Use this page when someone should be available as an approver, supervisor, department head,
          cash advance approver, or final approver. If an email needs review, fix it here before relying
          on notification emails.
        </AdminHelpPanel>
      </div>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-2xl rounded-md border border-surface-border bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-surface-text">Add a new approver</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-sm font-semibold text-surface-muted hover:text-surface-text">
                Close
              </button>
            </div>
            <form action={addApprover} className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_2fr_auto]">
              <input type="text" name="name" placeholder="Full name" required className="field-input" />
              <input type="email" name="email" placeholder="email@vienovo.ph" className="field-input" />
              <PendingSubmitButton type="submit" idleLabel="Add approver" pendingLabel="Adding..." className="btn-primary" />
              <div className="lg:col-span-3 flex flex-wrap gap-3 text-sm text-surface-text">
                {roles.map((role) => (
                  <label key={role} className="flex items-center gap-1.5">
                    <input type="checkbox" name={`role_${role}`} className="accent-brand-600" />
                    <span className="capitalize">{role}</span>
                  </label>
                ))}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <AdminSection
        title="Approver list"
        description="Search people, fix emails that need review, and switch people on or off."
        meta={`${filtered.length} of ${approvers.length} shown`}
      >
        <div className="mb-5 flex flex-col gap-3">
          <AdminSearchField value={query} onChange={setQuery} placeholder="Search by name, email, or role" />
          <AdminFilterTabs
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All" },
              { value: "review", label: "Needs review" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "hr_missing_email", label: "HR missing email" },
            ]}
          />
          <AdminFilterTabs
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: "all", label: "All roles" },
              ...roles.map((role) => ({ value: role, label: role === "sla" ? "SLA role" : role })),
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState
            title="No approvers match these filters"
            description="Try a broader search or switch to a different filter."
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead className="border-b border-surface-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map((approver) => (
                  <tr key={approver._id} className="bg-white align-top">
                    <td className="px-4 py-4 font-medium text-surface-text">{approver.name}</td>
                    <td className="px-4 py-4">
                      {editingId === approver._id ? (
                        <input
                          form={`approver-edit-${approver._id}`}
                          type="email"
                          name="email"
                          defaultValue={approver.email}
                          placeholder="email@vienovo.ph"
                          className={`w-[260px] field-input ${approver.emailNeedsReview ? "border-amber-300 bg-amber-50" : ""}`}
                        />
                      ) : (
                        <p className="text-sm text-surface-text">{approver.email}</p>
                      )}
                      {approver.emailNeedsReview ? (
                        <p className="mt-2 text-xs text-amber-700">This email looks incomplete or needs checking.</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      {editingId === approver._id ? (
                        <div className="flex flex-wrap gap-2">
                          {roles.map((role) => (
                            <label
                              key={role}
                              className="inline-flex items-center gap-1 rounded border border-surface-border bg-white px-2 py-1 text-xs"
                            >
                              <input
                                form={`approver-edit-${approver._id}`}
                                type="checkbox"
                                name={`role_${role}`}
                                defaultChecked={approver.roles.includes(role)}
                                className="accent-brand-600"
                              />
                              <span className="capitalize text-surface-text">{role}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {approver.roles.length > 0 ? (
                            approver.roles.map((role) => (
                              <span
                                key={role}
                                className={`inline-flex items-center rounded border px-2 py-1 text-xs font-medium capitalize ${
                                  ROLE_TONE[role.toLowerCase()] ?? "border-slate-200 bg-slate-50 text-slate-700"
                                }`}
                              >
                                {role}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-surface-muted">No roles</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <AdminStatusPill tone={approver.isActive ? "ok" : "neutral"}>
                        {approver.isActive ? "Active" : "Inactive"}
                      </AdminStatusPill>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {editingId === approver._id ? (
                          <>
                            <form id={`approver-edit-${approver._id}`} action={updateApprover}>
                              <input type="hidden" name="id" value={approver._id} />
                              <input type="hidden" name="department" value={approver.department || ""} />
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
                            onClick={() => setEditingId(approver._id)}
                            className="border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                          >
                            Edit
                          </button>
                        )}
                        <form action={toggleApprover}>
                          <input type="hidden" name="id" value={approver._id} />
                          <PendingSubmitButton
                            type="submit"
                            idleLabel={approver.isActive ? "Deactivate" : "Activate"}
                            pendingLabel="Updating..."
                            className="border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-surface-muted transition hover:text-surface-text"
                          />
                        </form>
                        <form action={deleteApprover}>
                          <input type="hidden" name="id" value={approver._id} />
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
